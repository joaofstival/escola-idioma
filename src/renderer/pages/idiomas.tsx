// Idiomas e valores: cada idioma tem um valor fixo de mensalidade, usado ao gerar as mensalidades das matrículas.
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CampoTexto } from '@/components/campos';
import { ConfirmarApagar, type AlvoApagar } from '@/components/confirmar-apagar';
import { EstadoErro, EstadoVazio, TabelaCarregando } from '@/components/estados';
import { FormDialog } from '@/components/form-dialog';
import { MenuAcoes } from '@/components/menu-acoes';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { brl } from '@/lib/format';
import { paraNumero, textoObrigatorio } from '@/lib/validacao';
import type { Idioma } from '../../shared/types.ts';

const esquema = z.object({
  nome: textoObrigatorio('o nome', 60),
  codigo: textoObrigatorio('o código', 12).refine((v) => /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/i.test(v), 'Use o padrão ISO 639-1, como en, es ou pt-br.'),
  mensalidade: z.string().refine((v) => {
    const n = paraNumero(v);
    return !Number.isNaN(n) && n >= 0 && n <= 100000;
  }, 'Informe a mensalidade em reais, de 0 a 100.000 (ex.: 250,00).'),
});
type Valores = z.infer<typeof esquema>;

function FormIdioma({ idioma, aoFechar, aoSalvar }: { idioma: Idioma | null; aoFechar: () => void; aoSalvar: () => void }) {
  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { nome: idioma?.nome ?? '', codigo: idioma?.codigo ?? '', mensalidade: idioma ? String(idioma.mensalidade).replace('.', ',') : '' },
  });
  return (
    <FormDialog
      titulo={idioma ? `Editar ${idioma.nome}` : 'Novo idioma'}
      form={form}
      rotuloSalvar="Salvar idioma"
      aoFechar={aoFechar}
      aoEnviar={async (v) => {
        const corpo = { nome: v.nome.trim(), codigo: v.codigo.trim().toLowerCase(), mensalidade: paraNumero(v.mensalidade) };
        if (idioma) await api.put(`/idiomas/${idioma.id}`, corpo);
        else await api.post('/idiomas', corpo);
        toast.success(idioma ? 'Idioma atualizado.' : 'Idioma cadastrado.');
        aoSalvar();
      }}
    >
      <CampoTexto<Valores> nome="nome" rotulo="Nome" obrigatorio maxLength={60} placeholder="Ex.: Inglês" autoFocus />
      <CampoTexto<Valores> nome="codigo" rotulo="Código (ISO 639-1)" obrigatorio maxLength={12} placeholder="Ex.: en, es, pt-br" />
      <CampoTexto<Valores>
        nome="mensalidade" rotulo="Mensalidade (R$)" obrigatorio inputMode="decimal" placeholder="0,00"
        dica="Valor fixo usado nas mensalidades. Uma alteração vale para as próximas matrículas; as mensalidades já geradas não mudam."
      />
    </FormDialog>
  );
}

export default function Idiomas() {
  const { data: idiomas, error, loading, reload } = useQuery(() => api.get<Idioma[]>('/idiomas'), []);
  const [editando, setEditando] = useState<Idioma | 'novo' | null>(null);
  const [apagar, setApagar] = useState<Idioma | null>(null);
  const alvo: AlvoApagar | null = apagar && {
    nome: apagar.nome, tipo: 'idioma', aviso: 'Só é possível se não houver turmas, materiais ou professores vinculados.',
  };

  async function confirmarApagar() {
    if (!apagar) return;
    try {
      await api.del(`/idiomas/${apagar.id}`);
      toast.success(`Idioma “${apagar.nome}” apagado.`);
      reload();
    } catch (e) {
      toast.error(mensagemErro(e));
    }
    setApagar(null);
  }

  return (
    <>
      <PageHeader title="Idiomas e valores" description={idiomas ? `${idiomas.length} idioma(s)` : undefined}>
        <Button onClick={() => setEditando('novo')}>
          <Plus /> Novo idioma
        </Button>
      </PageHeader>

      <div role="note" className="mb-6 flex gap-2 rounded-lg border border-info-deep/30 bg-info-soft p-3 text-info-deep">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          <strong>Valor fixo usado nas mensalidades.</strong> Ao matricular um aluno, todas as mensalidades do ano são geradas com o valor do idioma da turma.
        </p>
      </div>

      {error && !idiomas ? (
        <EstadoErro erro={error} aoRecarregar={reload} />
      ) : idiomas && idiomas.length === 0 ? (
        <EstadoVazio titulo="Nenhum idioma cadastrado" descricao="Cadastre o primeiro idioma para criar turmas e matrículas.">
          <Button onClick={() => setEditando('novo')}>
            <Plus /> Novo idioma
          </Button>
        </EstadoVazio>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Idioma</TableHead>
              <TableHead>Código</TableHead>
              <TableHead className="text-right">Mensalidade</TableHead>
              <TableHead className="text-right">Anual (12×)</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          {loading && !idiomas ? (
            <TabelaCarregando colunas={5} />
          ) : (
            <TableBody>
              {idiomas?.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.nome}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{i.codigo}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{brl(i.mensalidade)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{brl(i.mensalidade * 12)}</TableCell>
                  <TableCell className="text-right">
                    <MenuAcoes
                      item={i.nome}
                      acoes={[
                        { rotulo: 'Editar idioma', icone: Pencil, aoClicar: () => setEditando(i) },
                        { rotulo: 'Apagar idioma', icone: Trash2, destrutiva: true, aoClicar: () => setApagar(i) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
      )}

      {editando && <FormIdioma idioma={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} aoSalvar={reload} />}
      <ConfirmarApagar alvo={alvo} aoCancelar={() => setApagar(null)} aoConfirmar={() => void confirmarApagar()} />
    </>
  );
}
