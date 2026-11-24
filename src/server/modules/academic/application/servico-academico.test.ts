import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServicoAcademico } from './servico-academico.ts';
test('serviço acadêmico valida vínculo sem Electron, SQL ou HTTP', () => {
  const servico = new ServicoAcademico({
    turmas: () => [{ id: 1, nome: 'A', idioma_nome: 'Inglês', nivel: 1, ano_letivo: 2026, horario: null }],
    alunos: () => [{ id: 5, nome: 'Aluno' }],
  });
  const aluno = { papel: 'aluno', aluno_id: 5, professor_id: null };
  assert.throws(() => servico.alunos(aluno, 1), /NAO_AUTORIZADA/);
  assert.throws(() => servico.exigirTurma(aluno, 2), /NAO_AUTORIZADA/);
  assert.equal(servico.alunos({ papel: 'professor', aluno_id: null, professor_id: 1 }, 1)[0].id, 5);
});
