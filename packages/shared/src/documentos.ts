// CPF e CNPJ: limpeza, validação pelos dígitos verificadores e formatação.
// O banco valida o CPF de novo (app.cpf_valido); aqui é para a mensagem na hora.

export function somenteDigitos(texto: string): string {
  return texto.replace(/\D/g, '');
}

export function cpfValido(entrada: string): boolean {
  const c = somenteDigitos(entrada);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const d = [...c].map(Number);
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += d[i]! * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === d[9] && dv(10) === d[10];
}

export function cnpjValido(entrada: string): boolean {
  const c = somenteDigitos(entrada);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const d = [...c].map(Number);
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = pesos.reduce((acc, p, i) => acc + p * d[i]!, 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === d[12] && dv(13) === d[13];
}

export function formatarCnpj(cnpj: string | null | undefined): string {
  const c = somenteDigitos(cnpj ?? '');
  if (c.length !== 14) return cnpj ?? '—';
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}
