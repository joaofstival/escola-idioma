// Ponte segura entre renderer (sem Node) e main. Única superfície exposta: window.escola.
import { contextBridge, ipcRenderer } from 'electron';
import type { ApiRequest, EscolaBridge } from '../shared/types.ts';

const bridge: EscolaBridge = {
  request: (req: ApiRequest) => ipcRenderer.invoke('api:request', req),
  saveFile: (defaultName: string, content: string) => ipcRenderer.invoke('file:save', defaultName, content),
  saveBinary: (nome: string, base64: string) => ipcRenderer.invoke('file:save-binary', nome, base64),
  exportarBackup: () => ipcRenderer.invoke('backup:exportar'),
  restaurarBackup: () => ipcRenderer.invoke('backup:restaurar'),
};

contextBridge.exposeInMainWorld('escola', bridge);
