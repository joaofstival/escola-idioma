import { MinhaConta } from '@/components/minha-conta';
import { useEffect, useState } from 'react';
import { DatabaseBackup, Download } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { EstadoErro, EstadoVazio, TabelaCarregando } from '@/components/estados';
import { StatusBadge } from '@/components/status-badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@/hooks/use-query';
import { api, mensagemErro } from '@/lib/api';
import type { BackupInfo, EstadoBackup } from '../../shared/types.ts';

const tamanho = (b: number) =>
  b < 1024 * 1024
    ? `${Math.max(1, Math.round(b / 1024))} KB`
    : `${(b / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export default function Configuracoes() {
  const q = useQuery(() => api.get<BackupInfo[]>('/backups'), []);
  const estado = useQuery(() => api.get<EstadoBackup>('/backups/estado'), []);
  useEffect(() => {
    const timer = setInterval(estado.reload, 30_000);
    return () => clearInterval(timer);
  }, [estado.reload]);
  const [criando, setCriando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [senha, setSenha] = useState('');

  async function fazerAgora() {
    setCriando(true);
    try {
      const b = await api.post<BackupInfo>('/backups');
      toast.success(`Backup criado: ${b.nome}`);
      q.reload();
    } catch (err) {
      toast.error(`Não foi possível fazer o backup. ${mensagemErro(err)}`);
    } finally {
      setCriando(false);
      estado.reload();
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      const r = await api.post<{ nome: string; base64: string }>('/operacoes/backup/exportar', { senha });
      const arquivo = await window.escola.saveBinary(r.nome, r.base64);
      if (arquivo) toast.success('Cópia exportada. Guarde em local protegido.');
      setSenha('');
      setConfirmando(false);
    } catch (err) {
      toast.error(`Não foi possível exportar a cópia. ${mensagemErro(err)}`);
    } finally {
      setExportando(false);
    }
  }

  const itens = q.data ?? [];
  return (
    <>
      <PageHeader title="Configurações" description="Cópias de segurança do banco de dados da escola." />
      <MinhaConta />
      <section aria-labelledby="backup-titulo" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 id="backup-titulo" className="text-base font-semibold">
              Backups
            </h2>
            <p className="mt-1 text-muted-foreground">
              O servidor guarda um backup ao iniciar e a cada dia de operação, e mantém os 14 mais recentes. Faça um backup agora antes de
              mudanças grandes e exporte uma cópia para um pen drive ou nuvem.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setConfirmando(true)} disabled={exportando}>
              <Download aria-hidden="true" />
              {exportando ? 'Exportando…' : 'Exportar cópia'}
            </Button>
            <Button onClick={() => void fazerAgora()} disabled={criando}>
              <DatabaseBackup aria-hidden="true" />
              {criando ? 'Fazendo backup…' : 'Fazer backup agora'}
            </Button>
          </div>
        </div>

        {estado.error ? (
          <EstadoErro erro={estado.error} aoRecarregar={estado.reload} titulo="Não foi possível consultar a situação do backup." />
        ) : (
          estado.data && (
            <div className="space-y-2">
              <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted-foreground">
                <div>
                  <dt>Última tentativa</dt>
                  <dd>{estado.data.ultimaTentativa ? quando(estado.data.ultimaTentativa) : 'Nenhuma nesta sessão'}</dd>
                </div>
                <div>
                  <dt>Último backup concluído</dt>
                  <dd>{estado.data.ultimoSucesso ? quando(estado.data.ultimoSucesso) : 'Nenhum'}</dd>
                </div>
              </dl>
              {estado.data.erro && (
                <p role="alert" className="rounded-xl border border-danger-deep/30 bg-danger-soft p-4 text-danger-deep">
                  {estado.data.erro} Use “Fazer backup agora” para tentar novamente. O aviso só desaparece após um backup concluído.
                </p>
              )}
            </div>
          )
        )}

        <p className="text-sm text-muted-foreground">
          Os backups ficam no servidor e incluem materiais e entregas. Para restaurar, o operador deve parar o servidor e executar o
          procedimento de manutenção documentado. Reiniciar somente este aplicativo não restaura a escola.
        </p>
        {q.error ? (
          <EstadoErro erro={q.error} aoRecarregar={q.reload} titulo="Não foi possível listar os backups." />
        ) : !q.loading && itens.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum backup ainda."
            descricao="Nenhuma cópia está disponível nesta pasta. Consulte a situação acima e faça um backup agora."
          >
            <Button onClick={() => void fazerAgora()} disabled={criando}>
              Fazer backup agora
            </Button>
          </EstadoVazio>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead className="text-right">Tamanho</TableHead>
                </TableRow>
              </TableHeader>
              {!q.data ? (
                <TabelaCarregando colunas={4} />
              ) : (
                <TableBody aria-busy={q.loading}>
                  {itens.map((b) => (
                    <TableRow key={b.nome}>
                      <TableCell className="font-mono text-xs">{b.nome}</TableCell>
                      <TableCell>{quando(b.criadoEm)}</TableCell>
                      <TableCell>
                        <StatusBadge tom={b.tipo === 'manual' ? 'info' : 'neutro'}>
                          {b.tipo === 'manual' ? 'Manual' : 'Automático'}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{tamanho(b.tamanho)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              )}
            </Table>
          </div>
        )}
      </section>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exportar os dados da escola?</AlertDialogTitle>
            <AlertDialogDescription>
              A cópia contém dados pessoais, financeiros e anexos. Confirme sua senha de administrador e guarde o arquivo em local
              protegido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label htmlFor="backup-senha">Senha de administrador</label>
          <input
            id="backup-senha"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="rounded border p-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!senha || exportando}
              onClick={(e) => {
                e.preventDefault();
                void exportar();
              }}
            >
              Exportar cópia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
