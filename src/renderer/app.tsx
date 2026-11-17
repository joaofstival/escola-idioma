import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from '@/components/shell';
import { Toaster } from '@/components/ui/sonner';
import EmMigracao from '@/pages/em-migracao';
import Financeiro from '@/pages/financeiro';
import Cotacao from '@/pages/cotacao';
import Traducao from '@/pages/traducao';
import Configuracoes from '@/pages/configuracoes';
import Painel from '@/pages/dashboard';
import Avaliacoes from '@/pages/avaliacoes';
import { AvaliacaoDetalhe, AvaliacaoNova } from '@/pages/avaliacao-detalhe';

/** Telas ainda não portadas (plano 03). Cada tela portada troca seu item por uma rota própria. */
const EM_MIGRACAO: Record<string, string> = {
  alunos: 'Alunos',
  professores: 'Professores',
  idiomas: 'Idiomas e valores',
  turmas: 'Turmas',
  matriculas: 'Matrículas',
  materiais: 'Materiais didáticos',
};

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          {Object.entries(EM_MIGRACAO).map(([rota, titulo]) => (
            <Route key={rota} path={`${rota}/*`} element={<EmMigracao titulo={titulo} />} />
          ))}
          <Route path="dashboard" element={<Painel />} />
          <Route path="avaliacoes" element={<Avaliacoes />} />
          <Route path="avaliacoes/nova" element={<AvaliacaoNova />} />
          <Route path="avaliacoes/:id" element={<AvaliacaoDetalhe />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="cotacao" element={<Cotacao />} />
          <Route path="traducao" element={<Traducao />} />
          <Route path="configuracoes" element={<Configuracoes />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
      <Toaster position="bottom-right" />
    </>
  );
}
