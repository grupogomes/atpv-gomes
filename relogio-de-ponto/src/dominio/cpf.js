/** Normaliza um CPF removendo mascara e completando com zeros a esquerda. */
export function normalizarCpf(valor) {
  return String(valor || '').replace(/\D/g, '').padStart(11, '0').slice(-11);
}

/** Valida CPF pelos dois digitos verificadores. */
export function cpfValido(valor) {
  const cpf = String(valor || '').replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  for (const digito of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < digito; i++) soma += Number(cpf[i]) * (digito + 1 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== Number(cpf[digito])) return false;
  }
  return true;
}

/** Formata para exibicao: 000.000.000-00 */
export function formatarCpf(valor) {
  const cpf = normalizarCpf(valor);
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}
