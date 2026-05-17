# Claude Voice Assistant — Browser Extension

A Siri-like Claude assistant that lives in every webpage as a floating orb.
Press `\` (or your custom hotkey) and just talk.

---

## Install in Microsoft Edge

1. Unzip this folder somewhere permanent (Desktop, Documents, etc.)
2. Open Edge → go to `edge://extensions`
3. Turn on **Developer mode** (toggle, top-left)
4. Click **"Load unpacked"**
5. Select the `claude-orb-extension` folder
6. ✅ The gold **C** orb will appear on every webpage

---

## First-time Setup

1. Click the **C** icon in your Edge toolbar (top-right)
2. Paste your **Anthropic API key** (get one free at console.anthropic.com)
3. Click **Save**
4. Done — start talking

---

## How to Use

| Action | What happens |
|---|---|
| Press `\` on any page | Mic activates, Claude listens |
| Speak your question | Transcribes and sends to Claude |
| Claude responds | Reads response aloud + shows in panel |
| Click the gold orb | Opens/closes the chat panel |
| Press `Escape` | Stops listening or closes panel |
| Type in the text box | Send without voice |

---

## Settings (click the C toolbar icon)

- **API Key** — your Anthropic key, stored locally only
- **Hotkey** — click the key display and press any key to change it (default: `\`)
- **Voice input** — toggle mic on/off
- **Text-to-speech** — toggle Claude's voice on/off
- **Speech rate / pitch** — adjust how Claude sounds
- **Read current page** — sends page text for context-aware answers
- **Remember conversations** — keeps history between browser sessions

---

## File Structure

```
claude-orb-extension/
├── manifest.json      Extension config + permissions
├── content.js         Floating orb injected on every page
├── orb.css            Orb + panel styles
├── popup.html         Settings UI (toolbar popup)
├── popup.js           Settings logic
├── background.js      Service worker + hotkey forwarding
└── icons/             Extension icons
```

---

## 🔮 Planned Features (leave room for these)

- Custom voice / persona selection (choose Microsoft Aria, Guy, etc.)
- Right-click context menu → "Ask Claude about this"
- Conversation history browser + export
- Multi-tab awareness
- Auto-summarize pages on load
- Floating side panel mode (instead of popup)
- Wake word support ("Hey Claude")
- Screenshot / image analysis

---

## Privacy

- API key stored locally in Edge storage only
- Page content sent to Anthropic API only when you send a message
- No third-party tracking, no ads, no data collection
