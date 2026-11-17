import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueryState<T> {
  data: T | undefined;
  error: Error | undefined;
  /** true na primeira carga e em recargas (os dados antigos ficam em `data` durante a recarga). */
  loading: boolean;
  reload: () => void;
}

/** Busca simples: carregando / erro / recarregar, sem biblioteca. Refaz quando `deps` muda. */
export function useQuery<T>(fn: () => Promise<T>, deps: readonly unknown[]): QueryState<T> {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let vivo = true;
    setState((s) => ({ data: s.data, loading: true }));
    fnRef.current().then(
      (data) => vivo && setState({ data, loading: false }),
      (error: unknown) => vivo && setState({ error: error instanceof Error ? error : new Error(String(error)), loading: false }),
    );
    return () => {
      vivo = false;
    };
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}
