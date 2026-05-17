# ⚡ ORB — Claude AI, Directly In Your Browser

> *No new tabs. No switching apps. Just ask.*

ORB is an Opera GX browser extension built by Raijin Acquisitions that embeds the full power of Claude AI into your browsing experience. Ask complex questions, scrape live web data, solve problems — all without ever leaving the page you're on.

---

## What ORB Can Do

- **Answer anything** — Complex math, research questions, coding help, writing — Claude's full reasoning capability at your fingertips
- **Scrape & analyze live web data** — Pull structured information from any page. Real examples:
  - Scraped Zillow for distressed properties in active builder zones — returned a structured address list instantly
  - Pulled breaking news from CNN and delivered a full breakdown without leaving the article
  - Researched the 3 hottest AI startups with funding data and analysis — mid-scroll, no new tab
- **Context-aware responses** — ORB reads the page you're on and answers accordingly
- **Voice activation** *(v1.1 — coming soon)* — Say "Hey Claude" and ORB wakes up hands-free

---

## Getting Started

### Requirements
- Opera GX browser
- Your own [Anthropic API key](https://console.anthropic.com/) — free to get, you control your usage

### Installation

**Download ORB:**
👉 [raijinacq.github.io/ORB](https://raijinacq.github.io/ORB)

1. Download and unzip the ORB folder somewhere permanent
2. Open Opera GX → go to `opera://extensions`
3. Enable **Developer Mode** (top right toggle)
4. Click **Load Unpacked** → select the ORB folder
5. Click the ⚡ ORB icon in your toolbar
6. Enter your Anthropic API key and click Save
7. Start using Claude from anywhere in your browser

---

## How to Use

| Action | What happens |
|--------|-------------|
| Click the ⚡ orb | Opens/closes the chat panel |
| Type your question | Claude answers in context |
| Press your hotkey | Activates voice input (v1.1) |
| Say "Hey Claude" | Wake word activation (v1.1) |
| Press Escape | Closes panel |

---

## Settings

- **API Key** — Your Anthropic key, stored locally only
- **Hotkey** — Customize your activation key
- **Voice Input** — Toggle mic on/off
- **Text-to-Speech** — Toggle Claude's voice on/off
- **Read Current Page** — Sends page content for context-aware answers
- **Remember Conversations** — Keeps history between sessions

---

## Roadmap

| Version | Status | Features |
|---------|--------|----------|
| v1.0 | ✅ Live | AI chat, web scraping, page summarization, Q&A |
| v1.1 | 🔨 In Development | Voice activation, "Hey Claude" wake word |
| v1.2 | 📋 Planned | Memory & personalization, adapts to how you work |
| v2.0 | 🔭 Future | Full Opera GX integration — workspaces, tab management, GX Corner |

---

## File Structure

```
ORB/
├── manifest.json      Extension config + permissions
├── content.js         Floating orb injected on every page
├── orb.css            Orb + panel styles
├── popup.html         Settings UI (toolbar popup)
├── popup.js           Settings logic
├── background.js      Service worker + hotkey forwarding
└── icons/             Extension icons
```

---

## Privacy

- API key stored locally in Opera GX storage only
- Page content sent to Anthropic API only when you send a message
- No third-party tracking, no ads, no data collection

---

## Support the Project

ORB is built independently by Raijin Acquisitions. If you find it useful, consider supporting development:

👉 [Patreon — patreon.com/c/claudeorb](https://www.patreon.com/c/claudeorb)

Supporters get early access to new versions, roadmap voting rights, and behind-the-scenes development updates.

**Tiers:**
- ⚡ **Thunderclap** — $3/month — Front row seat to development
- 🌩️ **Stormcaller** — $8/month — Vote on what gets built next
- 🔱 **Raijin** — $20/month — Co-builder status, direct line to the developer

---

## Contributing

Issues, ideas, and PRs are welcome. ORB is early and growing fast — your input shapes what it becomes.

---

## License

MIT — see [LICENSE](./LICENSE)

---

*Built by [Raijin Acquisitions](https://github.com/RaijinAcq) ⚡*
