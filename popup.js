// popup.js — settings panel for ORB Extension

// ─────────────────────────────────────────────
// DEFAULT SETTINGS — must match content.js defaults exactly
// ─────────────────────────────────────────────
let settings = {
  apiKey:             '',
  braveApiKey:        '',
  hotkey:             '\\',
  voiceEnabled:       true,
  wakeWordEnabled:    true,
  ttsEnabled:         false,   // OFF by default
  includePageContent: true,
  ttsRate:            1.1,
  ttsPitch:           1.0,
  rememberHistory:    true,
};

let recordingHotkey = false;

// ─────────────────────────────────────────────
// DOM REFS — guard against missing elements
// ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

const apiKeyInput   = $('apiKeyInput');
const saveKeyBtn    = $('saveKeyBtn');
const savedMsg      = $('savedMsg');
const braveKeyInput = $('braveKeyInput');
const saveBraveKeyBtn = $('saveBraveKeyBtn');
const braveKeyMsg   = $('braveKeyMsg');
const hotkeyDisplay = $('hotkeyDisplay');
const statusPill    = $('statusPill');
const activateBtn   = $('activateBtn');
const toggleWake    = $('toggleWake');
const toggleVoice   = $('toggleVoice');
const toggleTTS     = $('toggleTTS');
const togglePage    = $('togglePage');
const toggleMemory  = $('toggleMemory');
const ttsRate       = $('ttsRate');
const ttsRateVal    = $('ttsRateVal');
const ttsPitch      = $('ttsPitch');
const ttsPitchVal   = $('ttsPitchVal');
const clearHistBtn  = $('clearHistBtn');

// ─────────────────────────────────────────────
// LOAD SETTINGS ON OPEN
// ─────────────────────────────────────────────
chrome.storage.local.get(['claudeOrbSettings'], (res) => {
  if (chrome.runtime.lastError) { syncUI(); return; }
  if (res.claudeOrbSettings) {
    settings = { ...settings, ...res.claudeOrbSettings };
  }
  syncUI();
});

function syncUI() {
  if (apiKeyInput)   apiKeyInput.value   = settings.apiKey      ? '••••••••••••••••' : '';
  if (braveKeyInput) braveKeyInput.value = settings.braveApiKey ? '••••••••••••••••' : '';
  if (hotkeyDisplay) hotkeyDisplay.textContent = settings.hotkey || '\\';

  setToggle(toggleWake,   settings.wakeWordEnabled);
  setToggle(toggleVoice,  settings.voiceEnabled);
  setToggle(toggleTTS,    settings.ttsEnabled);
  setToggle(togglePage,   settings.includePageContent);
  setToggle(toggleMemory, settings.rememberHistory);

  if (ttsRate)    { ttsRate.value    = settings.ttsRate;    ttsRateVal.textContent  = Number(settings.ttsRate).toFixed(1); }
  if (ttsPitch)   { ttsPitch.value   = settings.ttsPitch;   ttsPitchVal.textContent = Number(settings.ttsPitch).toFixed(1); }

  updateStatusPill();
}

function updateStatusPill() {
  if (!statusPill) return;
  if (settings.apiKey) {
    statusPill.textContent = 'Ready';
    statusPill.className   = 'status-pill active';
  } else {
    statusPill.textContent = 'No key';
    statusPill.className   = 'status-pill no-key';
  }
}

// ─────────────────────────────────────────────
// SAVE + BROADCAST
// ─────────────────────────────────────────────
function save() {
  chrome.storage.local.set({ claudeOrbSettings: settings }, () => {
    if (chrome.runtime.lastError) console.warn('[ORB] Save failed:', chrome.runtime.lastError);
  });
  broadcastToActiveTab({ type: 'SETTINGS_UPDATED', settings });
}

function broadcastToActiveTab(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime.lastError || !tabs || !tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {
      // Content script may not be loaded on this page — that's fine
    });
  });
}

// ─────────────────────────────────────────────
// API KEY
// ─────────────────────────────────────────────
saveKeyBtn?.addEventListener('click', () => {
  const val = apiKeyInput?.value?.trim();
  if (!val || val.startsWith('••')) return; // nothing new to save

  // Basic format check
  if (!val.startsWith('sk-ant-')) {
    flash(savedMsg, 'Key should start with sk-ant-', '#F87171');
    return;
  }

  settings.apiKey = val;
  if (apiKeyInput) apiKeyInput.value = '••••••••••••••••';
  save();
  updateStatusPill();
  flash(savedMsg, '✓ Saved', '#4ADE80');
});

// ─────────────────────────────────────────────
// BRAVE SEARCH API KEY
// ─────────────────────────────────────────────
saveBraveKeyBtn?.addEventListener('click', () => {
  const val = braveKeyInput?.value?.trim();
  if (!val || val.startsWith('••')) return;

  settings.braveApiKey = val;
  if (braveKeyInput) braveKeyInput.value = '••••••••••••••••';
  save();
  flash(braveKeyMsg, '✓ Saved', '#4ADE80');
});

function flash(el, text, color) {
  if (!el) return;
  el.textContent = text;
  el.style.color = color || '';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

// ─────────────────────────────────────────────
// HOTKEY RECORDER
// ─────────────────────────────────────────────
hotkeyDisplay?.addEventListener('click', () => {
  if (recordingHotkey) return;
  recordingHotkey = true;
  hotkeyDisplay.textContent = '…';
  hotkeyDisplay.classList.add('recording');
  hotkeyDisplay.title = 'Press any key now';
});

document.addEventListener('keydown', (e) => {
  if (!recordingHotkey) return;
  e.preventDefault();
  e.stopPropagation();

  // Reject modifier-only presses
  if (['Control', 'Alt', 'Shift', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) return;

  settings.hotkey = e.key;
  if (hotkeyDisplay) {
    hotkeyDisplay.textContent = e.key;
    hotkeyDisplay.classList.remove('recording');
    hotkeyDisplay.title = 'Click to change';
  }
  recordingHotkey = false;
  save();
});

// Cancel hotkey recording on Escape
document.addEventListener('keyup', (e) => {
  if (recordingHotkey && e.key === 'Escape') {
    recordingHotkey = false;
    if (hotkeyDisplay) {
      hotkeyDisplay.textContent = settings.hotkey;
      hotkeyDisplay.classList.remove('recording');
      hotkeyDisplay.title = 'Click to change';
    }
  }
});

// ─────────────────────────────────────────────
// TOGGLES
// ─────────────────────────────────────────────
function setToggle(el, val) {
  if (!el) return;
  el.classList.toggle('on', Boolean(val));
}

function bindToggle(el, key) {
  if (!el) return;
  el.addEventListener('click', () => {
    settings[key] = !settings[key];
    setToggle(el, settings[key]);
    save();
  });
}

bindToggle(toggleWake,   'wakeWordEnabled');
bindToggle(toggleVoice,  'voiceEnabled');
bindToggle(toggleTTS,    'ttsEnabled');
bindToggle(togglePage,   'includePageContent');
bindToggle(toggleMemory, 'rememberHistory');

// ─────────────────────────────────────────────
// SLIDERS
// ─────────────────────────────────────────────
ttsRate?.addEventListener('input', () => {
  settings.ttsRate = parseFloat(ttsRate.value);
  if (ttsRateVal) ttsRateVal.textContent = settings.ttsRate.toFixed(1);
  save();
});

ttsPitch?.addEventListener('input', () => {
  settings.ttsPitch = parseFloat(ttsPitch.value);
  if (ttsPitchVal) ttsPitchVal.textContent = settings.ttsPitch.toFixed(1);
  save();
});

// ─────────────────────────────────────────────
// OPEN ASSISTANT BUTTON
// ─────────────────────────────────────────────
activateBtn?.addEventListener('click', () => {
  broadcastToActiveTab({ type: 'ACTIVATE_VOICE' });
  window.close();
});

// ─────────────────────────────────────────────
// CLEAR HISTORY
// ─────────────────────────────────────────────
clearHistBtn?.addEventListener('click', () => {
  if (!confirm('Clear all conversation history?')) return;
  chrome.storage.local.remove(['claudeOrbHistory'], () => {
    flash({ classList: { add: () => {}, remove: () => {} }, textContent: '' }, '', '');
    clearHistBtn.textContent = 'Cleared ✓';
    setTimeout(() => { clearHistBtn.textContent = 'Clear history'; }, 2000);
  });
});
