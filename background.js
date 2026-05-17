/* background.js — minimal hub */
'use strict';

// Relay SETTINGS_UPDATED from popup to all tabs
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'SETTINGS_UPDATED') return;
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    });
  });
});

// Open assistant on active tab when popup button clicked
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'ACTIVATE_VOICE') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'ACTIVATE_VOICE' }).catch(() => {});
  });
});

// Open the popup when the onboarding button is clicked
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'OPEN_SETTINGS') return;
  if (chrome.action?.openPopup) {
    chrome.action.openPopup().catch(() => {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    });
  } else {
    chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[RAIJIN] Extension installed v4.0');
});
