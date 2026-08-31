import { config } from '../config.js';
import { driver } from '../biometria/index.js';
import { registrarAuditoria } from '../servicos/auditoria.js';

/**
 * Modo de teste — só existe quando BIOMETRIA_DRIVER=simulador.
 *
 * Serve para conferir o sistema inteiro (cadastro, marcação, comprovante,
 * espelho, AFD) num computador que ainda não tem o leitor plugado. Em vez de
 * uma digital, quem opera digita uma "senha de dedo": qualquer palavra. A
 * mesma palavra sempre gera o mesmo template, então cadastrar com "ana" e
 * marcar com "ana" identifica a Ana.
 *
 * Com o driver real (BIOMETRIA_DRIVER=agente) estas rotas respondem 404 —
 * não existe caminho para injetar identidade num sistema em produção.
 */
export function simuladorAtivo() {
  return config.biometria.driver === 'simulador';
}

export function definirDedoSimulado(req, res) {
  if (!simuladorAtivo()) {
    return res.status(404).json({ erro: 'Rota inexistente.' });
  }
  const leitor = driver();
  if (typeof leitor.apresentarDedo !== 'function') {
    return res.status(409).json({ erro: 'O driver ativo não é o simulador.' });
  }

  const semente = String(req.body?.semente || '').trim();
  if (!semente) {
    return res.status(400).json({ erro: 'Informe a senha de dedo para o teste.' });
  }

  leitor.apresentarDedo(semente);
  registrarAuditoria({
    ator: req.usuario?.login || `posto:${req.posto?.id || '?'}`,
    acao: 'simulador.dedo',
    detalhe: `modo de teste: dedo "${semente}"`,
    ip: req.ipOrigem || ''
  });
  return res.json({ ok: true, semente, aviso: 'Modo de teste — não use em produção.' });
}
