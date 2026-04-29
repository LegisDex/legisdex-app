import './index.css';

type DesktopConfig = {
  url: string;
  baseUrl: string;
  allowedPathPrefixes: string[];
  pathAliases: Record<string, string>;
  isPackaged: boolean;
};

type DesktopBridge = {
  getConfig: () => Promise<DesktopConfig>;
  retry: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  openInBrowser: (url: string) => Promise<void>;
};

type TopbarAction =
  | 'back'
  | 'forward'
  | 'reload'
  | 'toggle-sidebar'
  | 'toggle-theme';

type TopbarState = {
  canGoBack: boolean;
  canGoForward: boolean;
  theme: 'light' | 'dark';
};

type TopbarBridge = {
  action: (action: TopbarAction) => Promise<void>;
  onState: (callback: (state: TopbarState) => void) => () => void;
};

declare global {
  interface Window {
    legisdexDesktop?: DesktopBridge;
    legisdexTopbar?: TopbarBridge;
  }
}

const isTopbarSurface =
  new URLSearchParams(window.location.search).get('surface') === 'topbar';

const getConfig = async (): Promise<DesktopConfig> => {
  if (!window.legisdexDesktop) {
    return {
      url: 'https://www.legisdex.com/chat',
      baseUrl: 'https://www.legisdex.com',
      allowedPathPrefixes: ['/chat', '/compliance', '/tracker', '/sign-in', '/sign-up'],
      pathAliases: {
        '/account': '/chat/account',
        '/checkout': '/chat/checkout',
        '/return': '/chat/return',
      },
      isPackaged: true,
    };
  }

  return window.legisdexDesktop.getConfig();
};

const icon = {
  sidebar:
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5.75h12M4 10h12M4 14.25h8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  back:
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 5 7.5 10l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  forward:
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  reload:
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.3 6.6A6 6 0 1 0 16 10" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"/><path d="M15.5 3.7v3.1h-3.1" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  theme:
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13.8 13.8A6.2 6.2 0 0 1 6.2 6.2 5.6 5.6 0 1 0 13.8 13.8Z" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const initTopbar = () => {
  document.body.className = 'topbar-surface';
  document.body.dataset.theme = 'dark';
  document.body.innerHTML = `
    <main class="topbar-shell" aria-label="LegisDex desktop toolbar">
      <div class="topbar-left">
        <span class="topbar-mark" aria-hidden="true">
          <img src="./logo-small.png" alt="" />
        </span>
        <span class="topbar-brand">LegisDex</span>
        <span class="topbar-divider" aria-hidden="true"></span>
        <button class="topbar-icon-button" type="button" data-action="toggle-sidebar" aria-label="Toggle sidebar" title="Toggle sidebar">${icon.sidebar}</button>
        <button class="topbar-icon-button" type="button" data-action="back" aria-label="Back" title="Back">${icon.back}</button>
        <button class="topbar-icon-button" type="button" data-action="forward" aria-label="Forward" title="Forward">${icon.forward}</button>
        <button class="topbar-icon-button" type="button" data-action="reload" aria-label="Reload" title="Reload">${icon.reload}</button>
        <button class="topbar-icon-button" type="button" data-action="toggle-theme" aria-label="Toggle theme" title="Toggle theme">${icon.theme}</button>
      </div>
    </main>
  `;

  const backButton = document.querySelector<HTMLButtonElement>('[data-action="back"]');
  const forwardButton =
    document.querySelector<HTMLButtonElement>('[data-action="forward"]');

  document.body.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest<HTMLButtonElement>('[data-action]');
    const action = button?.dataset.action as TopbarAction | undefined;

    if (!action || button?.disabled) {
      return;
    }

    window.legisdexTopbar?.action(action);
  });

  window.legisdexTopbar?.onState((state) => {
    document.body.dataset.theme = state.theme;

    if (backButton) {
      backButton.disabled = !state.canGoBack;
    }

    if (forwardButton) {
      forwardButton.disabled = !state.canGoForward;
    }
  });
};

const initFallback = async () => {
  document.body.classList.add('fallback-surface');

  const statusElement = document.querySelector<HTMLParagraphElement>('[data-status]');
  const retryButton = document.querySelector<HTMLButtonElement>('[data-retry]');
  const browserButton = document.querySelector<HTMLButtonElement>('[data-browser]');
  const config = await getConfig();

  if (statusElement) {
    statusElement.textContent = config.isPackaged
      ? `Could not reach ${config.url}. Check your connection and try again.`
      : `Could not reach ${config.url}. Start the Next.js app with npm run dev, then retry.`;
  }

  retryButton?.addEventListener('click', () => {
    if (statusElement) {
      statusElement.textContent = 'Trying to connect to LegisDex...';
    }
    window.legisdexDesktop?.retry();
  });

  browserButton?.addEventListener('click', () => {
    window.legisdexDesktop?.openInBrowser(config.url);
  });
};

if (isTopbarSurface) {
  initTopbar();
} else {
  initFallback();
}
