import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Carrega o .env (formato CHAVE=valor) sem dependencia externa.
 * Variaveis ja presentes no ambiente tem precedencia.
 */
function carregarEnv(arquivo) {
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;
    const igual = limpa.indexOf('=');
    if (igual < 1) continue;
    const chave = limpa.slice(0, igual).trim();
    if (process.env[chave] !== undefined) continue;
    process.env[chave] = limpa.slice(igual + 1).trim();
  }
}

carregarEnv(path.resolve(process.cwd(), '.env'));

const desenvolvimento = process.env.NODE_ENV !== 'production';

/** Em desenvolvimento geramos segredos efemeros para o sistema subir sem setup. */
function segredo(chave) {
  const valor = process.env[chave];
  if (valor) return valor;
  if (!desenvolvimento) {
    throw new Error(`Configuracao obrigatoria ausente em producao: ${chave}`);
  }
  return crypto.randomBytes(32).toString('base64');
}

export const config = {
  desenvolvimento,
  porta: Number(process.env.PORTA || 3000),
  host: process.env.HOST || '0.0.0.0',
  banco: path.resolve(process.env.BANCO || './dados/ponto.db'),
  fuso: process.env.FUSO || '-03:00',

  empregador: {
    tipoIdentificador: Number(process.env.EMPREGADOR_TIPO_ID || 1), // 1=CNPJ 2=CPF
    documento: (process.env.EMPREGADOR_DOCUMENTO || '').replace(/\D/g, ''),
    razaoSocial: process.env.EMPREGADOR_RAZAO_SOCIAL || '',
    cnoCaepf: (process.env.EMPREGADOR_CNO_CAEPF || '').replace(/\D/g, ''),
    endereco: process.env.EMPREGADOR_ENDERECO || ''
  },

  rep: {
    identificacao: process.env.REP_IDENTIFICACAO || 'REPP0000000000001',
    // "3" = REP-P no leiaute do AFD (1 = REP-C, 2 = REP-A).
    tipo: '3'
  },

  redesAutorizadas: (process.env.REDES_AUTORIZADAS || '127.0.0.1/32')
    .split(',').map((r) => r.trim()).filter(Boolean),

  chaveBiometria: segredo('CHAVE_BIOMETRIA'),
  segredoSessao: segredo('SEGREDO_SESSAO'),

  biometria: {
    driver: process.env.BIOMETRIA_DRIVER || 'simulador',
    agenteUrl: process.env.BIOMETRIA_AGENTE_URL || 'http://127.0.0.1:9010',
    // Score minimo (0-100) para aceitar uma identificacao 1:N.
    scoreMinimo: Number(process.env.BIOMETRIA_SCORE_MINIMO || 60)
  },

  // A declaracao de comparecimento (consulta/exame do proprio trabalhador) nao
  // obriga o abono pela lei. Marque true apenas se a convencao coletiva da
  // categoria, o regulamento interno ou a pratica ja consolidada da empresa
  // previrem o abono — nesse caso ele passa a ser devido.
  abonarConsulta: process.env.ABONA_CONSULTA === 'true',

  // Intervalo minimo, em segundos, entre duas marcacoes do MESMO trabalhador.
  // Serve apenas para descartar duplo toque acidental no leitor; NAO restringe
  // horario de marcacao (vedado pela Portaria MTP 671/2021).
  janelaAntiDuplicidadeSegundos: Number(process.env.JANELA_ANTIDUPLICIDADE || 60)
};
