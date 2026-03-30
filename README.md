# ClaudeBridge

**Control Claude Code from your iPhone via Telegram.**

ClaudeBridge is a lightweight Node.js bot that bridges Telegram messages to the [Claude Code](https://claude.ai/code) CLI. Send a prompt from your phone, get the full Claude Code output back in your chat.

## Why?

You're away from your desk but need to run a quick Claude Code task. SSH is clunky on mobile. ClaudeBridge lets you type naturally in Telegram and get results in seconds.

## Prerequisites

- **Node.js** 18+
- **Claude Code** CLI installed and authenticated (`npm install -g @anthropic-ai/claude-code`)
- **Telegram Bot** — create one via [@BotFather](https://t.me/BotFather)
- Your **Telegram Chat ID** — send a message to [@userinfobot](https://t.me/userinfobot) to get it

## Installation (5 minutes)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/claudebridge.git
cd claudebridge

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your bot token and chat ID

# 4. Start the bot
npm start

# 5. (Optional) Run with pm2 for persistence
npm install -g pm2
pm2 start index.js --name claudebridge
```

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | Yes |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID (only this user can use the bot) | Yes |
| `CLAUDE_WORK_DIR` | Working directory for Claude Code (default: `~`) | No |
| `TASK_TIMEOUT` | Max seconds per task (default: `300`) | No |

## Usage

Open Telegram on your iPhone and message your bot:

### Run prompts

```
You: Leggi il file server.js e dimmi quante righe ha

Bot: Running...
Bot: Il file server.js ha 245 righe. Contiene l'entry point Express
     con 6 cron job configurati...
```

### Multi-line prompts

```
You: Crea un endpoint GET /api/health che ritorna
     { status: "ok", uptime: process.uptime() }
     in src/routes/api.js

Bot: Running...
Bot: Ho aggiunto l'endpoint in api.js alla riga 15...
```

### Commands

| Command | Description |
|---------|-------------|
| `/status` | Check if Claude Code is busy or idle |
| `/stop` | Stop the currently running task |
| `/help` | Show available commands |

## How it works

```
iPhone Telegram -> Telegram API -> ClaudeBridge (Node.js)
                                        |
                                        v
                               claude --dangerously-skip-permissions -p "prompt"
                                        |
                                        v
                               Output sent back to Telegram
```

1. You send a message on Telegram
2. ClaudeBridge receives it via polling
3. Auth check: only your `CHAT_ID` is accepted
4. Spawns `claude -p "your prompt"` as a child process
5. Captures stdout and sends it back in chunks (max 4096 chars per message)
6. Timeout after 5 minutes with automatic notification

## Security

- **Single-user**: Only the configured `TELEGRAM_CHAT_ID` can interact with the bot
- **No secrets in code**: All config via `.env` (git-ignored)
- **Local execution**: Claude Code runs on your machine, not a remote server
- **`--dangerously-skip-permissions`**: Required for non-interactive mode. The bot runs with full Claude Code permissions on your machine — only you should have access

## Running as a service

### With pm2

```bash
pm2 start index.js --name claudebridge
pm2 save
pm2 startup  # Auto-start on boot
```

### With tmux (simpler)

```bash
tmux new -s bridge
npm start
# Ctrl+B, D to detach
```

## License

MIT

---

*Built for the [FuelEye](https://fueleye.io) development workflow.*
