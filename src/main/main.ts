import { ClienteCentral } from './cliente-central.ts';
// Processo principal do Electron: janela, banco (node:sqlite), IPC e segurança de navegação.
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDb, limparDados } from './db.ts';
import type { Db } from './db.ts';
import { createApi } from './app.ts';
import type { Router } from './router.ts';
import { seed } from './seed.ts';
import {
  concluirRestauracaoPendente,
  exportarBackup,
  iniciarBackupAutomatico,
  prepararRestauracao,
  validarArquivoDeBackup,
} from './backup.ts';
import type { ApiRequest, ApiResponse, ResultadoBackupIpc } from '../shared/types.ts';

// dist/main.js → os demais artefatos estão ao lado (dist/preload.cjs, dist/renderer).
const DIST = import.meta.dirname;
const PRELOAD = join(DIST, 'preload.cjs');
const INDEX_HTML = join(DIST, 'renderer', 'index.html');
const RENDERER_URL = pathToFileURL(INDEX_HTML).href;

const central =
  process.env.ESCOLA_MODO_LEGADO === '1' && !app.isPackaged
    ? null
    : new ClienteCentral(process.env.ESCOLA_API_URL ?? 'http://127.0.0.1:3489');
let db: Db | null = null;
let api: Router | null = null;
let janela: BrowserWindow | null = null;
let pararBackup: (() => void) | null = null;

function ehExterno(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Só aceita IPC vindo das páginas do próprio app (file:// em dist/renderer). */
function origemConfiavel(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  return (
    url.split('#')[0] === RENDERER_URL &&
    event.sender.id === janela?.webContents.id &&
    event.senderFrame?.routingId === event.sender.mainFrame.routingId
  );
}

async function iniciarBanco(): Promise<void> {
  const userData = app.getPath('userData');
  // Restauração pedida na sessão anterior: troca os arquivos antes de abrir o banco.
  const bancoNovo = !existsSync(join(userData, 'escola.db'));
  const restaurou = concluirRestauracaoPendente(userData);
  db = await openDb({ file: join(userData, 'escola.db') });
  const forcarSeed = process.argv.includes('--seed');
  if (forcarSeed) {
    limparDados(db);
    console.log('[seed] dados apagados; recriando dados de exemplo');
  }
  // Banco restaurado, mesmo vazio, nunca é coberto por dados de exemplo.
  if (forcarSeed || (!restaurou && bancoNovo)) {
    const r = seed(db);
    if (r.populado) console.log('[seed] banco populado com dados de exemplo', r.contagem);
  }
  api = createApi(db);
  pararBackup = iniciarBackupAutomatico(db);
}

function registrarIpc(): void {
  ipcMain.handle('api:request', async (event, req: ApiRequest): Promise<ApiResponse> => {
    if (!origemConfiavel(event)) return { ok: false, status: 403, erro: 'Origem não autorizada' };
    if (central) return central.request(req);
    if (!api) return { ok: false, status: 503, erro: 'Banco de dados ainda não está pronto' };
    return api.handle(req);
  });

  ipcMain.handle('file:save-binary', async (event, nome: unknown, base64: unknown) => {
    if (!origemConfiavel(event)) throw new Error('Origem não autorizada');
    if (typeof nome !== 'string' || typeof base64 !== 'string' || base64.length > 7_000_000) throw new Error('Arquivo inválido');
    const padrao = basename(nome),
      ext = extname(padrao).slice(1).toLowerCase();
    if (!['pdf', 'png', 'jpg', 'jpeg', 'mp3', 'ogg', 'wav'].includes(ext)) throw new Error('Formato não permitido');
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

const FILTRO_DB = [
  { name: 'Banco da escola (.db)', extensions: ['db'] },
  { name: 'Todos os arquivos', extensions: ['*'] },
];
const falha = (err: unknown): ResultadoBackupIpc => ({
  ok: false,
  cancelado: false,
  erro: err instanceof Error ? err.message : String(err),
});

function registrarIpcBackup(): void {
  ipcMain.handle('backup:exportar', async (event): Promise<ResultadoBackupIpc> => {
    if (!origemConfiavel(event)) throw new Error('Origem não autorizada');
    if (!db) return { ok: false, cancelado: false, erro: 'Banco de dados ainda não está pronto' };
    const win = BrowserWindow.fromWebContents(event.sender);
    const hoje = new Date().toISOString().slice(0, 10);
    const opcoes = { defaultPath: join(app.getPath('documents'), `escola-backup-${hoje}.db`), filters: FILTRO_DB };
    const r = win ? await dialog.showSaveDialog(win, opcoes) : await dialog.showSaveDialog(opcoes);
    if (r.canceled || !r.filePath) return { ok: false, cancelado: true };
    try {
      exportarBackup(db, r.filePath, true); // o diálogo nativo já confirmou a substituição
      return { ok: true, arquivo: r.filePath };
    } catch (err) {
      return falha(err);
    }
  });

  ipcMain.handle('backup:restaurar', async (event): Promise<ResultadoBackupIpc> => {
    if (!origemConfiavel(event)) throw new Error('Origem não autorizada');
    if (!db) return { ok: false, cancelado: false, erro: 'Banco de dados ainda não está pronto' };
    const win = BrowserWindow.fromWebContents(event.sender);
    const opcoes = {
      title: 'Escolha o backup a restaurar',
      defaultPath: app.getPath('documents'),
      properties: ['openFile' as const],
      filters: FILTRO_DB,
    };
    const r = win ? await dialog.showOpenDialog(win, opcoes) : await dialog.showOpenDialog(opcoes);
    if (r.canceled || r.filePaths.length === 0) return { ok: false, cancelado: true };
    const escolhido = r.filePaths[0];
    const problema = validarArquivoDeBackup(escolhido);
    if (problema) return { ok: false, cancelado: false, erro: problema };
    const msg = {
      type: 'warning' as const,
      buttons: ['Restaurar e reiniciar', 'Cancelar'],
      defaultId: 1,
      cancelId: 1,
      title: 'Restaurar backup',
      message: `Substituir os dados atuais pelos de "${basename(escolhido)}"?`,
      detail: 'Os dados atuais ficam guardados na pasta do app (escola.db.pre-restauracao-*). O app será reiniciado.',
    };
    const c = win ? await dialog.showMessageBox(win, msg) : await dialog.showMessageBox(msg);
    if (c.response !== 0) return { ok: false, cancelado: true };
    const userData = app.getPath('userData');
    try {
      prepararRestauracao(escolhido, userData);
    } catch (err) {
      return falha(err);
    }
    // Fecha o banco (checkpoint) antes de responder: se não fechar limpo, não troca nada e avisa.
    api = null; // pedidos que chegarem agora recebem 503
    try {
      pararBackup?.();
      db?.close();
      db = null;
    } catch (err) {
      rmSync(join(userData, 'escola.db.restaurar'), { force: true });
      console.error('Falha ao fechar o banco antes de reiniciar', err);
      app.relaunch();
      setTimeout(() => app.exit(1), 50);
      return falha(new Error('Não foi possível fechar o banco com segurança; nada foi restaurado. O app vai reiniciar.'));
    }
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 50);
    return { ok: true, arquivo: escolhido };
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
  if (process.env.ESCOLA_SCREENSHOT) capturarTelas(janela, process.env.ESCOLA_SCREENSHOT);
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
      if (!central) await iniciarBanco();
    } catch (err) {
      console.error('Falha ao abrir o banco de dados', err);
      dialog.showErrorBox('Erro ao abrir o banco de dados', String(err instanceof Error ? err.message : err));
      app.quit();
      return;
    }
    registrarIpc();
    registrarIpcBackup();
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
      pararBackup?.();
      db?.close();
      db = null;
    } catch (err) {
      console.error('Falha ao fechar o banco de dados', err);
    }
  });
}
