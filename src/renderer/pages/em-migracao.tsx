import { PageHeader } from '@/components/page-header';
import { EstadoVazio } from '@/components/estados';

/** Placeholder das telas ainda não portadas para React (o plano 03 as conclui). */
export default function EmMigracao({ titulo }: { titulo: string }) {
  return (
    <>
      <PageHeader title={titulo} />
      <EstadoVazio titulo="Em migração" descricao="Esta tela está sendo reescrita no novo padrão visual e volta em breve." />
    </>
  );
}
