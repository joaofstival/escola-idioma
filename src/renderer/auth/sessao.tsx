import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { UsuarioSessao, SessaoResposta } from '../../shared/contracts/identidade';
import { api } from '@/lib/api';
const Contexto = createContext<{
  usuario: UsuarioSessao | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
} | null>(null);
export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null),
    [carregando, setCarregando] = useState(true);
  useEffect(() => {
    let ativo = true;
    api
      .get<SessaoResposta>('/auth/session')
      .then((r) => {
        if (ativo) setUsuario(r.usuario);
      })
      .catch(() => {})
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    const expirar = () => setUsuario(null);
    window.addEventListener('escola:session-expired', expirar);
    return () => {
      ativo = false;
      window.removeEventListener('escola:session-expired', expirar);
    };
  }, []);
  async function entrar(email: string, senha: string) {
    const r = await api.post<SessaoResposta>('/auth/login', { email, senha });
    setUsuario(r.usuario);
  }
  async function sair() {
    try {
      await api.post('/auth/logout');
    } catch {
      // O cliente central já elimina a credencial local mesmo sem conexão.
    } finally {
      setUsuario(null);
    }
  }
  return <Contexto.Provider value={{ usuario, carregando, entrar, sair }}>{children}</Contexto.Provider>;
}
export function useSessao() {
  const s = useContext(Contexto);
  if (!s) throw new Error('Provedor de sessão ausente');
  return s;
}
