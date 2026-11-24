import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cenarioCentral, dados } from './test-helpers.ts';
test('biblioteca privada: autorização, versões, integridade e arquivamento', async () => {
  const { app, db, tokens: t } = await cenarioCentral();
  try {
    const arquivo = { nome: 'aula.pdf', mime: 'application/pdf', base64: Buffer.from('%PDF-1.7\nconteudo de teste').toString('base64') };
    const body = { turma_id: 1, titulo: 'Material da turma', arquivo, estado: 'publicado' };
    const p = dados<any>(await app.handle({ method: 'POST', path: '/biblioteca', body }, t.profA));
    assert.equal((await app.handle({ method: 'POST', path: '/biblioteca', body }, t.alunoA)).status, 403);
    assert.equal((await app.handle({ method: 'GET', path: `/biblioteca/${p.id}/arquivo` }, t.alunoB)).status, 404);
    assert.equal(dados<any>(await app.handle({ method: 'GET', path: `/biblioteca/${p.id}/arquivo` }, t.alunoA)).base64, arquivo.base64);
    const invalido = { ...body, arquivo: { ...arquivo, base64: Buffer.from('arquivo falso').toString('base64') } };
    assert.equal((await app.handle({ method: 'POST', path: '/biblioteca', body: invalido }, t.profA)).status, 422);
    const v = dados<any>(await app.handle({ method: 'POST', path: `/biblioteca/${p.id}/versionar`, body }, t.profA));
    assert.equal(v.versao, 2);
    assert.equal((await app.handle({ method: 'GET', path: `/biblioteca/${p.id}/arquivo` }, t.alunoA)).status, 404);
    dados(
      await app.handle(
        { method: 'PUT', path: `/biblioteca/${v.id}`, body: { revisao: v.revisao, estado: 'arquivado', motivo: 'Material substituído' } },
        t.profA,
      ),
    );
    assert.deepEqual(dados(await app.handle({ method: 'GET', path: '/biblioteca' }, t.alunoA)), []);
  } finally {
    db.close();
  }
});
test('atividades: identidade da entrega, isolamento, nota privada e publicação com versão', async () => {
  const { app, db, tokens: t } = await cenarioCentral();
  try {
    const a = dados<any>(
      await app.handle(
        {
          method: 'POST',
          path: '/atividades',
          body: {
            turma_id: 1,
            titulo: 'Exercício',
            descricao: 'Escreva um texto',
            prazo: '2026-12-31',
            valor_max: 10,
            estado: 'publicada',
          },
        },
        t.profA,
      ),
    );
    const path = `/atividades/${a.id}/entregas`;
    const body = { texto: 'Meu texto', operacao_id: randomUUID() };
    assert.equal((await app.handle({ method: 'POST', path, body: { ...body, aluno_id: 2 } }, t.alunoA)).status, 422);
    assert.equal((await app.handle({ method: 'POST', path, body }, t.alunoB)).status, 404);
    const e = dados<any>(await app.handle({ method: 'POST', path, body }, t.alunoA));
    assert.equal(dados<any>(await app.handle({ method: 'POST', path, body }, t.alunoA)).id, e.id);
    const nota = { nota: 8, devolutiva: 'Bom trabalho', publicada: false, versao: null, motivo: 'Correção inicial' };
    assert.equal((await app.handle({ method: 'PUT', path: `${path}/${e.id}/nota`, body: nota }, t.profB)).status, 404);
    const n = dados<any>(await app.handle({ method: 'PUT', path: `${path}/${e.id}/nota`, body: nota }, t.profA));
    assert.equal(dados<any[]>(await app.handle({ method: 'GET', path }, t.alunoA))[0].nota, null);
    assert.equal((await app.handle({ method: 'POST', path, body: { ...body, operacao_id: randomUUID() } }, t.alunoA)).status, 422);
    assert.equal((await app.handle({ method: 'PUT', path: `${path}/${e.id}/nota`, body: nota }, t.profA)).status, 409);
    dados(
      await app.handle({ method: 'PUT', path: `${path}/${e.id}/nota`, body: { ...nota, publicada: true, versao: n.nota_versao } }, t.profA),
    );
    assert.equal(dados<any[]>(await app.handle({ method: 'GET', path }, t.alunoA))[0].nota, 8);
    assert.equal(db.get<{ n: number }>('SELECT count(*) n FROM notas_versoes')?.n, 2);
  } finally {
    db.close();
  }
});
