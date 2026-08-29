import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

/**
 * ===========================================================================
 * Assinatura digital ICP-Brasil
 * ===========================================================================
 * A Portaria MTP 671/2021 exige que os arquivos e comprovantes gerados pelo
 * REP-P sejam assinados digitalmente com certificado ICP-Brasil do empregador
 * (padrao PAdES para PDF, CAdES para os arquivos fiscais).
 *
 * A assinatura NAO e feita em JavaScript aqui, de proposito: a chave privada
 * deve viver num token/HSM ou num arquivo PKCS#12 sob controle do empregador,
 * e a operacao e delegada a uma ferramenta externa. O sistema funciona sem ela
 * (e avisa em /admin/saude), mas so esta apto a entregar arquivos a
 * fiscalizacao com a assinatura configurada.
 *
 * Configuracao (.env):
 *   ASSINATURA_COMANDO=/usr/local/bin/assinar-icp
 *   ASSINATURA_CERTIFICADO=/caminho/certificado.p12
 *   ASSINATURA_SENHA_ARQUIVO=/caminho/senha.txt
 *
 * O comando recebe:  <comando> --tipo pdf|cades --entrada ARQ --saida ARQ
 *                    --certificado P12 --senha-arquivo ARQ
 */

export function assinaturaConfigurada() {
  return Boolean(process.env.ASSINATURA_COMANDO && process.env.ASSINATURA_CERTIFICADO);
}

/** Situacao da assinatura, exibida no painel de saude do sistema. */
export function situacaoAssinatura() {
  if (!assinaturaConfigurada()) {
    return {
      ativa: false,
      alerta: 'Assinatura digital ICP-Brasil nao configurada. Os arquivos AFD/AEJ e ' +
              'os comprovantes saem sem assinatura e NAO atendem plenamente a ' +
              'Portaria MTP 671/2021. Configure ASSINATURA_COMANDO e ASSINATURA_CERTIFICADO.'
    };
  }
  const certificado = process.env.ASSINATURA_CERTIFICADO;
  if (!fs.existsSync(certificado)) {
    return { ativa: false, alerta: `Certificado nao encontrado em ${certificado}.` };
  }
  return { ativa: true, certificado };
}

/**
 * Assina um buffer. Devolve o conteudo assinado; se a assinatura falhar,
 * lanca — nunca devolve silenciosamente o arquivo sem assinar.
 */
export function assinar(conteudo, { tipo = 'cades' } = {}) {
  if (!assinaturaConfigurada()) {
    throw new Error('Assinatura digital nao configurada.');
  }
  const base = `/tmp/repp-${crypto.randomUUID()}`;
  const entrada = `${base}.in`;
  const saida = `${base}.out`;
  try {
    fs.writeFileSync(entrada, conteudo);
    const argumentos = [
      '--tipo', tipo,
      '--entrada', entrada,
      '--saida', saida,
      '--certificado', process.env.ASSINATURA_CERTIFICADO
    ];
    if (process.env.ASSINATURA_SENHA_ARQUIVO) {
      argumentos.push('--senha-arquivo', process.env.ASSINATURA_SENHA_ARQUIVO);
    }
    execFileSync(process.env.ASSINATURA_COMANDO, argumentos, { stdio: 'pipe', timeout: 60000 });
    return fs.readFileSync(saida);
  } finally {
    for (const arquivo of [entrada, saida]) {
      try { fs.unlinkSync(arquivo); } catch { /* ja removido */ }
    }
  }
}

/** Assina se estiver configurado; caso contrario devolve o original. */
export function assinarSePossivel(conteudo, opcoes) {
  return assinaturaConfigurada() ? assinar(conteudo, opcoes) : conteudo;
}
