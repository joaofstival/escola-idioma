import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
export function useAlteracoesPendentes(alterado: boolean, permitir: () => boolean) {
  const bloqueio = useBlocker(
    ({ currentLocation, nextLocation }) => alterado && !permitir() && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (bloqueio.state === 'blocked') {
      if (window.confirm('Há alterações não salvas. Descartar e sair?')) bloqueio.proceed();
      else bloqueio.reset();
    }
  }, [bloqueio]);
  useEffect(() => {
    const sair = (e: BeforeUnloadEvent) => {
      if (alterado && !permitir()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', sair);
    return () => window.removeEventListener('beforeunload', sair);
  }, [alterado, permitir]);
}
