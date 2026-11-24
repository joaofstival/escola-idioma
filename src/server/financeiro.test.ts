import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cenarioCentral, dados } from './test-helpers.ts';
import { ServicoFinanceiro, RepositorioFinanceiro } from './modules/finance/public.ts';

test('parcial, repetição e estorno não perdem saldo nem histórico', async () => {
  const { app, db, tokens } = await cenarioCentral();
  try {
    db.run("INSERT INTO mensalidades(id,matricula_id,aluno_id,competencia,valor,vencimento) VALUES(1,1,1,'2026-06',300,'2026-06-10')");
    const f = new ServicoFinanceiro(new RepositorioFinanceiro(db), () => '2026-06-10');
    const admin = dados(await app.handle({ method: 'GET', path: '/auth/session' }, tokens.admin)).usuario;
    const corpo = { valor_pago: 1, data_pagamento: '2026-06-10', forma_pagamento: 'pix', operacao_id: randomUUID() };
    const m = f.pagar(admin, 1, corpo);
    assert.equal(m.saldo_centavos, 29900);
    assert.equal(m.status, 'pendente');
    assert.equal(m.parcial, true);
    assert.equal(f.pagar(admin, 1, corpo).saldo_centavos, 29900);
    assert.equal(f.extrato(admin, 1).movimentos.length, 1);
    assert.throws(() => f.pagar(admin, 1, { ...corpo, valor_pago: 2 }), /Identificador/);
    assert.throws(() => f.pagar(admin, 1, { ...corpo, valor_pago: 300, operacao_id: randomUUID() }), /excede/);
    assert.equal(f.pagar(admin, 1, { ...corpo, valor_pago: 299, operacao_id: randomUUID() }).status, 'paga');
    const original = f.extrato(admin, 1).movimentos[0];
    const estorno = { pagamento_id: original.id, motivo: 'Pagamento lançado incorretamente', operacao_id: randomUUID() };
    assert.equal(f.estornar(admin, 1, estorno).saldo_centavos, 100);
    assert.equal(f.estornar(admin, 1, estorno).saldo_centavos, 100);
    assert.equal(f.extrato(admin, 1).movimentos.length, 3);
    assert.throws(() => f.estornar(admin, 1, { ...estorno, operacao_id: randomUUID() }), /válido/);
    const aluno = dados(await app.handle({ method: 'GET', path: '/auth/session' }, tokens.alunoB)).usuario;
    assert.throws(() => f.extrato(aluno, 1), /não encontrada/);
    assert.throws(() => f.pagar(aluno, 1, corpo), /não permitido/);
  } finally {
    db.close();
  }
});

test('configuração é versionada e descontos exigem autorização e motivo', async () => {
  const { app, db, tokens } = await cenarioCentral();
  try {
    const admin = dados(await app.handle({ method: 'GET', path: '/auth/session' }, tokens.admin)).usuario;
    db.run("INSERT INTO mensalidades(id,matricula_id,aluno_id,competencia,valor,vencimento) VALUES(1,1,1,'2026-06',300,'2026-06-10')");
    const f = new ServicoFinanceiro(new RepositorioFinanceiro(db), () => '2026-06-10');
    f.configurar(admin, { dia_vencimento: 15, prazo_inicial: 7, multa_bp: 500, juros_bp: 200 });
    db.run("INSERT INTO mensalidades(id,matricula_id,aluno_id,competencia,valor,vencimento) VALUES(2,2,2,'2026-06',300,'2026-06-15')");
    assert.equal(db.get<{ politica_id: number }>('SELECT politica_id FROM mensalidades WHERE id=1')!.politica_id, 1);
    assert.equal(db.get<{ politica_id: number }>('SELECT politica_id FROM mensalidades WHERE id=2')!.politica_id, 2);
    assert.throws(() => f.ajustar(admin, 1, { tipo: 'desconto', valor: 20, motivo: 'x', operacao_id: randomUUID() }));
    assert.equal(
      f.ajustar(admin, 1, { tipo: 'desconto', valor: 20, motivo: 'Desconto autorizado pela escola', operacao_id: randomUUID() })
        .saldo_centavos,
      28000,
    );
    assert.equal(db.get<{ n: number }>("SELECT count(*) n FROM auditoria WHERE acao='DESCONTO'")!.n, 1);
  } finally {
    db.close();
  }
});
