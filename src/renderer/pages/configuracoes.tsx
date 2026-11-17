import { useState } from 'react';
import { DatabaseBackup, Download, Upload } from 'lucide-react';
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
import type { BackupInfo, ResultadoBackupIpc } from '../../shared/types.ts';

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
  const [criando, setCriando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [erroRestaurar, setErroRestaurar] = useState<string | null>(null);

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
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      const r: ResultadoBackupIpc = await window.escola.exportarBackup();
      if (r.ok) toast.success(`Cópia exportada para ${r.arquivo}`);
      else if (!r.cancelado) toast.error(`Não foi possível exportar a cópia. ${r.erro ?? ''}`.trim());
    } catch (err) {
      toast.error(`Não foi possível exportar a cópia. ${mensagemErro(err)}`);
    } finally {
      setExportando(false);
    }
  }

  async function restaurar() {
    setConfirmando(false);
    setRestaurando(true);
    setErroRestaurar(null);
    try {
      const r = await window.escola.restaurarBackup();
      if (r.ok) toast.success('Backup restaurado. O aplicativo vai reiniciar.');
      else if (!r.cancelado) setErroRestaurar(r.erro ?? 'Não foi possível restaurar o backup.');
    } catch (err) {
      setErroRestaurar(mensagemErro(err));
    } finally {
      setRestaurando(false);
    }
  }

  const itens = q.data ?? [];
  return (
    <>
      <PageHeader title="Configurações" description="Cópias de segurança do banco de dados da escola." />
      <section aria-labelledby="backup-titulo" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 id="backup-titulo" className="text-base font-semibold">
              Backups
            </h2>
            <p className="mt-1 text-muted-foreground">
              O aplicativo guarda um backup ao abrir e a cada dia de uso, e mantém os 14 mais recentes. Faça um backup agora antes de
              mudanças grandes e exporte uma cópia para um pen drive ou nuvem.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setConfirmando(true)} disabled={restaurando}>
              <Upload aria-hidden="true" />
              Restaurar de arquivo
            </Button>
            <Button variant="outline" onClick={() => void exportar()} disabled={exportando}>
              <Download aria-hidden="true" />
              {exportando ? 'Exportando…' : 'Exportar cópia'}
            </Button>
            <Button onClick={() => void fazerAgora()} disabled={criando}>
              <DatabaseBackup aria-hidden="true" />
              {criando ? 'Fazendo backup…' : 'Fazer backup agora'}
            </Button>
          </div>
        </div>

        {erroRestaurar && (
          <p role="alert" className="rounded-xl border border-danger-deep/30 bg-danger-soft p-4 text-danger-deep">
            Nada foi restaurado e seus dados atuais continuam intactos. {erroRestaurar}
          </p>
        )}

        {q.error ? (
          <EstadoErro erro={q.error} aoRecarregar={q.reload} titulo="Não foi possível listar os backups." />
        ) : !q.loading && itens.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum backup ainda."
            descricao="O primeiro backup automático é feito na próxima vez que o aplicativo abrir. Você pode fazer um agora."
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
            <AlertDialogTitle>Restaurar os dados de um arquivo de backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Você vai escolher um arquivo de backup (.db). Os dados atuais serão substituídos pelos do arquivo e o aplicativo vai
              reiniciar. Os dados de agora ficam guardados como “pre-restauracao” na pasta do aplicativo, para voltar atrás se precisar.
              Arquivos que não forem um backup válido são recusados sem alterar nada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restaurar()}>Escolher arquivo…</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
