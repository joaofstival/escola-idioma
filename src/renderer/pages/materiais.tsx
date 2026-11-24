// Materiais didáticos: filtros (idioma, nível, tipo, busca), agrupamento idioma → nível e cadastro em diálogo.
// Links http(s) abrem no navegador padrão (o processo main intercepta target=_blank).
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  BookOpen,
  ExternalLink,
  FileText,
  Headphones,
  Link2,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Trash2,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CampoSelect, CampoTexto, CampoTextarea } from '@/components/campos';
import { ConfirmarApagar } from '@/components/confirmar-apagar';
import { EstadoErro, EstadoVazio } from '@/components/estados';
import { BarraFiltros, FiltroSelect } from '@/components/filtros';
import { FormDialog } from '@/components/form-dialog';
import { MenuAcoes } from '@/components/menu-acoes';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { cefr } from '@/lib/format';
import { TIPO_MATERIAL, opcoesNivel } from '@/lib/opcoes';
import { nuloSeVazio, textoObrigatorio, textoOpcional } from '@/lib/validacao';
import type { Idioma, Material, MaterialTipo } from '../../shared/types.ts';

const TIPOS = Object.entries(TIPO_MATERIAL) as [MaterialTipo, string][];
const ICONE: Record<MaterialTipo, LucideIcon> = {
  livro: BookOpen,
  apostila: FileText,
  audio: Headphones,
  video: Video,
  link: Link2,
  outro: Paperclip,
};
const ehUrl = (s: string | null) => !!s && /^https?:\/\/\S+$/i.test(s);

const esquema = z
  .object({
    titulo: textoObrigatorio('o título', 200),
    tipo: z.string(),
    autor: textoOpcional('o autor', 150),
    idioma_id: z.string().min(1, 'Escolha o idioma.'),
    nivel: z.string().min(1, 'Escolha o nível.'),
    referencia: textoOpcional('a referência', 500),
    descricao: textoOpcional('a descrição', 2000),
  })
  .superRefine((v, ctx) => {
    if (v.tipo !== 'link') return;
    if (!v.referencia)
      ctx.addIssue({ code: 'custom', path: ['referencia'], message: 'Informe o endereço do link (começa com http:// ou https://).' });
    else if (!ehUrl(v.referencia))
      ctx.addIssue({ code: 'custom', path: ['referencia'], message: 'O endereço do link deve começar com http:// ou https://.' });
  });
type Valores = z.infer<typeof esquema>;

function FormMaterial({
  mat,
  idiomas,
  padrao,
  aoFechar,
  aoSalvar,
}: {
  mat: Material | null;
  idiomas: Idioma[];
  padrao: { idioma_id?: string; nivel?: string };
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: {
      titulo: mat?.titulo ?? '',
      tipo: mat?.tipo ?? 'livro',
      autor: mat?.autor ?? '',
      idioma_id: String(mat?.idioma_id ?? padrao.idioma_id ?? ''),
      nivel: String(mat?.nivel ?? (padrao.nivel || 1)),
      referencia: mat?.referencia ?? '',
      descricao: mat?.descricao ?? '',
    },
  });
  const tipo = useWatch({ control: form.control, name: 'tipo' });
  return (
    <FormDialog
      titulo={mat ? 'Editar material' : 'Novo material'}
      form={form}
      larga
      rotuloSalvar="Salvar material"
      aoFechar={aoFechar}
      aoEnviar={async (v) => {
        const corpo = {
          titulo: v.titulo.trim(),
          tipo: v.tipo,
          autor: nuloSeVazio(v.autor),
          idioma_id: Number(v.idioma_id),
          nivel: Number(v.nivel),
          referencia: nuloSeVazio(v.referencia),
          descricao: nuloSeVazio(v.descricao),
        };
        if (mat) await api.put(`/materiais/${mat.id}`, corpo);
        else await api.post('/materiais', corpo);
        toast.success(mat ? 'Material atualizado.' : 'Material cadastrado.');
        aoSalvar();
      }}
    >
      <CampoTexto<Valores> nome="titulo" rotulo="Título" obrigatorio maxLength={200} className="sm:col-span-2" autoFocus />
      <CampoSelect<Valores> nome="tipo" rotulo="Tipo" obrigatorio opcoes={TIPOS.map(([valor, rotulo]) => ({ valor, rotulo }))} />
      <CampoTexto<Valores> nome="autor" rotulo="Autor / editora" maxLength={150} />
      <CampoSelect<Valores>
        nome="idioma_id"
        rotulo="Idioma"
        obrigatorio
        opcoes={idiomas.map((i) => ({ valor: String(i.id), rotulo: i.nome }))}
      />
      <CampoSelect<Valores> nome="nivel" rotulo="Nível" obrigatorio opcoes={opcoesNivel()} />
      <CampoTexto<Valores>
        nome="referencia"
        rotulo="Referência"
        obrigatorio={tipo === 'link'}
        maxLength={500}
        className="sm:col-span-2"
        placeholder="ISBN, local na biblioteca ou endereço https://…"
      />
      <CampoTextarea<Valores> nome="descricao" rotulo="Descrição" maxLength={2000} rows={3} className="sm:col-span-2" />
      <FormDescription className="sm:col-span-2">
        O material aparece automaticamente nas turmas do mesmo idioma e nível. Para o tipo “Link”, a referência deve começar com http:// ou
        https://.
      </FormDescription>
    </FormDialog>
  );
}

function ItemMaterial({ m, aoEditar, aoApagar }: { m: Material; aoEditar: () => void; aoApagar: () => void }) {
  const Icone = ICONE[m.tipo] ?? Paperclip;
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        title={TIPO_MATERIAL[m.tipo]}
      >
        <Icone className="size-4" aria-hidden="true" />
        <span className="sr-only">{TIPO_MATERIAL[m.tipo]}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{m.titulo}</div>
        {m.autor && <div className="text-xs text-muted-foreground">{m.autor}</div>}
        {m.descricao && <p className="mt-1 text-muted-foreground">{m.descricao}</p>}
        {m.referencia &&
          (ehUrl(m.referencia) ? (
            <a
              href={m.referencia}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 break-all text-primary hover:underline"
              title="Abrir no navegador"
            >
              {m.referencia} <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
            </a>
          ) : (
            <div className="mt-1 text-xs text-muted-foreground">{m.referencia}</div>
          ))}
      </div>
      <MenuAcoes
        item={m.titulo}
        acoes={[
          { rotulo: 'Editar material', icone: Pencil, aoClicar: aoEditar },
          { rotulo: 'Apagar material', icone: Trash2, destrutiva: true, aoClicar: aoApagar },
        ]}
      />
    </li>
  );
}

export default function Materiais() {
  const [params, setParams] = useSearchParams();
  const idiomaId = params.get('idioma_id') ?? '';
  const nivelF = params.get('nivel') ?? '';
  const tipo = params.get('tipo') ?? '';
  const mudar = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );
  const [texto, setTexto] = useState(params.get('busca') ?? '');
  const [busca, setBusca] = useState(texto.trim());
  useEffect(() => {
    const t = setTimeout(() => setBusca(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const idiomas = useQuery(() => api.get<Idioma[]>('/idiomas'), []);
  const lista = useQuery(
    () => api.get<Material[]>('/materiais', { busca, idioma_id: idiomaId, nivel: nivelF, tipo }),
    [busca, idiomaId, nivelF, tipo],
  );
  const [editando, setEditando] = useState<Material | 'novo' | null>(null);
  const [apagar, setApagar] = useState<Material | null>(null);
  const mats = lista.data;

  async function confirmarApagar() {
    if (!apagar) return;
    try {
      await api.del(`/materiais/${apagar.id}`);
      toast.success(`Material “${apagar.titulo}” apagado.`);
      lista.reload();
    } catch (e) {
      toast.error(mensagemErro(e));
    }
    setApagar(null);
  }

  // Agrupa idioma → nível (a API já devolve ordenado por idioma, nível e título).
  const grupos = new Map<string, Map<number, Material[]>>();
  for (const m of mats ?? []) {
    const nome = m.idioma_nome ?? `Idioma ${m.idioma_id}`;
    if (!grupos.has(nome)) grupos.set(nome, new Map());
    const porNivel = grupos.get(nome)!;
    if (!porNivel.has(m.nivel)) porNivel.set(m.nivel, []);
    porNivel.get(m.nivel)!.push(m);
  }

  const botaoNovo = (
    <Button
      onClick={() =>
        idiomas.data ? setEditando('novo') : (toast.error('Os idiomas ainda não carregaram. Tentando de novo.'), idiomas.reload())
      }
    >
      <Plus /> Novo material
    </Button>
  );

  return (
    <>
      <PageHeader title="Materiais didáticos">{botaoNovo}</PageHeader>
      <BarraFiltros total={mats ? `${mats.length} material(is)` : undefined}>
        <div className="flex flex-col gap-2">
          <Label htmlFor="busca-materiais">Buscar</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="busca-materiais"
              type="search"
              className="w-72 pl-9"
              placeholder="Título, autor ou descrição"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
        </div>
        <FiltroSelect
          rotulo="Idioma"
          valor={idiomaId}
          aoMudar={(v) => mudar('idioma_id', v)}
          opcoes={[
            { valor: '', rotulo: 'Todos os idiomas' },
            ...(idiomas.data ?? []).map((i) => ({ valor: String(i.id), rotulo: i.nome })),
          ]}
        />
        <FiltroSelect rotulo="Nível" valor={nivelF} aoMudar={(v) => mudar('nivel', v)} opcoes={opcoesNivel('Todos os níveis')} />
        <FiltroSelect
          rotulo="Tipo"
          valor={tipo}
          aoMudar={(v) => mudar('tipo', v)}
          opcoes={[{ valor: '', rotulo: 'Todos os tipos' }, ...TIPOS.map(([valor, rotulo]) => ({ valor, rotulo }))]}
        />
      </BarraFiltros>

      {lista.error && !mats ? (
        <EstadoErro erro={lista.error} aoRecarregar={lista.reload} />
      ) : !mats ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : mats.length === 0 ? (
        <EstadoVazio titulo="Nenhum material encontrado" descricao="Ajuste os filtros ou cadastre um material.">
          {botaoNovo}
        </EstadoVazio>
      ) : (
        <div className="flex flex-col gap-8">
          {Array.from(grupos).map(([idioma, porNivel]) => (
            <section key={idioma} aria-label={idioma}>
              <h2 className="mb-2 text-base font-semibold">
                {idioma}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  {Array.from(porNivel.values()).reduce((s, l) => s + l.length, 0)} material(is)
                </span>
              </h2>
              {Array.from(porNivel).map(([n, itens]) => (
                <div key={n} className="mb-4">
                  <h3 className="flex items-center gap-2 border-b py-2 text-sm font-medium">
                    <Badge variant="secondary">{cefr(n)}</Badge> Nível {n}
                  </h3>
                  <ul className="divide-y">
                    {itens.map((m) => (
                      <ItemMaterial key={m.id} m={m} aoEditar={() => setEditando(m)} aoApagar={() => setApagar(m)} />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {editando && idiomas.data && (
        <FormMaterial
          mat={editando === 'novo' ? null : editando}
          idiomas={idiomas.data}
          padrao={{ idioma_id: idiomaId, nivel: nivelF }}
          aoFechar={() => setEditando(null)}
          aoSalvar={lista.reload}
        />
      )}
      <ConfirmarApagar
        alvo={apagar && { nome: apagar.titulo, tipo: 'material' }}
        aoCancelar={() => setApagar(null)}
        aoConfirmar={() => void confirmarApagar()}
      />
    </>
  );
}
