import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { CampoBusca } from './campos';
import { Form } from '@/components/ui/form';

type V = { aluno_id: string };
const alunos = [
  { valor: '1', rotulo: 'Ana Souza · 111' },
  { valor: '2', rotulo: 'João Álvares · 222' },
  { valor: '3', rotulo: 'Ana Paula Lima · 333' },
];

function Tela({ aoMudar }: { aoMudar: (v: string) => void }) {
  const form = useForm<V>({ defaultValues: { aluno_id: '' } });
  aoMudar(form.watch('aluno_id'));
  return (
    <Form {...form}>
      <CampoBusca<V>
        nome="aluno_id"
        rotulo="Aluno"
        opcoes={alunos}
        placeholder="Selecione o aluno"
        semResultado="Nenhum aluno encontrado."
      />
    </Form>
  );
}

describe('CampoBusca', () => {
  test('filtra ao digitar (sem acento e sem diferenciar maiúscula) e escolhe com Enter', async () => {
    const user = userEvent.setup();
    let valor = '';
    render(<Tela aoMudar={(v) => (valor = v)} />);
    await user.click(screen.getByRole('button', { name: 'Aluno' }));
    await user.type(screen.getByRole('combobox', { name: /buscar/i }), 'joao');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(valor).toBe('2');
    expect(screen.getByRole('button', { name: 'Aluno' })).toHaveTextContent('João Álvares');
  });

  test('mostra mensagem quando nada combina e escolhe por clique', async () => {
    const user = userEvent.setup();
    let valor = '';
    render(<Tela aoMudar={(v) => (valor = v)} />);
    await user.click(screen.getByRole('button', { name: 'Aluno' }));
    await user.type(screen.getByRole('combobox', { name: /buscar/i }), 'zzz');
    expect(screen.getByText('Nenhum aluno encontrado.')).toBeInTheDocument();
    await user.clear(screen.getByRole('combobox', { name: /buscar/i }));
    await user.type(screen.getByRole('combobox', { name: /buscar/i }), 'ana');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    await user.click(screen.getByRole('option', { name: /Ana Paula/ }));
    expect(valor).toBe('3');
  });
});
