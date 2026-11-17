// Professores: lista com os idiomas habilitados, cadastro em diálogo (checkboxes de idiomas) e ativar/inativar.
import { useState } from 'react';
import { useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Power, PowerOff, Presentation } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { CampoCheck, CampoTexto } from '@/components/campos';
import { ConfirmarApagar } from '@/components/confirmar-apagar';
import { EstadoErro, EstadoVazio, TabelaCarregando } from '@/components/estados';
import { BarraFiltros, FiltroSelect } from '@/components/filtros';
import { FormDialog } from '@/components/form-dialog';
import { MenuAcoes } from '@/components/menu-acoes';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormDescription } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import { ou } from '@/lib/format';
import { emailOpcional, nuloSeVazio, textoObrigatorio, textoOpcional } from '@/lib/validacao';
import type { Idioma, Professor } from '../../shared/types.ts';

const esquema = z.object({
  nome: textoObrigatorio('o nome completo', 150),
  email: emailOpcional,
  telefone: textoOpcional('o telefone', 30),
  idiomas: z.array(z.number()),
  ativo: z.boolean(),
});
type Valores = z.infer<typeof esquema>;

function CampoIdiomas({ idiomas }: { idiomas: Idioma[] }) {
  const { watch, setValue } = useFormContext<Valores>();
  const marcados = watch('idiomas');
  return (
    <fieldset className="flex flex-col gap-2 sm:col-span-2">
      <legend className="mb-2 text-sm font-medium">Idiomas em que está habilitado</legend>
      {idiomas.length ? (
        <div className="flex flex-wrap gap-2">
          {idiomas.map((i) => {
            const id = `idioma-${i.id}`;
            return (
              <div key={i.id} className="flex h-9 items-center gap-2 rounded-lg border px-3">
                <Checkbox
                  id={id}
                  checked={marcados.includes(i.id)}
                  onCheckedChange={(v) =>
                    setValue('idiomas', v === true ? [...marcados, i.id] : marcados.filter((x) => x !== i.id), { shouldDirty: true })
                  }
                />
                <Label htmlFor={id} className="font-normal">
                  {i.nome}
                </Label>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground">Cadastre idiomas primeiro.</p>
      )}
      <FormDescription>Só professores habilitados no idioma podem ser alocados nas turmas desse idioma.</FormDescription>
    </fieldset>
  );
}

function FormProfessor({
  prof,
  idiomas,
  aoFechar,
  aoSalvar,
}: {
  prof: Professor | null;
  idiomas: Idioma[];
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const form = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nome: prof?.nome ?? '',
      email: prof?.email ?? '',
      telefone: prof?.telefone ?? '',
      idiomas: prof?.idiomas.map((i) => i.id) ?? [],
      ativo: prof?.ativo ?? true,
    },
  });
  return (
    <FormDialog
      titulo={prof ? `Editar ${prof.nome}` : 'Novo professor'}
      form={form}
      larga
      rotuloSalvar="Salvar professor"
      aoFechar={aoFechar}
      aoEnviar={async (v) => {
        const corpo = {
          nome: v.nome.trim(),
          email: nuloSeVazio(v.email),
          telefone: nuloSeVazio(v.telefone),
          idiomas: v.idiomas,
          ...(prof ? { ativo: v.ativo } : {}),
        };
        if (prof) await api.put(`/professores/${prof.id}`, corpo);
        else await api.post('/professores', corpo);
        toast.success(prof ? 'Professor atualizado.' : 'Professor cadastrado.');
        aoSalvar();
      }}
    >
      <CampoTexto<Valores> nome="nome" rotulo="Nome completo" obrigatorio maxLength={150} className="sm:col-span-2" autoFocus />
      <CampoTexto<Valores> nome="email" rotulo="E-mail" type="email" maxLength={150} />
      <CampoTexto<Valores> nome="telefone" rotulo="Telefone" type="tel" maxLength={30} />
      <CampoIdiomas idiomas={idiomas} />
      {prof && <CampoCheck<Valores> nome="ativo" rotulo="Professor ativo" className="sm:col-span-2" />}
    </FormDialog>
  );
}

export default function Professores() {
  const [ativo, setAtivo] = useState('');
  const [idiomaId, setIdiomaId] = useState('');
  const idiomas = useQuery(() => api.get<Idioma[]>('/idiomas'), []);
  const lista = useQuery(() => api.get<Professor[]>('/professores', { ativo, idioma_id: idiomaId }), [ativo, idiomaId]);
  const [editando, setEditando] = useState<Professor | 'novo' | null>(null);
  const [inativar, setInativar] = useState<Professor | null>(null);
  const profs = lista.data;

  async function alternar(p: Professor) {
    try {
      await api.put(`/professores/${p.id}`, { ativo: !p.ativo });
      toast.success(p.ativo ? `${p.nome} inativado.` : `${p.nome} reativado.`);
      lista.reload();
    } catch (e) {
      toast.error(mensagemErro(e));
    }
  }

  const botaoNovo = (
    <Button
      onClick={() =>
        idiomas.data ? setEditando('novo') : (toast.error('Os idiomas ainda não carregaram. Tentando de novo.'), idiomas.reload())
      }
    >
      <Plus /> Novo professor
    </Button>
  );

  return (
    <>
      <PageHeader title="Professores">{botaoNovo}</PageHeader>
      <BarraFiltros total={profs ? `${profs.length} professor(es)` : undefined}>
        <FiltroSelect
          rotulo="Situação"
          valor={ativo}
          aoMudar={setAtivo}
          opcoes={[
            { valor: '', rotulo: 'Todos' },
            { valor: 'true', rotulo: 'Ativos' },
            { valor: 'false', rotulo: 'Inativos' },
          ]}
        />
        <FiltroSelect
          rotulo="Idioma"
          valor={idiomaId}
          aoMudar={setIdiomaId}
          opcoes={[
            { valor: '', rotulo: 'Todos os idiomas' },
            ...(idiomas.data ?? []).map((i) => ({ valor: String(i.id), rotulo: i.nome })),
          ]}
        />
      </BarraFiltros>

      {lista.error && !profs ? (
        <EstadoErro erro={lista.error} aoRecarregar={lista.reload} />
      ) : profs && profs.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum professor encontrado"
          descricao={
            ativo || idiomaId
              ? 'Nenhum professor com esses filtros. Ajuste os filtros ou cadastre um novo.'
              : 'Cadastre o primeiro professor.'
          }
        >
          {botaoNovo}
        </EstadoVazio>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Professor</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Idiomas habilitados</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          {!profs ? (
            <TabelaCarregando colunas={5} />
          ) : (
            <TableBody>
              {profs.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.nome}</div>
                    {p.email && <div className="text-xs text-muted-foreground">{p.email}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{ou(p.telefone)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.idiomas.length ? (
                        p.idiomas.map((i) => (
                          <Badge key={i.id} variant="secondary">
                            {i.nome}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">Nenhum</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge tom={p.ativo ? 'ok' : 'neutro'}>{p.ativo ? 'Ativo' : 'Inativo'}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-right">
                    <MenuAcoes
                      item={p.nome}
                      acoes={[
                        { rotulo: 'Editar professor', icone: Pencil, aoClicar: () => setEditando(p) },
                        {
                          rotulo: 'Ver turmas',
                          icone: Presentation,
                          aoClicar: () => {
                            location.hash = `#/turmas?professor_id=${p.id}`;
                          },
                        },
                        p.ativo
                          ? { rotulo: 'Inativar professor', icone: PowerOff, destrutiva: true, aoClicar: () => setInativar(p) }
                          : { rotulo: 'Reativar professor', icone: Power, aoClicar: () => void alternar(p) },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
      )}

      {editando && idiomas.data && (
        <FormProfessor
          prof={editando === 'novo' ? null : editando}
          idiomas={idiomas.data}
          aoFechar={() => setEditando(null)}
          aoSalvar={lista.reload}
        />
      )}
      <ConfirmarApagar
        alvo={
          inativar && {
            nome: inativar.nome,
            tipo: 'professor',
            aviso: 'Ele continua nas turmas atuais, mas não poderá ser alocado em novas turmas.',
          }
        }
        titulo={(a) => `Inativar ${a.tipo} “${a.nome}”?`}
        rotuloConfirmar="Inativar professor"
        aoCancelar={() => setInativar(null)}
        aoConfirmar={() => {
          if (inativar) void alternar(inativar);
          setInativar(null);
        }}
      />
    </>
  );
}
