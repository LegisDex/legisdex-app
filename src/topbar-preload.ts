import { contextBridge, ipcRenderer } from 'electron';

type TopbarAction =
  | 'back'
  | 'forward'
  | 'reload'
  | 'toggle-sidebar'
  | 'toggle-theme';

type TopbarState = {
  section: string;
  detail: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  hasSidebar: boolean;
  hasTheme: boolean;
};

contextBridge.exposeInMainWorld('legisdexTopbar', {
  action: (action: TopbarAction) =>
    ipcRenderer.invoke('legisdex:topbar-action', action),
  onState: (callback: (state: TopbarState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: TopbarState) => {
      callback(state);
    };

    ipcRenderer.on('legisdex:topbar-state', listener);

    return () => {
      ipcRenderer.removeListener('legisdex:topbar-state', listener);
    };
  },
});
