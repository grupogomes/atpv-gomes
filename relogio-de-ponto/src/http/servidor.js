import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { rotasPonto } from './rotas-ponto.js';
import { rotasAdmin } from './rotas-admin.js';
import { rotasTrabalhador } from './rotas-trabalhador.js';
import { ipDaRequisicao } from '../seguranca/rede.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function criarServidor() {
  db(); // garante esquema aplicado antes de aceitar requisicoes

  const app = express();
  app.disable('x-powered-by');

  // Nao confiamos em proxy: o IP de origem e usado como controle de acesso.
  app.set('trust proxy', false);

  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, proximo) => {
    res.set('x-content-type-options', 'nosniff');
    res.set('referrer-policy', 'no-referrer');
    res.set('content-security-policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
    proximo();
  });

  app.use('/api/ponto', rotasPonto);
  app.use('/api/admin', rotasAdmin);
  app.use('/api/portal', rotasTrabalhador);

  app.get('/api/hora', (req, res) => {
    // O quiosque sincroniza o relogio da tela com o do servidor: o horario que
    // vale e o do REP-P, nao o do computador da recepcao.
    res.json({ agora: new Date().toISOString(), fuso: config.fuso });
  });

  app.use('/kiosk', express.static(path.join(raiz, 'public', 'kiosk')));
  app.use('/admin', express.static(path.join(raiz, 'public', 'admin')));
  app.use('/portal', express.static(path.join(raiz, 'public', 'portal')));
  app.get('/', (req, res) => res.redirect('/kiosk/'));

  app.use((req, res) => res.status(404).json({ erro: 'Rota nao encontrada.' }));

  app.use((erro, req, res, _proximo) => {
    console.error('[erro]', ipDaRequisicao(req), erro);
    res.status(500).json({ erro: 'Falha interna.' });
  });

  return app;
}
