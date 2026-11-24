import { ClienteCentral } from './cliente-central.ts';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'node:fs/promises';
import { readFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ApiRequest, ApiResponse } from '../shared/types.ts';
const DIST = import.meta.dirname,
  PRELOAD = join(DIST, 'preload.cjs'),
  INDEX_HTML = join(DIST, 'renderer', 'index.html'),
  RENDERER_URL = pathToFileURL(INDEX_HTML).href;
if (process.env.ESCOLA_USERDATA) app.setPath('userData', process.env.ESCOLA_USERDATA);
let endereco = process.env.ESCOLA_API_URL ?? 'http://127.0.0.1:3489';
try {
  if (!process.env.ESCOLA_API_URL) endereco = JSON.parse(readFileSync(join(app.getPath('userData'), 'conexao.json'), 'utf8')).endereco;
} catch {
  /* Primeira execução usa o servidor local. */
}
let central: ClienteCentral;
try {
  central = new ClienteCentral(endereco);
} catch {
  endereco = 'http://127.0.0.1:3489';
  central = new ClienteCentral(endereco);
}
let janela: BrowserWindow | null = null;
function ehExterno(url: string) {
  try {
    const u = new URL(url);
    return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}
function origemConfiavel(event: IpcMainInvokeEvent) {
  return (
    event.senderFrame?.url.split('#')[0] === RENDERER_URL &&
    event.sender.id === janela?.webContents.id &&
    event.senderFrame?.routingId === event.sender.mainFrame.routingId
  );
}
function registrarIpc(): void {
  ipcMain.handle('api:request', async (event, req: ApiRequest): Promise<ApiResponse> => {
    if (!origemConfiavel(event)) return { ok: false, status: 403, erro: 'Origem não autorizada' };
    if (req.path === '/cliente/conexao') {
      if (req.method === 'GET') return { ok: true, status: 200, data: { endereco } };
      if (req.method === 'PUT') {
        const valor = (req.body as { endereco?: unknown })?.endereco;
        if (typeof valor !== 'string') return { ok: false, status: 422, erro: 'Informe a URL da escola' };
        try {
          const novo = new ClienteCentral(valor);
          await writeFile(join(app.getPath('userData'), 'conexao.json'), JSON.stringify({ endereco: valor }), 'utf8');
          central = novo;
          endereco = valor;
          return { ok: true, status: 200, data: { ok: true } };
        } catch {
          return { ok: false, status: 422, erro: 'Use uma URL HTTPS válida; HTTP é permitido apenas localmente' };
        }
      }
    }
    return central.request(req);
  });

  ipcMain.handle('file:save-binary', async (event, nome: unknown, base64: unknown) => {
    if (!origemConfiavel(event)) throw new Error('Origem não autorizada');
    if (typeof nome !== 'string' || typeof base64 !== 'string' || base64.length > 512_000_000) throw new Error('Arquivo inválido');
    const padrao = basename(nome),
      ext = extname(padrao).slice(1).toLowerCase();
    if (!['pdf', 'png', 'jpg', 'jpeg', 'mp3', 'ogg', 'wav', 'db'].includes(ext)) throw new Error('Formato não permitido');
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.toString('base64') !== base64) throw new Error('Arquivo inválido');
    const r = await dialog.showSaveDialog({
      defaultPath: join(app.getPath('documents'), padrao),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (r.canceled || !r.filePath) return null;
    if (extname(r.filePath).slice(1).toLowerCase() !== ext) throw new Error('Mantenha a extensão original do arquivo');
    await writeFile(r.filePath, bytes);
    return r.filePath;
  });
  ipcMain.handle('file:save', async (event, defaultName: unknown, content: unknown): Promise<string | null> => {
    if (!origemConfiavel(event)) throw new Error('Origem não autorizada');
    if (typeof content !== 'string') throw new Error('Conteúdo inválido para salvar');
    const nome = basename(typeof defaultName === 'string' && defaultName.trim() ? defaultName : 'arquivo.txt');
    const ext = extname(nome).slice(1).toLowerCase();
    const filtros =
      ext === 'csv' ? [{ name: 'Planilha CSV', extensions: ['csv'] }] : ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [];
    const win = BrowserWindow.fromWebContents(event.sender);
    const opcoes = {
      defaultPath: join(app.getPath('documents'), nome),
      filters: [...filtros, { name: 'Todos os arquivos', extensions: ['*'] }],
    };
    const r = win ? await dialog.showSaveDialog(win, opcoes) : await dialog.showSaveDialog(opcoes);
    if (r.canceled || !r.filePath) return null;
    // CSV com BOM para o Excel reconhecer UTF-8 (acentos).
    const dados = ext === 'csv' && !content.startsWith('﻿') ? '﻿' + content : content;
    await writeFile(r.filePath, dados, 'utf8');
    return r.filePath;
  });
}

function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Escola de Idiomas',
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  janela.once('ready-to-show', () => janela?.show());
  janela.on('closed', () => {
    janela = null;
  });
  void janela.loadFile(INDEX_HTML);
  if (!app.isPackaged && process.env.ESCOLA_SCREENSHOT) capturarTelas(janela, process.env.ESCOLA_SCREENSHOT);
}

/**
 * Modo de verificação (desenvolvimento): ESCOLA_SCREENSHOT=<pasta> ESCOLA_ROTAS="alunos,turmas" npm start
 * abre cada rota, salva <pasta>/<rota>.png e fecha o app. Use ESCOLA_USERDATA para um banco separado.
 */
function capturarTelas(win: BrowserWindow, pasta: string): void {
  const rotas = (process.env.ESCOLA_ROTAS || 'dashboard')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  win.webContents.once('did-finish-load', async () => {
    mkdirSync(pasta, { recursive: true });
    if (process.env.ESCOLA_TEST_EMAIL && process.env.ESCOLA_TEST_PASSWORD) {
      await win.webContents.executeJavaScript(
        `window.escola.request({method:'POST',path:'/auth/login',body:${JSON.stringify({ email: process.env.ESCOLA_TEST_EMAIL, senha: process.env.ESCOLA_TEST_PASSWORD })}})`,
      );
      await win.loadFile(INDEX_HTML);
      await new Promise((r) => setTimeout(r, 800));
    }
    for (const rota of rotas) {
      await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify('#/' + rota)}`);
      await new Promise((r) => setTimeout(r, 1200));
      const img = await win.webContents.capturePage();
      const nome = rota.replace(/[^a-z0-9_-]+/gi, '_') || 'tela';
      await writeFile(join(pasta, `${nome}.png`), img.toPNG());
      console.log(`[screenshot] ${join(pasta, nome + '.png')}`);
    }
    app.quit();
  });
}

// Bloqueia navegação para fora do app e window.open; links http(s) abrem no navegador padrão.
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (ehExterno(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] === RENDERER_URL) return; // navegação interna (ex.: hash)
    event.preventDefault();
    if (ehExterno(url)) void shell.openExternal(url);
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });
  app.whenReady().then(() => {
    registrarIpc();
    ipcMain.handle('backup:exportar', () => ({ ok: false, cancelado: false, erro: 'Exporte a cópia na página Configurações.' }));
    ipcMain.handle('backup:restaurar', () => ({
      ok: false,
      cancelado: false,
      erro: 'A restauração é feita pelo operador com o servidor parado.',
    }));
    criarJanela();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
