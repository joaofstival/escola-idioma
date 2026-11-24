import { expect, test } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Configuracoes from './configuracoes';
import { instalarEscola, renderizar } from '@/test/escola-falsa';

test('mostra falha do backup automático e só limpa o aviso após sucesso confirmado', async () => {
  const falha = { ultimaTentativa: '2026-11-24T12:00:00Z', ultimoSucesso: null, erro: 'Falha no backup automático.' };
  const sucesso = { ultimaTentativa: '2026-11-24T12:01:00Z', ultimoSucesso: '2026-11-24T12:01:00Z', erro: null };
  const api = instalarEscola({
    'GET /backups': { data: [] },
    'GET /backups/estado': [{ data: falha }, { data: falha }, { data: sucesso }],
    'POST /backups': [{ status: 500, erro: 'Não foi possível criar a cópia.' }, { data: { nome: 'escola-manual-2026-11-24-120100.db' } }],
  });
  renderizar(<Configuracoes />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Falha no backup automático.');
  const tentar = () => screen.getAllByRole('button', { name: 'Fazer backup agora' })[0];
  await userEvent.click(tentar());
  await waitFor(() => expect(api.de('GET', '/backups/estado')).toHaveLength(2));
  expect(screen.getByRole('alert')).toHaveTextContent('Falha no backup automático.');
  await waitFor(() => expect(tentar()).toBeEnabled());
  await userEvent.click(tentar());
  await waitFor(() => expect(api.de('GET', '/backups/estado')).toHaveLength(3));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByText('Último backup concluído')).toBeInTheDocument();
});

test('erro ao consultar saúde não é apresentado como ausência de backup', async () => {
  instalarEscola({
    'GET /backups': { data: [] },
    'GET /backups/estado': { status: 500, erro: 'Consulta indisponível' },
  });
  renderizar(<Configuracoes />);
  expect(await screen.findByText('Não foi possível consultar a situação do backup.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
});
