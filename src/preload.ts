import { contextBridge, ipcRenderer } from 'electron';

type DesktopConfig = {
  url: string;
  baseUrl: string;
  allowedPathPrefixes: string[];
  pathAliases: Record<string, string>;
  isPackaged: boolean;
};

const TITLEBAR_HEIGHT = 40;
const TITLEBAR_ID = 'legisdex-desktop-titlebar';
const TITLEBAR_STYLE_ID = 'legisdex-desktop-titlebar-style';
const WINDOW_CONTROLS_WIDTH = 138;
const TITLEBAR_INJECTION_RETRIES = 80;

let desktopConfig: DesktopConfig | null = null;
let titleWatchersInstalled = false;
let removalObserverInstalled = false;
let actionObserverInstalled = false;

document.documentElement.dataset.legisdexRuntime = 'desktop';
document.documentElement.style.setProperty(
  '--legisdex-titlebar-height',
  `${TITLEBAR_HEIGHT}px`,
);
document.documentElement.style.setProperty(
  '--legisdex-window-controls-width',
  `${WINDOW_CONTROLS_WIDTH}px`,
);

const clickFirstVisible = (selector: string) => {
  const controls = Array.from(document.querySelectorAll<HTMLElement>(selector));
  const control = controls.find((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  });

  (control ?? controls[0])?.click();
};

const getLogoUrl = () => {
  if (!desktopConfig) {
    return '/logo-small.png';
  }

  return new URL('/logo-small.png', desktopConfig.baseUrl).toString();
};

const titleCaseSegment = (segment: string) =>
  segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const getDocumentPageName = () => {
  const title = document.title.replace(/\s*[|-]\s*LegisDex\s*$/i, '').trim();
  return title || 'Workspace';
};

const getPageLocation = () => {
  const pathName = window.location.pathname;
  const segments = pathName.split('/').filter(Boolean);

  if (pathName.startsWith('/chat/account')) {
    return {
      section: 'Account',
      detail: titleCaseSegment(segments[2] ?? 'profile'),
    };
  }

  if (pathName.startsWith('/chat/checkout')) {
    return { section: 'Billing', detail: 'Checkout' };
  }

  if (pathName.startsWith('/chat/return')) {
    return { section: 'Billing', detail: 'Return' };
  }

  if (pathName.startsWith('/tracker')) {
    const section = 'Tracker';
    const detail = segments[1]
      ? titleCaseSegment(segments.at(-1) ?? 'Project')
      : 'Projects';
    return { section, detail };
  }

  if (pathName.startsWith('/compliance')) {
    const detail = segments[1] ? titleCaseSegment(segments[1]) : 'Workspace';
    return { section: 'Compliance', detail };
  }

  if (pathName.startsWith('/chat')) {
    return { section: 'Chat', detail: segments[1] ? 'Conversation' : 'New Chat' };
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

  return { section: getDocumentPageName(), detail: '' };
};

const updateTitlebarTitle = () => {
  const { section, detail } = getPageLocation();
  const sectionElement = document.querySelector<HTMLElement>(
    '[data-legisdex-page-section]',
  );
  const detailElement = document.querySelector<HTMLElement>(
    '[data-legisdex-page-detail]',
  );
  const separatorElement = document.querySelector<HTMLElement>(
    '[data-legisdex-page-separator]',
  );
  const nextTitle = `${detail ? `${detail} - ${section}` : section} - LegisDex`;

  if (sectionElement) {
    sectionElement.textContent = section;
  }

  if (detailElement) {
    detailElement.textContent = detail;
    detailElement.hidden = !detail;
  }

  if (separatorElement) {
    separatorElement.hidden = !detail;
  }

  if (document.title !== nextTitle) {
    document.title = nextTitle;
  }
};

const updateTitlebarActions = () => {
  const themeButton = document.querySelector<HTMLButtonElement>(
    '[data-legisdex-titlebar-theme]',
  );
  const sidebarButton = document.querySelector<HTMLButtonElement>(
    '[data-legisdex-titlebar-sidebar]',
  );
  const hasThemeToggle = Boolean(
    document.querySelector('[data-legisdex-theme-toggle]'),
  );
  const hasSidebarTrigger = Boolean(
    document.querySelector('[data-legisdex-sidebar-trigger]'),
  );

  if (themeButton) {
    themeButton.hidden = !hasThemeToggle;
  }

  if (sidebarButton) {
    sidebarButton.hidden = !hasSidebarTrigger;
  }
};

const applyTitlebarAssets = () => {
  const logo = document.querySelector<HTMLImageElement>(
    `#${TITLEBAR_ID} [data-legisdex-logo]`,
  );

  if (logo) {
    logo.src = getLogoUrl();
  }
};

const isAllowedPath = (pathName: string) =>
  desktopConfig?.allowedPathPrefixes.some(
    (prefix) => pathName === prefix || pathName.startsWith(`${prefix}/`),
  ) ?? false;

const normalizeDesktopPath = (pathName: string) => {
  if (!desktopConfig) {
    return pathName;
  }

  for (const [source, destination] of Object.entries(desktopConfig.pathAliases)) {
    if (pathName === source) {
      return destination;
    }

    if (pathName.startsWith(`${source}/`)) {
      return `${destination}${pathName.slice(source.length)}`;
    }
  }

  return pathName;
};

const getDesktopUrl = (href: string) => {
  if (!desktopConfig) {
    return href;
  }

  try {
    const targetUrl = new URL(href, window.location.href);
    const baseUrl = new URL(desktopConfig.baseUrl);

    if (targetUrl.origin !== baseUrl.origin) {
      return null;
    }

    targetUrl.pathname = normalizeDesktopPath(targetUrl.pathname);

    if (!isAllowedPath(targetUrl.pathname)) {
      return null;
    }

    return targetUrl.toString();
  } catch {
    return null;
  }
};

const ensureTitlebarStyle = () => {
  if (document.getElementById(TITLEBAR_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = TITLEBAR_STYLE_ID;
  style.textContent = `
    :root {
      --legisdex-titlebar-height: ${TITLEBAR_HEIGHT}px;
      --legisdex-window-controls-width: ${WINDOW_CONTROLS_WIDTH}px;
    }

    body[data-legisdex-fallback-shell="true"] {
      padding-top: var(--legisdex-titlebar-height) !important;
    }

    body[data-legisdex-fallback-shell="true"] .shell {
      min-height: calc(100vh - var(--legisdex-titlebar-height)) !important;
    }

    #${TITLEBAR_ID} {
      position: fixed !important;
      top: 0 !important;
      right: 0 !important;
      left: 0 !important;
      z-index: 2147483647 !important;
      display: grid !important;
      grid-template-columns: auto auto minmax(12rem, 1fr);
      width: 100vw !important;
      height: var(--legisdex-titlebar-height) !important;
      min-height: var(--legisdex-titlebar-height) !important;
      max-height: var(--legisdex-titlebar-height) !important;
      box-sizing: border-box !important;
      padding-right: var(--legisdex-window-controls-width) !important;
      overflow: hidden !important;
      visibility: visible !important;
      opacity: 1 !important;
      pointer-events: auto !important;
      color: #f8fafc !important;
      background:
        linear-gradient(90deg, rgba(5, 5, 5, 0.97), rgba(9, 17, 29, 0.94)),
        rgba(5, 5, 5, 0.95) !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 0.8rem 2rem rgba(0, 0, 0, 0.18);
      backdrop-filter: blur(20px);
      app-region: drag;
      -webkit-app-region: drag;
      cursor: default;
      user-select: none;
      font-family:
        Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
        sans-serif;
    }

    .legisdex-titlebar-brand {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      min-width: 0;
      padding-left: 0.85rem;
      app-region: drag;
      -webkit-app-region: drag;
      font-size: 0.78rem;
      font-weight: 850;
      letter-spacing: 0;
    }

    .legisdex-titlebar-mark {
      display: grid;
      width: 1.45rem;
      height: 1.45rem;
      place-items: center;
      overflow: hidden;
      border-radius: 7px;
      color: #06111f;
      background: linear-gradient(135deg, #f8fafc, #67e8f9 52%, #14b8a6);
      box-shadow: 0 0 1.2rem rgba(20, 184, 166, 0.26);
    }

    .legisdex-titlebar-mark img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .legisdex-titlebar-center {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      height: 100%;
      padding: 0 1.35rem;
      color: #cbd5e1;
      font-size: 0.78rem;
      font-weight: 760;
      letter-spacing: 0;
      app-region: drag;
      -webkit-app-region: drag;
      background:
        linear-gradient(90deg, rgba(56, 189, 248, 0.06), transparent 35%, rgba(20, 184, 166, 0.06));
      border-left: 1px solid rgba(255, 255, 255, 0.07);
    }

    .legisdex-titlebar-actions {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding-left: 0.45rem;
      app-region: no-drag;
      -webkit-app-region: no-drag;
    }

    .legisdex-titlebar-action {
      display: grid;
      width: 28px;
      height: 28px;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: #dbeafe;
      background: rgba(255, 255, 255, 0.055);
      box-shadow: none;
      cursor: pointer;
      font: inherit;
      font-size: 0.88rem;
      line-height: 1;
      transition:
        color 150ms ease,
        background 150ms ease,
        border-color 150ms ease;
      app-region: no-drag;
      -webkit-app-region: no-drag;
    }

    .legisdex-titlebar-action:hover {
      color: #ffffff;
      background: rgba(56, 189, 248, 0.14);
      border-color: rgba(125, 211, 252, 0.34);
    }

    .legisdex-titlebar-action[hidden] {
      display: none;
    }

    .legisdex-titlebar-location {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      max-width: min(36rem, 52vw);
      height: 24px;
      gap: 0.45rem;
      padding: 0 0.72rem;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.045);
      white-space: nowrap;
      app-region: drag;
      -webkit-app-region: drag;
    }

    .legisdex-titlebar-section {
      min-width: 0;
      overflow: hidden;
      color: #f8fafc;
      font-weight: 850;
      text-overflow: ellipsis;
    }

    .legisdex-titlebar-separator {
      color: rgba(203, 213, 225, 0.44);
      font-weight: 700;
    }

    .legisdex-titlebar-detail {
      max-width: min(28rem, 62vw);
      overflow: hidden;
      color: #94a3b8;
      text-overflow: ellipsis;
      font-weight: 760;
    }

    .legisdex-titlebar-detail[hidden],
    .legisdex-titlebar-separator[hidden] {
      display: none;
    }
  `;

  document.head.append(style);
};

const ensureTitlebarElement = () => {
  if (document.getElementById(TITLEBAR_ID)) {
    return;
  }

  if (document.querySelector('.shell')) {
    document.body.dataset.legisdexFallbackShell = 'true';
  }

  const titlebar = document.createElement('div');
  titlebar.id = TITLEBAR_ID;
  titlebar.innerHTML = `
    <div class="legisdex-titlebar-brand">
      <span class="legisdex-titlebar-mark">
        <img data-legisdex-logo src="${getLogoUrl()}" alt="" />
      </span>
      <span>LegisDex</span>
    </div>
    <div class="legisdex-titlebar-actions">
      <button class="legisdex-titlebar-action" type="button" data-legisdex-titlebar-sidebar aria-label="Toggle sidebar" title="Toggle sidebar">☰</button>
      <button class="legisdex-titlebar-action" type="button" data-legisdex-titlebar-theme aria-label="Toggle theme" title="Toggle theme">◐</button>
    </div>
    <div class="legisdex-titlebar-center">
      <span class="legisdex-titlebar-location" aria-live="polite">
        <span class="legisdex-titlebar-section" data-legisdex-page-section></span>
        <span class="legisdex-titlebar-separator" data-legisdex-page-separator>/</span>
        <span class="legisdex-titlebar-detail" data-legisdex-page-detail></span>
      </span>
    </div>
  `;

  titlebar.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const action = target?.closest<HTMLElement>(
      '[data-legisdex-titlebar-sidebar], [data-legisdex-titlebar-theme]',
    );

    if (!action) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (action.hasAttribute('data-legisdex-titlebar-sidebar')) {
      clickFirstVisible('[data-legisdex-sidebar-trigger]');
      return;
    }

    clickFirstVisible('[data-legisdex-theme-toggle]');
  });

  document.body.append(titlebar);
  updateTitlebarActions();
};

const installTitleWatchers = () => {
  if (titleWatchersInstalled) {
    return;
  }

  titleWatchersInstalled = true;

  const title = document.querySelector('title');

  if (title) {
    new MutationObserver(updateTitlebarTitle).observe(title, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  const notifyNavigation = () => window.setTimeout(updateTitlebarTitle, 0);
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    notifyNavigation();
    return result;
  };

  history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    notifyNavigation();
    return result;
  };

  window.addEventListener('popstate', notifyNavigation);
  window.addEventListener('hashchange', notifyNavigation);
};

const installRemovalObserver = () => {
  if (removalObserverInstalled) {
    return;
  }

  removalObserverInstalled = true;

  new MutationObserver(() => {
    if (!document.getElementById(TITLEBAR_ID)) {
      window.setTimeout(injectTitlebar, 50);
    }
  }).observe(document.body, { childList: true });
};

const installActionObserver = () => {
  if (actionObserverInstalled) {
    return;
  }

  actionObserverInstalled = true;

  new MutationObserver(() => {
    window.setTimeout(updateTitlebarActions, 50);
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'data-state'],
  });
};

function injectTitlebar() {
  if (!document.body || !document.head) {
    return;
  }

  document.documentElement.dataset.legisdexRuntime = 'desktop';
  document.documentElement.style.setProperty(
    '--legisdex-titlebar-height',
    `${TITLEBAR_HEIGHT}px`,
  );
  document.documentElement.style.setProperty(
    '--legisdex-window-controls-width',
    `${WINDOW_CONTROLS_WIDTH}px`,
  );

  ensureTitlebarStyle();
  ensureTitlebarElement();
  applyTitlebarAssets();
  updateTitlebarTitle();
  updateTitlebarActions();
  installTitleWatchers();
  installRemovalObserver();
  installActionObserver();
}

const scheduleTitlebarInjection = () => {
  injectTitlebar();
  window.setTimeout(injectTitlebar, 100);
  window.setTimeout(injectTitlebar, 800);
};

const waitForBodyAndInject = () => {
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    injectTitlebar();

    if (document.getElementById(TITLEBAR_ID) || attempts >= TITLEBAR_INJECTION_RETRIES) {
      window.clearInterval(timer);
    }
  }, 50);
};

ipcRenderer.invoke('legisdex:get-config').then((config: DesktopConfig) => {
  desktopConfig = config;
  applyTitlebarAssets();
  updateTitlebarTitle();
});

if (document.readyState === 'loading') {
  waitForBodyAndInject();
  window.addEventListener('DOMContentLoaded', scheduleTitlebarInjection, {
    once: true,
  });
} else if (document.readyState === 'complete') {
  scheduleTitlebarInjection();
} else {
  window.addEventListener('load', scheduleTitlebarInjection, { once: true });
}

window.addEventListener(
  'click',
  (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest<HTMLAnchorElement>('a[href]');
    const desktopUrl = link?.href ? getDesktopUrl(link.href) : null;

    if (!link || !link.href) {
      return;
    }

    if (desktopUrl) {
      if (desktopUrl !== link.href) {
        event.preventDefault();
        window.location.assign(desktopUrl);
      }
      return;
    }

    event.preventDefault();
    ipcRenderer.invoke('legisdex:open-external', link.href);
  },
  true,
);

contextBridge.exposeInMainWorld('legisdexDesktop', {
  getConfig: () => ipcRenderer.invoke('legisdex:get-config'),
  retry: () => ipcRenderer.invoke('legisdex:retry'),
  openExternal: (url: string) => ipcRenderer.invoke('legisdex:open-external', url),
});
