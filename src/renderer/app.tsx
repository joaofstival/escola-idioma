import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from '@/components/shell';
import { Toaster } from '@/components/ui/sonner';
import Alunos from '@/pages/alunos';
import Avaliacoes from '@/pages/avaliacoes';
import { AvaliacaoDetalhe, AvaliacaoNova } from '@/pages/avaliacao-detalhe';
import Configuracoes from '@/pages/configuracoes';
import Cotacao from '@/pages/cotacao';
import Painel from '@/pages/dashboard';
import Financeiro from '@/pages/financeiro';
import Idiomas from '@/pages/idiomas';
import Materiais from '@/pages/materiais';
import Matriculas from '@/pages/matriculas';
import Professores from '@/pages/professores';
import Traducao from '@/pages/traducao';
import Turmas from '@/pages/turmas';

export default function App() {
  return (
    <>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Painel />} />
          <Route path="alunos/:id?" element={<Alunos />} />
          <Route path="professores" element={<Professores />} />
          <Route path="idiomas" element={<Idiomas />} />
          <Route path="turmas/:id?" element={<Turmas />} />
          <Route path="matriculas" element={<Matriculas />} />
          <Route path="materiais" element={<Materiais />} />
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
