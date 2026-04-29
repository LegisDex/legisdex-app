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
const WINDOW_CONTROLS_WIDTH = 138;
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

const titleCaseSegment = (segment: string) =>
  segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const getTopbarLocation = (url: string, pageTitle = 'Workspace') => {
  try {
    const parsedUrl = new URL(url);
    const pathName = normalizeDesktopPath(parsedUrl.pathname);
    const segments = pathName.split('/').filter(Boolean);

    if (pathName.startsWith('/chat/account')) {
      return {
        section: 'Account',
        detail: titleCaseSegment(segments[2] ?? 'Profile'),
      };
    }

    if (pathName.startsWith('/chat/checkout')) {
      return { section: 'Billing', detail: 'Checkout' };
    }

    if (pathName.startsWith('/chat/return')) {
      return { section: 'Billing', detail: 'Return' };
    }

    if (pathName.startsWith('/tracker')) {
      const lastSegment = segments.length > 0 ? segments[segments.length - 1] : '';
      return {
        section: 'Tracker',
        detail: segments[1] ? titleCaseSegment(lastSegment || 'Project') : 'Projects',
      };
    }

    if (pathName.startsWith('/compliance')) {
      return {
        section: 'Compliance',
        detail: segments[1] ? titleCaseSegment(segments[1]) : 'Workspace',
      };
    }

    if (pathName.startsWith('/chat')) {
      return {
        section: 'Chat',
        detail: segments[1] ? 'Conversation' : 'New Chat',
      };
    }

    if (pathName.startsWith('/sign-in')) return { section: 'Auth', detail: 'Sign In' };
    if (pathName.startsWith('/sign-up')) return { section: 'Auth', detail: 'Sign Up' };
    if (pathName.startsWith('/forgot-password')) {
      return { section: 'Auth', detail: 'Forgot Password' };
    }
    if (pathName.startsWith('/reset-password')) {
      return { section: 'Auth', detail: 'Reset Password' };
    }
    if (pathName.startsWith('/verify-email')) {
      return { section: 'Auth', detail: 'Verify Email' };
    }

    const title = pageTitle.replace(/\s*[|-]\s*LegisDex\s*$/i, '').trim();
    return { section: title || 'Workspace', detail: '' };
  } catch {
    return { section: 'Workspace', detail: '' };
  }
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
let topbarView: BrowserView | null = null;
let isMainContentLoading = false;

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

const loadLegisDex = async (window: BrowserWindow) => {
  await window.loadURL(getLegisDexUrl());
};

const loadFallback = async (window: BrowserWindow) => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    return;
  }

  await window.loadFile(getRendererIndexPath());
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

const updateTopbarBounds = () => {
  if (!mainWindow || !topbarView) {
    return;
  }

  const [width] = mainWindow.getContentSize();

  topbarView.setBounds({
    x: 0,
    y: 0,
    width: Math.max(320, width - WINDOW_CONTROLS_WIDTH),
    height: TITLEBAR_HEIGHT,
  });
};

const getMainContentActions = async () => {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) {
    return { hasSidebar: false, hasTheme: false };
  }

  try {
    return await mainWindow.webContents.executeJavaScript(
      `(() => ({
        hasSidebar: Boolean(document.querySelector('[data-legisdex-sidebar-trigger]')),
        hasTheme: Boolean(document.querySelector('[data-legisdex-theme-toggle]'))
      }))()`,
      true,
    );
  } catch {
    return { hasSidebar: false, hasTheme: false };
  }
};

const sendTopbarState = async () => {
  if (!mainWindow || !topbarView || topbarView.webContents.isDestroyed()) {
    return;
  }

  const { hasSidebar, hasTheme } = await getMainContentActions();
  const location = getTopbarLocation(
    mainWindow.webContents.getURL(),
    mainWindow.webContents.getTitle(),
  );

  topbarView.webContents.send('legisdex:topbar-state', {
    ...location,
    canGoBack: mainWindow.webContents.canGoBack(),
    canGoForward: mainWindow.webContents.canGoForward(),
    isLoading: isMainContentLoading,
    hasSidebar,
    hasTheme,
  });
};

const clickMainContentSelector = async (selector: string) => {
  if (!mainWindow) {
    return;
  }

  await mainWindow.webContents.executeJavaScript(
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
    backgroundColor: '#050505',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
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

  mainWindow.webContents.setUserAgent(
    `${mainWindow.webContents.getUserAgent()} LegisDexDesktop/${app.getVersion()}`,
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

  mainWindow.setBrowserView(topbarView);
  updateTopbarBounds();
  await loadTopbar(topbarView);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();

    if (!app.isPackaged) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  topbarView.webContents.on('did-finish-load', () => {
    void sendTopbarState();
  });

  mainWindow.on('resize', updateTopbarBounds);
  mainWindow.on('maximize', updateTopbarBounds);
  mainWindow.on('unmaximize', updateTopbarBounds);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const desktopUrl = getDesktopNavigationUrl(url, legisDexUrl);

    if (desktopUrl) {
      mainWindow?.loadURL(desktopUrl);
      return { action: 'deny' };
    }

    if (isSameAppNavigation(url, legisDexUrl)) {
      return { action: 'deny' };
    }

    openOutsideDesktop(url);

    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isSameAppNavigation(url, legisDexUrl)) {
      event.preventDefault();
      openOutsideDesktop(url);
    }
  });

  mainWindow.webContents.on('did-start-loading', () => {
    isMainContentLoading = true;
    void sendTopbarState();
  });

  mainWindow.webContents.on('did-stop-loading', () => {
    isMainContentLoading = false;
    void sendTopbarState();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    void sendTopbarState();
    setTimeout(() => void sendTopbarState(), 500);
  });

  mainWindow.webContents.on('page-title-updated', () => {
    void sendTopbarState();
  });

  mainWindow.webContents.on('did-navigate', () => {
    void sendTopbarState();
  });

  mainWindow.webContents.on('did-navigate-in-page', (_event, url) => {
    if (url.startsWith('file:') || isSameAppNavigation(url, legisDexUrl)) {
      void sendTopbarState();
      return;
    }

    openOutsideDesktop(url);
    void sendTopbarState();
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

ipcMain.handle('legisdex:topbar-action', async (_event, action: string) => {
  if (!mainWindow) {
    return;
  }

  if (action === 'back' && mainWindow.webContents.canGoBack()) {
    mainWindow.webContents.goBack();
    return;
  }

  if (action === 'forward' && mainWindow.webContents.canGoForward()) {
    mainWindow.webContents.goForward();
    return;
  }

  if (action === 'reload') {
    mainWindow.webContents.reload();
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
  if (!mainWindow) {
    return;
  }

  await loadLegisDex(mainWindow);
});

ipcMain.handle('legisdex:open-external', async (_event, url: string) => {
  if (isSameAppNavigation(url, getLegisDexUrl())) {
    return;
  }

  await openOutsideDesktop(url);
});
