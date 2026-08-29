import { config } from '../config.js';

/**
 * Converte um Date para o formato de data/hora exigido pelo leiaute da
 * Portaria 671/2021 (ISO 8601 com deslocamento explicito):
 *   2021-04-27T16:44:00-0300
 * O deslocamento e escrito sem os dois-pontos, como no Anexo I.
 */
export function paraDH(data, fuso = config.fuso) {
  const sinal = fuso.startsWith('-') ? -1 : 1;
  const [hh, mm] = fuso.replace(/[+-]/, '').split(':').map(Number);
  const offsetMin = sinal * (hh * 60 + (mm || 0));
  const local = new Date(data.getTime() + offsetMin * 60000);
  const p = (n, t = 2) => String(n).padStart(t, '0');
  const dataHora =
    `${local.getUTCFullYear()}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}` +
    `T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}`;
  return dataHora + fuso.replace(':', '');
}

/** Le uma string DH do AFD/AEJ de volta para Date. */
export function deDH(texto) {
  const normalizado = String(texto).replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return new Date(normalizado);
}

/** Data local (AAAA-MM-DD) no fuso oficial — usada para agrupar a jornada. */
export function dataLocal(data, fuso = config.fuso) {
  return paraDH(data, fuso).slice(0, 10);
}

/** Hora local HH:MM:SS no fuso oficial. */
export function horaLocal(data, fuso = config.fuso) {
  return paraDH(data, fuso).slice(11, 19);
}

/** DDMMAAAA — formato usado em alguns campos de data do leiaute. */
export function ddmmaaaa(data, fuso = config.fuso) {
  const iso = dataLocal(data, fuso);
  return `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;
}

/** Diferenca em minutos entre dois Date. */
export function minutosEntre(inicio, fim) {
  return Math.round((fim.getTime() - inicio.getTime()) / 60000);
}

/** Converte minutos para HH:MM (aceita negativos). */
export function minutosParaHHMM(minutos) {
  const sinal = minutos < 0 ? '-' : '';
  const abs = Math.abs(Math.round(minutos));
  return `${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
