import { StatusBadge, type Tom } from '@/components/status-badge';
import type { MatriculaStatus } from '../../shared/types.ts';

export const STATUS_MAT: Record<MatriculaStatus, [string, Tom]> = {
  ativa: ['Ativa', 'ok'], concluida: ['Concluída', 'info'], cancelada: ['Cancelada', 'neutro'],
};

export const StatusMatricula = ({ status }: { status: MatriculaStatus }) => <StatusBadge tom={STATUS_MAT[status][1]}>{STATUS_MAT[status][0]}</StatusBadge>;
