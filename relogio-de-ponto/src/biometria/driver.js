/**
 * Contrato do driver biometrico.
 *
 * O REP-P nunca fala direto com o hardware: ele conversa com um driver que
 * implementa esta interface. Isso mantem o nucleo legal do sistema
 * independente da marca do leitor (Nitgen, DigitalPersona, Futronic, Control
 * iD, Fingertech...) e permite homologar o leitor sem tocar no codigo fiscal.
 *
 * @typedef {object} Captura
 * @property {Buffer} template   Template biometrico (vetor de minucias). Nunca imagem.
 * @property {number} qualidade  0-100, qualidade da captura.
 * @property {string} modelo     Modelo do leitor que capturou.
 *
 * @typedef {object} Identificacao
 * @property {boolean} encontrado
 * @property {number}  [trabalhadorId]
 * @property {number}  [score]        0-100, confianca da comparacao.
 * @property {string}  [modelo]
 *
 * @typedef {object} DriverBiometrico
 * @property {() => Promise<{disponivel: boolean, modelo?: string, detalhe?: string}>} status
 * @property {(opcoes?: {timeoutMs?: number}) => Promise<Captura>} capturar
 * @property {(template: Buffer, candidatos: Array<{trabalhadorId: number, template: Buffer}>) => Promise<Identificacao>} identificar
 */

/** Erro de negocio da camada biometrica (mensagem exibivel ao trabalhador). */
export class ErroBiometria extends Error {
  constructor(mensagem, codigo = 'BIOMETRIA_FALHA') {
    super(mensagem);
    this.codigo = codigo;
  }
}
