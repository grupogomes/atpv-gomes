import { config } from '../config.js';
import { ipDaRequisicao, redeAutorizada } from '../seguranca/rede.js';
import { autenticarPosto } from '../servicos/postos.js';
import { sessaoValida } from '../servicos/usuarios.js';
import { registrarAuditoria } from '../servicos/auditoria.js';

/**
 * Barreira que impede marcacao remota.
 *
 * Sao tres condicoes cumulativas, e todas sao verificadas no SERVIDOR:
 *   1. a requisicao vem de uma faixa de rede autorizada (rede da empresa);
 *   2. o posto existe, esta ativo e apresenta o token secreto correto;
 *   3. a marcacao em si ainda passa pela identificacao biometrica.
 *
 * Um celular fora da empresa falha em (1). Um celular dentro da empresa, na
 * mesma rede Wi-Fi, falha em (2), porque nao tem o token do posto. Alguem que
 * copie o token de um posto ainda falha em (3), porque nao tem o dedo da
 * pessoa. Nao existe caminho de marcacao que pule qualquer uma das tres.
 */
export function exigirPosto(req, res, proximo) {
  const ip = ipDaRequisicao(req);

  if (!redeAutorizada(ip, config.redesAutorizadas)) {
    registrarAuditoria({
      ator: 'desconhecido', acao: 'marcacao.recusada.rede',
      detalhe: `origem ${ip} fora das redes autorizadas`, ip
    });
    return res.status(403).json({
      erro: 'Marcacao de ponto so e aceita nos terminais da empresa.',
      codigo: 'REDE_NAO_AUTORIZADA'
    });
  }

  const postoId = req.get('x-posto-id') || req.body?.postoId;
  const token = req.get('x-posto-token') || req.body?.postoToken;
  const posto = autenticarPosto(postoId, token);

  if (!posto) {
    registrarAuditoria({
      ator: 'desconhecido', acao: 'marcacao.recusada.posto',
      detalhe: `posto "${postoId || '(vazio)'}" nao autenticado`, ip
    });
    return res.status(403).json({
      erro: 'Este equipamento nao esta autorizado a registrar ponto.',
      codigo: 'POSTO_NAO_AUTORIZADO'
    });
  }

  req.posto = posto;
  req.ipOrigem = ip;
  return proximo();
}

/** Exige sessao administrativa; opcionalmente um papel especifico. */
export function exigirUsuario(papeis = null) {
  return (req, res, proximo) => {
    const token = req.get('x-sessao')
      || (req.get('authorization') || '').replace(/^Bearer\s+/i, '')
      || lerCookie(req, 'sessao');
    const usuario = sessaoValida(token);
    if (!usuario) return res.status(401).json({ erro: 'Sessao expirada ou inexistente.' });
    if (papeis && !papeis.includes(usuario.papel)) {
      return res.status(403).json({ erro: 'Permissao insuficiente para esta operacao.' });
    }
    req.usuario = usuario;
    req.ipOrigem = ipDaRequisicao(req);
    return proximo();
  };
}

export function lerCookie(req, nome) {
  const bruto = req.get('cookie') || '';
  for (const parte of bruto.split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return decodeURIComponent(resto.join('='));
  }
  return '';
}

/** Limitador simples de tentativas por IP, em memoria. */
export function limitar({ janelaMs = 60000, maximo = 30 } = {}) {
  const contagem = new Map();
  return (req, res, proximo) => {
    const chave = ipDaRequisicao(req);
    const agora = Date.now();
    const registro = contagem.get(chave);
    if (!registro || agora > registro.expira) {
      contagem.set(chave, { total: 1, expira: agora + janelaMs });
      return proximo();
    }
    registro.total += 1;
    if (registro.total > maximo) {
      return res.status(429).json({ erro: 'Muitas tentativas. Aguarde um instante.' });
    }
    return proximo();
  };
}
