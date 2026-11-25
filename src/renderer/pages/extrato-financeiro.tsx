import { useState } from 'react';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { brl, data } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EstadoErro } from '@/components/estados';
interface Movimento {
  id: string;
  tipo: string;
  valor_centavos: number;
  data: string;
  motivo: string | null;
  estorno_de: string | null;
}
export function ExtratoFinanceiro({
  id,
  fechar,
  atualizar,
  somenteLeitura = false,
}: {
  id: number;
  fechar: () => void;
  atualizar?: () => void;
  somenteLeitura?: boolean;
}) {
  const q = useQuery(
    () =>
      api.get<{ mensalidade: { saldo_centavos: number }; movimentos: Movimento[] }>(
        `${somenteLeitura ? '/portal' : ''}/mensalidades/${id}/extrato`,
      ),
    [id],
  );
  const [motivo, setMotivo] = useState(''),
    [valor, setValor] = useState(''),
    [tipo, setTipo] = useState('desconto'),
    [erro, setErro] = useState(''),
    [salvando, setSalvando] = useState(false);
  const [vencimento, setVencimento] = useState('');
  async function corrigir(cancelar = false) {
    setSalvando(true);
    setErro('');
    try {
      await api.put(`/mensalidades/${id}${cancelar ? '/cancelar' : ''}`, cancelar ? { motivo } : { vencimento, motivo });
      q.reload();
      atualizar?.();
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }
  async function acao(pagamento?: string) {
    setSalvando(true);
    setErro('');
    try {
      await api.post(
        `/mensalidades/${id}/${pagamento ? 'estornar' : 'ajustar'}`,
        pagamento
          ? { pagamento_id: pagamento, motivo, operacao_id: crypto.randomUUID() }
          : { tipo, valor: Number(valor.replace(',', '.')), motivo, operacao_id: crypto.randomUUID() },
      );
      q.reload();
      atualizar?.();
      setMotivo('');
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }
  const estornados = new Set(q.data?.movimentos.filter((m) => m.tipo === 'estorno').map((m) => m.estorno_de));
  return (
    <Dialog open onOpenChange={(a) => !a && fechar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico da mensalidade</DialogTitle>
          <DialogDescription>Pagamentos, ajustes e estornos são preservados para conferência.</DialogDescription>
        </DialogHeader>
        {q.error ? (
          <EstadoErro erro={q.error} />
        ) : !q.data ? (
          <p>Carregando…</p>
        ) : (
          <>
            <p className="font-semibold">Saldo: {brl(q.data.mensalidade.saldo_centavos / 100)}</p>
            <ul className="divide-y">
              {q.data.movimentos.map((m) => (
                <li key={m.id} className="space-y-1 py-3">
                  <p>
                    {m.tipo} · {brl(m.valor_centavos / 100)} · {data(m.data)}
                    {estornados.has(m.id) ? ' · estornado' : ''}
                  </p>
                  {m.motivo && <p className="text-sm text-muted-foreground">{m.motivo}</p>}
                  {!somenteLeitura && m.tipo === 'pagamento' && !estornados.has(m.id) && (
                    <Button variant="outline" size="sm" disabled={salvando || motivo.trim().length < 5} onClick={() => void acao(m.id)}>
                      Estornar este pagamento
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {!somenteLeitura && (
              <div className="space-y-3 border-t pt-4">
                <Label htmlFor="motivo-extrato">Motivo do ajuste ou estorno (mínimo 5 caracteres)</Label>
                <Input id="motivo-extrato" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} />
                <Label htmlFor="tipo-ajuste">Novo ajuste</Label>
                <select
                  id="tipo-ajuste"
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                >
                  <option value="desconto">Desconto autorizado sobre principal</option>
                  <option value="ajuste">Acréscimo ao principal</option>
                </select>
                <Label htmlFor="valor-ajuste">Valor (R$)</Label>
                <Input id="valor-ajuste" value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" />
                <Button disabled={salvando || motivo.trim().length < 5} onClick={() => void acao()}>
                  Registrar ajuste
                </Button>
                <Label htmlFor="vencimento-corrigir">Corrigir vencimento (sem pagamentos ativos)</Label>
                <Input id="vencimento-corrigir" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
                <Button variant="outline" disabled={salvando || motivo.trim().length < 5 || !vencimento} onClick={() => void corrigir()}>
                  Corrigir vencimento
                </Button>
                <Button variant="outline" disabled={salvando || motivo.trim().length < 5} onClick={() => void corrigir(true)}>
                  Cancelar cobrança
                </Button>
              </div>
            )}
          </>
        )}
        {erro && (
          <p role="alert" className="text-danger-deep">
            {erro}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function ConfiguracaoFinanceira() {
  const q = useQuery(
    () => api.get<{ dia_vencimento: number; prazo_inicial: number; multa_bp: number; juros_bp: number }>('/financeiro/configuracoes'),
    [],
  );
  const [mensagem, setMensagem] = useState(''),
    [enviando, setEnviando] = useState(false);
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setEnviando(true);
    try {
      await api.put('/financeiro/configuracoes', {
        dia_vencimento: Number(d.get('dia')),
        prazo_inicial: Number(d.get('prazo')),
        multa_bp: Math.round(Number(d.get('multa')) * 100),
        juros_bp: Math.round(Number(d.get('juros')) * 100),
      });
      q.reload();
      setMensagem('Parâmetros salvos. Cobranças antigas mantêm sua política.');
    } catch (err) {
      setMensagem(mensagemErro(err));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <details className="rounded-xl border p-4">
      <summary className="cursor-pointer font-medium">Parâmetros financeiros</summary>
      {q.data && (
        <form key={JSON.stringify(q.data)} onSubmit={salvar} className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            ['dia', 'Dia de vencimento', q.data.dia_vencimento],
            ['prazo', 'Prazo inicial (dias)', q.data.prazo_inicial],
            ['multa', 'Multa (%)', q.data.multa_bp / 100],
            ['juros', 'Juros mensais (%)', q.data.juros_bp / 100],
          ].map(([nome, rotulo, v]) => (
            <div key={nome}>
              <Label htmlFor={'config-' + nome}>{rotulo}</Label>
              <Input id={'config-' + nome} name={String(nome)} type="number" step="0.01" defaultValue={v} required />
            </div>
          ))}
          <Button disabled={enviando}>Salvar novos parâmetros</Button>
          <p className="text-sm text-muted-foreground">Aplicados somente a novas cobranças.</p>
        </form>
      )}
      {q.error && <p role="alert">{q.error.message}</p>}
      {mensagem && <p role="status">{mensagem}</p>}
    </details>
  );
}

export function NovaCobranca({ atualizar }: { atualizar: () => void }) {
  const q = useQuery(() => api.get<{ id: number; aluno_nome: string; turma_nome: string }[]>('/financeiro/matriculas'), []);
  const [erro, setErro] = useState(''),
    [salvando, setSalvando] = useState(false);
  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      d = new FormData(form);
    setSalvando(true);
    try {
      await api.post('/mensalidades', {
        matricula_id: Number(d.get('matricula')),
        competencia: d.get('competencia'),
        valor: Number(String(d.get('valor')).replace(',', '.')),
        vencimento: d.get('vencimento'),
        motivo: d.get('motivo'),
      });
      form.reset();
      atualizar();
      setErro('Cobrança criada.');
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setSalvando(false);
    }
  }
  return (
    <details className="my-3 rounded-xl border p-4">
      <summary className="cursor-pointer font-medium">Criar cobrança excepcional</summary>
      <form onSubmit={enviar} className="mt-3 grid gap-3 sm:grid-cols-2">
        <Label htmlFor="nova-matricula">Matrícula</Label>
        <select id="nova-matricula" name="matricula" className="h-9 rounded-md border border-input bg-background px-3 text-sm" required>
          <option value="">Selecione</option>
          {q.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {m.aluno_nome} · {m.turma_nome}
            </option>
          ))}
        </select>
        {[
          ['competencia', 'Competência', 'month'],
          ['vencimento', 'Vencimento', 'date'],
          ['valor', 'Valor (R$)', 'text'],
          ['motivo', 'Motivo', 'text'],
        ].map(([nome, rotulo, tipo]) => (
          <div key={nome}>
            <Label htmlFor={'nova-' + nome}>{rotulo}</Label>
            <Input id={'nova-' + nome} name={nome} type={tipo} required />
          </div>
        ))}
        <Button disabled={salvando}>Criar cobrança</Button>
      </form>
      {erro && <p role="status">{erro}</p>}
    </details>
  );
}
