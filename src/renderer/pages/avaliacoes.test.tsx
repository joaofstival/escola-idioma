import { describe, expect, test } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Avaliacoes from './avaliacoes';
import { instalarEscola, renderizar } from '@/test/escola-falsa';
import { avaliacao } from '@/test/fixtures';

const turmas = { data: [{ id: 1, nome: 'Inglês A1' }] };

describe('lista de avaliações', () => {
  test('mostra o esqueleto da tabela enquanto carrega', async () => {
    instalarEscola({ 'GET /turmas': turmas, 'GET /avaliacoes': { data: [avaliacao()] } });
    renderizar(<Avaliacoes />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(await screen.findByText('Feedback do trimestre')).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  test('vazio: explica e oferece a ação de criar', async () => {
    instalarEscola({ 'GET /turmas': turmas, 'GET /avaliacoes': { data: [] } });
    renderizar(<Avaliacoes />);
    expect(await screen.findByText('Nenhuma avaliação criada.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /nova avaliação/i }).length).toBeGreaterThanOrEqual(2);
  });

  test('erro: mostra a mensagem e "Tentar novamente" busca de novo', async () => {
    const api = instalarEscola({
      'GET /turmas': turmas,
      'GET /avaliacoes': [{ status: 500, erro: 'Banco indisponível' }, { data: [avaliacao()] }],
    });
    renderizar(<Avaliacoes />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Banco indisponível');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Feedback do trimestre')).toBeInTheDocument();
    expect(api.de('GET', '/avaliacoes')).toHaveLength(2);
  });

  test('apagar pede confirmação citando o nome e só apaga ao confirmar', async () => {
    const api = instalarEscola({
      'GET /turmas': turmas,
      'GET /avaliacoes': { data: [avaliacao()] },
      'DELETE /avaliacoes/1': { data: { ok: true } },
    });
    renderizar(<Avaliacoes />);
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar avaliação Feedback do trimestre' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText(/Apagar avaliação “Feedback do trimestre”\?/)).toBeInTheDocument();
    expect(api.de('DELETE', '/avaliacoes/1')).toHaveLength(0);

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(api.de('DELETE', '/avaliacoes/1')).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Apagar avaliação Feedback do trimestre' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Apagar avaliação' }));
    await waitFor(() => expect(api.de('DELETE', '/avaliacoes/1')).toHaveLength(1));
  });

  test('avaliação travada (com respostas) não pode ser apagada', async () => {
    instalarEscola({ 'GET /turmas': turmas, 'GET /avaliacoes': { data: [avaliacao({ travada: true, total_respostas: 3 })] } });
    renderizar(<Avaliacoes />);
    expect(await screen.findByRole('button', { name: 'Apagar avaliação Feedback do trimestre' })).toBeDisabled();
    expect(screen.getByText('Travada')).toBeInTheDocument();
  });
});
