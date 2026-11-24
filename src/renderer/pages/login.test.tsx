import { test, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/app';
import { instalarEscola, renderizar } from '@/test/escola-falsa';
test('aluno entra em sua área sem cadastros administrativos e sai limpando a sessão', async () => {
  instalarEscola({
    'GET /auth/session': { status: 401, erro: 'Entre' },
    'POST /auth/login': {
      data: { usuario: { id: 2, nome: 'Aluno A', email: 'a@escola.test', papel: 'aluno', aluno_id: 1, professor_id: null } },
    },
    'GET /portal/turmas': { data: [] },
    'POST /auth/logout': { data: { ok: true } },
  });
  renderizar(<App />);
  await userEvent.type(await screen.findByLabelText('E-mail'), 'a@escola.test');
  await userEvent.type(screen.getByLabelText('Senha'), 'Senha-Aluno-2026!');
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByText('Olá, Aluno A')).toBeInTheDocument();
  expect(screen.queryByText('Contas e acesso')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Novo aluno' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
  expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  expect(screen.queryByText('Olá, Aluno A')).not.toBeInTheDocument();
});
