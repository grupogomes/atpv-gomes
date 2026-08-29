/**
 * CRC-16/KERMIT (tambem chamado CCITT-TRUE) — padrao exigido pelo leiaute do
 * AFD da Portaria MTP 671/2021 para os arquivos gerados por REP-A e REP-P.
 *
 * Polinomio 0x1021 refletido (0x8408), init 0x0000, sem XOR final.
 */
export function crc16Kermit(buffer) {
  const dados = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer, 'latin1');
  let crc = 0x0000;
  for (const byte of dados) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0x8408 : crc >>> 1;
    }
  }
  return crc & 0xffff;
}

/** CRC-16 formatado como 4 digitos hexadecimais maiusculos, como vai no AFD. */
export function crc16Hex(texto) {
  return crc16Kermit(texto).toString(16).toUpperCase().padStart(4, '0');
}
