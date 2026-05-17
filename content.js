/* ================================================
   content.js — MINIMAL v4
   
   Stripped back to the absolute basics.
   SpeechRecognition directly in the content script.
   Triggered ONLY by explicit user click.
   No iframes. No offscreen. No auto-start.
   
   Get click-to-talk working first.
   Wake word comes after.
   ================================================ */

(function () {
  if (document.getElementById('claude-orb')) return;

  let convoSR  = null;   // active conversation listener
  let wakeSR   = null;   // background wake word listener
  let isSending = false;
  let messages  = [];
  let synth     = window.speechSynthesis;

  let currentCtrl = null;  // AbortController for in-flight API request
  let lastCallTime = 0;   // timestamp of last API call dispatch (ms)

  let settings = {
    apiKey:             '',
    braveApiKey:        '',   // optional — unlocks richer web search results
    hotkey:             '\\',
    voiceEnabled:       true,
    wakeWordEnabled:    true,
    ttsEnabled:         false,
    includePageContent: true,
    ttsRate:            1.1,
    ttsPitch:           1.0,
    rememberHistory:    true,
  };

  // ─────────────────────────────────────────────
  // SPEECH RECOGNITION
  // Only starts on user gesture (click / hotkey).
  // Gets mic permission via getUserMedia first,
  // then hands off to SR.
  // ─────────────────────────────────────────────

  function stopWake() {
    if (wakeSR) { try { wakeSR.abort(); } catch(_) {} wakeSR = null; }
  }

  function startListening() {
    // Stop wake listener first and give mic time to fully release
    stopWake();
    if (convoSR) { try { convoSR.abort(); } catch(_) {} convoSR = null; }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showStatus('⚠ Voice not supported in this browser', 'idle'); return; }

    showStatus('Starting mic…', 'listening');

    // Small delay so wake SR fully releases the mic before convo SR grabs it
    setTimeout(() => launchSR(SR), 250);
  }

  function launchSR(SR) {
    const instance = new SR();
    convoSR = instance;
    instance.continuous      = false;
    instance.interimResults  = true;
    instance.maxAlternatives = 1;
    instance.lang            = 'en-US';

    let final = '';

    instance.onstart = () => {
      showStatus('Listening… speak now', 'listening');
    };

    instance.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      showStatus(interim || final || 'Listening…', 'listening');
    };

    instance.onend = () => {
      if (convoSR === instance) convoSR = null;
      if (final.trim()) {
        sendMessage(final.trim());
      } else {
        showStatus('No speech detected — try again', 'idle');
        setTimeout(startWakeListener, 800);
      }
    };

    instance.onerror = (e) => {
      if (convoSR === instance) convoSR = null;
      const errors = {
        'not-allowed':   '⚠ Mic denied — allow in Edge address bar',
        'no-speech':     'No speech — try again',
        'audio-capture': '⚠ No microphone found',
        'network':       '⚠ Network error',
        'aborted':       null,
      };
      const msg = errors[e.error] !== undefined ? errors[e.error] : `⚠ ${e.error}`;
      if (msg) showStatus(msg, 'idle');
      else showStatus('Ask ORB anything...', 'idle');
      if (e.error !== 'aborted') setTimeout(startWakeListener, 800);
    };

    instance.start();
  }

  function stopListening() {
    if (convoSR) { try { convoSR.abort(); } catch(_) {} convoSR = null; }
    showStatus('Ask ORB anything...', 'idle');
  }

  // ─────────────────────────────────────────────
  // VERY SIMPLE WAKE WORD
  // After each response, restart a single-utterance
  // SR to check for "Hey ORB". Not always-on,
  // but catches it if user speaks soon after.
  // ─────────────────────────────────────────────
  function startWakeListener() {
    if (!settings.wakeWordEnabled || !settings.voiceEnabled) return;
    if (wakeSR || convoSR || isSending) return; // don't start if busy

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const instance = new SR();
    wakeSR = instance;
    instance.continuous     = true;
    instance.interimResults = true;
    instance.lang           = 'en-US';

    let triggered = false;

    instance.onresult = (e) => {
      if (triggered) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = (e.results[i][0].transcript || '').toLowerCase()
          .replace(/[^a-z0-9 ]/g, '');
        if (t.includes('hey orb') || t.includes('ok orb') || t.includes('hi orb')) {
          triggered = true;
          try { instance.abort(); } catch(_) {}
          if (wakeSR === instance) wakeSR = null;
          if (!document.getElementById('claude-panel')?.classList.contains('visible')) {
            openPanel();
          }
          showStatus('Hey! Go ahead…', 'listening');
          setTimeout(() => startListening(), 400);
          break;
        }
      }
    };

    instance.onend = () => {
      if (wakeSR === instance) wakeSR = null;
      // Restart wake listener if nothing is happening
      if (!triggered && !isSending && !convoSR) {
        setTimeout(startWakeListener, 500);
      }
    };

    instance.onerror = (e) => {
      if (wakeSR === instance) wakeSR = null;
      if (e.error === 'aborted' || e.error === 'not-allowed' || e.error === 'audio-capture') return;
      setTimeout(startWakeListener, 2000);
    };

    try { instance.start(); } catch (_) { wakeSR = null; }
  }

  // ─────────────────────────────────────────────
  // BUILD UI
  // ─────────────────────────────────────────────
  function buildUI() {
    // Orb
    const orb = document.createElement('div');
    orb.id = 'claude-orb';
    orb.innerHTML = `<div class="claude-orb-inner" id="claude-orb-inner">⚡</div>`;

    // Panel
    const panel = document.createElement('div');
    panel.id = 'claude-panel';
    panel.innerHTML = `
      <div class="co-panel-header">
        <div class="co-panel-title"><div class="co-title-dot"></div>ORB <span style="font-size:9px;opacity:0.45;font-family:'JetBrains Mono',monospace;font-weight:400;letter-spacing:0.06em;">by RAIJIN</span></div>
        <div class="co-panel-actions">
          <div class="co-icon-btn" id="co-mute-btn">🔇</div>
          <div class="co-icon-btn" id="co-clear-btn" title="New chat">↺</div>
          <div class="co-icon-btn" id="co-close-btn" title="Close">✕</div>
        </div>
      </div>
      <div class="co-page-strip">
        <div class="co-page-dot"></div>
        <div class="co-page-url">${esc(location.hostname)}</div>
      </div>
      <div class="co-messages" id="co-messages">
        <div class="co-empty" id="co-empty">
          <div class="co-empty-icon">◎</div>
          <div class="co-empty-title">Ready to help</div>
          <div class="co-empty-hint">Type below or click the icon to get started</div>
          <div class="co-empty-session">New session — previous chat cleared</div>
        </div>
      </div>
      <div class="co-voice-status">
        <div class="co-voice-indicator" id="co-voice-indicator"></div>
        <div class="co-voice-text" id="co-voice-text">Ask ORB anything...</div>
      </div>
      <div class="co-input-row">
        <textarea class="co-text-input" id="co-text-input" placeholder="Ask ORB anything…" rows="1"></textarea>
        <button class="co-send-btn" id="co-send-btn">➤</button>
      </div>
    `;

    document.body.appendChild(orb);
    document.body.appendChild(panel);

    // Events
    orb.addEventListener('click', () => { addRipple(); togglePanel(); });
    document.getElementById('co-close-btn').addEventListener('click', closePanel);
    document.getElementById('co-clear-btn').addEventListener('click', clearChat);

    document.getElementById('co-mute-btn').addEventListener('click', () => {
      settings.ttsEnabled = !settings.ttsEnabled;
      syncMute();
      if (!settings.ttsEnabled) synth.cancel();
      saveSettings();
    });

    document.getElementById('co-send-btn').addEventListener('click', () => {
      const v = document.getElementById('co-text-input').value.trim();
      if (v) sendMessage(v);
    });

    document.getElementById('co-text-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v) sendMessage(v);
      }
      setTimeout(() => {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
      }, 0);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });
  }

  function addRipple() {
    const r = document.createElement('div');
    r.className = 'claude-orb-ripple';
    document.getElementById('claude-orb-inner')?.appendChild(r);
    setTimeout(() => r.remove(), 500);
  }

  function syncMute() {
    const btn = document.getElementById('co-mute-btn');
    if (btn) { btn.textContent = settings.ttsEnabled ? '🔊' : '🔇'; }
  }

  function togglePanel() {
    document.getElementById('claude-panel').classList.contains('visible') ? closePanel() : openPanel();
  }

  function openPanel() {
    document.getElementById('claude-panel')?.classList.add('visible');
    syncMute();
  }

  function closePanel() {
    document.getElementById('claude-panel')?.classList.remove('visible');
    stopListening();
  }

  function showStatus(text, orbState) {
    const orb  = document.getElementById('claude-orb');
    const ind  = document.getElementById('co-voice-indicator');
    const vtxt = document.getElementById('co-voice-text');
    const wave = document.getElementById('co-waveform');
    const mic  = document.getElementById('co-mic-btn');

    if (orb) { orb.className = ''; orb.id = 'claude-orb'; if (orbState !== 'idle') orb.classList.add(orbState); }
    if (ind)  { ind.className = 'co-voice-indicator'; if (orbState !== 'idle') ind.classList.add(orbState); }
    if (wave) wave.style.display = orbState === 'listening' ? 'flex' : 'none';
    if (mic)  mic.style.opacity  = orbState === 'listening' ? '1' : '0.65';
    if (vtxt) { vtxt.textContent = text; vtxt.className = 'co-voice-text' + (orbState !== 'idle' ? ' active' : ''); }
  }

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function fmt(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/`(.+?)`/g,'<code style="background:#0d0d10;padding:1px 5px;border-radius:4px">$1</code>')
      .replace(/(^|\n)[-•]\s+/g,'$1· ')  // normalise bare "- " list markers before <br> conversion
      .replace(/\n/g,'<br>');
  }

  function bubble(role, text, animate = true) {
    const empty = document.getElementById('co-empty');
    if (empty) empty.style.display = 'none';
    const msgs = document.getElementById('co-messages');
    if (!msgs) return;
    const w = document.createElement('div'); w.className = `co-msg ${role}`;
    if (!animate) w.style.animation = 'none';
    const l = document.createElement('div'); l.className = 'co-msg-label'; l.textContent = role === 'user' ? 'you' : 'orb';
    const b = document.createElement('div'); b.className = 'co-msg-bubble'; b.innerHTML = fmt(text);
    w.appendChild(l); w.appendChild(b); msgs.appendChild(w);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function typing(show) {
    if (show) {
      const empty = document.getElementById('co-empty');
      if (empty) empty.style.display = 'none';
      const msgs = document.getElementById('co-messages');
      if (!msgs || document.getElementById('co-typing')) return;
      const w = document.createElement('div'); w.className = 'co-msg claude'; w.id = 'co-typing';
      const l = document.createElement('div'); l.className = 'co-msg-label'; l.textContent = 'orb';
      const b = document.createElement('div'); b.className = 'co-msg-bubble co-typing';
      b.innerHTML = '<span></span><span></span><span></span>';
      w.appendChild(l); w.appendChild(b); msgs.appendChild(w); msgs.scrollTop = msgs.scrollHeight;
    } else {
      document.getElementById('co-typing')?.remove();
    }
  }

  function clearChat() {
    messages = [];
    const msgs = document.getElementById('co-messages');
    if (msgs) msgs.innerHTML = `
      <div class="co-empty" id="co-empty">
        <div class="co-empty-icon">◎</div>
        <div class="co-empty-title">Ready to help</div>
        <div class="co-empty-hint">Type below or click the icon to get started</div>
      </div>`;
    saveHistory();
  }

  // ─────────────────────────────────────────────
  // CLAUDE API
  // ─────────────────────────────────────────────
  async function sendMessage(text) {
    if (!text?.trim()) return;

    // New input interrupts any in-flight request
    if (isSending) {
      if (currentCtrl) currentCtrl.abort();
      typing(false);
      isSending = false;
    }

    isSending = true;
    currentCtrl = new AbortController();
    const myCtrl = currentCtrl;

    const input = document.getElementById('co-text-input');
    if (input) { input.value = ''; input.style.height = 'auto'; }

    // 2-second cooldown between API calls
    const COOLDOWN = 2000;
    const sinceLastCall = Date.now() - lastCallTime;
    if (sinceLastCall < COOLDOWN) {
      const wait = COOLDOWN - sinceLastCall;
      showStatus('Cooling down…', 'thinking');
      await new Promise(r => setTimeout(r, wait));
      if (myCtrl !== currentCtrl || myCtrl.signal.aborted) return;
    }

    if (!settings.apiKey) {
      bubble('claude', 'Add your Anthropic API key in settings to get started.');
      isSending = false; showStatus('Ask ORB anything...', 'idle'); return;
    }

    messages.push({ role: 'user', content: text });
    bubble('user', text);
    showStatus('Thinking…', 'thinking');
    typing(true);

    let system = `You are ORB, a voice assistant in a browser extension. Keep responses SHORT — 1-3 sentences max unless asked for more. No bullet points, no bold, no headers. Talk naturally. You have access to a web_search tool — use it whenever the user asks about current events, real-time data, prices, weather, sports scores, or anything that may have changed recently.`;

    if (settings.includePageContent) {
      try {
        const pg = document.body?.innerText?.substring(0, 3000) || '';
        if (pg.trim()) system += `\n\nCURRENT PAGE: ${document.title} | ${location.href}\n${pg}`;
      } catch (_) {}
    }

    try {
      const reply = await callClaude(system, messages.slice(-16));
      if (myCtrl !== currentCtrl || myCtrl.signal.aborted) return; // interrupted by new message
      typing(false);
      messages.push({ role: 'assistant', content: reply });
      bubble('claude', reply);
      saveHistory();
      isSending = false;
      speak(reply);
    } catch (err) {
      if (myCtrl !== currentCtrl || myCtrl.signal.aborted) return; // interrupted by new message
      typing(false); isSending = false;
      const errMsg = err.name === 'AbortError'
        ? 'That took too long — please try again'
        : err.message;
      bubble('claude', errMsg);
      showStatus('Ask ORB anything...', 'idle');
    }
  }

  // Recursive API caller — handles tool_use loop (web search).
  // `apiMsgs` is only set on recursive calls and may contain content arrays.
  // The global `messages` array is never mutated here — only plain text is
  // pushed there by sendMessage after this resolves.
  async function callClaude(system, msgs, apiMsgs, depth) {
    depth    = depth    ?? 0;
    apiMsgs  = apiMsgs  ?? msgs.map(m => ({ role: m.role, content: m.content }));

    if (depth > 3) throw new Error('Too many tool calls');

    const ctrl  = currentCtrl;                          // captured once per call; same across recursion
    const timer = setTimeout(() => ctrl?.abort(), 45000);

    lastCallTime = Date.now();
    let res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl?.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: apiMsgs,
      }),
    });
    clearTimeout(timer);

    // Exponential backoff: one automatic retry on 429 before surfacing the error
    if (res.status === 429 && depth === 0) {
      clearTimeout(timer);
      showStatus('Rate limited — retrying…', 'thinking');
      await new Promise(r => setTimeout(r, 3000));
      if (ctrl !== currentCtrl || ctrl.signal.aborted) throw new Error('aborted');
      lastCallTime = Date.now();
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl?.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: apiMsgs,
        }),
      });
    }

    if (!res.ok) {
      const httpErrors = {
        400: 'Something went wrong — please try again',
        401: 'Invalid API key — check your settings',
        429: 'ORB is busy — please wait a moment and try again',
        500: 'ORB is having trouble — please try again shortly',
      };
      throw new Error(httpErrors[res.status] || 'Something went wrong — please try again');
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    // Join ALL text blocks — server-side web_search produces multiple (intro + final answer)
    const fullText = (data.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (data.stop_reason === 'end_turn' && fullText) return fullText;

    // Case 2: Claude wants to call a tool — execute it and loop back
    if (data.stop_reason === 'tool_use') {
      const toolUses = data.content.filter(b => b.type === 'tool_use');

      // Append assistant's tool_use turn to the local chain
      const next = [...apiMsgs, { role: 'assistant', content: data.content }];

      const toolResults = [];
      for (const tu of toolUses) {
        if (tu.name === 'web_search') {
          showStatus('Searching the web…', 'thinking');
          const result = await executeWebSearch(tu.input?.query ?? '');
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
        }
      }

      if (toolResults.length === 0) throw new Error('Tool call produced no results');

      next.push({ role: 'user', content: toolResults });
      showStatus('Thinking…', 'thinking');
      await new Promise(r => setTimeout(r, 1000));
      return callClaude(system, msgs, next, depth + 1);
    }

    throw new Error("ORB didn't get a response — please try again");
  }

  // Execute a web search query. Returns a plain-text string of results.
  // Tries Brave Search (if braveApiKey is set) then falls back to DuckDuckGo.
  async function executeWebSearch(query) {
    if (!query.trim()) return 'No search query provided.';

    // Brave Search API — richest results, requires a free API key in settings
    if (settings.braveApiKey) {
      try {
        const r = await fetch(
          `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
          { headers: { 'X-Subscription-Token': settings.braveApiKey, 'Accept': 'application/json' } }
        );
        if (r.ok) {
          const d = await r.json();
          const snippets = (d.web?.results ?? []).slice(0, 5)
            .map(r => `${r.title}\n${r.url}\n${r.description ?? ''}`.trim())
            .join('\n\n');
          if (snippets) return `Search results for "${query}":\n\n${snippets}`;
        }
      } catch (_) {}
    }

    // DuckDuckGo Instant Answer API — free, no key needed
    try {
      const r = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`
      );
      if (r.ok) {
        const d = await r.json();
        const parts = [];
        if (d.Answer)       parts.push(d.Answer);
        if (d.AbstractText) parts.push(d.AbstractText);
        (d.RelatedTopics ?? []).slice(0, 4).forEach(t => { if (t.Text) parts.push(t.Text); });
        if (parts.length) return `Search results for "${query}":\n\n${parts.join('\n\n')}`;
      }
    } catch (_) {}

    return `Search for "${query}" returned no usable results. Answer from your training data if you can, and note the limitation.`;
  }

  // ─────────────────────────────────────────────
  // TTS
  // ─────────────────────────────────────────────
  function speak(text) {
    const done = () => {
      showStatus('Ask ORB anything...', 'idle');
    };

    if (!settings.ttsEnabled) { done(); return; }

    synth.cancel();
    const clean = text.replace(/\*\*?/g,'').replace(/`/g,'').replace(/#{1,6} /g,'').replace(/\n+/g,' ').trim();
    const snip  = clean.length > 250 ? clean.substring(0, clean.lastIndexOf(' ', 250)) + '…' : clean;
    const utt   = new SpeechSynthesisUtterance(snip);
    utt.rate    = parseFloat(settings.ttsRate)  || 1.1;
    utt.pitch   = parseFloat(settings.ttsPitch) || 1.0;

    const pick = () => {
      const vs = synth.getVoices();
      return vs.find(v => v.name.includes('Aria') || v.name.includes('Jenny')) ||
             vs.find(v => v.lang.startsWith('en') && v.localService) || null;
    };
    utt.voice = pick();
    if (!utt.voice) synth.addEventListener('voiceschanged', () => { utt.voice = pick(); }, { once: true });

    utt.onstart = () => showStatus('Speaking…', 'speaking');
    utt.onend   = done;
    utt.onerror = done;
    showStatus('Speaking…', 'speaking');
    synth.speak(utt);
  }

  // ─────────────────────────────────────────────
  // STORAGE
  // ─────────────────────────────────────────────
  async function loadSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get(['claudeOrbSettings'], (res) => {
        if (chrome.runtime.lastError) { resolve(); return; }
        if (res.claudeOrbSettings) settings = { ...settings, ...res.claudeOrbSettings };
        resolve();
      });
    });
  }

  function saveHistory() {
    try { chrome.storage.local.set({ claudeOrbHistory: messages.slice(-30) }); } catch (_) {}
  }

  function saveSettings() {
    try {
      chrome.storage.local.set({ claudeOrbSettings: settings });
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings }).catch(() => {});
    } catch (_) {}
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'SETTINGS_UPDATED') {
      const hadKey = !!settings.apiKey;
      settings = { ...settings, ...msg.settings };
      syncMute();
      if (!hadKey && settings.apiKey) {
        const msgs = document.getElementById('co-messages');
        if (msgs && !document.getElementById('co-typing')) {
          msgs.innerHTML = `
            <div class="co-empty" id="co-empty">
              <div class="co-empty-icon">◎</div>
              <div class="co-empty-title">Ready to help</div>
              <div class="co-empty-hint">Type below or click the icon to get started</div>
            </div>`;
        }
      }
    }
    if (msg.type === 'ACTIVATE_VOICE') { openPanel(); }
  });

  // ─────────────────────────────────────────────
  // BOOT
  // ─────────────────────────────────────────────
  function showOnboarding() {
    const empty = document.getElementById('co-empty');
    if (!empty) return;
    empty.innerHTML = `
      <div class="co-empty-icon">◎</div>
      <div class="co-empty-title">Welcome to ORB</div>
      <div class="co-onboarding-msg">Add your Anthropic API key in settings to get started</div>
      <button class="co-onboarding-btn" id="co-onboarding-btn">Open Settings</button>
    `;
    document.getElementById('co-onboarding-btn')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
    });
  }

  async function init() {
    buildUI();
    await loadSettings();
    try { chrome.storage.local.remove('claudeOrbHistory'); } catch (_) {}
    syncMute();
    showStatus('Ask ORB anything...', 'idle');
    if (!settings.apiKey) showOnboarding();
  }

  init();
})();
