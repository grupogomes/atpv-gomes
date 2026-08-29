import crypto from 'node:crypto';
import { ErroBiometria } from './driver.js';

/**
 * Driver de simulacao — usado em desenvolvimento, testes e homologacao, antes
 * de o leitor fisico estar plugado. O "template" e um digest deterministico de
 * uma semente; a comparacao e exata. Nao usar em producao.
 */
export function criarSimulador({ sementeAtual = null } = {}) {
  let semente = sementeAtual;

  return {
    nome: 'simulador',

    async status() {
      return { disponivel: true, modelo: 'Simulador', detalhe: 'driver de homologacao' };
    },

    /** Em producao a captura vem do leitor; aqui vem da semente injetada. */
    async capturar() {
      if (!semente) {
        throw new ErroBiometria('Nenhum dedo apresentado ao leitor.', 'SEM_CAPTURA');
      }
      const template = crypto.createHash('sha256').update(`dedo:${semente}`).digest();
      return { template, qualidade: 90, modelo: 'Simulador' };
    },

    async identificar(template, candidatos) {
      const alvo = template.toString('hex');
      for (const candidato of candidatos) {
        if (candidato.template.toString('hex') === alvo) {
          return {
            encontrado: true,
            trabalhadorId: candidato.trabalhadorId,
            score: 100,
            modelo: 'Simulador'
          };
        }
      }
      return { encontrado: false };
    },

    /** Apenas para testes: define qual dedo esta encostado no leitor. */
    apresentarDedo(valor) { semente = valor; }
  };
}
