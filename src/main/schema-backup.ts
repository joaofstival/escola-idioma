// Compara o formato declarado do backup com as migrations da própria versão.
// Rejeita também constraints/índices alterados e triggers/views inesperados.
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations/index.ts';

const schemas = new Map<number, string>();

function assinatura(db: DatabaseSync): string {
  const objetos = db
    .prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
    .all();
  return JSON.stringify(objetos.map((o) => ({ ...o, sql: typeof o.sql === 'string' ? o.sql.replace(/\s+/g, ' ').trim() : o.sql })));
}

export function schemaBackupCompativel(db: DatabaseSync, versao: number): boolean {
  let esperado = schemas.get(versao);
  if (!esperado) {
    const referencia = new DatabaseSync(':memory:');
    try {
      for (const m of MIGRATIONS.filter((m) => m.versao <= versao)) referencia.exec(m.sql);
      esperado = assinatura(referencia);
      schemas.set(versao, esperado);
    } finally {
      referencia.close();
    }
  }
  return assinatura(db) === esperado;
}
