import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cenarioCentral, dados } from './test-helpers.ts';
test('cadastros são paginados no SQL com ordenação estável, filtros e acesso restrito', async () => {
  const { app, db, tokens: t } = await cenarioCentral();
  try {
    db.transaction(() => {
      for (let i = 0; i < 105; i++) db.run('INSERT INTO alunos(nome) VALUES(?)', ['Registro ' + String(i).padStart(3, '0')]);
    });
    const a = dados<any>(await app.handle({ method: 'GET', path: '/alunos?pagina=1&tamanho=25&busca=Registro' }, t.admin));
    const b = dados<any>(await app.handle({ method: 'GET', path: '/alunos?pagina=2&tamanho=25&busca=Registro' }, t.admin));
    assert.equal(a.total, 105);
    assert.equal(a.itens.length, 25);
    assert.equal(b.itens[0].nome, 'Registro 025');
    assert.equal(new Set([...a.itens, ...b.itens].map((v) => v.id)).size, 50);
    assert.equal((await app.handle({ method: 'GET', path: '/alunos?pagina=0' }, t.admin)).status, 422);
    assert.equal((await app.handle({ method: 'GET', path: '/alunos?pagina=1' }, t.alunoA)).status, 403);
    const prof = dados<any>(await app.handle({ method: 'GET', path: '/professores?pagina=1&tamanho=1' }, t.admin));
    assert.equal(prof.total, 2);
    assert.equal(prof.itens.length, 1);
    assert.equal(prof.itens[0].idiomas.length, 1);
  } finally {
    db.close();
  }
});
