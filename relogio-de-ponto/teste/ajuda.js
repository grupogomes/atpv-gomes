import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Cada arquivo de teste roda em processo proprio (node --test), entao basta
 * apontar o banco para um arquivo temporario ANTES de importar os modulos.
 */
export function bancoTemporario() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repp-teste-'));
  const arquivo = path.join(dir, 'ponto.db');
  process.env.BANCO = arquivo;
  process.env.CHAVE_BIOMETRIA = Buffer.alloc(32, 7).toString('base64');
  process.env.SEGREDO_SESSAO = 'segredo-de-teste-suficientemente-longo';
  process.env.REP_IDENTIFICACAO = 'REPP0000000000001';
  process.env.EMPREGADOR_DOCUMENTO = '11222333000181';
  process.env.EMPREGADOR_RAZAO_SOCIAL = 'EMPRESA DE TESTE LTDA';
  process.env.FUSO = '-03:00';
  return { dir, arquivo };
}

/** CPFs validos usados nos testes. */
export const CPF_A = '52998224725';
export const CPF_B = '11144477735';
