import { Feriados } from '@/components/feriados';
import { useState } from 'react';
import { useSessao } from '@/auth/sessao';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EstadoErro } from '@/components/estados';
import { data as fmtData } from '@/lib/format';
interface Aula {
  id: number;
  turma_id: number;
  turma_nome: string;
  data: string;
  inicio: string;
  fim: string;
  local: string;
  status: string;
  conteudo: string;
  versao: number;
}
export default function Agenda() {
  const { usuario } = useSessao();
  const gestao = ['admin', 'secretaria'].includes(usuario?.papel ?? ''),
    docente = ['admin', 'professor'].includes(usuario?.papel ?? '');
  const q = useQuery(() => api.get<Aula[]>('/academico/aulas'), []),
    turmas = useQuery(() => api.get<{ id: number; nome: string }[]>('/portal/turmas'), []);
  const [erro, setErro] = useState(''),
    [selecionada, setSelecionada] = useState<Aula | null>(null),
    [edicao, setEdicao] = useState<Aula | null>(null),
    [salvando, setSalvando] = useState(false);
  async function criar(e: React.FormEvent<HTMLFormElement>, horario = false) {
    e.preventDefault();
    const f = e.currentTarget,
      d = new FormData(f);
    setSalvando(true);
    setErro('');
    try {
      await api.post(horario ? '/academico/horarios' : '/academico/aulas', {
        turma_id: Number(d.get('turma')),
        inicio: d.get('inicio'),
        fim: d.get('fim'),
        local: d.get('local') ?? '',
        ...(horario
          ? { dia: Number(d.get('dia')) }
          : { data: d.get('data'), ...(d.get('reposicao') ? { reposicao_de: Number(d.get('reposicao')) } : {}) }),
        ...(d.get('excecao') ? { excecao_motivo: d.get('excecao') } : {}),
      });
      q.reload();
      f.reset();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }
  const campos = (horario = false) => (
    <>
      <Label htmlFor={'turma-' + horario}>Turma</Label>
      <select id={'turma-' + horario} name="turma" className="h-9 rounded-md border border-input bg-background px-3 text-sm" required>
        {turmas.data?.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome}
          </option>
        ))}
      </select>
      {horario ? (
        <>
          <Label htmlFor="dia-semana">Dia da semana</Label>
          <select id="dia-semana" name="dia" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            {['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <Label htmlFor="data-aula">Data</Label>
          <Input id="data-aula" name="data" type="date" required />
        </>
      )}
      {[
        ['inicio', 'Início'],
        ['fim', 'Fim'],
      ].map(([n, r]) => (
        <div key={n}>
          <Label htmlFor={n + horario}>{r}</Label>
          <Input id={n + horario} name={n} type="time" required />
        </div>
      ))}
      <Label htmlFor={'local-' + horario}>Sala/local</Label>
      <Input id={'local-' + horario} name="local" maxLength={100} />
      {usuario?.papel === 'admin' && (
        <>
          <Label htmlFor={'excecao-' + horario}>Justificativa para exceção de conflito (opcional)</Label>
          <Input id={'excecao-' + horario} name="excecao" minLength={10} />
        </>
      )}
      {!horario && (
        <>
          <Label htmlFor="reposicao">Reposição de aula cancelada (opcional)</Label>
          <select id="reposicao" name="reposicao" className="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option value="">Não é reposição</option>
            {q.data
              ?.filter((a) => a.status === 'cancelada')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.turma_nome} · {fmtData(a.data)}
                </option>
              ))}
          </select>
        </>
      )}
      <Button disabled={salvando}>{horario ? 'Cadastrar horário semanal' : 'Agendar aula'}</Button>
    </>
  );
  return (
    <section className="space-y-5">
      <h1 className="text-xl font-semibold">Agenda e frequência</h1>
      <Feriados />
      {gestao && (
        <div className="grid gap-4 md:grid-cols-2">
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-medium">Agendar aula presencial</summary>
            <form onSubmit={(e) => void criar(e)} className="mt-4 grid gap-2">
              {campos()}
            </form>
          </details>
          <details className="rounded-xl border p-4">
            <summary className="cursor-pointer font-medium">Cadastrar horário semanal</summary>
            <form onSubmit={(e) => void criar(e, true)} className="mt-4 grid gap-2">
              {campos(true)}
            </form>
          </details>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-danger-deep">
          {erro}
        </p>
      )}
      {usuario?.papel === 'aluno' && <MinhaFrequencia />}
      {q.error ? (
        <EstadoErro erro={q.error} aoRecarregar={q.reload} />
      ) : !q.data ? (
        <p>Carregando agenda…</p>
      ) : q.data.length === 0 ? (
        <p>Nenhuma aula agendada.</p>
      ) : (
        <div className="space-y-3">
          {q.data.map((a) => (
            <article className="space-y-2 rounded-xl border p-4" key={a.id}>
              <h2 className="font-semibold">
                {a.turma_nome} · {fmtData(a.data)} · {a.inicio}–{a.fim}
              </h2>
              <p>
                {a.local || 'Local a confirmar'} · {a.status}
              </p>
              {a.conteudo && <p className="whitespace-pre-wrap text-muted-foreground">{a.conteudo}</p>}
              <div className="flex flex-wrap gap-2">
                {(gestao || docente) && (
                  <Button variant="outline" onClick={() => setEdicao(a)}>
                    Registrar ou corrigir aula
                  </Button>
                )}
                {docente && a.status === 'realizada' && <Button onClick={() => setSelecionada(a)}>Fazer chamada</Button>}
              </div>
            </article>
          ))}
        </div>
      )}
      {selecionada && (
        <Chamada
          aula={q.data?.find((a) => a.id === selecionada.id) ?? selecionada}
          fechar={() => setSelecionada(null)}
          atualizar={q.reload}
        />
      )}{' '}
      {edicao && <EditarAula aula={edicao} gestao={gestao} fechar={() => setEdicao(null)} atualizar={q.reload} />}{' '}
      {gestao && <Transferencia />}
    </section>
  );
}
function EditarAula({ aula, gestao, fechar, atualizar }: { aula: Aula; gestao: boolean; fechar: () => void; atualizar: () => void }) {
  const [erro, setErro] = useState(''),
    [salvando, setSalvando] = useState(false);
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setSalvando(true);
    try {
      await api.put(`/academico/aulas/${aula.id}`, {
        versao: aula.versao,
        status: d.get('status'),
        conteudo: d.get('conteudo'),
        motivo: d.get('motivo'),
      });
      atualizar();
      fechar();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Dialog open onOpenChange={(a) => !a && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registro da aula</DialogTitle>
          <DialogDescription>
            {aula.turma_nome} · {fmtData(aula.data)}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-3">
          <Label htmlFor="status-aula">Situação</Label>
          <select
            id="status-aula"
            name="status"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            defaultValue={gestao ? aula.status : 'realizada'}
          >
            {(gestao ? ['prevista', 'realizada', 'cancelada'] : ['realizada']).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <Label htmlFor="conteudo-aula">Conteúdo ministrado</Label>
          <textarea
            id="conteudo-aula"
            name="conteudo"
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            maxLength={5000}
            defaultValue={aula.conteudo}
          />
          <Label htmlFor="motivo-aula">Motivo/descrição do registro</Label>
          <Input id="motivo-aula" name="motivo" required minLength={5} />
          {erro && <p role="alert">{erro}</p>}
          <Button disabled={salvando}>Salvar registro</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function Chamada({ aula, fechar, atualizar }: { aula: Aula; fechar: () => void; atualizar: () => void }) {
  const q = useQuery(() => api.get<{ id: number; nome: string; status: string | null }[]>(`/academico/aulas/${aula.id}/alunos`), [aula.id]);
  const [erro, setErro] = useState(''),
    [salvando, setSalvando] = useState(false);
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setSalvando(true);
    try {
      await api.post(`/academico/aulas/${aula.id}/chamada`, {
        versao: aula.versao,
        motivo: d.get('motivo'),
        presencas: q.data?.map((a) => ({ aluno_id: a.id, status: d.get('aluno-' + a.id) })),
      });
      atualizar();
      fechar();
    } catch (err) {
      setErro(mensagemErro(err));
      atualizar();
    } finally {
      setSalvando(false);
    }
  }
  return (
    <Dialog open onOpenChange={(a) => !a && fechar()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chamada</DialogTitle>
          <DialogDescription>
            {aula.turma_nome} · {fmtData(aula.data)}
          </DialogDescription>
        </DialogHeader>
        {q.error ? (
          <EstadoErro erro={q.error} />
        ) : (
          <form onSubmit={salvar} className="space-y-3">
            {q.data?.map((a) => (
              <div key={a.id}>
                <Label htmlFor={'presenca-' + a.id}>{a.nome}</Label>
                <select
                  id={'presenca-' + a.id}
                  name={'aluno-' + a.id}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  defaultValue={a.status ?? 'presente'}
                >
                  <option value="presente">Presente</option>
                  <option value="falta">Falta</option>
                  <option value="justificada">Justificada</option>
                </select>
              </div>
            ))}
            <Label htmlFor="motivo-chamada">Registro ou motivo da correção</Label>
            <Input id="motivo-chamada" name="motivo" minLength={5} required />
            {erro && <p role="alert">{erro}</p>}
            <Button disabled={salvando || !q.data}>Salvar chamada</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
function MinhaFrequencia() {
  const q = useQuery(
    () =>
      api.get<{
        presentes: number;
        faltas: number;
        justificadas: number;
        pendentes: number;
        percentual: number | null;
        criterio: string;
        aulas: { aula_id: number; data: string; turma_nome: string; status: string | null }[];
      }>('/academico/frequencia'),
    [],
  );
  return q.error ? (
    <EstadoErro erro={q.error} />
  ) : q.data ? (
    <section className="space-y-2 rounded-xl border p-4">
      <h2 className="font-semibold">Minha frequência</h2>
      <p>
        {q.data.presentes} presenças · {q.data.faltas} faltas · {q.data.justificadas} justificadas · {q.data.pendentes} pendentes
      </p>
      <p>{q.data.percentual === null ? 'Sem frequência consolidada' : q.data.percentual + '% de presença'}</p>
      <p className="text-sm text-muted-foreground">{q.data.criterio}</p>
      <ul>
        {q.data.aulas.map((a) => (
          <li key={a.aula_id}>
            {fmtData(a.data)} · {a.turma_nome} · {a.status ?? 'Chamada pendente'}
          </li>
        ))}
      </ul>
    </section>
  ) : null;
}
function Transferencia() {
  const q = useQuery(() => api.get<{ id: number; aluno_nome: string; turma_nome: string }[]>('/matriculas?status=ativa'), []),
    t = useQuery(() => api.get<{ id: number; nome: string }[]>('/turmas'), []);
  const [mensagem, setMensagem] = useState(''),
    [enviando, setEnviando] = useState(false);
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setEnviando(true);
    try {
      await api.post('/academico/transferencias', {
        matricula_id: Number(d.get('matricula')),
        turma_destino: Number(d.get('destino')),
        motivo: d.get('motivo'),
        operacao_id: crypto.randomUUID(),
      });
      q.reload();
      setMensagem('Transferência concluída. As cobranças originais foram preservadas sem duplicação.');
    } catch (err) {
      setMensagem(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer font-medium">Transferir matrícula</summary>
      <form onSubmit={enviar} className="mt-3 space-y-3">
        <Label htmlFor="transferir-origem">Matrícula ativa</Label>
        <select
          id="transferir-origem"
          name="matricula"
          required
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {q.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.aluno_nome} · {m.turma_nome}
            </option>
          ))}
        </select>
        <Label htmlFor="transferir-destino">Turma de destino (mesmo idioma e ano)</Label>
        <select
          id="transferir-destino"
          name="destino"
          required
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {t.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
        <Label htmlFor="transferir-motivo">Motivo</Label>
        <Input id="transferir-motivo" name="motivo" required minLength={5} />
        <Button disabled={enviando}>Transferir sem duplicar cobranças</Button>
      </form>
      {mensagem && <p role="status">{mensagem}</p>}
    </details>
  );
}
