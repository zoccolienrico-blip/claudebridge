# ClaudeBridge 🌉

Control Claude Code from your iPhone via Telegram.

ClaudeBridge is a Telegram bot that bridges your mobile device with Claude Code running on your Mac/PC. Send prompts from anywhere, get results on Telegram.

Built by a solo founder who needed to fix production bugs from a construction site. Zero compromises.

## Features

- **Two modes**: prefix with `!` for instant shell commands, plain text for Claude Code
- **Interactive confirms**: dangerous commands forwarded to Telegram — approve or reject from iPhone
- **Single user auth**: only your chat ID can control it
- **Auto-restart**: pm2 keeps it alive after reboots
- **Chunked output**: long responses split automatically (Telegram 4096 char limit)

## Prerequisites

- Claude Code installed (`npm install -g @anthropic-ai/claude-code`)
- A Telegram bot token (create via @BotFather)
- Node.js 18+
- pm2 (`npm install -g pm2`)

## Installation

1. Clone the repo
```bash
git clone https://github.com/zoccolienrico-blip/claudebridge.git
cd claudebridge
npm install
```

2. Create your .env
```bash
cp .env.example .env
```

Edit .env:
```
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_ID=your_telegram_chat_id
CLAUDE_WORK_DIR=~/your-project
TASK_TIMEOUT=300
```

How to get your chat ID: message @userinfobot on Telegram.

3. Start with pm2
```bash
pm2 start index.js --name claudebridge
pm2 save
```

4. Auto-start on reboot (macOS)
```bash
pm2 startup launchd
sudo [command it gives you]
pm2 save
```

## Usage

### Shell commands — instant
Prefix with ! to run directly in shell:
```
!git log --oneline -5
!pm2 status
!ls ~/myproject
```

### Claude Code prompts — AI powered
Send any text without !:
```
Fix the bug in src/api.js where company filter is missing
Add a new endpoint GET /api/vehicles with pagination
What does server.js do?
```

### Interactive confirms
When Claude Code asks for approval on dangerous commands,
ClaudeBridge forwards the question to Telegram.
Reply yes, no, or the exact text to proceed.

## Real-world example

```
You (iPhone): Fix the 500 error on /api/refueling
Bot: Working on it...
Bot: Found the issue — missing try/catch on line 847.
     Fixed and committed. Deploy in progress.

You: !git log --oneline -3
Bot: a1b2c3 fix: error handling /api/refueling
     d4e5f6 feat: new dashboard widget
     g7h8i9 chore: update dependencies
```

## Why not just use SSH?

SSH works. But typing complex prompts on a phone keyboard into a terminal is painful. ClaudeBridge lets you describe what you need in plain language and Claude Code figures out the rest — while you are on a job site, in a meeting, or putting your kid to bed.

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| TELEGRAM_BOT_TOKEN | From @BotFather | required |
| TELEGRAM_CHAT_ID | Your personal chat ID | required |
| CLAUDE_WORK_DIR | Project directory | ~/ |
| TASK_TIMEOUT | Seconds before timeout | 300 |

## Security

- Single-user by design — only your TELEGRAM_CHAT_ID can send commands
- All dangerous bash commands require explicit approval
- Never expose this bot publicly or share your token

## License

MIT — fork it, improve it, share it.

---

Built for FuelEye — IoT fuel monitoring for construction, transport and agriculture.
https://fueleye.io
