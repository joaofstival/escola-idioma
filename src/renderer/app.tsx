import { ProvedorSessao, useSessao } from '@/auth/sessao';
import Login from '@/pages/login';
import Portal from '@/pages/portal';
import Usuarios from '@/pages/usuarios';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
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

function RotasAdministrativas() {
  const { usuario } = useSessao();
  const { pathname } = useLocation();
  const recurso = pathname.split('/')[1];
  if (usuario?.papel === 'financeiro' && !['financeiro', 'cotacao', 'traducao'].includes(recurso))
    return <Navigate to="/financeiro" replace />;
  if (
    usuario?.papel === 'secretaria' &&
    !['alunos', 'professores', 'idiomas', 'turmas', 'matriculas', 'materiais', 'cotacao', 'traducao'].includes(recurso)
  )
    return <Navigate to="/alunos" replace />;

  return (
    <>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="usuarios" element={<Usuarios />} />
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

function Entrada() {
  const { usuario, carregando } = useSessao();
  if (carregando) return <p className="p-8">Conectando à escola…</p>;
  if (!usuario) return <Login />;
  return ['aluno', 'professor'].includes(usuario.papel) ? <Portal /> : <RotasAdministrativas />;
}
export default function App() {
  return (
    <ProvedorSessao>
      <Entrada />
    </ProvedorSessao>
  );
}
