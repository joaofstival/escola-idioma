import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PagamentoDialog } from './pagamento-dialog';
import { instalarEscola, renderizar } from '@/test/escola-falsa';
import { mensalidade } from '@/test/fixtures';

// Hoje = 09/04/2026: a mensalidade de março (vence 10/03) está com 30 dias de atraso.
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 3, 9, 12) }));
afterEach(() => vi.useRealTimers());

const atrasada = mensalidade({ atrasada: true, dias_atraso: 30, multa: 6, juros: 3, valor_atualizado: 309 });
const abrir = () => renderizar(<PagamentoDialog mensalidade={atrasada} aoFechar={() => {}} aoPagar={() => {}} aoDesfazer={() => {}} />);

describe('registrar pagamento', () => {
  test('sugere o valor com multa de 2% e juros pro rata e mostra a conta', async () => {
    instalarEscola({});
    abrir();
    expect(await screen.findByLabelText('Valor pago (R$)')).toHaveValue('309.00');
    expect(screen.getByText('Multa (2%)')).toBeInTheDocument();
    expect(screen.getByText(/Juros 1% a\.m\. \(30 dias\)/)).toBeInTheDocument();
  });

  test('valor zero é recusado na tela, ligado ao campo, e nada é enviado', async () => {
    const api = instalarEscola({ 'POST /mensalidades/1/pagar': { data: {} } });
    abrir();
    const valor = await screen.findByLabelText('Valor pago (R$)');
    await userEvent.clear(valor);
    await userEvent.type(valor, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pagamento' }));
    expect(await screen.findByText('Informe um valor pago maior que zero.')).toBeInTheDocument();
    expect(valor).toHaveAttribute('aria-invalid', 'true');
    expect(api.de('POST', '/mensalidades/1/pagar')).toHaveLength(0);
  });

  test('envia o valor, a data e a forma escolhidos', async () => {
    const api = instalarEscola({ 'POST /mensalidades/1/pagar': { data: { ...atrasada, status: 'paga', valor_pago: 309 } } });
    abrir();
    await userEvent.click(await screen.findByLabelText('Boleto'));
    await userEvent.click(screen.getByRole('button', { name: 'Registrar pagamento' }));
    await waitFor(() => expect(api.de('POST', '/mensalidades/1/pagar')).toHaveLength(1));
    expect(api.de('POST', '/mensalidades/1/pagar')[0].corpo).toEqual({
      valor_pago: 309,
      forma_pagamento: 'boleto',
      data_pagamento: '2026-04-09',
    });
  });

  test('erro do servidor (ex.: já paga) aparece no diálogo, que continua aberto', async () => {
    instalarEscola({ 'POST /mensalidades/1/pagar': { status: 422, erro: 'Mensalidade já está paga' } });
    abrir();
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar pagamento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mensalidade já está paga');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
