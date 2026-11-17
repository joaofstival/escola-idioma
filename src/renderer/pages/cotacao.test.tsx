import { describe, expect, test } from 'vitest';
import { screen } from '@testing-library/react';
import Cotacao from './cotacao';
import { instalarEscola, renderizar } from '@/test/escola-falsa';

const usd = {
  moeda: 'USD',
  nome: 'Dólar',
  valor_em_brl: 5.1,
  brl_em_moeda: 0.196,
  atualizado_em: '2026-11-15T10:00:00Z',
  variacao_pct: 0.5,
  fonte: 'awesomeapi',
  desatualizada: false,
};
const resposta = (extra = {}) => ({ base: 'BRL', fonte: 'awesomeapi', data: '2026-11-15T10:00:00Z', cotacoes: { USD: usd }, ...extra });

describe('cotação', () => {
  test('dado desatualizado aparece em aviso visível', async () => {
    instalarEscola({ 'GET /cotacao': { data: resposta({ desatualizada: true, cotacoes: { USD: { ...usd, desatualizada: true } } }) } });
    renderizar(<Cotacao />);
    expect(await screen.findByRole('status')).toHaveTextContent('Cotações desatualizadas');
    expect(screen.getByText('Desatualizada')).toBeInTheDocument();
  });

  test('dado em dia não mostra aviso', async () => {
    instalarEscola({ 'GET /cotacao': { data: resposta() } });
    renderizar(<Cotacao />);
    expect(await screen.findByText('Dólar')).toBeInTheDocument();
    expect(screen.queryByText(/Cotações desatualizadas/)).toBeNull();
  });

  test('serviço fora do ar mostra o erro com "Tentar novamente"', async () => {
    instalarEscola({ 'GET /cotacao': { status: 502, erro: 'Serviço de cotação indisponível no momento.' } });
    renderizar(<Cotacao />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Serviço de cotação indisponível');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
