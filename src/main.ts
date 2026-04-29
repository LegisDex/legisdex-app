import {
  app,
  BrowserView,
  BrowserWindow,
  ipcMain,
  Menu,
  session,
  shell,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

if (started) {
  app.quit();
}

const FALLBACK_WEB_URL = 'https://www.legisdex.com';
const LOCAL_WEB_URL = 'http://localhost:3000';
const DESKTOP_START_PATH = '/chat';
const TITLEBAR_HEIGHT = 40;
const TITLEBAR_BACKGROUND = '#202024';
const TITLEBAR_OVERLAY_BACKGROUND = '#00000000';
const DESKTOP_PATH_ALIASES = [
  ['/account', '/chat/account'],
  ['/checkout', '/chat/checkout'],
  ['/return', '/chat/return'],
] as const;
const DESKTOP_PATH_PREFIXES = [
  '/chat',
  '/account',
  '/checkout',
  '/compliance',
  '/return',
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
  app.isPackaged
    ? path.join(process.resourcesPath, fileName)
    : path.join(process.cwd(), PUBLIC_ASSET_DIR, fileName);

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

const isLegisDexHost = (hostname: string) => {
  const normalizedHost = hostname.toLowerCase();

  return (
    normalizedHost === 'legisdex.com' ||
    normalizedHost === 'www.legisdex.com' ||
    normalizedHost.endsWith('.legisdex.com') ||
    normalizedHost === 'localhost' ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost === '::1' ||
    normalizedHost === '[::1]'
  );
};

const isLegisDexUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url);

    return isLegisDexHost(parsedUrl.hostname);
  } catch {
    return false;
  }
};

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

const isSameAppNavigation = (url: string, appUrl: string) => {
  try {
    const nextUrl = new URL(url);
    const homeUrl = new URL(appUrl);

    return isAppOrigin(nextUrl, homeUrl) || isLegisDexHost(nextUrl.hostname);
  } catch {
    return false;
  }
};

const openOutsideDesktop = async (url: string) => {
  if (isLegisDexUrl(url)) {
    return;
  }

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
let mainContentView: BrowserView | null = null;
let topbarView: BrowserView | null = null;

const getRendererIndexPath = () =>
  path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);

const getRendererDevUrl = (searchParams?: Record<string, string>) => {
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return null;
  }

  const url = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  return url.toString();
};

const getMainContentWebContents = () => {
  if (!mainContentView || mainContentView.webContents.isDestroyed()) {
    return null;
  }

  return mainContentView.webContents;
};

const loadLegisDex = async () => {
  const contents = getMainContentWebContents();

  if (!contents) {
    return;
  }

  await contents.loadURL(getLegisDexUrl());
};

const loadFallback = async () => {
  const contents = getMainContentWebContents();

  if (!contents) {
    return;
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await contents.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    return;
  }

  await contents.loadFile(getRendererIndexPath());
};

const loadTopbar = async (view: BrowserView) => {
  const devUrl = getRendererDevUrl({ surface: 'topbar' });

  if (devUrl) {
    await view.webContents.loadURL(devUrl);
    return;
  }

  await view.webContents.loadFile(getRendererIndexPath(), {
    query: { surface: 'topbar' },
  });
};

const updateBrowserViewBounds = () => {
  if (!mainWindow || !mainContentView || !topbarView) {
    return;
  }

  const [width, height] = mainWindow.getContentSize();
  const viewWidth = Math.max(320, width);

  topbarView.setBounds({
    x: 0,
    y: 0,
    width: viewWidth,
    height: TITLEBAR_HEIGHT,
  });

  mainContentView.setBounds({
    x: 0,
    y: 0,
    width: viewWidth,
    height: Math.max(0, height),
  });
};

const sendTopbarState = async () => {
  const contents = getMainContentWebContents();

  if (!contents || !topbarView || topbarView.webContents.isDestroyed()) {
    return;
  }

  topbarView.webContents.send('legisdex:topbar-state', {
    canGoBack: contents.canGoBack(),
    canGoForward: contents.canGoForward(),
  });
};

const clickMainContentSelector = async (selector: string) => {
  const contents = getMainContentWebContents();

  if (!contents) {
    return;
  }

  await contents.executeJavaScript(
    `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      if (control instanceof HTMLElement) {
        control.click();
        return true;
      }
      return false;
    })()`,
    true,
  );
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
    backgroundColor: TITLEBAR_BACKGROUND,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: TITLEBAR_OVERLAY_BACKGROUND,
      symbolColor: '#f8fafc',
      height: TITLEBAR_HEIGHT,
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

  mainContentView = new BrowserView({
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

  mainContentView.webContents.setUserAgent(
    `${mainContentView.webContents.getUserAgent()} LegisDexDesktop/${app.getVersion()}`,
  );

  topbarView = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, 'topbar-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.addBrowserView(mainContentView);
  mainWindow.addBrowserView(topbarView);
  mainWindow.setTopBrowserView(topbarView);
  updateBrowserViewBounds();

  mainContentView.webContents.once('did-finish-load', () => {
    mainWindow?.show();

    if (!app.isPackaged) {
      mainContentView?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  await loadLegisDex();
  await loadTopbar(topbarView);

  topbarView.webContents.on('did-finish-load', () => {
    void sendTopbarState();
  });

  mainWindow.on('resize', updateBrowserViewBounds);
  mainWindow.on('maximize', updateBrowserViewBounds);
  mainWindow.on('unmaximize', updateBrowserViewBounds);

  mainContentView.webContents.setWindowOpenHandler(({ url }) => {
    const desktopUrl = getDesktopNavigationUrl(url, legisDexUrl);

    if (desktopUrl) {
      void mainContentView?.webContents.loadURL(desktopUrl);
      return { action: 'deny' };
    }

    if (isSameAppNavigation(url, legisDexUrl)) {
      return { action: 'deny' };
    }

    openOutsideDesktop(url);

    return { action: 'deny' };
  });

  mainContentView.webContents.on('will-navigate', (event, url) => {
    if (!isSameAppNavigation(url, legisDexUrl)) {
      event.preventDefault();
      openOutsideDesktop(url);
    }
  });

  mainContentView.webContents.on('did-start-loading', () => {
    void sendTopbarState();
  });

  mainContentView.webContents.on('did-stop-loading', () => {
    void sendTopbarState();
  });

  mainContentView.webContents.on('did-finish-load', () => {
    void sendTopbarState();
    setTimeout(() => void sendTopbarState(), 500);
  });

  mainContentView.webContents.on('page-title-updated', () => {
    void sendTopbarState();
  });

  mainContentView.webContents.on('did-navigate', () => {
    void sendTopbarState();
  });

  mainContentView.webContents.on('did-navigate-in-page', (_event, url) => {
    if (url.startsWith('file:') || isSameAppNavigation(url, legisDexUrl)) {
      void sendTopbarState();
      return;
    }

    openOutsideDesktop(url);
    void sendTopbarState();
  });

  mainContentView.webContents.on(
    'did-fail-load',
    async (_event, _code, _desc, url) => {
    if (url === legisDexUrl) {
      await loadFallback();
    }
    },
  );

  mainWindow.on('closed', () => {
    mainContentView = null;
    topbarView = null;
    mainWindow = null;
  });
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

ipcMain.handle('legisdex:topbar-action', async (_event, action: string) => {
  const contents = getMainContentWebContents();

  if (!contents) {
    return;
  }

  if (action === 'back' && contents.canGoBack()) {
    contents.goBack();
    return;
  }

  if (action === 'forward' && contents.canGoForward()) {
    contents.goForward();
    return;
  }

  if (action === 'reload') {
    contents.reload();
    return;
  }

  if (action === 'toggle-sidebar') {
    await clickMainContentSelector('[data-legisdex-sidebar-trigger]');
    setTimeout(() => void sendTopbarState(), 150);
    return;
  }

  if (action === 'toggle-theme') {
    await clickMainContentSelector('[data-legisdex-theme-toggle]');
  }
});

ipcMain.handle('legisdex:retry', async () => {
  if (!getMainContentWebContents()) {
    return;
  }

  await loadLegisDex();
});

ipcMain.handle('legisdex:open-external', async (_event, url: string) => {
  if (isSameAppNavigation(url, getLegisDexUrl())) {
    return;
  }

  await openOutsideDesktop(url);
});
