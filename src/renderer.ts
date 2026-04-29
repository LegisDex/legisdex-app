import './index.css';

type DesktopBridge = {
  getConfig: () => Promise<{
    url: string;
    baseUrl: string;
    allowedPathPrefixes: string[];
    pathAliases: Record<string, string>;
    isPackaged: boolean;
  }>;
  retry: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
};

declare global {
  interface Window {
    legisdexDesktop?: DesktopBridge;
  }
}

const statusElement = document.querySelector<HTMLParagraphElement>('[data-status]');
const retryButton = document.querySelector<HTMLButtonElement>('[data-retry]');
const browserButton = document.querySelector<HTMLButtonElement>('[data-browser]');

const setStatus = (message: string) => {
  if (statusElement) {
    statusElement.textContent = message;
  }
};

const getConfig = async () => {
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

const init = async () => {
  const config = await getConfig();

  setStatus(
    config.isPackaged
      ? `Could not reach ${config.url}. Check your connection and try again.`
      : `Could not reach ${config.url}. Start the Next.js app with npm run dev, then retry.`,
  );

  retryButton?.addEventListener('click', () => {
    setStatus('Trying to connect to LegisDex...');
    window.legisdexDesktop?.retry();
  });

  browserButton?.addEventListener('click', () => {
    window.legisdexDesktop?.openExternal(config.url);
  });
};

init();
