import { describe, expect, test } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Matriculas from './matriculas';
import { instalarEscola, renderizar } from '@/test/escola-falsa';

const turma = (id: number, nome: string, idioma_id: number, extra = {}) => ({
  id,
  nome,
  idioma_id,
  nivel: 2,
  ano_letivo: 2027,
  capacidade: 10,
  ocupacao: 1,
  ...extra,
});
const sugestao = (idioma_id: number, idioma_nome: string, turmaId: number, turmaNome: string) => ({
  aluno_id: 5,
  aluno_nome: 'Ana Souza',
  matricula_anterior_id: idioma_id,
  idioma_id,
  idioma_nome,
  nivel_atual: 1,
  nivel_sugerido: 2,
  turmas_sugeridas: [{ id: turmaId, nome: turmaNome, capacidade: 10, ocupacao: 1 }],
  inadimplente: false,
});

describe('rematrículas: aluno com mais de um idioma', () => {
  test('cada linha (aluno + idioma) tem destino e envio próprios', async () => {
    const user = userEvent.setup();
    const api = instalarEscola({
      'GET /matriculas/sugestoes-rematricula': {
        data: [sugestao(1, 'Inglês', 11, 'Inglês B1'), sugestao(2, 'Espanhol', 22, 'Espanhol B1')],
      },
      'GET /turmas': { data: [turma(11, 'Inglês B1', 1), turma(12, 'Inglês B1 noite', 1, { nivel: 3 }), turma(22, 'Espanhol B1', 2)] },
      'POST /matriculas/rematricula': { data: { id: 9, turma_nome: 'Espanhol B1', mensalidades_geradas: 3 } },
      'GET /matriculas': { data: [] },
    });
    renderizar(<Matriculas />, '/?aba=rematriculas&ano=2027');
    const botoes = await screen.findAllByRole('button', { name: /rematricular ana souza/i });
    expect(botoes).toHaveLength(2);
    // a linha de Espanhol mostra a turma de Espanhol (antes mostrava a de Inglês ao escolher a primeira)
    const linhas = screen.getAllByRole('row').slice(1);
    expect(within(linhas[0]).getAllByText(/Inglês B1/).length).toBeGreaterThan(0);
    expect(within(linhas[1]).getAllByText(/Espanhol B1/).length).toBeGreaterThan(0);
    // escolher outra turma na linha de Inglês não pode mudar a linha de Espanhol
    await user.click(within(linhas[0]).getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Inglês B1 noite/ }));
    expect(within(linhas[0]).getAllByText(/Inglês B1 noite/).length).toBeGreaterThan(0);
    expect(within(linhas[1]).queryByText(/Inglês B1/)).toBeNull();
    expect(within(linhas[1]).getAllByText(/Espanhol B1/).length).toBeGreaterThan(0);
    await user.click(botoes[1]);
    const envio = api.de('POST', '/matriculas/rematricula')[0].corpo as { turma_id_destino: number };
    expect(envio.turma_id_destino).toBe(22);
    // só a linha enviada fica ocupada
    expect(botoes[0]).toBeEnabled();
  });
});

describe('nova matrícula: turma indicada no link', () => {
  test('avisa quando a turma do link não pôde ser carregada', async () => {
    instalarEscola({
      'GET /alunos': { data: [] },
      'GET /idiomas': { data: [] },
      'GET /turmas/7': { status: 404, erro: 'Turma não encontrada' },
      'GET /turmas': { data: [] },
    });
    renderizar(<Matriculas />, '/?aba=nova&turma_id=7');
    expect(await screen.findByText(/não foi possível carregar a turma/i)).toBeInTheDocument();
  });

  test('avisa quando a turma do link está lotada', async () => {
    instalarEscola({
      'GET /alunos': { data: [] },
      'GET /idiomas': { data: [] },
      'GET /turmas/7': { data: turma(7, 'Inglês A2', 1, { ocupacao: 10 }) },
      'GET /turmas': { data: [turma(7, 'Inglês A2', 1, { ocupacao: 10 })] },
    });
    renderizar(<Matriculas />, '/?aba=nova&turma_id=7');
    expect(await screen.findByText(/a turma inglês a2 está lotada/i)).toBeInTheDocument();
  });
});
