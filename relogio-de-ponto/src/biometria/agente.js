import { ErroBiometria } from './driver.js';
import { config } from '../config.js';

/**
 * Driver que conversa com o "agente biometrico" — um pequeno servico local,
 * instalado no proprio computador do posto, que carrega o SDK do fabricante do
 * leitor e expoe HTTP em 127.0.0.1. Ver agente-biometrico/PROTOCOLO.md.
 *
 * Essa separacao existe porque os SDKs de leitor sao nativos (Windows, .NET ou
 * C) e precisam rodar na maquina onde o USB esta plugado. O REP-P continua
 * sendo o unico dono dos registros.
 */
export function criarDriverAgente({ url = config.biometria.agenteUrl } = {}) {
  async function chamar(rota, corpo, timeoutMs = 20000) {
    const controle = new AbortController();
    const alarme = setTimeout(() => controle.abort(), timeoutMs);
    try {
      const resposta = await fetch(`${url}${rota}`, {
        method: corpo ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json' },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: controle.signal
      });
      if (!resposta.ok) {
        throw new ErroBiometria(
          `Agente biometrico respondeu ${resposta.status}`, 'AGENTE_ERRO'
        );
      }
      return await resposta.json();
    } catch (erro) {
      if (erro instanceof ErroBiometria) throw erro;
      throw new ErroBiometria(
        'Leitor biometrico indisponivel. Chame o suporte.', 'AGENTE_INDISPONIVEL'
      );
    } finally {
      clearTimeout(alarme);
    }
  }

  return {
    nome: 'agente',

    async status() {
      try {
        const resposta = await chamar('/status', null, 3000);
        return {
          disponivel: Boolean(resposta.disponivel),
          modelo: resposta.modelo,
          detalhe: resposta.detalhe
        };
      } catch {
        return { disponivel: false, detalhe: 'agente local nao responde' };
      }
    },

    async capturar({ timeoutMs = 20000 } = {}) {
      const resposta = await chamar('/capturar', { timeoutMs }, timeoutMs + 2000);
      if (!resposta.template) {
        throw new ErroBiometria('Nao foi possivel ler a digital. Tente novamente.', 'SEM_CAPTURA');
      }
      return {
        template: Buffer.from(resposta.template, 'base64'),
        qualidade: Number(resposta.qualidade || 0),
        modelo: resposta.modelo || ''
      };
    },

    /**
     * Identificacao 1:N. Mandamos os templates cadastrados (decifrados apenas
     * em memoria) e o agente devolve o melhor casamento acima do limiar.
     */
    async identificar(template, candidatos) {
      const resposta = await chamar('/identificar', {
        template: template.toString('base64'),
        limiar: config.biometria.scoreMinimo,
        candidatos: candidatos.map((c) => ({
          id: c.trabalhadorId,
          template: c.template.toString('base64')
        }))
      });
      if (!resposta.encontrado) return { encontrado: false };
      return {
        encontrado: true,
        trabalhadorId: Number(resposta.id),
        score: Number(resposta.score || 0),
        modelo: resposta.modelo || ''
      };
    }
  };
}
