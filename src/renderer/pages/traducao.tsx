import { useState } from 'react';
import { ArrowLeftRight, Copy, Languages } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { FiltroSelect } from '@/components/filtro-select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, mensagemErro } from '@/lib/api';
import type { Traducao as Resultado } from '../../shared/types.ts';

const IDIOMAS = [
  { valor: 'pt', rotulo: 'Português' }, { valor: 'en', rotulo: 'Inglês' }, { valor: 'es', rotulo: 'Espanhol' }, { valor: 'fr', rotulo: 'Francês' },
  { valor: 'it', rotulo: 'Italiano' }, { valor: 'de', rotulo: 'Alemão' }, { valor: 'ja', rotulo: 'Japonês' }, { valor: 'zh', rotulo: 'Chinês' },
];
const MAX_BYTES = 500;
const bytes = (s: string) => new TextEncoder().encode(s).length;

export default function Traducao() {
  const [texto, setTexto] = useState('');
  const [de, setDe] = useState('pt');
  const [para, setPara] = useState('en');
  const [res, setRes] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const usados = bytes(texto);
  const erroCampo = texto.trim() === '' ? 'Digite o texto a traduzir.' : usados > MAX_BYTES ? `O texto passa de ${MAX_BYTES} bytes (tem ${usados}). Encurte-o.` : de === para ? 'Escolha idiomas diferentes de origem e destino.' : null;
  const [tentou, setTentou] = useState(false);

  async function traduzir(e: React.FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (erroCampo || carregando) return;
    setCarregando(true);
    setErro(null);
    try {
      setRes(await api.get<Resultado>('/traducao', { texto: texto.trim(), de, para }));
    } catch (err) {
      setRes(null);
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }

  function inverter() {
    setDe(para);
    setPara(de);
    if (res) { setTexto(res.traducao); setRes(null); }
  }

  async function copiar(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      toast.success('Tradução copiada.');
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e use Ctrl+C.');
    }
  }

  return (
    <>
      <PageHeader title="Tradutor" description="Palavras e frases curtas. Sem internet, usa o dicionário do aplicativo." />
      <form onSubmit={traduzir} noValidate className="max-w-3xl space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5"><Label>De</Label><FiltroSelect rotulo="Idioma de origem" valor={de} aoMudar={setDe} opcoes={IDIOMAS} className="w-40" /></div>
          <Button type="button" variant="outline" size="icon" onClick={inverter} aria-label="Inverter idiomas"><ArrowLeftRight aria-hidden="true" /></Button>
          <div className="space-y-1.5"><Label>Para</Label><FiltroSelect rotulo="Idioma de destino" valor={para} aoMudar={setPara} opcoes={IDIOMAS} className="w-40" /></div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trad-texto">Texto</Label>
          <Textarea id="trad-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
            aria-invalid={tentou && erroCampo ? true : undefined} aria-describedby="trad-ajuda" />
          <p id="trad-ajuda" className={tentou && erroCampo ? 'text-sm text-danger-deep' : 'text-xs text-muted-foreground'}>
            {tentou && erroCampo ? erroCampo : `${usados} de ${MAX_BYTES} bytes`}
          </p>
        </div>
        <Button type="submit" disabled={carregando}><Languages aria-hidden="true" />{carregando ? 'Traduzindo…' : 'Traduzir texto'}</Button>
      </form>

      <div className="mt-8 max-w-3xl" aria-live="polite">
        {erro && <p role="alert" className="rounded-xl border border-danger-deep/30 bg-danger-soft p-4 text-danger-deep">{erro}</p>}
        {res && (
          <section className="space-y-3 rounded-xl border p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-lg font-semibold">{res.traducao}</p>
              <Button variant="outline" size="sm" onClick={() => void copiar(res.traducao)}><Copy aria-hidden="true" />Copiar tradução</Button>
            </div>
            {res.alternativas && res.alternativas.length > 0 && (
              <p className="text-muted-foreground">Outras opções: {res.alternativas.join(' · ')}</p>
            )}
            <p className="text-xs text-muted-foreground">Fonte: {res.fonte}</p>
          </section>
        )}
      </div>
    </>
  );
}
