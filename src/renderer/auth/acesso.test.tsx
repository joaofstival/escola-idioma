import { expect, test } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../app';
import { instalarEscola, renderizar } from '@/test/escola-falsa';
const aluno = { id: 7, nome: 'Ana Aluna', email: 'ana@escola.test', papel: 'aluno', aluno_id: 1, professor_id: null };
test('sem sessão, a entrada pede login antes de consultar cadastros', async () => {
  const api = instalarEscola({ 'GET /auth/session': { status: 401, erro: 'Entre na conta' } });
  renderizar(<App />);
  expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  expect(api.de('GET', '/alunos')).toHaveLength(0);
});
test('aluno recebe sua área e logout elimina os dados mesmo quando a rede falha', async () => {
  const api = instalarEscola({
    'GET /auth/session': { data: { usuario: aluno } },
    'GET /portal/turmas': { data: [] },
    'GET /portal/dashboard': {
      data: { turmas: 0, materiais: 0, atividades: 0, avisos_nao_lidos: 0, proxima_aula: null, entregas_pendentes: null },
    },
    'POST /auth/logout': { status: 503, erro: 'Sem conexão' },
  });
  renderizar(<App />);
  expect(await screen.findByRole('heading', { name: 'Olá, Ana Aluna' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Contas e acesso' })).not.toBeInTheDocument();
  expect(api.de('GET', '/alunos')).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
  await waitFor(() => expect(screen.queryByText('Olá, Ana Aluna')).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
});
