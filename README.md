# WhisperDump Lofi Companion 🧠✨

> A sovereign, persistent, and personalized AI companion for your browser.

WhisperDump is not just a tool; it's a **cognitive extension**. Designed to live in your browser's side panel and follow you across the web, it serves as your personal "Boss" agent interface, brain dump repository, and proactive nudge system.

![Lofi Vibe](https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGJmZDAyY2IzZWYwZWYwZWYwZWYwZWYwZWYwZWYwZWYwZWYwZWYmZXA9djFfaW50ZXJuYWxfZ2lmX2J5X2lkJmN0PWc/3o7TKVUn7iM8FMEU24/giphy.gif)

## 🌟 Key Features

### 🎮 Persistent Lofi Companion
- **Dynamic Avatar**: Supports Images, GIFs, and **MP4/WebM** video loops. Turn your browser into a lofi study stream.
- **Shadow DOM Isolation**: The companion follows you on every tab without interfering with website styles.
- **Live Updates**: Change your avatar or voice in the settings, and it reflects instantly across all open tabs.

### 🎙️ Advanced TTS Persona
- **Multiple Voices**: Choose between UK/US Male and Female personas.
- **Snitch Mode**: The UK Male voice ("Snitch") provides a distinct, authoritative yet friendly presence.
- **One-Click Mute**: Quickly toggle voice feedback from the side panel header.

### 🧠 Cognitive Sovereignty
- **Brain Dumps**: Instantly capture thoughts and index them into your "OpenClaw" brain via WebSocket or HTTP.
- **Smart Reminders**: Set one-off or **recurring nudges** (e.g., "remind me to hydrate every 30 mins") directly through natural language chat.
- **Vision Integration**: "Snitch" can see what you see. Take a screenshot and send it to the Boss for context-aware advice.

### ⚡ Technical Stack
- **Frontend**: Vanilla JS, CSS3, HTML5 (Custom Components via Shadow DOM).
- **Communication**: WebSockets (Real-time) & REST APIs.
- **Storage**: `chrome.storage.sync` for cross-device preference persistence.
- **AI Backend**: Compatible with OpenClaw swarm architectures.

## 🚀 Getting Started

1. Clone this repository.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode".
4. Click "Load unpacked" and select the extension folder.
5. Pin the extension and click the icon to open your Side Panel.

## 🛠️ Configuration

Edit the `OPENCLAW_WS` and `OPENCLAW_HTTP` constants in `sidepanel.js` to point to your own agent backend.

---

*Built with ❤️ for the community*
