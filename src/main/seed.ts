// Dados de exemplo. A seed só popula banco vazio (idempotente). `--seed` limpa e recria (ver main.ts).
// A parte 3 acrescenta matrículas, mensalidades e materiais via ETAPAS_EXTRAS (seed-academico.ts).
import type { Db } from './db.ts';
import { seedMateriais, seedMatriculas } from './seed-academico.ts';

export interface IdiomaSeed { nome: string; codigo: string; mensalidade: number }
export interface ProfessorSeed { nome: string; email: string; telefone: string; idiomas: string[] }
export interface AlunoSeed {
  nome: string; data_nascimento: string; documento: string; email: string; telefone: string; endereco: string;
  pais_origem?: string; moeda_origem?: string; ativo?: boolean;
}
/** `anoRelativo`: 0 = ano atual, -1 = ano anterior. */
export interface TurmaSeed { nome: string; idioma: string; nivel: number; anoRelativo: 0 | -1; professor: string; horario: string; capacidade: number }

export const IDIOMAS: IdiomaSeed[] = [
  { nome: 'Inglês', codigo: 'en', mensalidade: 320 },
  { nome: 'Espanhol', codigo: 'es', mensalidade: 290 },
  { nome: 'Francês', codigo: 'fr', mensalidade: 340 },
  { nome: 'Alemão', codigo: 'de', mensalidade: 360 },
  { nome: 'Italiano', codigo: 'it', mensalidade: 310 },
];

export const PROFESSORES: ProfessorSeed[] = [
  { nome: 'Mariana Costa', email: 'mariana.costa@escola.com.br', telefone: '(11) 98123-4501', idiomas: ['Inglês', 'Espanhol'] },
  { nome: 'Robert Miller', email: 'robert.miller@escola.com.br', telefone: '(11) 98123-4502', idiomas: ['Inglês'] },
  { nome: 'Lucía Fernández', email: 'lucia.fernandez@escola.com.br', telefone: '(11) 98123-4503', idiomas: ['Espanhol'] },
  { nome: 'Claire Dubois', email: 'claire.dubois@escola.com.br', telefone: '(11) 98123-4504', idiomas: ['Francês', 'Inglês'] },
  { nome: 'Hans Becker', email: 'hans.becker@escola.com.br', telefone: '(11) 98123-4505', idiomas: ['Alemão'] },
  { nome: 'Giulia Romano', email: 'giulia.romano@escola.com.br', telefone: '(11) 98123-4506', idiomas: ['Italiano', 'Espanhol'] },
];

export const ALUNOS: AlunoSeed[] = [
  { nome: 'Ana Beatriz Souza', data_nascimento: '2004-03-12', documento: '123.456.789-01', email: 'ana.souza@email.com', telefone: '(11) 99811-0001', endereco: 'Rua das Flores, 120 - São Paulo/SP' },
  { nome: 'Bruno Henrique Lima', data_nascimento: '1998-07-25', documento: '234.567.890-12', email: 'bruno.lima@email.com', telefone: '(11) 99811-0002', endereco: 'Av. Paulista, 1500, ap. 82 - São Paulo/SP' },
  { nome: 'Carla Mendes', data_nascimento: '2001-11-03', documento: '345.678.901-23', email: 'carla.mendes@email.com', telefone: '(11) 99811-0003', endereco: 'Rua Augusta, 900 - São Paulo/SP' },
  { nome: 'Diego Albuquerque', data_nascimento: '1995-01-18', documento: '456.789.012-34', email: 'diego.alb@email.com', telefone: '(11) 99811-0004', endereco: 'Rua Vergueiro, 2300 - São Paulo/SP' },
  { nome: 'Eduarda Nogueira', data_nascimento: '2007-05-30', documento: '567.890.123-45', email: 'duda.nogueira@email.com', telefone: '(11) 99811-0005', endereco: 'Rua Haddock Lobo, 45 - São Paulo/SP' },
  { nome: 'Felipe Araújo', data_nascimento: '1990-09-09', documento: '678.901.234-56', email: 'felipe.araujo@email.com', telefone: '(11) 99811-0006', endereco: 'Rua Oscar Freire, 300 - São Paulo/SP' },
  { nome: 'Gabriela Rocha', data_nascimento: '2003-12-21', documento: '789.012.345-67', email: 'gabi.rocha@email.com', telefone: '(11) 99811-0007', endereco: 'Rua Teodoro Sampaio, 780 - São Paulo/SP' },
  { nome: 'Heitor Carvalho', data_nascimento: '2009-02-14', documento: '890.123.456-78', email: 'heitor.carvalho@email.com', telefone: '(11) 99811-0008', endereco: 'Rua Cardeal Arcoverde, 1200 - São Paulo/SP' },
  { nome: 'Isabela Martins', data_nascimento: '1999-08-07', documento: '901.234.567-89', email: 'isabela.martins@email.com', telefone: '(11) 99811-0009', endereco: 'Alameda Santos, 650 - São Paulo/SP' },
  { nome: 'João Pedro Ribeiro', data_nascimento: '2002-04-01', documento: '012.345.678-90', email: 'joao.ribeiro@email.com', telefone: '(11) 99811-0010', endereco: 'Rua Pamplona, 410 - São Paulo/SP' },
  { nome: 'Larissa Teixeira', data_nascimento: '1997-06-16', documento: '111.222.333-44', email: 'larissa.teixeira@email.com', telefone: '(11) 99811-0011', endereco: 'Rua Bela Cintra, 1700 - São Paulo/SP' },
  { nome: 'Marcelo Pires', data_nascimento: '1985-10-28', documento: '222.333.444-55', email: 'marcelo.pires@email.com', telefone: '(11) 99811-0012', endereco: 'Rua Domingos de Morais, 2000 - São Paulo/SP' },
  { nome: 'Natália Freitas', data_nascimento: '2005-01-09', documento: '333.444.555-66', email: 'natalia.freitas@email.com', telefone: '(11) 99811-0013', endereco: 'Rua Fradique Coutinho, 95 - São Paulo/SP' },
  { nome: 'Otávio Santos', data_nascimento: '1993-03-27', documento: '444.555.666-77', email: 'otavio.santos@email.com', telefone: '(11) 99811-0014', endereco: 'Av. Rebouças, 3100 - São Paulo/SP', ativo: false },
  { nome: 'Paula Moreira', data_nascimento: '2000-07-19', documento: '555.666.777-88', email: 'paula.moreira@email.com', telefone: '(11) 99811-0015', endereco: 'Rua Mourato Coelho, 510 - São Paulo/SP' },
  // Alunos estrangeiros (mensalidade pode ser exibida na moeda de origem)
  { nome: 'John Smith', data_nascimento: '1992-02-11', documento: 'RNM V123456-7', email: 'john.smith@mail.com', telefone: '(11) 99822-1001', endereco: 'Rua Jerônimo da Veiga, 200 - São Paulo/SP', pais_origem: 'Estados Unidos', moeda_origem: 'USD' },
  { nome: 'Emily Johnson', data_nascimento: '1996-09-30', documento: 'RNM V234567-8', email: 'emily.johnson@mail.com', telefone: '(11) 99822-1002', endereco: 'Rua Joaquim Floriano, 870 - São Paulo/SP', pais_origem: 'Estados Unidos', moeda_origem: 'USD' },
  { nome: 'Sophie Martin', data_nascimento: '1994-12-05', documento: 'RNM V345678-9', email: 'sophie.martin@mail.fr', telefone: '(11) 99822-1003', endereco: 'Rua Tabapuã, 1100 - São Paulo/SP', pais_origem: 'França', moeda_origem: 'EUR' },
  { nome: 'Lukas Schmidt', data_nascimento: '1989-04-22', documento: 'RNM V456789-0', email: 'lukas.schmidt@mail.de', telefone: '(11) 99822-1004', endereco: 'Rua Gomes de Carvalho, 1500 - São Paulo/SP', pais_origem: 'Alemanha', moeda_origem: 'EUR' },
  { nome: 'Martina Rossi', data_nascimento: '1997-08-14', documento: 'RNM V567890-1', email: 'martina.rossi@mail.it', telefone: '(11) 99822-1005', endereco: 'Rua Bandeira Paulista, 600 - São Paulo/SP', pais_origem: 'Itália', moeda_origem: 'EUR' },
  { nome: 'Mateo González', data_nascimento: '2000-01-26', documento: 'RNM V678901-2', email: 'mateo.gonzalez@mail.com.ar', telefone: '(11) 99822-1006', endereco: 'Rua Clodomiro Amazonas, 300 - São Paulo/SP', pais_origem: 'Argentina', moeda_origem: 'ARS' },
  { nome: 'Valentina López', data_nascimento: '2003-06-08', documento: 'RNM V789012-3', email: 'valentina.lopez@mail.com.ar', telefone: '(11) 99822-1007', endereco: 'Rua Pedroso Alvarenga, 1000 - São Paulo/SP', pais_origem: 'Argentina', moeda_origem: 'ARS' },
  { nome: 'Camila Muñoz', data_nascimento: '1999-10-17', documento: 'RNM V890123-4', email: 'camila.munoz@mail.cl', telefone: '(11) 99822-1008', endereco: 'Rua Leopoldo Couto de Magalhães, 700 - São Paulo/SP', pais_origem: 'Chile', moeda_origem: 'CLP' },
  { nome: 'Haruto Tanaka', data_nascimento: '1991-05-03', documento: 'RNM V901234-5', email: 'haruto.tanaka@mail.jp', telefone: '(11) 99822-1009', endereco: 'Rua Galvão Bueno, 400 - São Paulo/SP', pais_origem: 'Japão', moeda_origem: 'JPY' },
  { nome: 'Yuki Sato', data_nascimento: '2002-11-29', documento: 'RNM V012345-6', email: 'yuki.sato@mail.jp', telefone: '(11) 99822-1010', endereco: 'Rua dos Estudantes, 150 - São Paulo/SP', pais_origem: 'Japão', moeda_origem: 'JPY', ativo: false },
];

export const TURMAS: TurmaSeed[] = [
  // Ano anterior
  { nome: 'Inglês 1 - Manhã', idioma: 'Inglês', nivel: 1, anoRelativo: -1, professor: 'Robert Miller', horario: 'Seg e Qua, 08h-09h30', capacidade: 12 },
  { nome: 'Inglês 2 - Noite', idioma: 'Inglês', nivel: 2, anoRelativo: -1, professor: 'Mariana Costa', horario: 'Ter e Qui, 19h-20h30', capacidade: 15 },
  { nome: 'Inglês 3 - Sábado', idioma: 'Inglês', nivel: 3, anoRelativo: -1, professor: 'Claire Dubois', horario: 'Sáb, 09h-12h', capacidade: 12 },
  { nome: 'Espanhol 1 - Tarde', idioma: 'Espanhol', nivel: 1, anoRelativo: -1, professor: 'Lucía Fernández', horario: 'Seg e Qua, 14h-15h30', capacidade: 12 },
  { nome: 'Espanhol 2 - Noite', idioma: 'Espanhol', nivel: 2, anoRelativo: -1, professor: 'Mariana Costa', horario: 'Seg e Qua, 19h-20h30', capacidade: 12 },
  { nome: 'Francês 1 - Noite', idioma: 'Francês', nivel: 1, anoRelativo: -1, professor: 'Claire Dubois', horario: 'Ter e Qui, 19h-20h30', capacidade: 10 },
  { nome: 'Alemão 1 - Noite', idioma: 'Alemão', nivel: 1, anoRelativo: -1, professor: 'Hans Becker', horario: 'Seg e Qua, 19h-20h30', capacidade: 10 },
  { nome: 'Italiano 1 - Sábado', idioma: 'Italiano', nivel: 1, anoRelativo: -1, professor: 'Giulia Romano', horario: 'Sáb, 09h-12h', capacidade: 10 },
  // Ano atual
  { nome: 'Inglês 1 - Manhã', idioma: 'Inglês', nivel: 1, anoRelativo: 0, professor: 'Robert Miller', horario: 'Seg e Qua, 08h-09h30', capacidade: 12 },
  { nome: 'Inglês 2 - Manhã', idioma: 'Inglês', nivel: 2, anoRelativo: 0, professor: 'Robert Miller', horario: 'Ter e Qui, 08h-09h30', capacidade: 12 },
  { nome: 'Inglês 3 - Noite', idioma: 'Inglês', nivel: 3, anoRelativo: 0, professor: 'Mariana Costa', horario: 'Ter e Qui, 19h-20h30', capacidade: 15 },
  { nome: 'Inglês 4 - Sábado', idioma: 'Inglês', nivel: 4, anoRelativo: 0, professor: 'Claire Dubois', horario: 'Sáb, 09h-12h', capacidade: 12 },
  { nome: 'Espanhol 1 - Tarde', idioma: 'Espanhol', nivel: 1, anoRelativo: 0, professor: 'Lucía Fernández', horario: 'Seg e Qua, 14h-15h30', capacidade: 12 },
  { nome: 'Espanhol 2 - Tarde', idioma: 'Espanhol', nivel: 2, anoRelativo: 0, professor: 'Lucía Fernández', horario: 'Ter e Qui, 14h-15h30', capacidade: 12 },
  { nome: 'Espanhol 3 - Noite', idioma: 'Espanhol', nivel: 3, anoRelativo: 0, professor: 'Giulia Romano', horario: 'Seg e Qua, 19h-20h30', capacidade: 12 },
  { nome: 'Francês 1 - Noite', idioma: 'Francês', nivel: 1, anoRelativo: 0, professor: 'Claire Dubois', horario: 'Seg e Qua, 19h-20h30', capacidade: 10 },
  { nome: 'Francês 2 - Noite', idioma: 'Francês', nivel: 2, anoRelativo: 0, professor: 'Claire Dubois', horario: 'Ter e Qui, 19h-20h30', capacidade: 10 },
  { nome: 'Alemão 1 - Noite', idioma: 'Alemão', nivel: 1, anoRelativo: 0, professor: 'Hans Becker', horario: 'Seg e Qua, 19h-20h30', capacidade: 10 },
  { nome: 'Alemão 2 - Noite', idioma: 'Alemão', nivel: 2, anoRelativo: 0, professor: 'Hans Becker', horario: 'Ter e Qui, 19h-20h30', capacidade: 10 },
  { nome: 'Italiano 1 - Sábado', idioma: 'Italiano', nivel: 1, anoRelativo: 0, professor: 'Giulia Romano', horario: 'Sáb, 09h-12h', capacidade: 10 },
  { nome: 'Italiano 2 - Sábado', idioma: 'Italiano', nivel: 2, anoRelativo: 0, professor: 'Giulia Romano', horario: 'Sáb, 13h-16h', capacidade: 10 },
];

export interface SeedOptions { anoAtual?: number }

/** Ids gerados pela seed, por nome, para as próximas etapas (matrículas, mensalidades…) referenciarem. */
export interface SeedContexto {
  anoAtual: number;
  idiomas: Map<string, number>;
  professores: Map<string, number>;
  alunos: Map<string, number>;
  /** chave: `${ano}|${nome da turma}` */
  turmas: Map<string, number>;
}

export interface SeedResultado {
  populado: boolean;
  contagem: { idiomas: number; professores: number; alunos: number; turmas: number };
}

/** true se o banco não tem nenhum cadastro. */
export function bancoVazio(db: Db): boolean {
  const r = db.get<{ n: number }>(
    'SELECT (SELECT count(*) FROM idiomas) + (SELECT count(*) FROM alunos) + (SELECT count(*) FROM professores) + (SELECT count(*) FROM turmas) AS n')!;
  return r.n === 0;
}

/** Insere idiomas, professores, alunos e turmas (sem verificar se o banco está vazio). */
export function seedCadastros(db: Db, anoAtual: number): SeedContexto {
  const ctx: SeedContexto = { anoAtual, idiomas: new Map(), professores: new Map(), alunos: new Map(), turmas: new Map() };
  for (const i of IDIOMAS) {
    ctx.idiomas.set(i.nome, db.run('INSERT INTO idiomas (nome, codigo, mensalidade) VALUES (?, ?, ?)', [i.nome, i.codigo, i.mensalidade]).lastInsertRowid);
  }
  for (const p of PROFESSORES) {
    const id = db.run('INSERT INTO professores (nome, email, telefone, ativo) VALUES (?, ?, ?, 1)', [p.nome, p.email, p.telefone]).lastInsertRowid;
    ctx.professores.set(p.nome, id);
    for (const nome of p.idiomas) db.run('INSERT INTO professor_idiomas (professor_id, idioma_id) VALUES (?, ?)', [id, ctx.idiomas.get(nome)!]);
  }
  for (const a of ALUNOS) {
    const id = db.run(
      `INSERT INTO alunos (nome, data_nascimento, documento, email, telefone, endereco, pais_origem, moeda_origem, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.nome, a.data_nascimento, a.documento, a.email, a.telefone, a.endereco, a.pais_origem ?? null, a.moeda_origem ?? 'BRL', a.ativo ?? true],
    ).lastInsertRowid;
    ctx.alunos.set(a.nome, id);
  }
  for (const t of TURMAS) {
    const ano = anoAtual + t.anoRelativo;
    const id = db.run(
      'INSERT INTO turmas (nome, idioma_id, nivel, ano_letivo, professor_id, horario, capacidade) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [t.nome, ctx.idiomas.get(t.idioma)!, t.nivel, ano, ctx.professores.get(t.professor)!, t.horario, t.capacidade],
    ).lastInsertRowid;
    ctx.turmas.set(`${ano}|${t.nome}`, id);
  }
  return ctx;
}

/** Etapas extras da seed. Parte 3: matrículas + mensalidades e materiais. A parte 4 acrescenta avaliações. */
export type EtapaSeed = (db: Db, ctx: SeedContexto) => void;
export const ETAPAS_EXTRAS: EtapaSeed[] = [seedMatriculas, seedMateriais];

/** Popula o banco com dados de exemplo, somente se estiver vazio. */
export function seed(db: Db, opts: SeedOptions = {}): SeedResultado {
  const contar = () => db.get<SeedResultado['contagem']>(
    `SELECT (SELECT count(*) FROM idiomas) AS idiomas, (SELECT count(*) FROM professores) AS professores,
            (SELECT count(*) FROM alunos) AS alunos, (SELECT count(*) FROM turmas) AS turmas`)!;
  if (!bancoVazio(db)) return { populado: false, contagem: contar() };
  const anoAtual = opts.anoAtual ?? new Date().getFullYear();
  db.transaction(() => {
    const ctx = seedCadastros(db, anoAtual);
    for (const etapa of ETAPAS_EXTRAS) etapa(db, ctx);
  });
  return { populado: true, contagem: contar() };
}
