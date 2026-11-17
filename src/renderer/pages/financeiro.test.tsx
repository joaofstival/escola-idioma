import { describe, expect, test } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Financeiro from './financeiro';
import { instalarEscola, renderizar } from '@/test/escola-falsa';
import { mensalidade } from '@/test/fixtures';

const resumo = { ano: 2026, recebido: 300, a_receber: 300, em_atraso: 309, alunos_inadimplentes: [], por_mes: [] };
const lista = [
  mensalidade({ id: 1, aluno_nome: 'Ana Atrasada', atrasada: true, dias_atraso: 30, multa: 6, juros: 3, valor_atualizado: 309 }),
  mensalidade({ id: 2, aluno_nome: 'Bia Paga', status: 'paga', valor_pago: 300, data_pagamento: '2026-03-08', forma_pagamento: 'pix' }),
  mensalidade({ id: 3, aluno_nome: 'Caio Aberto', vencimento: '2026-12-10', competencia: '2026-12' }),
];
const rotas = () => ({
  'GET /financeiro/resumo': { data: resumo },
  'GET /financeiro/inadimplentes': { data: [] },
  'GET /alunos': { data: [] },
  'GET /mensalidades': { data: lista },
  'POST /mensalidades/2/estornar': { data: {} },
});
const linha = (nome: string) => screen.getByRole('row', { name: new RegExp(nome) });

describe('mensalidades', () => {
  test('status sempre em texto: Atrasada com dias, Paga e Em aberto', async () => {
    instalarEscola(rotas());
    renderizar(<Financeiro />, '/financeiro?ano=2026');
    await screen.findByText('Ana Atrasada');
    expect(within(linha('Ana Atrasada')).getByText('Atrasada · 30 dias')).toBeInTheDocument();
    expect(within(linha('Bia Paga')).getByText('Paga')).toBeInTheDocument();
    expect(within(linha('Caio Aberto')).getByText('Em aberto')).toBeInTheDocument();
  });

  test('atrasada mostra o valor atualizado e os encargos; paga mostra o valor pago', async () => {
    instalarEscola(rotas());
    renderizar(<Financeiro />, '/financeiro?ano=2026');
    await screen.findByText('Ana Atrasada');
    expect(linha('Ana Atrasada').textContent).toMatch(/R\$\s309,00/);
    expect(linha('Ana Atrasada').textContent).toMatch(/\+R\$\s9,00 encargos/);
    expect(linha('Bia Paga').textContent).toMatch(/R\$\s300,00pago/);
  });

  test('só mensalidade em aberto pode receber pagamento; só a paga pode ser estornada', async () => {
    instalarEscola(rotas());
    renderizar(<Financeiro />, '/financeiro?ano=2026');
    await screen.findByText('Ana Atrasada');
    expect(within(linha('Ana Atrasada')).getByRole('button', { name: /Registrar pagamento/ })).toBeInTheDocument();
    expect(within(linha('Caio Aberto')).getByRole('button', { name: /Registrar pagamento/ })).toBeInTheDocument();
    expect(within(linha('Bia Paga')).queryByRole('button', { name: /Registrar pagamento/ })).toBeNull();
    expect(within(linha('Bia Paga')).getByRole('button', { name: /Estornar/ })).toBeInTheDocument();
    expect(within(linha('Ana Atrasada')).queryByRole('button', { name: /Estornar/ })).toBeNull();
  });

  test('estornar pede confirmação explicando o efeito e só então estorna', async () => {
    const api = instalarEscola(rotas());
    renderizar(<Financeiro />, '/financeiro?ano=2026');
    await screen.findByText('Bia Paga');
    await userEvent.click(within(linha('Bia Paga')).getByRole('button', { name: /Estornar/ }));
    const d = await screen.findByRole('alertdialog');
    expect(within(d).getByText(/Estornar pagamento “Bia Paga/)).toBeInTheDocument();
    expect(within(d).getByText(/volta a ficar em aberto/)).toBeInTheDocument();
    expect(api.de('POST', '/mensalidades/2/estornar')).toHaveLength(0);
    await userEvent.click(within(d).getByRole('button', { name: 'Estornar pagamento' }));
    await waitFor(() => expect(api.de('POST', '/mensalidades/2/estornar')).toHaveLength(1));
  });

  test('lista vazia com filtro oferece limpar filtros', async () => {
    instalarEscola({ ...rotas(), 'GET /mensalidades': { data: [] } });
    renderizar(<Financeiro />, '/financeiro?ano=2026&status=paga');
    expect(await screen.findByText('Nenhuma mensalidade encontrada com estes filtros.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Limpar filtros' }).length).toBeGreaterThan(0);
  });

  test('erro na lista mostra a mensagem e permite tentar de novo', async () => {
    instalarEscola({ ...rotas(), 'GET /mensalidades': [{ status: 500, erro: 'Falha no banco' }, { data: lista }] });
    renderizar(<Financeiro />, '/financeiro?ano=2026');
    expect(await screen.findByText('Falha no banco')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Ana Atrasada')).toBeInTheDocument();
  });

  test('"Todos os anos" busca mensalidades de todos os anos (não volta ao ano do resumo)', async () => {
    const api = instalarEscola(rotas());
    renderizar(<Financeiro />, '/financeiro?ano=2026');
    await screen.findByText('Ana Atrasada');
    await userEvent.click(screen.getByRole('combobox', { name: 'Ano' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Todos os anos' }));
    await waitFor(() => {
      const gets = api.de('GET', '/mensalidades');
      expect(gets.length).toBeGreaterThan(1);
      expect(gets[gets.length - 1].consulta).not.toMatch(/ano=|competencia=/);
    });
  });
});
