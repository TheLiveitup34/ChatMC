const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {

    // ── Invoke (request → response) ──────────────────────────────────────────

    loadChat: () => ipcRenderer.invoke('chat:load'),
    startWatch: () => ipcRenderer.invoke('chat:watch'),
    getLogPath: () => ipcRenderer.invoke('chat:path'),
    watchMinecraft: () => ipcRenderer.invoke('minecraft:watch'),
    openLink: (url) => ipcRenderer.invoke('shell:open', url),
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),

    // ── Listeners (main pushes to renderer) ──────────────────────────────────

    onChatFlush: (cb) => ipcRenderer.on('chat-flush', (_, data) => cb(data)),
    onChatUpdate: (cb) => ipcRenderer.on('chat-update', (_, data) => cb(data)),
    onChatError: (cb) => ipcRenderer.on('chat-error', (_, msg) => cb(msg)),
    onMinecraftState: (cb) => ipcRenderer.on('minecraft-state', (_, state) => cb(state)),
    onUpdaterStatus: (cb) => ipcRenderer.on('updater-status', (_, status) => cb(status)),

    // ── Cleanup ───────────────────────────────────────────────────────────────

    removeAllListeners: () => {
        ipcRenderer.removeAllListeners('chat-flush');
        ipcRenderer.removeAllListeners('chat-update');
        ipcRenderer.removeAllListeners('chat-error');
        ipcRenderer.removeAllListeners('minecraft-state');
        ipcRenderer.removeAllListeners('updater-status');
    },
});