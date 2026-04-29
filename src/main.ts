import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

if (started) {
  app.quit();
}

const FALLBACK_WEB_URL = 'https://www.legisdex.com';
const LOCAL_WEB_URL = 'http://localhost:3000';
const DESKTOP_START_PATH = '/chat';
const DESKTOP_PATH_ALIASES = [
  ['/account', '/chat/account'],
  ['/checkout', '/chat/checkout'],
  ['/return', '/chat/return'],
] as const;
const DESKTOP_PATH_PREFIXES = [
  '/chat',
  '/compliance',
  '/tracker',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/sign-out',
  '/api/auth',
];
const PUBLIC_ASSET_DIR = 'public';
const WINDOW_ICON = 'favicon.ico';

const getLegisDexBaseUrl = () => {
  const configuredUrl = process.env.LEGISDEX_WEB_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  return app.isPackaged ? FALLBACK_WEB_URL : LOCAL_WEB_URL;
};

const getLegisDexUrl = (pathName = DESKTOP_START_PATH) =>
  new URL(pathName, getLegisDexBaseUrl()).toString();

const getPublicAssetPath = (fileName: string) =>
  path.join(app.getAppPath(), PUBLIC_ASSET_DIR, fileName);

const isHttpUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
};

const isAllowedDesktopPath = (pathName: string) =>
  DESKTOP_PATH_PREFIXES.some(
    (prefix) => pathName === prefix || pathName.startsWith(`${prefix}/`),
  );

const isAppOrigin = (url: URL, appUrl: URL) =>
  url.origin === appUrl.origin ||
  (!app.isPackaged && url.origin === new URL(LOCAL_WEB_URL).origin);

const normalizeDesktopPath = (pathName: string) => {
  for (const [source, destination] of DESKTOP_PATH_ALIASES) {
    if (pathName === source) {
      return destination;
    }

    if (pathName.startsWith(`${source}/`)) {
      return `${destination}${pathName.slice(source.length)}`;
    }
  }

  return pathName;
};

const getDesktopNavigationUrl = (url: string, appUrl: string) => {
  try {
    const nextUrl = new URL(url);
    const homeUrl = new URL(appUrl);

    if (!isAppOrigin(nextUrl, homeUrl)) {
      return null;
    }

    nextUrl.pathname = normalizeDesktopPath(nextUrl.pathname);

    if (!isAllowedDesktopPath(nextUrl.pathname)) {
      return null;
    }

    return nextUrl.toString();
  } catch {
    return null;
  }
};

const openOutsideDesktop = async (url: string) => {
  if (isHttpUrl(url) || url.startsWith('mailto:')) {
    await shell.openExternal(url);
  }
};

const isTrustedAppUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url);
    const appUrl = new URL(getLegisDexBaseUrl());

    return (
      parsedUrl.origin === appUrl.origin ||
      (!app.isPackaged && parsedUrl.origin === new URL(LOCAL_WEB_URL).origin)
    );
  } catch {
    return false;
  }
};

const configureAppSecurity = () => {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });

    contents.on('select-bluetooth-device', (event) => {
      event.preventDefault();
    });
  });

  app.on('browser-window-created', (_event, window) => {
    window.webContents.on('will-prevent-unload', (event) => {
      event.preventDefault();
    });
  });

  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowedPermissions = new Set(['clipboard-sanitized-write']);
      const originIsTrusted = isTrustedAppUrl(webContents.getURL());

      callback(originIsTrusted && allowedPermissions.has(permission));
    },
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) => {
      const allowedPermissions = new Set(['clipboard-sanitized-write']);

      return (
        Boolean(webContents) &&
        isTrustedAppUrl(requestingOrigin) &&
        allowedPermissions.has(permission)
      );
    },
  );
};

let mainWindow: BrowserWindow | null = null;

const loadLegisDex = async (window: BrowserWindow) => {
  await window.loadURL(getLegisDexUrl());
};

const loadFallback = async (window: BrowserWindow) => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    return;
  }

  const fallbackFilePath = path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
  );

  await window.loadFile(fallbackFilePath);
};

const createWindow = async () => {
  const legisDexUrl = getLegisDexUrl();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'LegisDex',
    icon: getPublicAssetPath(WINDOW_ICON),
    backgroundColor: '#050505',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#f8fafc',
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
      webviewTag: false,
    },
  });

  mainWindow.webContents.setUserAgent(
    `${mainWindow.webContents.getUserAgent()} LegisDexDesktop/${app.getVersion()}`,
  );

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();

    if (!app.isPackaged) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const desktopUrl = getDesktopNavigationUrl(url, legisDexUrl);

    if (desktopUrl) {
      mainWindow?.loadURL(desktopUrl);
      return { action: 'deny' };
    }

    openOutsideDesktop(url);

    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const desktopUrl = getDesktopNavigationUrl(url, legisDexUrl);

    if (!desktopUrl) {
      event.preventDefault();
      openOutsideDesktop(url);
      return;
    }

    if (desktopUrl !== url) {
      event.preventDefault();
      mainWindow?.loadURL(desktopUrl);
    }
  });

  mainWindow.webContents.on('did-navigate-in-page', (_event, url) => {
    if (url.startsWith('file:')) {
      return;
    }

    const desktopUrl = getDesktopNavigationUrl(url, legisDexUrl);

    if (desktopUrl) {
      if (desktopUrl !== url) {
        mainWindow?.loadURL(desktopUrl);
      }
      return;
    }

    openOutsideDesktop(url);
    mainWindow?.loadURL(legisDexUrl);
  });

  mainWindow.webContents.on('did-fail-load', async (_event, _code, _desc, url) => {
    if (url === legisDexUrl) {
      await loadFallback(mainWindow as BrowserWindow);
    }
  });

  await loadLegisDex(mainWindow);
};

app.setAppUserModelId('com.legisdex.desktop');

app.on('ready', async () => {
  configureAppSecurity();
  Menu.setApplicationMenu(null);
  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

ipcMain.handle('legisdex:get-config', () => ({
  url: getLegisDexUrl(),
  baseUrl: getLegisDexBaseUrl(),
  allowedPathPrefixes: DESKTOP_PATH_PREFIXES,
  pathAliases: Object.fromEntries(DESKTOP_PATH_ALIASES),
  isPackaged: app.isPackaged,
}));

ipcMain.handle('legisdex:retry', async () => {
  if (!mainWindow) {
    return;
  }

  await loadLegisDex(mainWindow);
});

ipcMain.handle('legisdex:open-external', async (_event, url: string) => {
  await openOutsideDesktop(url);
});
