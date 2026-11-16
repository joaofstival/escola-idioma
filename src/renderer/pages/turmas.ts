// PROVISÓRIO — será substituído pelo agente responsável.
import type { Page } from '../page.ts';
import { empty } from '../ui.ts';

const page: Page = {
  title: 'Turmas',
  render(container) { container.innerHTML = empty('Em construção'); },
};
export default page;
