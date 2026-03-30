// ClaudeBridge — Telegram <-> Claude Code bridge
// Lets you control Claude Code from your iPhone via Telegram
require('dotenv').config();
var TelegramBot = require('node-telegram-bot-api');
var { spawn, execFile } = require('child_process');
var path = require('path');

// ─── Config ──────────────────────────────────────────────
var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
var CHAT_ID = process.env.TELEGRAM_CHAT_ID;
var WORK_DIR = (process.env.CLAUDE_WORK_DIR || '~').replace('~', process.env.HOME);
var TIMEOUT_SEC = parseInt(process.env.TASK_TIMEOUT) || 300;

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID required in .env');
  process.exit(1);
}

var ALLOWED_CHAT = String(CHAT_ID);

// ─── State ───────────────────────────────────────────────
var activeTask = null; // { process, startTime, prompt, waitingConfirmation, outputBuffer }

// ─── Confirmation detection ─────────────────────────────
var CONFIRM_PATTERNS = [
  /Do you want to proceed\?/i,
  /requires approval/i,
  /Continue\?/i,
  /\(Y\/n\)/i,
  /\(yes\/no\)/i,
  /\[Y\/n\]/i,
  /\[yes\/no\]/i,
  /Do you want to/i,
  /Allow this/i,
  /Approve\?/i,
  /Allow once/i,
  /Allow always/i,
  /Press Enter to/i,
  /\? \(y\)/i,
  /\byes\b.*\bno\b.*\balways\b/i
];

function detectConfirmation(text) {
  for (var i = 0; i < CONFIRM_PATTERNS.length; i++) {
    if (CONFIRM_PATTERNS[i].test(text)) return true;
  }
  return false;
}

// Strip ANSI escape codes for clean detection
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1B\][^\x07]*\x07/g, '');
}

// ─── Bot Setup ───────────────────────────────────────────
var bot = new TelegramBot(BOT_TOKEN, { polling: true });
console.log('ClaudeBridge started. Listening for messages from chat ' + ALLOWED_CHAT);

// ─── Auth middleware ─────────────────────────────────────
function isAuthorized(msg) {
  return String(msg.chat.id) === ALLOWED_CHAT;
}

function reject(msg) {
  bot.sendMessage(msg.chat.id, 'Unauthorized. Your chat ID: ' + msg.chat.id);
}

// ─── /help ───────────────────────────────────────────────
bot.onText(/\/help/, function(msg) {
  if (!isAuthorized(msg)) return reject(msg);
  bot.sendMessage(msg.chat.id,
    '*ClaudeBridge Commands*\n\n' +
    '`/status` — Check if Claude Code is busy or idle\n' +
    '`/stop` — Stop the current running task\n' +
    '`/help` — Show this help message\n\n' +
    '*Modalità:*\n' +
    '`!comando` — esegue direttamente nella shell (es. `!git status`)\n' +
    'Tutto il resto → prompt a Claude Code\n\n' +
    'Timeout: ' + TIMEOUT_SEC + 's per task.',
    { parse_mode: 'Markdown' }
  );
});

// ─── /status ─────────────────────────────────────────────
bot.onText(/\/status/, function(msg) {
  if (!isAuthorized(msg)) return reject(msg);
  if (activeTask) {
    var elapsed = Math.round((Date.now() - activeTask.startTime) / 1000);
    var status = activeTask.waitingConfirmation ? 'WAITING CONFIRMATION' : 'BUSY';
    bot.sendMessage(msg.chat.id,
      status + ' (' + elapsed + 's elapsed)\n\nPrompt: ' + activeTask.prompt.substring(0, 200)
    );
  } else {
    bot.sendMessage(msg.chat.id, 'IDLE — Ready for prompts.');
  }
});

// ─── /stop ───────────────────────────────────────────────
bot.onText(/\/stop/, function(msg) {
  if (!isAuthorized(msg)) return reject(msg);
  if (activeTask) {
    activeTask.process.kill('SIGTERM');
    activeTask = null;
    bot.sendMessage(msg.chat.id, 'Task stopped.');
  } else {
    bot.sendMessage(msg.chat.id, 'No active task to stop.');
  }
});

// ─── Send long messages in chunks ────────────────────────
var MAX_MSG_LEN = 4096;

function sendChunked(chatId, text) {
  if (!text || !text.trim()) {
    return bot.sendMessage(chatId, '(empty output)');
  }
  var chunks = [];
  var remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_MSG_LEN) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a newline near the limit
    var cutAt = remaining.lastIndexOf('\n', MAX_MSG_LEN);
    if (cutAt < MAX_MSG_LEN * 0.5) cutAt = MAX_MSG_LEN;
    chunks.push(remaining.substring(0, cutAt));
    remaining = remaining.substring(cutAt);
  }
  // Send sequentially to maintain order
  var chain = Promise.resolve();
  chunks.forEach(function(chunk, i) {
    chain = chain.then(function() {
      var prefix = chunks.length > 1 ? '[' + (i + 1) + '/' + chunks.length + '] ' : '';
      return bot.sendMessage(chatId, prefix + chunk);
    });
  });
  return chain;
}

// ─── Map user reply to stdin input ──────────────────────
function mapReplyToInput(text) {
  var lower = text.trim().toLowerCase();
  if (lower === 'si' || lower === 'sì' || lower === 'yes' || lower === 'y') return 'y\n';
  if (lower === 'no' || lower === 'n') return 'n\n';
  // Send exact text as-is
  return text.trim() + '\n';
}

// ─── Main message handler — run Claude Code ──────────────
bot.on('message', function(msg) {
  if (!isAuthorized(msg)) return reject(msg);

  var text = msg.text || '';

  // Skip commands (handled above)
  if (text.startsWith('/help') || text.startsWith('/status') || text.startsWith('/stop')) return;

  // Skip empty
  if (!text.trim()) return;

  // Check if already busy
  if (activeTask) {
    bot.sendMessage(msg.chat.id, 'Claude Code is busy. Use /stop to cancel or /status to check progress.');
    return;
  }

  // ─── MODE 1: Shell command (starts with !) ─────────────
  if (text.startsWith('!')) {
    var cmd = text.slice(1).trim();
    if (!cmd) return;
    bot.sendMessage(msg.chat.id, '🐚 Shell: ' + cmd);

    var shellProc = spawn('/bin/zsh', ['-c', cmd], {
      cwd: WORK_DIR,
      env: Object.assign({}, process.env, { FORCE_COLOR: '0' }),
      timeout: TIMEOUT_SEC * 1000
    });

    var shellOut = '';
    var shellErr = '';

    activeTask = { process: shellProc, startTime: Date.now(), prompt: cmd };

    shellProc.stdout.on('data', function(d) { shellOut += d.toString(); });
    shellProc.stderr.on('data', function(d) { shellErr += d.toString(); });

    shellProc.on('close', function(code) {
      activeTask = null;
      var output = (shellOut + (shellErr ? '\nSTDERR:\n' + shellErr : '')).trim();
      sendChunked(msg.chat.id, output || '(no output, exit code ' + code + ')');
    });

    shellProc.on('error', function(err) {
      activeTask = null;
      bot.sendMessage(msg.chat.id, 'Shell error: ' + err.message);
    });

    return;
  }

  // ─── MODE 2: Claude Code prompt ────────────────────────
  bot.sendMessage(msg.chat.id, 'Running...');

  var proc = execFile('/opt/homebrew/bin/claude',
    ['--dangerously-skip-permissions', '-p', text],
    {
      cwd: WORK_DIR,
      env: Object.assign({}, process.env, { FORCE_COLOR: '0' }),
      timeout: TIMEOUT_SEC * 1000,
      maxBuffer: 10 * 1024 * 1024
    },
    function(err, stdout, stderr) {
      activeTask = null;

      if (err && err.killed) {
        bot.sendMessage(msg.chat.id, 'Task timed out after ' + TIMEOUT_SEC + 's.');
        return;
      }

      if (err && !stdout) {
        bot.sendMessage(msg.chat.id, 'Error: ' + err.message + '\n\nIs Claude Code installed and in PATH?');
        return;
      }

      var output = stripAnsi((stdout || '').trim());
      if (stderr && stderr.trim() && !output) {
        output = 'STDERR:\n' + stripAnsi(stderr.trim());
      }

      sendChunked(msg.chat.id, output || '(no output, exit code ' + (err ? err.code : 0) + ')');
    }
  );

  activeTask = { process: proc, startTime: Date.now(), prompt: text };

  // Warning before timeout
  setTimeout(function() {
    if (activeTask && activeTask.process === proc) {
      bot.sendMessage(ALLOWED_CHAT, 'Task running for ' + (TIMEOUT_SEC - 30) + 's — will timeout soon. Use /stop to cancel.');
    }
  }, (TIMEOUT_SEC - 30) * 1000);
});

// ─── Graceful shutdown ───────────────────────────────────
process.on('SIGINT', function() {
  console.log('\nShutting down ClaudeBridge...');
  if (activeTask) activeTask.process.kill('SIGTERM');
  bot.stopPolling();
  process.exit(0);
});
