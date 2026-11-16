// Processo principal do Electron: janela, banco (sql.js), IPC e segurança de navegação.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDb, limparDados } from './db.ts';
import type { Db } from './db.ts';
import { createApi } from './app.ts';
import type { Router } from './router.ts';
import { seed } from './seed.ts';
import type { ApiRequest, ApiResponse } from '../shared/types.ts';

// dist/main.js → os demais artefatos estão ao lado (dist/preload.cjs, dist/renderer, dist/sql-wasm.wasm).
const DIST = import.meta.dirname;
const PRELOAD = join(DIST, 'preload.cjs');
const INDEX_HTML = join(DIST, 'renderer', 'index.html');
const WASM = join(DIST, 'sql-wasm.wasm');
const RENDERER_URL = pathToFileURL(join(DIST, 'renderer')).href;

let db: Db | null = null;
let api: Router | null = null;
let janela: BrowserWindow | null = null;

function ehExterno(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Só aceita IPC vindo das páginas do próprio app (file:// em dist/renderer). */
function origemConfiavel(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  return url.startsWith(RENDERER_URL);
}

async function iniciarBanco(): Promise<void> {
  const file = join(app.getPath('userData'), 'escola.db');
  db = await openDb({ file, wasmPath: WASM });
  if (process.argv.includes('--seed')) {
    limparDados(db);
    console.log('[seed] dados apagados; recriando dados de exemplo');
  }
  const r = seed(db);
  if (r.populado) console.log('[seed] banco populado com dados de exemplo', r.contagem);
  api = createApi(db);
}

function registrarIpc(): void {
  ipcMain.handle('api:request', async (event, req: ApiRequest): Promise<ApiResponse> => {
    if (!origemConfiavel(event)) return { ok: false, status: 403, erro: 'Origem não autorizada' };
    if (!api) return { ok: false, status: 503, erro: 'Banco de dados ainda não está pronto' };
    return api.handle(req);
  });

  ipcMain.handle('file:save', async (event, defaultName: unknown, content: unknown): Promise<string | null> => {
    if (!origemConfiavel(event)) throw new Error('Origem não autorizada');
    if (typeof content !== 'string') throw new Error('Conteúdo inválido para salvar');
    const nome = basename(typeof defaultName === 'string' && defaultName.trim() ? defaultName : 'arquivo.txt');
    const ext = extname(nome).slice(1).toLowerCase();
    const filtros = ext === 'csv'
      ? [{ name: 'Planilha CSV', extensions: ['csv'] }]
      : ext ? [{ name: ext.toUpperCase(), extensions: [ext] }] : [];
    const win = BrowserWindow.fromWebContents(event.sender);
    const opcoes = { defaultPath: join(app.getPath('documents'), nome), filters: [...filtros, { name: 'Todos os arquivos', extensions: ['*'] }] };
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
  janela.on('closed', () => { janela = null; });
  void janela.loadFile(INDEX_HTML);
  if (process.env.ESCOLA_SCREENSHOT) capturarTelas(janela, process.env.ESCOLA_SCREENSHOT);
}

/**
 * Modo de verificação (desenvolvimento): ESCOLA_SCREENSHOT=<pasta> ESCOLA_ROTAS="alunos,turmas" npm start
 * abre cada rota, salva <pasta>/<rota>.png e fecha o app. Use ESCOLA_USERDATA para um banco separado.
 */
function capturarTelas(win: BrowserWindow, pasta: string): void {
  const rotas = (process.env.ESCOLA_ROTAS || 'dashboard').split(',').map((r) => r.trim()).filter(Boolean);
  win.webContents.once('did-finish-load', async () => {
    mkdirSync(pasta, { recursive: true });
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
    if (url.startsWith(RENDERER_URL)) return; // navegação interna (ex.: hash)
    event.preventDefault();
    if (ehExterno(url)) void shell.openExternal(url);
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

if (process.env.ESCOLA_USERDATA) app.setPath('userData', process.env.ESCOLA_USERDATA);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await iniciarBanco();
    } catch (err) {
      console.error('Falha ao abrir o banco de dados', err);
      dialog.showErrorBox('Erro ao abrir o banco de dados', String(err instanceof Error ? err.message : err));
      app.quit();
      return;
    }
    registrarIpc();
    criarJanela();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) criarJanela();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    try {
      db?.close();
      db = null;
    } catch (err) {
      console.error('Falha ao fechar o banco de dados', err);
    }
  });
}
