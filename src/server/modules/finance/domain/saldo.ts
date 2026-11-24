export interface Movimento {
  id: string;
  tipo: string;
  valor_centavos: number;
  data: string;
  estorno_de: string | null;
}
export interface Obrigacao {
  id: number;
  valor_centavos: number;
  vencimento: string;
  multa_bp: number;
  juros_bp: number;
  status: string;
}
const dias = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000));
/** Centavos inteiros; juros simples sobre principal restante, sem capitalizar encargos. */
export class CalculadoraSaldo {
  calcular(m: Obrigacao, movimentos: Movimento[], data: string) {
    let principal = m.valor_centavos,
      multa = 0,
      jurosNumerador = 0,
      pago = 0,
      descontado = 0,
      multaAplicada = false,
      anterior = m.vencimento;
    const estornados = new Set(movimentos.filter((x) => x.tipo === 'estorno').map((x) => x.estorno_de));
    const cobrar = (ate: string) => {
      if (ate > m.vencimento && principal > 0) {
        if (!multaAplicada) {
          multa = Math.round((principal * m.multa_bp) / 10000);
          multaAplicada = true;
        }
        jurosNumerador += principal * m.juros_bp * dias(anterior, ate);
      }
      if (ate > anterior) anterior = ate;
    };
    for (const x of movimentos
      .filter((x) => x.data <= data && x.tipo !== 'estorno' && !estornados.has(x.id))
      .sort((a, b) => a.data.localeCompare(b.data))) {
      cobrar(x.data);
      if (x.tipo === 'pagamento') {
        let valor = x.valor_centavos;
        pago += valor;
        const juros = Math.round(jurosNumerador / 300000),
          abateJuros = Math.min(valor, juros);
        valor -= abateJuros;
        jurosNumerador -= abateJuros * 300000;
        const abateMulta = Math.min(valor, multa);
        valor -= abateMulta;
        multa -= abateMulta;
        principal = Math.max(0, principal - valor);
      } else if (x.tipo === 'desconto') {
        principal = Math.max(0, principal - x.valor_centavos);
        descontado += x.valor_centavos;
      } else if (x.tipo === 'ajuste') principal += x.valor_centavos;
    }
    cobrar(data);
    const juros = Math.max(0, Math.round(jurosNumerador / 300000));
    const saldo = m.status === 'cancelada' ? 0 : Math.max(0, principal + multa + juros);
    return {
      saldo_centavos: saldo,
      principal_centavos: principal,
      multa_centavos: multa,
      juros_centavos: juros,
      pago_centavos: pago,
      desconto_centavos: descontado,
      parcial: pago > 0 && saldo > 0,
    };
  }
}
