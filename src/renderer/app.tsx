import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from '@/components/shell';
import { Toaster } from '@/components/ui/sonner';
import EmMigracao from '@/pages/em-migracao';
import Alunos from '@/pages/alunos';
import Idiomas from '@/pages/idiomas';
import Turmas from '@/pages/turmas';
import Materiais from '@/pages/materiais';
import Matriculas from '@/pages/matriculas';
import Professores from '@/pages/professores';

/** Telas ainda não portadas (plano 03). Cada tela portada troca seu item por uma rota própria. */
const EM_MIGRACAO: Record<string, string> = {
  dashboard: 'Painel',
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
          <Route path="alunos/:id?" element={<Alunos />} />
          <Route path="turmas/:id?" element={<Turmas />} />
          <Route path="materiais" element={<Materiais />} />
          <Route path="matriculas" element={<Matriculas />} />
          <Route path="idiomas" element={<Idiomas />} />
          <Route path="professores" element={<Professores />} />
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
