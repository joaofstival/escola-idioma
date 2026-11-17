import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueryState<T> {
  data: T | undefined;
  error: Error | undefined;
  /** true na primeira carga e em recargas (os dados antigos ficam em `data` durante a recarga). */
  loading: boolean;
  reload: () => void;
}

interface Resultado<T> {
  chave: string;
  data?: T;
  error?: Error;
}

/** Busca simples: carregando / erro / recarregar, sem biblioteca. Refaz quando `deps` (valores simples) muda. */
export function useQuery<T>(fn: () => Promise<T>, deps: readonly unknown[]): QueryState<T> {
  const [tick, setTick] = useState(0);
  const [res, setRes] = useState<Resultado<T>>({ chave: '' });
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const chave = JSON.stringify([...deps, tick]);

  useEffect(() => {
    let vivo = true;
    fnRef.current().then(
      (data) => vivo && setRes({ chave, data }),
      (error: unknown) => vivo && setRes({ chave, error: error instanceof Error ? error : new Error(String(error)) }),
    );
    return () => {
      vivo = false;
    };
  }, [chave]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const atual = res.chave === chave;
  return { data: res.data, error: atual ? res.error : undefined, loading: !atual, reload };
}
