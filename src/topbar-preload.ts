import { contextBridge, ipcRenderer } from 'electron';

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
