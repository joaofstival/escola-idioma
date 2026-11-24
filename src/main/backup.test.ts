import { test, mock } from 'node:test';
import fs from 'node:fs';
import type { PathLike } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, TABELAS } from './db.ts';
import type { Db } from './db.ts';
import {
  criarBackup,
  obterEstadoBackup,
  listarBackups,
  aplicarRetencao,
  backupDiario,
  backupDiarioSeguro,
  iniciarBackupAutomatico,
  exportarBackup,
  prepararRestauracao,
  concluirRestauracaoPendente,
  validarArquivoDeBackup,
  pastaDeBackups,
} from './backup.ts';
import { ULTIMA_VERSAO } from './migrations/index.ts';
import { createApi } from './app.ts';

async function comPasta(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'escola-bkp-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const nomes = (db: Db) => db.all<{ nome: string }>('SELECT nome FROM alunos ORDER BY nome').map((r) => r.nome);
function lerNomes(file: string): string[] {
  const d = new DatabaseSync(file);
  try {
    return (d.prepare('SELECT nome FROM alunos ORDER BY nome').all() as { nome: string }[]).map((r) => r.nome);
  } finally {
    d.close();
  }
}
async function bancoCom(file: string, ...alunos: string[]): Promise<void> {
  const db = await openDb({ file });
  for (const a of alunos) db.run('INSERT INTO alunos (nome) VALUES (?)', [a]);
  db.close();
}
const em = (dia: number, h = 10, min = 0, s = 0) => new Date(2026, 10, dia, h, min, s);

test('backup abre e tem as mesmas linhas; nome segue escola-<tipo>-AAAA-MM-DD-HHmmss.db', async () => {
  await comPasta(async (dir) => {
    const db = await openDb({ file: join(dir, 'escola.db') });
    db.run("INSERT INTO alunos (nome) VALUES ('João'), ('Maria')");
    const info = criarBackup(db, pastaDeBackups(db), 'manual', em(17, 9, 5, 3));
    assert.equal(info.nome, 'escola-manual-2026-11-17-090503.db');
    assert.equal(info.tipo, 'manual');
    assert.ok(info.tamanho > 0);
    assert.deepEqual(lerNomes(join(dir, 'backups', info.nome)), ['João', 'Maria']);
    assert.deepEqual(readdirSync(join(dir, 'backups')), [info.nome], 'sem temporários');
    // mesmo segundo: não sobrescreve
    const outro = criarBackup(db, pastaDeBackups(db), 'manual', em(17, 9, 5, 3));
    assert.equal(outro.nome, 'escola-manual-2026-11-17-090503-2.db');
    db.close();
  });
});

test('retenção apaga só o excedente de automáticos; manuais e pre-* ficam', async () => {
  await comPasta(async (dir) => {
    const db = await openDb({ file: join(dir, 'escola.db') });
    const pasta = pastaDeBackups(db);
    for (let d = 1; d <= 16; d++) criarBackup(db, pasta, 'auto', em(d));
    criarBackup(db, pasta, 'manual', em(1));
    writeFileSync(join(pasta, 'escola.db.pre-migracao-v1'), 'x');
    const apagados = aplicarRetencao(pasta);
    assert.deepEqual(apagados.sort(), ['escola-auto-2026-11-01-100000.db', 'escola-auto-2026-11-02-100000.db']);
    const restantes = listarBackups(pasta);
    assert.equal(restantes.filter((b) => b.tipo === 'auto').length, 14);
    assert.equal(restantes.filter((b) => b.tipo === 'manual').length, 1);
    assert.ok(existsSync(join(pasta, 'escola.db.pre-migracao-v1')));
    assert.equal(restantes[0].nome.startsWith('escola-auto-2026-11-16'), true, 'ordenado do mais novo ao mais antigo');
    db.close();
  });
});

test('automático diário: duas chamadas no mesmo dia não duplicam; dia seguinte cria outro', async () => {
  await comPasta(async (dir) => {
    const db = await openDb({ file: join(dir, 'escola.db') });
    const pasta = pastaDeBackups(db);
    assert.ok(backupDiario(db, pasta, em(17, 8)));
    assert.equal(backupDiario(db, pasta, em(17, 20)), null);
    assert.ok(backupDiario(db, pasta, em(18, 0, 1)));
    assert.equal(listarBackups(pasta).filter((b) => b.tipo === 'auto').length, 2);
    // um backup manual no dia não conta como o automático
    criarBackup(db, pasta, 'manual', em(19));
    assert.ok(backupDiario(db, pasta, em(19, 1)));
    db.close();
  });
});

test('rotina automática: roda ao abrir e quando o dia vira com o app aberto (relógio injetado)', async () => {
  await comPasta(async (dir) => {
    const db = await openDb({ file: join(dir, 'escola.db') });
    let agora = em(17, 23, 50);
    const parar = iniciarBackupAutomatico(db, { agora: () => agora, intervaloMs: 15 });
    try {
      assert.equal(listarBackups(pastaDeBackups(db)).length, 1, 'backup ao abrir');
      agora = em(18, 0, 5);
      await new Promise((r) => setTimeout(r, 120));
      assert.equal(listarBackups(pastaDeBackups(db)).length, 2, 'backup quando o dia mudou');
    } finally {
      parar();
      db.close();
    }
  });
});

test('falha de backup não derruba: loga e devolve null', async () => {
  const db = await openDb({ file: null as never });
  const logs: string[] = [];
  assert.equal(
    backupDiarioSeguro(db, '/caminho/que/nao/existe/\0', em(17), (m) => logs.push(m)),
    null,
  );
  assert.equal(logs.length, 1);
});

test('exportar: grava cópia consistente, recusa destino existente e só sobrescreve com permissão', async () => {
  await comPasta(async (dir) => {
    const db = await openDb({ file: join(dir, 'escola.db') });
    db.run("INSERT INTO alunos (nome) VALUES ('Ana')");
    const destino = join(dir, 'copia.db');
    exportarBackup(db, destino);
    assert.deepEqual(lerNomes(destino), ['Ana']);
    assert.throws(() => exportarBackup(db, destino), /já existe/);
    db.run("INSERT INTO alunos (nome) VALUES ('Bia')");
    exportarBackup(db, destino, true);
    assert.deepEqual(lerNomes(destino), ['Ana', 'Bia']);
    assert.deepEqual(
      readdirSync(dir).filter((f) => f.endsWith('.tmp')),
      [],
    );
    db.close();
  });
});

test('REST: GET /backups lista e POST /backups cria manual; em memória responde 409', async () => {
  await comPasta(async (dir) => {
    const db = await openDb({ file: join(dir, 'escola.db') });
    const router = createApi(db);
    router.logger = () => {};
    const vazio = await router.handle({ method: 'GET', path: '/backups' });
    assert.deepEqual(vazio.ok && vazio.data, []);
    const criado = await router.handle({ method: 'POST', path: '/backups' });
    assert.ok(criado.ok && criado.status === 201);
    const lista = await router.handle({ method: 'GET', path: '/backups' });
    assert.ok(lista.ok);
    const itens = lista.data as { nome: string; tamanho: number; criadoEm: string; tipo: string }[];
    assert.equal(itens.length, 1);
    assert.match(itens[0].nome, /^escola-manual-\d{4}-\d{2}-\d{2}-\d{6}\.db$/);
    assert.equal(itens[0].tipo, 'manual');
    assert.ok(itens[0].tamanho > 0 && !Number.isNaN(Date.parse(itens[0].criadoEm)));
    db.close();
    const mem = createApi(await openDb());
    mem.logger = () => {};
    const r = await mem.handle({ method: 'POST', path: '/backups' });
    assert.equal(r.ok, false);
    assert.equal(r.status, 409);
  });
});

// ---------- restauração ----------

test('restauração válida em duas fases: guarda o atual como pre-restauracao e troca, sem -wal órfão', async () => {
  await comPasta(async (dir) => {
    const atual = join(dir, 'escola.db');
    await bancoCom(atual, 'Atual');
    const origem = join(dir, 'origem.db');
    await bancoCom(origem, 'Do backup');
    prepararRestauracao(origem, dir);
    assert.ok(existsSync(`${atual}.restaurar`));
    assert.deepEqual(lerNomes(atual), ['Atual'], 'fase 1 não toca no banco atual');
    assert.equal(concluirRestauracaoPendente(dir, em(17)), true);
    assert.deepEqual(lerNomes(atual), ['Do backup']);
    assert.deepEqual(lerNomes(`${atual}.pre-restauracao-2026-11-17`), ['Atual']);
    assert.equal(existsSync(`${atual}.restaurar`), false);
    assert.deepEqual(
      readdirSync(dir).filter((f) => f.endsWith('-wal') || f.endsWith('-shm')),
      [],
    );
    assert.equal(concluirRestauracaoPendente(dir), false, 'sem pendência não faz nada');
    const db = await openDb({ file: atual });
    assert.deepEqual(nomes(db), ['Do backup']);
    db.close();
  });
});

test('restauração com -wal antigo: dados que só estavam no WAL não se perdem e o -wal não contamina o novo', async () => {
  await comPasta(async (dir) => {
    const vivo = join(dir, 'vivo');
    const dirCrash = join(dir, 'crash');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(vivo);
    mkdirSync(dirCrash);
    const db = await openDb({ file: join(vivo, 'escola.db') });
    db.run("INSERT INTO alunos (nome) VALUES ('So no wal')");
    // "queda": fotografa arquivo + -wal + -shm com o banco ainda aberto (sem checkpoint)
    for (const s of ['', '-wal', '-shm'])
      if (existsSync(join(vivo, 'escola.db' + s))) copyFileSync(join(vivo, 'escola.db' + s), join(dirCrash, 'escola.db' + s));
    db.close();
    assert.ok(existsSync(join(dirCrash, 'escola.db-wal')), 'cenário precisa ter -wal');
    const origem = join(dir, 'origem.db');
    await bancoCom(origem, 'Novo');
    prepararRestauracao(origem, dirCrash);
    assert.equal(concluirRestauracaoPendente(dirCrash, em(17)), true);
    assert.deepEqual(lerNomes(join(dirCrash, 'escola.db.pre-restauracao-2026-11-17')), ['So no wal']);
    assert.deepEqual(lerNomes(join(dirCrash, 'escola.db')), ['Novo']);
    assert.equal(existsSync(join(dirCrash, 'escola.db-wal')), false);
  });
});

test('restauração a partir de arquivo com -wal ao lado usa VACUUM INTO (inclui o que só estava no WAL)', async () => {
  await comPasta(async (dir) => {
    const { mkdirSync } = await import('node:fs');
    const fonte = join(dir, 'fonte');
    mkdirSync(fonte);
    const ud = join(dir, 'ud');
    mkdirSync(ud);
    const db = await openDb({ file: join(fonte, 'escola.db') });
    db.run("INSERT INTO alunos (nome) VALUES ('Dentro do wal')");
    for (const s of ['', '-wal', '-shm'])
      if (existsSync(join(fonte, 'escola.db' + s))) copyFileSync(join(fonte, 'escola.db' + s), join(dir, 'escolhido.db' + s));
    db.close();
    prepararRestauracao(join(dir, 'escolhido.db'), ud);
    assert.deepEqual(lerNomes(join(ud, 'escola.db.restaurar')), ['Dentro do wal']);
  });
});

test('queda entre os renames: sem escola.db e com .restaurar conclui a troca e remove -wal/-shm órfãos', async () => {
  await comPasta(async (dir) => {
    const origem = join(dir, 'origem.db');
    await bancoCom(origem, 'Restaurado');
    prepararRestauracao(origem, dir);
    writeFileSync(join(dir, 'escola.db-wal'), 'lixo do banco antigo');
    writeFileSync(join(dir, 'escola.db-shm'), 'lixo');
    assert.equal(existsSync(join(dir, 'escola.db')), false);
    assert.equal(concluirRestauracaoPendente(dir), true, 'true avisa o main para não rodar o seed');
    assert.deepEqual(lerNomes(join(dir, 'escola.db')), ['Restaurado']);
    assert.deepEqual(readdirSync(dir).sort(), ['escola.db', 'origem.db']);
  });
});

test('arquivo inválido é recusado sem tocar no banco atual (lixo, vazio, versão futura, sem tabelas, FK quebrada)', async () => {
  await comPasta(async (dir) => {
    const atual = join(dir, 'escola.db');
    await bancoCom(atual, 'Intacto');
    const antes = readFileSync(atual);
    const recusa = (nome: string, esperado: RegExp) => {
      assert.throws(() => prepararRestauracao(join(dir, nome), dir), esperado, nome);
      assert.equal(existsSync(`${atual}.restaurar`), false, `${nome}: não gera .restaurar`);
      assert.ok(readFileSync(atual).equals(antes), `${nome}: banco atual intacto`);
    };
    writeFileSync(join(dir, 'lixo.db'), 'isto não é sqlite, só texto suficiente para parecer um arquivo qualquer'.repeat(40));
    recusa('lixo.db', /SQLite válido|integridade/);
    new DatabaseSync(join(dir, 'vazio.db')).close();
    recusa('vazio.db', /sem versão|faltam tabelas/);
    recusa('nao-existe.db', /não encontrado/);
    const futuro = join(dir, 'futuro.db');
    await bancoCom(futuro, 'F');
    const f = new DatabaseSync(futuro);
    f.exec(`PRAGMA user_version = ${ULTIMA_VERSAO + 1}`);
    f.close();
    recusa('futuro.db', /mais nova/);
    const semTab = join(dir, 'semtab.db');
    const s = new DatabaseSync(semTab);
    s.exec(`CREATE TABLE x (a); PRAGMA user_version = 1`);
    s.close();
    recusa('semtab.db', /faltam tabelas/);
    const fk = join(dir, 'fk.db');
    await bancoCom(fk, 'FK');
    const k = new DatabaseSync(fk);
    k.exec('PRAGMA foreign_keys = OFF; INSERT INTO matriculas (aluno_id, turma_id, ano_letivo) VALUES (999, 999, 2026)');
    k.close();
    recusa('fk.db', /foreign_key_check/);
    assert.equal(validarArquivoDeBackup(atual), null, 'o banco bom passa na validação');
  });
});

test('exportar recusa o arquivo do próprio banco (e seus -wal/-shm)', async () => {
  await comPasta(async (dir) => {
    const db = await openDb({ file: join(dir, 'escola.db') });
    for (const n of ['escola.db', 'escola.db-wal', 'escola.db.restaurar']) {
      assert.throws(() => exportarBackup(db, join(dir, n), true), /próprio banco/, n);
    }
    exportarBackup(db, join(dir, 'outro.db'), true);
    db.close();
  });
});

test('recusa schema adulterado e preserva o banco atual', async () => {
  await comPasta(async (dir) => {
    const atual = join(dir, 'escola.db');
    await bancoCom(atual, 'Intacto');
    const antes = readFileSync(atual);
    const falso = join(dir, 'schema-errado.db');
    const d = new DatabaseSync(falso);
    for (const tabela of TABELAS) d.exec(`CREATE TABLE ${tabela} (coluna_errada TEXT)`);
    d.exec('PRAGMA user_version = 1');
    d.close();
    assert.match(validarArquivoDeBackup(falso) ?? '', /estrutura|schema/i);
    assert.throws(() => prepararRestauracao(falso, dir), /estrutura|schema/i);
    assert.ok(readFileSync(atual).equals(antes));
    assert.equal(existsSync(`${atual}.restaurar`), false);
  });
});

test('recusa triggers e views não previstos mesmo com as tabelas corretas', async () => {
  await comPasta(async (dir) => {
    for (const [nome, sql] of [
      ['trigger', 'CREATE TRIGGER oculto AFTER INSERT ON alunos BEGIN DELETE FROM alunos WHERE id <> NEW.id; END'],
      ['view', 'CREATE VIEW oculta AS SELECT * FROM alunos'],
    ]) {
      const arquivo = join(dir, `${nome}.db`);
      await bancoCom(arquivo, 'Aluno');
      const d = new DatabaseSync(arquivo);
      d.exec(sql);
      d.close();
      assert.match(validarArquivoDeBackup(arquivo) ?? '', /estrutura|schema/i);
    }
  });
});

test('aceita backup legado original sem modificar a origem', async () => {
  const arquivo = new URL('./fixtures/escola-v1-antigo.db', import.meta.url);
  const antes = readFileSync(arquivo);
  const { fileURLToPath } = await import('node:url');
  assert.equal(validarArquivoDeBackup(fileURLToPath(arquivo)), null);
  assert.ok(readFileSync(arquivo).equals(antes));
});

test('pendência adulterada entre preparação e reinício não substitui o banco', async () => {
  await comPasta(async (dir) => {
    const atual = join(dir, 'escola.db');
    const origem = join(dir, 'origem.db');
    await bancoCom(atual, 'Intacto');
    await bancoCom(origem, 'Novo');
    prepararRestauracao(origem, dir);
    writeFileSync(`${atual}.restaurar`, 'arquivo adulterado');
    const antes = readFileSync(atual);
    assert.throws(() => concluirRestauracaoPendente(dir), /restauração|SQLite|integridade/i);
    assert.ok(readFileSync(atual).equals(antes));
    assert.ok(existsSync(`${atual}.restaurar`), 'mantém pendência para diagnóstico');
  });
});

test('estado expõe falha persistente até nova cópia concluir e mantém último sucesso', async () => {
  await comPasta(async (dir) => {
    const db = await openDb({ file: join(dir, 'escola.db') });
    try {
      assert.deepEqual(obterEstadoBackup(db), { ultimaTentativa: null, ultimoSucesso: null, erro: null });
      criarBackup(db, pastaDeBackups(db), 'auto', em(17));
      const sucesso = obterEstadoBackup(db).ultimoSucesso;
      const bloqueado = join(dir, 'bloqueado');
      writeFileSync(bloqueado, 'arquivo onde seria uma pasta');
      assert.equal(
        backupDiarioSeguro(db, bloqueado, em(18), () => {}),
        null,
      );
      const falha = obterEstadoBackup(db);
      assert.ok(falha.erro);
      assert.equal(falha.ultimaTentativa, em(18).toISOString());
      assert.equal(falha.ultimoSucesso, sucesso);
      const resposta = await createApi(db).handle({ method: 'GET', path: '/backups/estado' });
      assert.ok(resposta.ok);
      assert.deepEqual(resposta.data, falha);
      criarBackup(db, pastaDeBackups(db), 'manual', em(18, 12));
      assert.equal(obterEstadoBackup(db).erro, null);
      assert.equal(obterEstadoBackup(db).ultimoSucesso, em(18, 12).toISOString());
    } finally {
      db.close();
    }
  });
});

test('exportar recusa alias por hard link do banco vivo', async () => {
  await comPasta(async (dir) => {
    const { linkSync } = await import('node:fs');
    const db = await openDb({ file: join(dir, 'escola.db') });
    try {
      const alias = join(dir, 'outro-nome.db');
      linkSync(db.file!, alias);
      assert.throws(() => exportarBackup(db, alias, true), /próprio banco/);
      if (process.platform === 'win32') {
        assert.throws(() => exportarBackup(db, join(dir, 'ESCOLA.DB'), true), /próprio banco/);
      }
    } finally {
      db.close();
    }
  });
});

test('falha após a troca mantém a origem preparada e permite concluir no próximo boot', async () => {
  await comPasta(async (dir) => {
    const atual = join(dir, 'escola.db');
    const origem = join(dir, 'origem.db');
    await bancoCom(atual, 'Original');
    await bancoCom(origem, 'Restaurado');
    prepararRestauracao(origem, dir);
    const renomear = fs.renameSync;
    mock.method(fs, 'renameSync', (de: PathLike, para: PathLike) => {
      renomear(de, para);
      if (String(para) === atual) throw new Error('Falha simulada após publicar o arquivo');
    });
    syncBuiltinESMExports();
    try {
      assert.throws(() => concluirRestauracaoPendente(dir, em(17)), /Falha simulada/);
    } finally {
      mock.restoreAll();
      syncBuiltinESMExports();
    }
    assert.ok(existsSync(`${atual}.restaurar`), 'não perde a intenção de restauração');
    assert.deepEqual(lerNomes(`${atual}.pre-restauracao-2026-11-17`), ['Original']);
    assert.equal(concluirRestauracaoPendente(dir, em(17)), true);
    assert.deepEqual(lerNomes(atual), ['Restaurado']);
    assert.equal(existsSync(`${atual}.restaurar`), false);
    assert.deepEqual(lerNomes(`${atual}.pre-restauracao-2026-11-17`), ['Original'], 'não sobrescreve a cópia original');
    assert.ok(!readdirSync(dir).some((nome) => nome.endsWith('.instalando') || nome.endsWith('.tmp')));
  });
});
