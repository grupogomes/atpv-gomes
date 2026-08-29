/**
 * Verificacao de faixa de rede (IPv4 CIDR). E a primeira barreira contra
 * marcacao remota: o REP-P so aceita marcacao vinda das redes da empresa.
 * Sozinha nao basta (VPN contorna), por isso o token de posto tambem e exigido.
 */

/** Normaliza enderecos IPv4 mapeados em IPv6 (::ffff:192.168.0.5). */
export function normalizarIp(ip) {
  if (!ip) return '';
  const limpo = String(ip).trim();
  if (limpo.startsWith('::ffff:')) return limpo.slice(7);
  if (limpo === '::1') return '127.0.0.1';
  return limpo;
}

function paraInteiro(ip) {
  const partes = ip.split('.');
  if (partes.length !== 4) return null;
  let valor = 0;
  for (const parte of partes) {
    const n = Number(parte);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    valor = (valor << 8 >>> 0) + n;
  }
  return valor >>> 0;
}

/** Testa se `ip` pertence ao bloco CIDR (ex.: '192.168.0.0/16'). */
export function dentroDoCidr(ip, cidr) {
  const [base, bitsTexto] = String(cidr).split('/');
  const bits = bitsTexto === undefined ? 32 : Number(bitsTexto);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const alvo = paraInteiro(normalizarIp(ip));
  const rede = paraInteiro(base.trim());
  if (alvo === null || rede === null) return false;
  if (bits === 0) return true;
  const mascara = (0xffffffff << (32 - bits)) >>> 0;
  return (alvo & mascara) >>> 0 === (rede & mascara) >>> 0;
}

/** Testa contra a lista de redes autorizadas. */
export function redeAutorizada(ip, redes) {
  return redes.some((cidr) => dentroDoCidr(ip, cidr));
}

/** Extrai o IP de origem de uma requisicao Express, sem confiar em cabecalhos. */
export function ipDaRequisicao(req) {
  // Deliberadamente NAO usamos X-Forwarded-For: e um cabecalho que o cliente
  // controla, e aqui ele decidiria se a marcacao e "local" ou nao.
  return normalizarIp(req.socket?.remoteAddress || '');
}
