import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cenarioCentral, dados } from './test-helpers.ts';

test('agenda, chamada e frequência respeitam vínculo e versionamento', async () => {
  const { app, db, tokens } = await cenarioCentral();
  const chamar = (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, token = tokens.admin) =>
    app.handle({ method, path, body }, token);
  try {
    const aula = dados(
      await chamar('POST', '/academico/aulas', { turma_id: 1, data: '2026-06-10', inicio: '08:00', fim: '09:00', local: 'Sala 1' }),
    );
    assert.equal(
      (await chamar('POST', '/academico/aulas', { turma_id: 2, data: '2026-06-10', inicio: '08:30', fim: '09:30', local: 'Sala 1' }))
        .status,
      422,
    );
    assert.equal(
      (
        await chamar(
          'PUT',
          `/academico/aulas/${aula.id}`,
          { versao: 1, status: 'realizada', conteudo: 'Saudações', motivo: 'Aula ministrada' },
          tokens.profB,
        )
      ).status,
      403,
    );
    const realizada = dados(
      await chamar(
        'PUT',
        `/academico/aulas/${aula.id}`,
        { versao: 1, status: 'realizada', conteudo: 'Saudações', motivo: 'Aula ministrada' },
        tokens.profA,
      ),
    );
    assert.equal(
      (
        await chamar(
          'POST',
          `/academico/aulas/${aula.id}/chamada`,
          { versao: realizada.versao, motivo: 'Chamada do dia', presencas: [{ aluno_id: 2, status: 'presente' }] },
          tokens.profA,
        )
      ).status,
      422,
    );
    const corpo = { versao: realizada.versao, motivo: 'Chamada do dia', presencas: [{ aluno_id: 1, status: 'presente' }] };
    const feita = dados(await chamar('POST', `/academico/aulas/${aula.id}/chamada`, corpo, tokens.profA));
    assert.equal((await chamar('POST', `/academico/aulas/${aula.id}/chamada`, corpo, tokens.profA)).status, 409);
    assert.equal(dados(await chamar('GET', '/academico/frequencia', undefined, tokens.alunoA)).presentes, 1);
    assert.equal(dados(await chamar('GET', '/academico/frequencia', undefined, tokens.alunoB)).presentes, 0);
    dados(
      await chamar('PUT', `/academico/aulas/${aula.id}`, {
        versao: feita.versao,
        status: 'cancelada',
        conteudo: 'Cancelada',
        motivo: 'Reposição necessária',
      }),
    );
    assert.equal(dados(await chamar('GET', '/academico/frequencia', undefined, tokens.alunoA)).presentes, 0);
    assert.equal(db.get<{ n: number }>('SELECT count(*) n FROM presencas_historico')!.n, 1);
    dados(
      await chamar('POST', '/academico/aulas', {
        turma_id: 1,
        data: '2026-06-11',
        inicio: '08:00',
        fim: '09:00',
        local: 'Sala 1',
        reposicao_de: aula.id,
      }),
    );
  } finally {
    db.close();
  }
});

test('transferência mantém cobranças e rejeita repetição divergente e conflito semanal', async () => {
  const { app, db, tokens } = await cenarioCentral();
  try {
    db.run("INSERT INTO turmas(id,nome,idioma_id,nivel,ano_letivo,professor_id,capacidade) VALUES(3,'Nova turma',1,1,2026,1,10)");
    db.run("INSERT INTO mensalidades(matricula_id,aluno_id,competencia,valor,vencimento) VALUES(1,1,'2026-11',300,'2026-11-10')");
    const corpo = { matricula_id: 1, turma_destino: 3, motivo: 'Mudança de horário solicitada', operacao_id: randomUUID() };
    const nova = dados(await app.handle({ method: 'POST', path: '/academico/transferencias', body: corpo }, tokens.admin));
    assert.equal(dados(await app.handle({ method: 'POST', path: '/academico/transferencias', body: corpo }, tokens.admin)).id, nova.id);
    assert.equal(db.get<{ n: number }>('SELECT count(*) n FROM mensalidades')!.n, 1);
    assert.equal(db.get<{ status: string }>('SELECT status FROM matriculas WHERE id=1')!.status, 'concluida');
    const horario = { turma_id: 1, dia: 1, inicio: '08:00', fim: '09:00', local: 'Sala 1' };
    dados(await app.handle({ method: 'POST', path: '/academico/horarios', body: horario }, tokens.admin));
    assert.equal(
      (await app.handle({ method: 'POST', path: '/academico/horarios', body: { ...horario, turma_id: 3, local: 'Sala 2' } }, tokens.admin))
        .status,
      422,
    );
    assert.equal((await app.handle({ method: 'POST', path: '/academico/transferencias', body: corpo }, tokens.alunoA)).status, 403);
  } finally {
    db.close();
  }
});
