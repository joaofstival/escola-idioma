import type { Migration } from './index.ts';

export const migration003: Migration = {
  versao: 3,
  nome: 'movimentacoes-financeiras',
  sql: `
CREATE TABLE politicas_financeiras (
  id             INTEGER PRIMARY KEY,
  dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 28),
  prazo_inicial  INTEGER NOT NULL CHECK (prazo_inicial BETWEEN 1 AND 30),
  multa_bp       INTEGER NOT NULL CHECK (multa_bp BETWEEN 0 AND 10000),
  juros_bp       INTEGER NOT NULL CHECK (juros_bp BETWEEN 0 AND 10000),
  criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO politicas_financeiras
VALUES (
  1,
  10,
  5,
  200,
  100,
  datetime('now')
);

ALTER TABLE mensalidades ADD COLUMN valor_centavos INTEGER CHECK (valor_centavos >= 0);
ALTER TABLE mensalidades ADD COLUMN politica_id INTEGER REFERENCES politicas_financeiras(id);

UPDATE mensalidades
SET
  valor_centavos = CAST(round(valor * 100) AS INTEGER),
  politica_id = 1;

ALTER TABLE idiomas ADD COLUMN mensalidade_centavos INTEGER CHECK (mensalidade_centavos >= 0);

UPDATE idiomas
SET mensalidade_centavos = CAST(round(mensalidade * 100) AS INTEGER);

CREATE TRIGGER mensalidade_centavos_insert
AFTER INSERT ON mensalidades
BEGIN
  UPDATE mensalidades
  SET
    valor_centavos = CAST(round(NEW.valor * 100) AS INTEGER),
    politica_id = (SELECT max(id) FROM politicas_financeiras)
  WHERE id = NEW.id;
END;

CREATE TRIGGER mensalidade_centavos_update
AFTER UPDATE OF valor ON mensalidades
BEGIN
  UPDATE mensalidades
  SET valor_centavos = CAST(round(NEW.valor * 100) AS INTEGER)
  WHERE id = NEW.id;
END;

CREATE TRIGGER idioma_centavos_insert
AFTER INSERT ON idiomas
BEGIN
  UPDATE idiomas
  SET mensalidade_centavos = CAST(round(NEW.mensalidade * 100) AS INTEGER)
  WHERE id = NEW.id;
END;

CREATE TRIGGER idioma_centavos_update
AFTER UPDATE OF mensalidade ON idiomas
BEGIN
  UPDATE idiomas
  SET mensalidade_centavos = CAST(round(NEW.mensalidade * 100) AS INTEGER)
  WHERE id = NEW.id;
END;

CREATE TABLE movimentacoes_financeiras (
  id             TEXT PRIMARY KEY,
  operacao_id    TEXT NOT NULL UNIQUE,
  mensalidade_id INTEGER NOT NULL REFERENCES mensalidades(id),
  usuario_id     INTEGER REFERENCES usuarios(id),
  tipo           TEXT NOT NULL CHECK (tipo IN ('pagamento', 'estorno', 'desconto', 'ajuste', 'cancelamento')),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  data           TEXT NOT NULL,
  forma          TEXT,
  motivo         TEXT,
  estorno_de     TEXT UNIQUE REFERENCES movimentacoes_financeiras(id),
  criado_em      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_movimentacoes_mensalidade ON movimentacoes_financeiras(mensalidade_id, data);

INSERT INTO movimentacoes_financeiras (id, operacao_id, mensalidade_id, tipo, valor_centavos, data, forma, motivo)
SELECT
  'legado-' || id,
  'legado-' || id,
  id,
  'pagamento',
  CAST(round(valor_pago * 100) AS INTEGER),
  data_pagamento,
  forma_pagamento,
  'Importado do histórico legado; autoria desconhecida'
FROM mensalidades
WHERE status = 'paga' AND valor_pago > 0;

CREATE TRIGGER pagamento_legado
AFTER UPDATE OF status ON mensalidades
WHEN NEW.status = 'paga'
  AND NEW.valor_pago > 0
  AND NOT EXISTS (SELECT 1 FROM movimentacoes_financeiras WHERE mensalidade_id = NEW.id)
BEGIN
  INSERT INTO movimentacoes_financeiras (id, operacao_id, mensalidade_id, tipo, valor_centavos, data, forma, motivo)
  VALUES (
    'legado-' || NEW.id,
    'legado-' || NEW.id,
    NEW.id,
    'pagamento',
    CAST(round(NEW.valor_pago * 100) AS INTEGER),
    NEW.data_pagamento,
    NEW.forma_pagamento,
    'Lançamento do adaptador legado'
  );
END;
`,
};
