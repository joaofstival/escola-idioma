import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from '@/components/shell';
import { Toaster } from '@/components/ui/sonner';
import EmMigracao from '@/pages/em-migracao';

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
  financeiro: 'Mensalidades',
  cotacao: 'Cotação de moedas',
  traducao: 'Tradutor',
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
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
      <Toaster position="bottom-right" />
    </>
  );
}
