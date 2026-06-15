// ── State ────────────────────────────────────────────────────────────────────
const chatBox = document.getElementById('chatbox');
let toastTimer = null;

// ── Minecraft color code map ──────────────────────────────────────────────────
const MC_COLORS = {
  '0': '#000000', '1': '#0000AA', '2': '#00AA00', '3': '#00AAAA',
  '4': '#AA0000', '5': '#AA00AA', '6': '#FFAA00', '7': '#AAAAAA',
  '8': '#555555', '9': '#5555FF', 'a': '#55FF55', 'b': '#55FFFF',
  'c': '#FF5555', 'd': '#FF55FF', 'e': '#FFFF55', 'f': '#FFFFFF',
};

const MC_FORMATS = {
  'l': 'font-weight:bold',
  'o': 'font-style:italic',
  'n': 'text-decoration:underline',
  'm': 'text-decoration:line-through',
};


function showToast(msg, type = 'info', duration = 4000) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.className = 'show' + (type === 'warn' ? ' warn' : type === 'error' ? ' error' : '');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}
// ── Log parsing ───────────────────────────────────────────────────────────────

/**
 * Parses a raw log string (full file or incremental chunk) into HTML chat lines.
 * @param {string} raw  - Log text to parse
 * @returns {string[]}  - Array of processed HTML chat lines
 */
function parseLog(raw) {
  if (!raw || !raw.trim()) return [];

  const lines = raw.split('\n');
  const chats = [];
  for (const line of lines) {
    if (!line.toLowerCase().includes('[chat]')) continue;

    const tsMatch = line.match(/\[(\d+:\d+:\d+)\]/);
    const ts = tsMatch ? tsMatch[1] : '';

    let chat = line
      .replace(/\[[\d:]+\] \[.*?\/.*?\]: (?:\[System\] )?\[CHAT\] /, '')
      .replace(/\ufffd/g, '§')
      .replace(/\u00a7/g, '§');

    chat = parseMcFormatting(chat);
    // ... rest of processing

    chat = `<span class="ts">${ts}</span> <span class="sep">|</span> ${chat}`;
    chats.push(chat);
  }

  return chats;
}

/**
 * Converts §-encoded Minecraft formatting into HTML spans.
 */
function parseMcFormatting(text) {
  const parts = text.split('§');
  const result = [];
  let openSpans = 0;

  for (let i = 0; i < parts.length; i++) {
    if (i === 0) {
      result.push(escapeHtml(parts[i]));
      continue;
    }

    const code = parts[i][0]?.toLowerCase();
    const content = escapeHtml(parts[i].substring(1));

    if (code === 'r') {
      result.push('</span>'.repeat(openSpans));
      openSpans = 0;
      result.push(content);
    } else if (MC_COLORS[code]) {
      result.push(`<span style="color:${MC_COLORS[code]}">${content}`);
      openSpans++;
    } else if (MC_FORMATS[code]) {
      result.push(`<span style="${MC_FORMATS[code]}">${content}`);
      openSpans++;
    } else {
      result.push(content);
    }
  }

  result.push('</span>'.repeat(openSpans));
  return result.join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function addMessages(lines) {
  if (!lines.length) return;

  const fragment = document.createDocumentFragment();

  for (const line of lines) {
    const li = document.createElement('li');
    li.className = 'chat-line';
    li.innerHTML = line;
    fragment.appendChild(li);
  }

  chatBox.appendChild(fragment);
  window.scrollTo(0, document.body.scrollHeight);
}

function clearChat() {
  chatBox.innerHTML = '';
  document.documentElement.scrollTop = 0;
}

function showStatus(msg, isError = false) {
  const li = document.createElement('li');
  li.className = isError ? 'chat-line status error' : 'chat-line status';
  li.textContent = msg;
  chatBox.appendChild(li);
}

// ── IPC ───────────────────────────────────────────────────────────────────────

async function init() {
  const pathEl = document.getElementById('log-path');
  if (pathEl) {
    const logPath = await window.electronAPI.getLogPath();
    pathEl.textContent = logPath ?? 'No Minecraft detected';
  }

  // Full initial load
  const raw = await window.electronAPI.loadChat();
  if (raw === null) {
    showStatus('No Minecraft detected — launch the game to see chat.');
  } else {
    const lines = parseLog(raw);
    if (lines.length) addMessages(lines);
    else showStatus('Minecraft is running but no chat yet.');
  }

  // Start file watcher
  await window.electronAPI.startWatch();

  // Incremental updates — main now sends only NEW bytes since last read
  window.electronAPI.onChatUpdate((chunk) => {
    const lines = parseLog(chunk);
    addMessages(lines);
  });

  window.electronAPI.onChatFlush((raw) => {
    clearChat();
    if (raw) addMessages(parseLog(raw));
  });

  await window.electronAPI.watchMinecraft();

  window.electronAPI.onMinecraftState(({ running }) => {
    if (running) showStatus('Minecraft detected — watching chat...');
    else showStatus('Minecraft closed.');
  });

  window.electronAPI.onChatError((msg) => {
    showStatus(`Error: ${msg}`, true);
  });
  window.electronAPI.onUpdaterStatus((status) => {
    switch (status.type) {
      case 'available':
        showToast(`⬇ Update ${status.version} downloading...`, 'info', 5000);
        break;
      case 'progress':
        showToast(`⬇ Downloading update... ${status.percent}%`, 'info', 60000);
        break;
      case 'downloaded':
        showToast(`✓ Update ${status.version} ready — restart to apply`, 'warn', 8000);
        break;
    }
  });
}

// ── Controller buttons ────────────────────────────────────────────────────────

document.addEventListener('click', async (e) => {
  const link = e.target.closest('.chat-link');
  if (link) {
    e.preventDefault();
    window.electronAPI.openLink?.(link.dataset.href);
    return;
  }

  const controller = e.target.closest('[data-controller]');
  if (!controller) return;
  e.preventDefault();

  switch (controller.dataset.controller) {
    case 'clear':
      clearChat();
      break;

    case 'reload':
      clearChat();
      const raw = await window.electronAPI.loadChat();
      if (raw === null) showStatus('No Minecraft detected — launch the game to see chat.');
      else addMessages(parseLog(raw));
      break;
  }
});

// ── Cleanup on unload ─────────────────────────────────────────────────────────
window.addEventListener('unload', () => {
  window.electronAPI.removeAllListeners();
});

// ── Boot ──────────────────────────────────────────────────────────────────────
init();