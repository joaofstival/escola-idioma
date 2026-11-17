import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from '@/components/shell';
import { Toaster } from '@/components/ui/sonner';
import EmMigracao from '@/pages/em-migracao';
import Financeiro from '@/pages/financeiro';
import Cotacao from '@/pages/cotacao';
import Traducao from '@/pages/traducao';

/** Telas ainda não portadas (plano 03). Cada tela portada troca seu item por uma rota própria. */
const EM_MIGRACAO: Record<string, string> = {
  dashboard: 'Painel',
  alunos: 'Alunos',
  professores: 'Professores',
  idiomas: 'Idiomas e valores',
  turmas: 'Turmas',
  matriculas: 'Matrículas',
  materiais: 'Materiais didáticos',
  avaliacoes: 'Avaliações',
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
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="cotacao" element={<Cotacao />} />
          <Route path="traducao" element={<Traducao />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
      <Toaster position="bottom-right" />
    </>
  );
}
