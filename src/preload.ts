import { contextBridge, ipcRenderer } from 'electron';

type DesktopConfig = {
  url: string;
  baseUrl: string;
  allowedPathPrefixes: string[];
  pathAliases: Record<string, string>;
  isPackaged: boolean;
};

let desktopConfig: DesktopConfig | null = null;

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

ipcRenderer.invoke('legisdex:get-config').then((config: DesktopConfig) => {
  desktopConfig = config;
});

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
  openInBrowser: (url: string) =>
    ipcRenderer.invoke('legisdex:open-in-browser', url),
});
