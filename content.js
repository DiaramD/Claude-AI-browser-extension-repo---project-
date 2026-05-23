/* ================================================
   content.js — ORB luxury v5
   ================================================ */

(function () {
  if (document.getElementById('claude-orb')) return;

  let convoSR  = null;
  let wakeSR   = null;
  let isSending = false;
  let messages  = [];
  let synth     = window.speechSynthesis;

  let currentCtrl = null;
  let lastCallTime = 0;
  let pendingImage = null;
  let activeTab = 'chat';
  let marketRefreshTimer = null;

  const MARKET_TICKERS = [
    { symbol: '^GSPC',    name: 'S&P 500',       short: 'SPX' },
    { symbol: '^IXIC',    name: 'NASDAQ',         short: 'NDX' },
    { symbol: '^DJI',     name: 'Dow Jones',      short: 'DJI' },
    { symbol: 'BTC-USD',  name: 'Bitcoin',        short: 'BTC' },
    { symbol: 'GC=F',     name: 'Gold',           short: 'XAU' },
    { symbol: 'CL=F',     name: 'Crude Oil',      short: 'WTI' },
    { symbol: '^VIX',     name: 'VIX Fear Index', short: 'VIX' },
    { symbol: '^TNX',     name: '10Y Treasury',   short: 'TNX' },
    { symbol: 'DX-Y.NYB', name: 'DXY Dollar',     short: 'DXY' },
  ];

  const TICKER_KEYWORDS = {
    'bitcoin': 'BTC-USD', 'btc': 'BTC-USD',
    'ethereum': 'ETH-USD', 'eth': 'ETH-USD',
    'gold': 'GC=F', 'oil': 'CL=F', 'crude': 'CL=F',
    'nasdaq': '^IXIC', 'dow jones': '^DJI', 'dow': '^DJI',
    'vix': '^VIX', 'treasury': '^TNX', 'dxy': 'DX-Y.NYB',
  };

  const SKIP_CAPS = new Set([
    'ORB','API','RSI','EMA','SMA','ATH','ATL','IPO','ETF','USD','EUR','GBP','JPY',
    'THE','AND','FOR','NOT','BUT','ARE','YOU','CAN','NEW','ALL','ITS','HAS','WAS',
    'MAY','USE','GET','SET','PUT','BUY','SEE','NOW','TWO','ONE','ADD','ASK',
  ]);

  let settings = {
    apiKey:             '',
    braveApiKey:        '',
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
  // ─────────────────────────────────────────────

  function stopWake() {
    if (wakeSR) { try { wakeSR.abort(); } catch(_) {} wakeSR = null; }
  }

  function startListening() {
    stopWake();
    if (convoSR) { try { convoSR.abort(); } catch(_) {} convoSR = null; }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showStatus('⚠ Voice not supported in this browser', 'idle'); return; }

    showStatus('Starting mic…', 'listening');
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

    instance.onstart = () => { showStatus('Listening… speak now', 'listening'); };

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
        'not-allowed':   '⚠ Mic denied — allow in browser address bar',
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
  // WAKE WORD
  // ─────────────────────────────────────────────
  function startWakeListener() {
    if (!settings.wakeWordEnabled || !settings.voiceEnabled) return;
    if (wakeSR || convoSR || isSending) return;

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
    const orb = document.createElement('div');
    orb.id = 'claude-orb';
    orb.innerHTML = `<div class="claude-orb-inner" id="claude-orb-inner"></div>`;

    const panel = document.createElement('div');
    panel.id = 'claude-panel';
    panel.innerHTML = `
      <div class="co-panel-header">
        <div class="co-panel-title">ORB <span class="co-by-raijin">by RAIJIN Acquisitions</span></div>
        <div class="co-panel-actions">
          <div class="co-icon-btn" id="co-mute-btn">🔇</div>
          <div class="co-icon-btn" id="co-clear-btn" title="New chat">↺</div>
          <div class="co-icon-btn" id="co-close-btn" title="Close">✕</div>
        </div>
      </div>
      <div class="co-tab-bar">
        <div class="co-tab active" id="co-tab-chat" data-tab="chat">Chat</div>
        <div class="co-tab" id="co-tab-markets" data-tab="markets">Markets</div>
        <div class="co-tab" id="co-tab-sentiment" data-tab="sentiment">Sentiment</div>
      </div>
      <div class="co-page-strip">
        <div class="co-page-dot"></div>
        <div class="co-page-url">${esc(location.hostname)}</div>
      </div>
      <div class="co-messages" id="co-messages">
        <div class="co-empty" id="co-empty">
          <div class="co-empty-title">Ready.</div>
          <div class="co-empty-sub">New session.</div>
        </div>
      </div>
      <div class="co-markets-view" id="co-markets-view">
        <div class="co-markets-loading" id="co-markets-loading">
          <div class="co-luxury-loading">
            <div class="co-lux-bars"><div class="co-lux-bar"></div><div class="co-lux-bar"></div><div class="co-lux-bar"></div></div>
            <div class="co-lux-text">Scanning markets…</div>
          </div>
        </div>
        <div class="co-markets-list" id="co-markets-list"></div>
        <div class="co-markets-footer" id="co-markets-footer"></div>
      </div>
      <div class="co-sentiment-view" id="co-sentiment-view">
        <div class="co-sent-header">
          <input class="co-sent-input" id="co-sent-input" type="text" placeholder="AAPL, Tesla, Bitcoin…" />
          <button class="co-sent-btn" id="co-sent-btn">Scan</button>
        </div>
        <div class="co-sent-error" id="co-sent-error"></div>
        <div class="co-sent-loading" id="co-sent-loading">
          <div class="co-luxury-loading">
            <div class="co-lux-bars"><div class="co-lux-bar"></div><div class="co-lux-bar"></div><div class="co-lux-bar"></div></div>
            <div class="co-lux-text">Analyzing sentiment…</div>
          </div>
        </div>
        <div class="co-sent-results" id="co-sent-results">
          <div class="co-sent-ticker-label" id="co-sent-ticker-label"></div>
          <div class="co-sent-score-wrap">
            <div class="co-sent-score-num" id="co-sent-score-num">0</div>
            <div class="co-sent-score-desc" id="co-sent-score-desc">Neutral</div>
          </div>
          <div class="co-sent-bar-container">
            <div class="co-sent-bar-track">
              <div class="co-sent-needle" id="co-sent-needle"></div>
            </div>
            <div class="co-sent-bar-ends">
              <span>−100 Bearish</span>
              <span>Bullish +100</span>
            </div>
          </div>
          <div class="co-sent-breakdown">
            <div class="co-sent-src">
              <div class="co-sent-src-name">Reddit</div>
              <div class="co-sent-src-score" id="co-sent-reddit-score">0</div>
            </div>
            <div class="co-sent-src">
              <div class="co-sent-src-name">News</div>
              <div class="co-sent-src-score" id="co-sent-news-score">0</div>
            </div>
            <div class="co-sent-src">
              <div class="co-sent-src-name">Analyst</div>
              <div class="co-sent-src-score" id="co-sent-analyst-score">0</div>
            </div>
          </div>
          <div class="co-sent-signals-wrap">
            <div class="co-sent-signals-col">
              <div class="co-sent-sig-title bullish">▲ Bullish</div>
              <ul class="co-sent-sig-list bullish-list" id="co-sent-bull-list"></ul>
            </div>
            <div class="co-sent-signals-col">
              <div class="co-sent-sig-title bearish">▼ Bearish</div>
              <ul class="co-sent-sig-list bearish-list" id="co-sent-bear-list"></ul>
            </div>
          </div>
          <div class="co-sent-summary-wrap">
            <div class="co-sent-summary-label">Market Briefing</div>
            <div class="co-sent-summary-text" id="co-sent-summary-text"></div>
          </div>
          <div class="co-sent-timestamp" id="co-sent-timestamp"></div>
        </div>
        <div class="co-sent-cooldown" id="co-sent-cooldown"></div>
        <div class="co-sent-disclaimer">⚡ For informational purposes only. Not financial advice. Always do your own research.</div>
      </div>
      <div class="co-voice-status">
        <div class="co-voice-indicator" id="co-voice-indicator"></div>
        <div class="co-voice-text" id="co-voice-text">Ask anything.</div>
      </div>
      <div class="co-img-preview" id="co-img-preview">
        <img class="co-img-thumb" id="co-img-thumb" />
        <span class="co-img-label">📎 Image ready</span>
        <div class="co-img-clear" id="co-img-clear" title="Remove image">✕</div>
      </div>
      <div class="co-quant-strip" id="co-quant-strip">
        <button class="co-quant-btn" data-prompt="Calculate Sharpe ratio: Return = %, Volatility = %, Risk-free rate = %.">Sharpe</button>
        <button class="co-quant-btn" data-prompt="Calculate position size: Account = $, Risk % = %, Stop loss % = %.">Position</button>
        <button class="co-quant-btn" data-prompt="Explain RSI. Current RSI = . Is this overbought or oversold and what does it signal?">RSI</button>
        <button class="co-quant-btn" data-prompt="Calculate risk/reward ratio: Entry = $, Stop loss = $, Price target = $.">R:R</button>
      </div>
      <div class="co-input-row">
        <textarea class="co-text-input" id="co-text-input" placeholder="Ask anything." rows="1"></textarea>
        <button class="co-send-btn" id="co-send-btn">›</button>
      </div>
    `;

    document.body.appendChild(orb);
    document.body.appendChild(panel);

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
      if (isSending && currentCtrl) { currentCtrl.abort(); return; }
      const v = document.getElementById('co-text-input').value.trim();
      if (v) sendMessage(v);
    });

    document.getElementById('co-text-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v && !isSending) sendMessage(v);
      }
      setTimeout(() => {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
      }, 0);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });

    document.getElementById('co-text-input').addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file.size > 4 * 1024 * 1024) {
            const preview = document.getElementById('co-img-preview');
            const label = preview?.querySelector('.co-img-label');
            if (label) label.textContent = 'Image too large — please use a smaller screenshot';
            if (preview) preview.classList.add('visible');
            setTimeout(() => clearPendingImage(), 3000);
            break;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            const [header, data] = dataUrl.split(',');
            const mediaType = header.match(/:(.*?);/)[1] || 'image/png';
            pendingImage = { data, mediaType };
            const thumb = document.getElementById('co-img-thumb');
            const preview = document.getElementById('co-img-preview');
            if (thumb) thumb.src = dataUrl;
            if (preview) preview.classList.add('visible');
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    });

    document.getElementById('co-img-clear').addEventListener('click', clearPendingImage);

    document.querySelectorAll('.co-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    document.querySelectorAll('.co-quant-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (activeTab !== 'chat') switchTab('chat');
        const input = document.getElementById('co-text-input');
        if (input) {
          input.value = btn.dataset.prompt;
          input.focus();
          input.style.height = 'auto';
          input.style.height = Math.min(input.scrollHeight, 80) + 'px';
        }
      });
    });

    document.getElementById('co-sent-btn')?.addEventListener('click', runSentimentScan);
    document.getElementById('co-sent-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runSentimentScan();
    });
  }

  function clearPendingImage() {
    pendingImage = null;
    const preview = document.getElementById('co-img-preview');
    const thumb = document.getElementById('co-img-thumb');
    if (preview) preview.classList.remove('visible');
    if (thumb) thumb.src = '';
  }

  // ─────────────────────────────────────────────
  // TAB SWITCHING
  // ─────────────────────────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    const panel = document.getElementById('claude-panel');
    if (!panel) return;
    panel.classList.toggle('markets-tab', tab === 'markets');
    panel.classList.toggle('sentiment-tab', tab === 'sentiment');
    document.querySelectorAll('.co-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === tab)
    );
    if (tab === 'markets') {
      console.log('[ORB Markets] switchTab → markets, calling loadMarkets()');
      clearTimeout(marketRefreshTimer);
      loadMarkets();
    } else {
      clearTimeout(marketRefreshTimer);
      marketRefreshTimer = null;
    }
  }

  // ─────────────────────────────────────────────
  // MARKET DASHBOARD
  // ─────────────────────────────────────────────
  async function fetchMarkets() {
    if (!settings.apiKey) return MARKET_TICKERS.map(t => ({ ...t, error: true }));

    const userMsg = `Current prices for these 9 markets as a JSON array exactly like this template, fill in real values: [{"symbol":"SPX","price":0,"change":0,"changePct":0},{"symbol":"NDX","price":0,"change":0,"changePct":0},{"symbol":"DJI","price":0,"change":0,"changePct":0},{"symbol":"BTC","price":0,"change":0,"changePct":0},{"symbol":"XAU","price":0,"change":0,"changePct":0},{"symbol":"WTI","price":0,"change":0,"changePct":0},{"symbol":"VIX","price":0,"change":0,"changePct":0},{"symbol":"TNX","price":0,"change":0,"changePct":0},{"symbol":"DXY","price":0,"change":0,"changePct":0}]`;

    const haiku = 'claude-haiku-4-5-20251001';
    const apiHeaders = {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    const systemPrompt = 'You are a JSON API. Return ONLY a raw JSON array. No text before it. No text after it. No explanation. No markdown. Start your response with [ and end with ]';

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: apiHeaders,
        body: JSON.stringify({
          model: haiku,
          max_tokens: 1500,
          system: systemPrompt,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          tool_choice: { type: 'auto' },
          messages: [{ role: 'user', content: userMsg }],
        }),
      });

      if (!res.ok) return MARKET_TICKERS.map(t => ({ ...t, error: true }));

      const turn1 = await res.json();
      let raw = (turn1.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('');

      if (turn1.stop_reason === 'tool_use') {
        const toolResults = [];
        for (const tu of (turn1.content ?? []).filter(b => b.type === 'tool_use')) {
          if (tu.name === 'web_search') {
            const result = await executeWebSearch(tu.input?.query ?? '');
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
          }
        }
        const res2 = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify({
            model: haiku,
            max_tokens: 1500,
            system: systemPrompt,
            tools: [{ type: 'web_search_20250305', name: 'web_search' }],
            messages: [
              { role: 'user',      content: userMsg       },
              { role: 'assistant', content: turn1.content },
              { role: 'user',      content: toolResults   },
            ],
          }),
        });
        if (res2.ok) {
          const turn2 = await res2.json();
          raw = (turn2.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('');
        }
      }

      raw = raw.replace(/```(?:json)?/gi, '').trim();

      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return MARKET_TICKERS.map(t => ({ ...t, error: true }));

      let parsed;
      try {
        parsed = JSON.parse(match[0]);
      } catch (e) {
        return MARKET_TICKERS.map(t => ({ ...t, error: true }));
      }

      const byShort = {};
      for (const item of parsed) byShort[item.symbol] = item;

      return MARKET_TICKERS.map(t => {
        const hit = byShort[t.short];
        if (!hit || typeof hit.price !== 'number') return { ...t, error: true };
        return { ...t, price: hit.price, change: hit.change ?? 0, changePct: hit.changePct ?? 0 };
      });

    } catch (err) {
      return MARKET_TICKERS.map(t => ({ ...t, error: true }));
    }
  }

  let lastMarketData = null;

  async function loadMarkets() {
    const loading = document.getElementById('co-markets-loading');
    const footer  = document.getElementById('co-markets-footer');

    if (loading) loading.style.display = lastMarketData ? 'none' : 'block';

    // If a chat request is in flight, wait 2s for it to clear before fetching
    if (isSending) {
      await new Promise(r => setTimeout(r, 2000));
      if (activeTab !== 'markets') return;
    }

    const data = await fetchMarkets();
    if (loading) loading.style.display = 'none';
    if (activeTab !== 'markets') return;

    const allFailed = data.every(d => d.error);

    if (allFailed) {
      if (lastMarketData) {
        renderMarkets(lastMarketData.map(d => ({ ...d, stale: true })));
      }
      if (footer) footer.innerHTML =
        `Fetch failed — retrying…<br><span class="co-markets-disclaimer">Data may be delayed. Not financial advice.</span>`;
      clearTimeout(marketRefreshTimer);
      marketRefreshTimer = setTimeout(() => loadMarkets(), 5000);
      return;
    }

    if (lastMarketData) {
      const merged = data.map((d, i) => d.error ? { ...lastMarketData[i], stale: true } : d);
      lastMarketData = merged.map(d => ({ ...d, stale: false }));
      renderMarkets(merged);
    } else {
      lastMarketData = data.map(d => ({ ...d, stale: false }));
      renderMarkets(data);
    }

    const timeLabel   = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const staleSuffix = data.some(d => d.error) ? ' <span class="co-markets-stale">(some data cached)</span>' : '';
    if (footer) footer.innerHTML =
      `Data as of ${timeLabel}${staleSuffix}<br><span class="co-markets-disclaimer">Data may be delayed. Not financial advice.</span>`;

    clearTimeout(marketRefreshTimer);
    marketRefreshTimer = setTimeout(() => loadMarkets(), 90000);
  }

  function animateCount(el, target, fmtFn, duration) {
    duration = duration ?? 800;
    const start = performance.now();
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      el.textContent = fmtFn(target * easeOut(p));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = fmtFn(target);
    }
    requestAnimationFrame(tick);
  }

  function renderMarkets(data) {
    const list = document.getElementById('co-markets-list');
    if (!list) return;
    list.innerHTML = '';

    const fmt = (p) => {
      if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
      if (p >= 100)   return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (p >= 1)     return p.toFixed(3);
      return p.toFixed(4);
    };

    for (const item of data) {
      const row = document.createElement('div');
      row.className = 'co-market-row';

      if (item.error) {
        row.innerHTML = `
          <div class="co-mkt-main">
            <div class="co-mkt-left">
              <div class="co-mkt-symbol">${esc(item.short)}</div>
              <div class="co-mkt-fullname">${esc(item.name)}</div>
            </div>
            <div class="co-mkt-right">
              <div class="co-mkt-price-wrap">
                <div class="co-mkt-dot neutral"></div>
                <div class="co-mkt-price co-market-err">—</div>
              </div>
            </div>
          </div>`;
        list.appendChild(row);
        continue;
      }

      const up        = item.change >= 0;
      const dir       = up ? 'up' : 'dn';
      const changeStr = (up ? '+' : '') + item.change.toFixed(2);
      const pctStr    = (up ? '+' : '') + item.changePct.toFixed(2) + '%';
      const closed    = item.marketState && item.marketState !== 'REGULAR';
      const isVIX     = item.symbol === '^VIX';

      let vixGaugeHtml = '';
      if (isVIX) {
        const v = item.price;
        const [fearLabel, fearCls] = v < 15 ? ['Low Fear',     'low']
                                   : v < 25 ? ['Moderate',     'mod']
                                   : v < 35 ? ['High Fear',    'high']
                                   :          ['Extreme Fear', 'xtreme'];
        const pct = Math.min(100, Math.max(0, (v / 60) * 100)).toFixed(1);
        vixGaugeHtml = `
          <div class="co-vix-gauge">
            <div class="co-vix-track">
              <div class="co-vix-diamond" style="left:${pct}%"></div>
            </div>
            <div class="co-vix-fear-row">
              <div class="co-vix-fear-label">${fearLabel}</div>
              <div class="co-vix-fear-val ${fearCls}">${fmt(v)}</div>
            </div>
          </div>`;
      }

      row.innerHTML = `
        <div class="co-mkt-main">
          <div class="co-mkt-left">
            <div class="co-mkt-symbol">${esc(item.short)}${closed ? `<span class="co-mkt-closed-tag">closed</span>` : ''}</div>
            <div class="co-mkt-fullname">${esc(item.name)}</div>
          </div>
          <div class="co-mkt-right">
            <div class="co-mkt-price-wrap">
              <div class="co-mkt-dot ${dir}"></div>
              <div class="co-mkt-price">—</div>
            </div>
            <div class="co-mkt-change ${dir}">${changeStr} (${pctStr})</div>
          </div>
        </div>
        ${vixGaugeHtml}`;

      list.appendChild(row);

      const priceEl = row.querySelector('.co-mkt-price');
      if (priceEl) animateCount(priceEl, item.price, fmt, 800);
    }
  }

  // ─────────────────────────────────────────────
  // SENTIMENT SCANNER
  // ─────────────────────────────────────────────
  function getSentimentColor(score) {
    if (score <= -50) return '#F87171';
    if (score <= -20) return '#FB923C';
    if (score <= 20)  return '#F5E642';
    if (score <= 50)  return '#86EFAC';
    return '#4ADE80';
  }

  function getSentimentDesc(score) {
    if (score <= -50) return 'Extreme Bearish';
    if (score <= -20) return 'Bearish';
    if (score <= 20)  return 'Neutral';
    if (score <= 50)  return 'Bullish';
    return 'Extreme Bullish';
  }

  function renderSentimentResults(data) {
    const loading = document.getElementById('co-sent-loading');
    const results = document.getElementById('co-sent-results');
    if (loading) loading.style.display = 'none';
    if (!results) return;
    results.style.display = 'flex';

    const score = Math.max(-100, Math.min(100, Number(data.overall_score) || 0));
    const color = getSentimentColor(score);
    const el = (id) => document.getElementById(id);

    const tickerEl = el('co-sent-ticker-label');
    if (tickerEl) tickerEl.textContent = data.ticker || '';

    const numEl = el('co-sent-score-num');
    if (numEl) {
      numEl.style.color = color;
      numEl.style.setProperty('--glow-color', color);
      animateCount(numEl, score, (v) => {
        const r = Math.round(v);
        return (r >= 0 ? '+' : '') + r;
      }, 1000);
    }

    const descEl = el('co-sent-score-desc');
    if (descEl) descEl.textContent = getSentimentDesc(score);

    const needle = el('co-sent-needle');
    if (needle) needle.style.left = ((score + 100) / 200 * 100) + '%';

    const setScore = (id, val) => {
      const node = el(id);
      if (!node) return;
      const v = Math.max(-100, Math.min(100, Number(val) || 0));
      const c = getSentimentColor(v);
      node.style.color = c;
      const card = node.closest('.co-sent-src');
      if (card) card.style.borderBottomColor = c;
      animateCount(node, v, (n) => {
        const r = Math.round(n);
        return (r >= 0 ? '+' : '') + r;
      }, 800);
    };
    setScore('co-sent-reddit-score',  data.reddit_score);
    setScore('co-sent-news-score',    data.news_score);
    setScore('co-sent-analyst-score', data.analyst_score);

    const bullList = el('co-sent-bull-list');
    if (bullList) {
      bullList.innerHTML = '';
      (data.bullish_signals ?? []).forEach(sig => {
        const li = document.createElement('li');
        li.textContent = sig;
        bullList.appendChild(li);
      });
    }
    const bearList = el('co-sent-bear-list');
    if (bearList) {
      bearList.innerHTML = '';
      (data.bearish_signals ?? []).forEach(sig => {
        const li = document.createElement('li');
        li.textContent = sig;
        bearList.appendChild(li);
      });
    }

    const summaryEl = el('co-sent-summary-text');
    if (summaryEl) summaryEl.textContent = data.summary || '';

    const tsEl = el('co-sent-timestamp');
    if (tsEl) tsEl.textContent = 'Scanned: ' + (data.scanned_at || new Date().toLocaleTimeString());
  }

  async function callClaudeSentiment(system, userMsg) {
    async function apiCall(msgs) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          system,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          tool_choice: { type: 'auto' },
          messages: msgs,
        }),
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error('rate_limit');
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `API error ${res.status}`);
      }
      return res.json();
    }

    let msgs = [{ role: 'user', content: userMsg }];
    for (let depth = 0; depth < 6; depth++) {
      const data = await apiCall(msgs);
      const text = (data.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
      if (data.stop_reason === 'end_turn' && text) return text;

      if (data.stop_reason === 'tool_use') {
        const toolUses = data.content.filter(b => b.type === 'tool_use');
        msgs = [...msgs, { role: 'assistant', content: data.content }];
        const toolResults = [];
        for (const tu of toolUses) {
          if (tu.name === 'web_search') {
            const result = await executeWebSearch(tu.input?.query ?? '');
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
          }
        }
        if (toolResults.length === 0) throw new Error('Tool returned no results');
        msgs = [...msgs, { role: 'user', content: toolResults }];
        continue;
      }
      throw new Error('Unexpected API response');
    }
    throw new Error('Too many tool calls');
  }

  async function runSentimentScan() {
    const inputEl = document.getElementById('co-sent-input');
    const query = inputEl?.value.trim();
    if (!query) return;

    const scanBtn = document.getElementById('co-sent-btn');
    const loading = document.getElementById('co-sent-loading');
    const results = document.getElementById('co-sent-results');
    const errEl   = document.getElementById('co-sent-error');

    if (errEl)   { errEl.style.display = 'none'; errEl.textContent = ''; }
    if (results) results.style.display = 'none';
    if (loading) loading.style.display = 'flex';
    if (scanBtn) { scanBtn.disabled = true; scanBtn.textContent = 'Scanning…'; }

    if (!settings.apiKey) {
      if (loading) loading.style.display = 'none';
      if (errEl)  { errEl.textContent = 'Add your Anthropic API key in settings first.'; errEl.style.display = 'block'; }
      if (scanBtn) { scanBtn.disabled = false; scanBtn.textContent = 'Scan'; }
      return;
    }

    const system = `You are a financial sentiment analyst. Search for recent news, Reddit posts, and analyst opinions about the given ticker. Return ONLY a JSON object, no other text:
{"ticker":"","overall_score":0,"reddit_score":0,"news_score":0,"analyst_score":0,"bullish_signals":["","",""],"bearish_signals":["","",""],"summary":"","scanned_at":""}
Scores: -100 (extreme bearish) to +100 (extreme bullish). Summary: 2 sentences max.`;

    const userMsg = `Sentiment analysis for: ${query}. Return only JSON.`;

    try {
      const reply = await callClaudeSentiment(system, userMsg);
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Could not parse sentiment data — please try again');
      const parsed = JSON.parse(jsonMatch[0]);
      renderSentimentResults(parsed);
    } catch (err) {
      if (loading) loading.style.display = 'none';
      const isRateLimit = err.message === 'rate_limit' || /429|rate.?limit|too many/i.test(err.message);
      const msg = isRateLimit
        ? 'Scanner cooling down — please wait 30 seconds and try again ⚡'
        : err.message || 'Scan failed — please try again';
      if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    }

    startSentimentCooldown();
  }

  function startSentimentCooldown() {
    const scanBtn    = document.getElementById('co-sent-btn');
    const cooldownEl = document.getElementById('co-sent-cooldown');
    let remaining = 30;

    if (scanBtn)    { scanBtn.disabled = true; scanBtn.textContent = 'Scan'; }
    if (cooldownEl) { cooldownEl.textContent = `Next scan available in: ${remaining}s`; cooldownEl.style.display = 'block'; }

    const tick = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(tick);
        if (scanBtn)    scanBtn.disabled = false;
        if (cooldownEl) cooldownEl.style.display = 'none';
        return;
      }
      if (cooldownEl) cooldownEl.textContent = `Next scan available in: ${remaining}s`;
    }, 1000);
  }

  // ─────────────────────────────────────────────
  // TICKER AUTO-DETECTION
  // ─────────────────────────────────────────────
  function detectTickers(text) {
    const found = new Set();
    const lower = text.toLowerCase();
    for (const [kw, sym] of Object.entries(TICKER_KEYWORDS)) {
      if (lower.includes(kw)) found.add(sym);
    }
    const caps = text.match(/\b[A-Z]{2,5}\b/g) || [];
    for (const cap of caps) {
      if (!SKIP_CAPS.has(cap)) found.add(cap);
    }
    return [...found].slice(0, 5);
  }

  async function fetchTickerPrice(symbol) {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
      );
      if (!r.ok) return null;
      const d = await r.json();
      const meta = d.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return null;
      return { symbol, price: meta.regularMarketPrice, currency: meta.currency || 'USD' };
    } catch (_) { return null; }
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
    const panel = document.getElementById('claude-panel');
    if (!panel) return;
    panel.classList.remove('co-entering');
    void panel.offsetWidth;
    panel.classList.add('visible', 'co-entering');
    setTimeout(() => panel.classList.remove('co-entering'), 700);
    syncMute();
  }

  function closePanel() {
    document.getElementById('claude-panel')?.classList.remove('visible');
    stopListening();
    clearTimeout(marketRefreshTimer);
    marketRefreshTimer = null;
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
    const lines = s.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim().startsWith('$$')) {
        const trimmed = line.trim();
        const single = trimmed.length > 4 && trimmed.endsWith('$$')
          ? trimmed.slice(2, -2).trim()
          : null;
        if (single) {
          out.push(`<div class="co-math-wrap">$$${esc(single)}$$</div>`);
          i++; continue;
        }
        i++;
        const mathLines = [];
        while (i < lines.length && !lines[i].trim().startsWith('$$')) {
          mathLines.push(lines[i]);
          i++;
        }
        i++;
        out.push(`<div class="co-math-wrap">$$${esc(mathLines.join('\n'))}$$</div>`);
        continue;
      }

      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i]);
          i++;
        }
        const rows = tableLines.filter(r => !/^\s*\|[\s\-|:]+\|\s*$/.test(r));
        if (rows.length) {
          const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
          const [header, ...body] = rows;
          const th = cells(header).map(c => `<th>${inlineFmt(c)}</th>`).join('');
          const trs = body.map(r =>
            `<tr>${cells(r).map(c => `<td>${inlineFmt(c)}</td>`).join('')}</tr>`
          ).join('');
          out.push(`<table class="co-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`);
        }
        continue;
      }

      if (/^\s*---+\s*$/.test(line)) { out.push('<hr class="co-hr">'); i++; continue; }

      const h3 = line.match(/^###\s+(.+)/);
      const h2 = line.match(/^##\s+(.+)/);
      const h1 = line.match(/^#\s+(.+)/);
      if (h3) { out.push(`<div class="co-h3">${inlineFmt(h3[1])}</div>`); i++; continue; }
      if (h2) { out.push(`<div class="co-h2">${inlineFmt(h2[1])}</div>`); i++; continue; }
      if (h1) { out.push(`<div class="co-h1">${inlineFmt(h1[1])}</div>`); i++; continue; }

      if (/^(\s*)[-*•]\s+/.test(line)) {
        const listLines = [];
        while (i < lines.length && /^(\s*)[-*•]\s+/.test(lines[i])) {
          listLines.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
          i++;
        }
        out.push(`<ul class="co-ul">${listLines.map(l => `<li>${inlineFmt(l)}</li>`).join('')}</ul>`);
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        const listLines = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          listLines.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
          i++;
        }
        out.push(`<ol class="co-ol">${listLines.map(l => `<li>${inlineFmt(l)}</li>`).join('')}</ol>`);
        continue;
      }

      if (line.trim() === '') { out.push('<div class="co-para-gap"></div>'); i++; continue; }

      out.push(`<div class="co-line">${inlineFmt(line)}</div>`);
      i++;
    }

    return out.join('');
  }

  function inlineFmt(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="co-code">$1</code>');
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
    if (role === 'claude') renderKaTeX(b);
    w.appendChild(l); w.appendChild(b);
    msgs.appendChild(w);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function loadKaTeX() {
    if (window._orbKaTeXReady) return Promise.resolve();
    if (window._orbKaTeXLoading) return window._orbKaTeXLoading;

    window._orbKaTeXLoading = new Promise((resolve, reject) => {
      if (!document.querySelector('#orb-katex-css')) {
        const link = document.createElement('link');
        link.id = 'orb-katex-css';
        link.rel = 'stylesheet';
        link.href = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css';
        document.head.appendChild(link);
      }
      const katexJs = document.createElement('script');
      katexJs.src = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js';
      katexJs.onload = () => {
        const arJs = document.createElement('script');
        arJs.src = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js';
        arJs.onload = () => { window._orbKaTeXReady = true; resolve(); };
        arJs.onerror = reject;
        document.head.appendChild(arJs);
      };
      katexJs.onerror = reject;
      document.head.appendChild(katexJs);
    });
    return window._orbKaTeXLoading;
  }

  function renderKaTeX(el) {
    loadKaTeX().then(() => {
      if (window.renderMathInElement) {
        window.renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true  },
            { left: '$',  right: '$',  display: false },
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true  },
          ],
          throwOnError: false,
          errorColor: '#F87171',
        });
      }
    }).catch(() => {});
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
        <div class="co-empty-title">Ready.</div>
        <div class="co-empty-sub">New session.</div>
      </div>`;
    saveHistory();
  }

  // ─────────────────────────────────────────────
  // STREAMING BUBBLE
  // ─────────────────────────────────────────────
  function streamBubble() {
    const empty = document.getElementById('co-empty');
    if (empty) empty.style.display = 'none';
    const msgs = document.getElementById('co-messages');
    if (!msgs) return null;

    const w = document.createElement('div'); w.className = 'co-msg claude';
    const l = document.createElement('div'); l.className = 'co-msg-label'; l.textContent = 'orb';
    const b = document.createElement('div'); b.className = 'co-msg-bubble';

    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:inherit;margin:0;padding:0;background:none;border:none;';
    const cursor = document.createElement('span'); cursor.className = 'co-cursor';

    b.appendChild(pre); b.appendChild(cursor);
    w.appendChild(l); w.appendChild(b);
    msgs.appendChild(w);
    msgs.scrollTop = msgs.scrollHeight;

    // API chunks land in rawQueue with zero DOM contact.
    // scheduleNext() drains one character at a time with organic per-character
    // delays — punctuation pauses, newline pauses, random micro-variation.
    let accumulated = '';
    let rawQueue    = '';
    let displayed   = '';
    let streamDone  = false;
    let timerId     = null;

    function nextDelay(char) {
      if (rawQueue.length > 200) return 8;          // catch-up mode: flat 8ms
      let d = 18 + (Math.random() * 6 - 3);        // 15–21ms base with micro-variation
      if ('.,:!?;'.includes(char)) d += 120;        // punctuation pause
      if (char === '\n') d += 80;                   // newline pause
      return d;
    }

    function scheduleNext() {
      if (!rawQueue) {
        if (streamDone) {
          cursor.style.transition = 'opacity 0.2s ease';
          cursor.style.opacity    = '0';
          setTimeout(() => { cursor.remove(); swapToMarkdown(accumulated); }, 200);
        } else {
          timerId = setTimeout(scheduleNext, 16);
        }
        return;
      }
      const char  = rawQueue[0];
      displayed  += char;
      rawQueue    = rawQueue.slice(1);
      pre.textContent = displayed;
      if (msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 120) {
        msgs.scrollTop = msgs.scrollHeight;
      }
      timerId = setTimeout(scheduleNext, nextDelay(char));
    }

    cursor.style.width             = '1.5px';
    cursor.style.height            = '14px';
    cursor.style.animationDuration = '530ms';

    timerId = setTimeout(scheduleNext, 16);

    function stopTypewriter() {
      clearTimeout(timerId);
      timerId = null;
    }

    function addMeta(fullText) {
      const meta = document.createElement('div'); meta.className = 'co-msg-meta';
      const ts   = document.createElement('span'); ts.className = 'co-msg-ts';
      ts.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const acts = document.createElement('div'); acts.className = 'co-msg-actions';

      const copyBtn = document.createElement('button'); copyBtn.className = 'co-msg-action-btn'; copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(fullText).then(() => {
          copyBtn.textContent = 'Copied'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        }).catch(() => {});
      });
      const retryBtn = document.createElement('button'); retryBtn.className = 'co-msg-action-btn'; retryBtn.textContent = 'Retry';
      retryBtn.addEventListener('click', () => {
        const lastUser = [...messages].reverse().find(m => m.role === 'user');
        if (lastUser) {
          messages = messages.slice(0, -2);
          const t = typeof lastUser.content === 'string' ? lastUser.content : (lastUser.content.find(c => c.type === 'text')?.text ?? '');
          if (t) sendMessage(t);
        }
      });

      acts.appendChild(copyBtn); acts.appendChild(retryBtn);
      meta.appendChild(ts); meta.appendChild(acts);
      w.appendChild(meta);

      requestAnimationFrame(() => {
        if (b.scrollHeight > 380) {
          b.classList.add('collapsed');
          const readMore = document.createElement('button'); readMore.className = 'co-read-more'; readMore.textContent = '↓ Read more';
          readMore.addEventListener('click', () => { b.classList.remove('collapsed'); readMore.remove(); });
          w.insertBefore(readMore, meta);
        }
      });
    }

    function swapToMarkdown(fullText) {
      b.style.transition = 'none';
      b.style.opacity    = '0';
      b.innerHTML = fmt(fullText);
      renderKaTeX(b);
      b.querySelectorAll('.co-copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.closest('.co-code-block')?.querySelector('pre')?.textContent ?? '';
          navigator.clipboard.writeText(code).then(() => {
            btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
          }).catch(() => {});
        });
      });
      void b.offsetHeight;
      b.style.transition = 'opacity 0.15s ease';
      b.style.opacity    = '1';
      setTimeout(() => {
        addMeta(fullText);
        msgs.scrollTop = msgs.scrollHeight;
      }, 160);
    }

    return {
      el: w,

      append(delta) {
        accumulated += delta;
        rawQueue    += delta;
      },

      showSearching() {
        stopTypewriter();
        pre.style.display    = 'none';
        cursor.style.display = 'none';
        const ind = document.createElement('div'); ind.className = 'co-search-inline';
        ind.innerHTML = `<div class="co-lux-bars"><div class="co-lux-bar"></div><div class="co-lux-bar"></div><div class="co-lux-bar"></div></div><span class="co-search-inline-text">Searching…</span>`;
        ind.id = 'co-search-ind';
        b.appendChild(ind);
      },

      resumeStreaming() {
        document.getElementById('co-search-ind')?.remove();
        pre.style.display    = '';
        cursor.style.display = '';
        timerId = setTimeout(scheduleNext, 16);
      },

      finalize(fullText) {
        streamDone = true;
        if (!timerId) {
          cursor.style.transition = 'opacity 0.2s ease';
          cursor.style.opacity    = '0';
          setTimeout(() => { cursor.remove(); swapToMarkdown(accumulated); }, 200);
        }
      },

      cancel() {
        stopTypewriter();
        cursor.remove();
        if (!accumulated) { w.remove(); return; }
        swapToMarkdown(accumulated + '\n\n*— cancelled*');
      },
    };
  }

  // ─────────────────────────────────────────────
  // STREAMING API CALLER
  // ─────────────────────────────────────────────
  async function callClaudeStream(system, apiMsgs, isMath, onChunk, onSearching, onResume) {
    const ctrl = currentCtrl;
    lastCallTime = Date.now();

    const HDRS = {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    function buildBody(msgs) {
      return JSON.stringify({
        stream: true,
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        tool_choice: isMath ? { type: 'auto', disable_parallel_tool_use: true } : { type: 'auto' },
        messages: msgs,
      });
    }

    async function runStream(msgs, depth) {
      if (depth > 3) throw new Error('Too many tool calls');

      const timer = setTimeout(() => ctrl?.abort(), 45000);
      let res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl?.signal, headers: HDRS, body: buildBody(msgs),
      });
      clearTimeout(timer);

      if (res.status === 429 && depth === 0) {
        showStatus('Rate limited — retrying…', 'thinking');
        await new Promise(r => setTimeout(r, 3000));
        if (ctrl !== currentCtrl || ctrl.signal.aborted) throw new Error('aborted');
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: ctrl?.signal, headers: HDRS, body: buildBody(msgs),
        });
      }

      if (!res.ok) {
        const errs = { 400: 'Something went wrong — please try again', 401: 'Invalid API key — check your settings', 429: 'ORB is busy — please wait a moment and try again', 500: 'ORB is having trouble — please try again shortly' };
        throw new Error(errs[res.status] || 'Something went wrong — please try again');
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', fullText = '', stop_reason = null;
      const blockMeta = {};
      const assistantContent = [];
      let curTextBlock = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (ctrl?.signal.aborted) { reader.cancel(); throw new Error('aborted'); }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json || json === '[DONE]') continue;
          let ev;
          try { ev = JSON.parse(json); } catch (_) { continue; }

          if (ev.type === 'content_block_start') {
            const cb = ev.content_block;
            blockMeta[ev.index] = { type: cb.type, id: cb.id, name: cb.name, inputJson: '' };
            if (cb.type === 'text') {
              curTextBlock = { type: 'text', text: '' };
              assistantContent.push(curTextBlock);
            } else if (cb.type === 'tool_use') {
              assistantContent.push({ type: 'tool_use', id: cb.id, name: cb.name, input: {} });
            }
          } else if (ev.type === 'content_block_delta') {
            const meta = blockMeta[ev.index];
            if (!meta) continue;
            if (ev.delta.type === 'text_delta' && meta.type === 'text') {
              fullText += ev.delta.text;
              if (curTextBlock) curTextBlock.text += ev.delta.text;
              onChunk(ev.delta.text, fullText);
            } else if (ev.delta.type === 'input_json_delta' && meta.type === 'tool_use') {
              meta.inputJson += ev.delta.partial_json;
            }
          } else if (ev.type === 'content_block_stop') {
            const meta = blockMeta[ev.index];
            if (meta?.type === 'tool_use') {
              const cb = assistantContent.find(b => b.type === 'tool_use' && b.id === meta.id);
              if (cb) { try { cb.input = JSON.parse(meta.inputJson || '{}'); } catch (_) {} }
            }
            if (meta?.type === 'text') curTextBlock = null;
          } else if (ev.type === 'message_delta') {
            stop_reason = ev.delta.stop_reason;
          }
        }
      }

      if (stop_reason === 'end_turn' || fullText) return fullText;

      if (stop_reason === 'tool_use') {
        const toolUses = assistantContent.filter(b => b.type === 'tool_use');
        const next = [...msgs, { role: 'assistant', content: assistantContent }];
        const toolResults = [];
        for (const tu of toolUses) {
          if (tu.name === 'web_search') {
            if (onSearching) onSearching(tu.input?.query ?? '');
            const result = await executeWebSearch(tu.input?.query ?? '');
            if (onResume) onResume();
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
          }
        }
        if (!toolResults.length) throw new Error('Tool call produced no results');
        next.push({ role: 'user', content: toolResults });
        showStatus('Thinking…', 'thinking');
        await new Promise(r => setTimeout(r, 400));
        return runStream(next, depth + 1);
      }

      if (fullText) return fullText;
      throw new Error("ORB didn't get a response — please try again");
    }

    return runStream(apiMsgs, 0);
  }

  // ─────────────────────────────────────────────
  // CLAUDE API
  // ─────────────────────────────────────────────
  async function sendMessage(text) {
    if (!text?.trim()) return;

    if (isSending) {
      if (currentCtrl) currentCtrl.abort();
      isSending = false;
    }

    isSending = true;
    currentCtrl = new AbortController();
    const myCtrl = currentCtrl;

    const input = document.getElementById('co-text-input');
    if (input) { input.value = ''; input.style.height = 'auto'; }

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

    const imageToSend = pendingImage;
    clearPendingImage();

    const userContent = imageToSend
      ? [
          { type: 'image', source: { type: 'base64', media_type: imageToSend.mediaType, data: imageToSend.data } },
          { type: 'text', text },
        ]
      : text;

    messages.push({ role: 'user', content: userContent });
    bubble('user', text);
    showStatus('Thinking…', 'thinking');

    const sendBtn = document.getElementById('co-send-btn');
    const inputEl = document.getElementById('co-text-input');
    if (inputEl) inputEl.classList.add('thinking');
    if (sendBtn) { sendBtn.textContent = '✕'; sendBtn.classList.add('cancel'); }
    function endThinking() {
      if (inputEl) { inputEl.classList.remove('thinking'); inputEl.placeholder = 'Ask anything.'; }
      if (sendBtn) { sendBtn.textContent = '›'; sendBtn.classList.remove('cancel'); }
    }

    const mathQuery = /\b(solve|calculate|matrix|algebra|derivative|integral|equation|proof|differentiate|factor|simplify|expand|eigenvalue|determinant|limit|gradient|vector|polynomial)\b/i.test(text);

    const detectedTickers = detectTickers(text);
    let tickerCtx = '';
    if (detectedTickers.length) {
      showStatus('Fetching prices…', 'thinking');
      const prices = (await Promise.all(detectedTickers.map(fetchTickerPrice))).filter(Boolean);
      if (myCtrl !== currentCtrl || myCtrl.signal.aborted) return;
      if (prices.length) {
        tickerCtx = '\n\nLIVE MARKET PRICES (just fetched):\n' + prices.map(p => {
          const fmtP = p.price >= 100
            ? p.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : p.price.toFixed(4);
          return `${p.symbol}: ${fmtP} ${p.currency}`;
        }).join('\n');
        showStatus('Thinking…', 'thinking');
      }
    }

    let system = `You are ORB, an AI quantitative analyst assistant built by RAIJIN Acquisitions. You specialize in financial analysis, quantitative methods, and market research. Your capabilities include:\n- Live market data analysis\n- Quantitative calculations: Sharpe ratio, Beta, RSI, MACD, moving averages, options Greeks, position sizing, risk/reward ratios\n- Writing Python and R code for backtesting and analysis\n- Reading and analyzing charts, earnings reports, SEC filings from screenshots\n- News sentiment analysis and scoring\nAlways add this disclaimer at the end of any financial analysis response: '⚡ For informational purposes only. Not financial advice. Always do your own research.'\n\nKeep responses concise unless detail is requested. You have access to a web_search tool — use it ONLY for current events, real-time data, live prices, news, or anything that may have changed recently. Do NOT use web search for math, logic, coding, reasoning, or any question you can answer from your own knowledge. For calculus problems involving definite integrals, always use numerical integration methods (like Simpson's rule or Riemann sums with small intervals) rather than analytical approximations when exact closed forms are complex. Show the numerical computation steps and round only at the final answer. Always use full precision trigonometric values to at least 10 decimal places before rounding. Never round intermediate calculations — only round the final answer to the requested decimal places.${mathQuery ? ' The user is asking a math or reasoning question. Do not call web_search under any circumstances — solve it yourself.' : ''}`;

    if (tickerCtx) system += tickerCtx;

    if (settings.includePageContent) {
      try {
        const pg = document.body?.innerText?.substring(0, 3000) || '';
        if (pg.trim()) system += `\n\nCURRENT PAGE: ${document.title} | ${location.href}\n${pg}`;
      } catch (_) {}
    }

    const stream = streamBubble();

    try {
      const reply = await callClaudeStream(
        system,
        messages.slice(-16).map(m => ({ role: m.role, content: m.content })),
        mathQuery,
        delta => stream.append(delta),
        () => stream.showSearching(),
        () => stream.resumeStreaming()
      );
      if (myCtrl !== currentCtrl || myCtrl.signal.aborted) { stream.cancel(); return; }
      messages.push({ role: 'assistant', content: reply });
      stream.finalize(reply);
      saveHistory();
      endThinking();
      isSending = false;
      speak(reply);
    } catch (err) {
      if (myCtrl !== currentCtrl || myCtrl.signal.aborted) { stream.cancel(); return; }
      const errMsg = err.name === 'AbortError'
        ? 'That took too long — please try again'
        : err.message;
      stream.finalize(errMsg);
      endThinking();
      isSending = false;
      showStatus('Ask ORB anything...', 'idle');
    }
  }

  async function callClaude(system, msgs, apiMsgs, depth, isMath) {
    depth    = depth    ?? 0;
    isMath   = isMath   ?? false;
    apiMsgs  = apiMsgs  ?? msgs.map(m => ({ role: m.role, content: m.content }));

    if (depth > 3) throw new Error('Too many tool calls');

    const ctrl  = currentCtrl;
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
        max_tokens: 8192,
        system,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        tool_choice: isMath ? { type: 'auto', disable_parallel_tool_use: true } : { type: 'auto' },
        messages: apiMsgs,
      }),
    });
    clearTimeout(timer);

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
          max_tokens: 8192,
          system,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          tool_choice: isMath ? { type: 'auto', disable_parallel_tool_use: true } : { type: 'auto' },
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

    const fullText = (data.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (data.stop_reason === 'end_turn' && fullText) return fullText;

    if (data.stop_reason === 'tool_use') {
      const toolUses = data.content.filter(b => b.type === 'tool_use');
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
      return callClaude(system, msgs, next, depth + 1, isMath);
    }

    throw new Error("ORB didn't get a response — please try again");
  }

  async function executeWebSearch(query) {
    if (!query.trim()) return 'No search query provided.';

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
    const done = () => { showStatus('Ask ORB anything...', 'idle'); };

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
              <div class="co-empty-title">Ready.</div>
              <div class="co-empty-sub">New session.</div>
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
