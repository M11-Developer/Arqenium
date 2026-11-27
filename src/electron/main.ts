import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCore, type Core } from '../core/core';
import { Dispatcher, DispatchFailure } from '../core/dispatcher';
import { CHANNELS } from '../shared/channels';

const here = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
const devServerUrl = process.env.ARQ_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';

let core: Core | null = null;
let dispatcher: Dispatcher | null = null;
let mainWindow: BrowserWindow | null = null;

/** Channels the renderer may call through IPC - mirrors the shared contract. */
const ALLOWED_CHANNELS = new Set<string>(CHANNELS);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b0d10',
    title: 'ARQENIUM',
    autoHideMenuBar: true,
    webPreferences: {
      // CommonJS: sandboxed preloads cannot be ES modules.
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: false,
    },
  });

  mainWindow = win;

  win.once('ready-to-show', () => win.show());

  // Navigation hardening: the app never navigates away from its own origin.
  win.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin = isDev ? new URL(devServerUrl).origin : 'file://';
    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());

  if (isDev) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.join(here, '../renderer/index.html'));
  }

  win.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc(): void {
  // Single validated invoke channel. Nothing else is exposed to the renderer.
  ipcMain.handle('arq:invoke', async (_event, channel: unknown, input: unknown) => {
    if (!dispatcher) return { ok: false, error: { code: 'not_ready', message: 'Core services are still starting' } };
    if (typeof channel !== 'string' || !ALLOWED_CHANNELS.has(channel)) {
      return { ok: false, error: { code: 'unknown_channel', message: `Unknown channel: ${String(channel)}` } };
    }
    try {
      const result = await dispatcher.dispatch(channel, input);
      return { ok: true, result };
    } catch (err) {
      if (err instanceof DispatchFailure) {
        return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
      }
      return { ok: false, error: { code: 'request_failed', message: err instanceof Error ? err.message : String(err) } };
    }
  });

  // Native dialogs only - no filesystem access is granted to the renderer.
  ipcMain.handle('arq:pickDirectory', async () => {
    if (!mainWindow) return null;
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select a project folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('arq:pickFile', async (_event, filters: unknown) => {
    if (!mainWindow) return null;
    const safeFilters = Array.isArray(filters)
      ? filters
          .filter((f): f is { name: string; extensions: string[] } => !!f && typeof f === 'object' && Array.isArray((f as any).extensions))
          .map((f) => ({ name: String(f.name).slice(0, 80), extensions: f.extensions.map((e) => String(e).replace(/[^a-z0-9]/gi, '')).filter(Boolean) }))
      : [];
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Select a file',
      properties: ['openFile'],
      filters: safeFilters.length ? safeFilters : undefined,
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  ipcMain.handle('arq:openExternal', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return false;
    await shell.openExternal(url);
    return true;
  });
}

/** Forward every persisted event to the renderer for live TraceX updates. */
function bridgeEvents(): void {
  core?.events.on((event) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('arq:event', event);
    }
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Deny every permission request by default (no camera, mic, geolocation).
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    core = createCore({});
    dispatcher = new Dispatcher(core, 'electron');
    void core.providers.demoProvider();
    registerIpc();
    bridgeEvents();

    core.events.emit({
      type: 'app.started',
      message: 'ARQENIUM desktop runtime started',
      data: { runtime: 'electron', version: app.getVersion(), dataDir: core.dataDir },
      source: 'app',
    });

    if (!app.isPackaged) {
      const win = new BrowserWindow({ show: false });
      win.destroy();
    }
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    if (core) void core.dispose();
  });
}
