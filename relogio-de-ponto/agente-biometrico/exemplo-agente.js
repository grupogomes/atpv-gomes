#!/usr/bin/env node
/**
 * Agente biométrico de referência.
 *
 * Roda no computador onde o leitor USB está plugado, escuta só em 127.0.0.1 e
 * traduz o protocolo do REP-P para o SDK do fabricante.
 *
 * Este arquivo está pronto para uso EXCETO nos três pontos marcados com
 * `>>> AQUI ENTRA O SDK DO FABRICANTE`. Do jeito que está, ele roda em modo
 * simulado, útil para testar a integração de ponta a ponta antes de o leitor
 * chegar.
 *
 *   node agente-biometrico/exemplo-agente.js
 *   node agente-biometrico/exemplo-agente.js --simulado
 */

import http from 'node:http';
import crypto from 'node:crypto';

const PORTA = Number(process.env.AGENTE_PORTA || 9010);
const SIMULADO = process.argv.includes('--simulado') || !process.env.SDK_CAMINHO;
const MODELO = process.env.LEITOR_MODELO || (SIMULADO ? 'Simulado' : 'Leitor USB');

/* ==========================================================================
 * Ponte com o SDK
 *
 * Substitua o corpo destas três funções pela chamada ao SDK do seu leitor.
 * Formas usuais de fazer isso a partir do Node:
 *   - `child_process.execFile` num utilitário CLI que o fabricante forneça;
 *   - `koffi` / `ffi-napi` para chamar a DLL diretamente;
 *   - um serviço em C# ou Java que o agente consulta por HTTP local.
 * ======================================================================== */

async function sdkStatus() {
  // >>> AQUI ENTRA O SDK DO FABRICANTE
  // Ex.: verificar se o dispositivo está enumerado e o driver carregado.
  if (SIMULADO) return { disponivel: true, detalhe: 'modo simulado' };
  throw new Error('SDK não implementado');
}

async function sdkCapturar(timeoutMs) {
  // >>> AQUI ENTRA O SDK DO FABRICANTE
  // Ex.: NBioAPI_Capture(...) → extrair template → devolver em Buffer.
  // NUNCA devolva nem grave a imagem da digital: só o template.
  if (SIMULADO) {
    await new Promise((r) => setTimeout(r, 400));
    const semente = process.env.DEDO_SIMULADO || 'dedo-de-teste';
    return {
      template: crypto.createHash('sha256').update(`dedo:${semente}`).digest(),
      qualidade: 90
    };
  }
  throw new Error('SDK não implementado');
}

/**
 * Compara dois templates e devolve um score de 0 a 100.
 * O SDK do fabricante quase sempre tem uma função própria para isso —
 * use a dele, que é calibrada para o sensor. Comparação byte a byte só
 * funciona no modo simulado.
 */
async function sdkComparar(templateA, templateB) {
  // >>> AQUI ENTRA O SDK DO FABRICANTE
  // Ex.: NBioAPI_VerifyMatch(...) → converter o resultado para 0-100.
  if (SIMULADO) return templateA.equals(templateB) ? 100 : 0;
  throw new Error('SDK não implementado');
}

/* ==========================================================================
 * Protocolo HTTP (não precisa mexer)
 * ======================================================================== */

async function lerCorpo(req) {
  const pedacos = [];
  for await (const p of req) pedacos.push(p);
  if (!pedacos.length) return {};
  try { return JSON.parse(Buffer.concat(pedacos).toString('utf8')); }
  catch { return {}; }
}

function responder(res, status, corpo) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(texto);
}

const servidor = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/status') {
      const estado = await sdkStatus().catch((e) => ({ disponivel: false, detalhe: e.message }));
      return responder(res, 200, { ...estado, modelo: MODELO });
    }

    if (req.method === 'POST' && req.url === '/capturar') {
      const { timeoutMs = 20000 } = await lerCorpo(req);
      const captura = await sdkCapturar(timeoutMs);
      if (!captura?.template) return responder(res, 200, { template: null });
      return responder(res, 200, {
        template: captura.template.toString('base64'),
        qualidade: captura.qualidade,
        modelo: MODELO
      });
    }

    if (req.method === 'POST' && req.url === '/identificar') {
      const { template, candidatos = [], limiar = 60 } = await lerCorpo(req);
      if (!template) return responder(res, 400, { erro: 'template ausente' });

      const alvo = Buffer.from(template, 'base64');
      let melhor = { score: -1, id: null };
      for (const candidato of candidatos) {
        const score = await sdkComparar(alvo, Buffer.from(candidato.template, 'base64'));
        if (score > melhor.score) melhor = { score, id: candidato.id };
      }

      if (melhor.score < limiar) return responder(res, 200, { encontrado: false });
      return responder(res, 200, {
        encontrado: true, id: melhor.id, score: melhor.score, modelo: MODELO
      });
    }

    return responder(res, 404, { erro: 'rota desconhecida' });
  } catch (erro) {
    console.error('[agente]', erro);
    return responder(res, 500, { erro: erro.message });
  }
});

// Só localhost. O agente não tem autenticação e não deve estar acessível na rede.
servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`Agente biométrico em http://127.0.0.1:${PORTA}`);
  console.log(`  modelo: ${MODELO}${SIMULADO ? '  (MODO SIMULADO — não usar em produção)' : ''}`);
});
