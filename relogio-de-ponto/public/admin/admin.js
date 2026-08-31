/* Painel administrativo do REP-P. Somente leitura e cadastro: nenhuma rota
   daqui grava ou altera marcacao de ponto. */

const $ = (id) => document.getElementById(id);
let sessao = sessionStorage.getItem('repp.admin') || '';
let pessoas = [];
let modoTeste = false;

function esc(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

async function api(rota, opcoes = {}) {
  const resposta = await fetch(`/api/admin${rota}`, {
    ...opcoes,
    headers: { 'content-type': 'application/json', 'x-sessao': sessao, ...(opcoes.headers || {}) }
  });
  if (resposta.status === 401) { sair(); throw new Error('Sessão expirada.'); }
  const tipo = resposta.headers.get('content-type') || '';
  const dados = tipo.includes('json') ? await resposta.json() : await resposta.text();
  if (!resposta.ok) throw new Error(dados.erro || 'Falha na operação.');
  return dados;
}

/** AAAA-MM-DD -> DD/MM/AAAA, como se le no Brasil. */
function dataBr(iso) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function hhmm(minutos) {
  const sinal = minutos < 0 ? '-' : '';
  const abs = Math.abs(minutos || 0);
  return `${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/* --- sessao ------------------------------------------------------------- */

async function entrar() {
  $('erro-login').hidden = true;
  try {
    const resposta = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: $('login').value, senha: $('senha').value })
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro);
    sessao = dados.token;
    sessionStorage.setItem('repp.admin', sessao);
    iniciar();
  } catch (erro) {
    $('erro-login').textContent = erro.message;
    $('erro-login').hidden = false;
  }
}

function sair() {
  sessionStorage.removeItem('repp.admin');
  sessao = '';
  $('app').hidden = true;
  $('tela-login').hidden = false;
}

/* --- abas --------------------------------------------------------------- */

const carregadores = {
  saude: carregarSaude,
  pessoas: carregarPessoas,
  atestados: () => window.painelAtestados.carregar(),
  espelho: carregarSeletorPessoas,
  postos: carregarPostos,
  fiscal: carregarExportacoes,
  auditoria: carregarAuditoria
};

for (const botao of document.querySelectorAll('nav button[data-aba]')) {
  botao.addEventListener('click', () => {
    for (const b of document.querySelectorAll('nav button[data-aba]')) b.classList.remove('ativo');
    botao.classList.add('ativo');
    for (const secao of document.querySelectorAll('main section')) {
      secao.hidden = secao.id !== `aba-${botao.dataset.aba}`;
    }
    carregadores[botao.dataset.aba]().catch((e) => alert(e.message));
  });
}

/* --- saude -------------------------------------------------------------- */

async function carregarSaude() {
  const s = await api('/saude');
  modoTeste = Boolean(s.modoTeste);
  $('alertas').innerHTML = s.alertas.length
    ? s.alertas.map((a) => `<div class="alerta">${esc(a)}</div>`).join('')
    : '<div class="alerta ok">Nenhum alerta. Sistema em conformidade operacional.</div>';

  $('resumo-saude').innerHTML = `
    <table>
      <tr><th>Livro-razão</th><td>${s.integridade.total} registros —
        ${s.integridade.integro
          ? '<span class="pilula ok">cadeia íntegra</span>'
          : `<span class="pilula falta">${s.integridade.problemas.length} problema(s)</span>`}</td></tr>
      <tr><th>Leitor biométrico</th><td>${s.leitor.disponivel ? 'disponível' : 'INDISPONÍVEL'}
        ${esc(s.leitor.modelo || '')} ${esc(s.leitor.detalhe || '')}</td></tr>
      <tr><th>Assinatura ICP-Brasil</th><td>${s.assinatura.ativa ? 'configurada' : 'NÃO configurada'}</td></tr>
      <tr><th>Identificação do REP</th><td class="mono">${esc(s.rep.identificacao)}</td></tr>
      <tr><th>Sem biometria</th><td>${s.semBiometria.length
        ? s.semBiometria.map((t) => esc(t.nome)).join(', ') : 'ninguem'}</td></tr>
    </table>`;
}

/* --- pessoas ------------------------------------------------------------ */

async function carregarPessoas() {
  pessoas = await api('/trabalhadores?todos=1');
  $('tabela-pessoas').innerHTML = `
    <tr><th>Nome</th><th>CPF</th><th>Matrícula</th><th>Consentimento</th><th>Digitais</th><th>Situação</th><th></th></tr>
    ${pessoas.map((p) => `
      <tr>
        <td>${esc(p.nome)}</td>
        <td class="mono">${esc(p.cpf)}</td>
        <td>${esc(p.matricula)}</td>
        <td>${p.consentimento ? '<span class="pilula ok">registrado</span>' : '<span class="pilula falta">pendente</span>'}</td>
        <td>${p.dedosCadastrados}</td>
        <td>${p.ativo ? 'ativo' : 'inativo'}</td>
        <td>
          ${p.consentimento ? '' : `<button class="leve" data-consentir="${p.id}">Registrar termo</button>`}
          <button class="leve" data-biometria="${p.id}">Cadastrar digital</button>
        </td>
      </tr>`).join('')}`;

  for (const botao of document.querySelectorAll('[data-consentir]')) {
    botao.addEventListener('click', () => registrarTermo(botao.dataset.consentir));
  }
  for (const botao of document.querySelectorAll('[data-biometria]')) {
    botao.addEventListener('click', () => cadastrarDigital(botao.dataset.biometria));
  }
}

async function registrarTermo(id) {
  const termo = await api('/termo-biometria');
  if (!confirm(`${termo.texto}\n\n--- Confirmar que o trabalhador leu e concordou? ---`)) return;
  await api(`/trabalhadores/${id}/consentimento`, { method: 'POST', body: '{}' });
  carregarPessoas();
}

async function cadastrarDigital(id) {
  const dedo = prompt('Qual dedo? (ex.: polegar_direito, indicador_esquerdo)');
  if (!dedo) return;
  try {
    // Sem leitor plugado, a "digital" e uma palavra. A mesma palavra digitada
    // no quiosque identifica esta pessoa. So vale em modo de teste.
    if (modoTeste) {
      const semente = prompt(
        'MODO DE TESTE (sem leitor biométrico).\n\n' +
        'Escolha uma senha de dedo para esta pessoa — a mesma palavra deverá ' +
        'ser digitada no terminal na hora de bater o ponto.\n\n' +
        'Ex.: o primeiro nome dela.'
      );
      if (!semente) return;
      await api('/simulador/dedo', {
        method: 'POST', body: JSON.stringify({ semente: semente.trim() })
      });
    }
    const resultado = await api(`/trabalhadores/${id}/biometria`, {
      method: 'POST', body: JSON.stringify({ dedo })
    });
    alert(`Digital cadastrada. Qualidade: ${resultado.qualidade}.\nCadastre ao menos dois dedos por pessoa.`);
    carregarPessoas();
  } catch (erro) { alert(erro.message); }
}

$('btn-salvar-pessoa').addEventListener('click', async () => {
  $('erro-pessoa').hidden = true;
  try {
    await api('/trabalhadores', {
      method: 'POST',
      body: JSON.stringify({
        cpf: $('p-cpf').value, nome: $('p-nome').value,
        matricula: $('p-matricula').value, cargo: $('p-cargo').value,
        admissao: $('p-admissao').value || null
      })
    });
    for (const campo of ['p-cpf', 'p-nome', 'p-matricula', 'p-cargo']) $(campo).value = '';
    carregarPessoas();
  } catch (erro) {
    $('erro-pessoa').textContent = erro.message;
    $('erro-pessoa').hidden = false;
  }
});

/* --- espelho ------------------------------------------------------------ */

async function carregarSeletorPessoas() {
  if (!pessoas.length) pessoas = await api('/trabalhadores?todos=1');
  $('e-trabalhador').innerHTML = pessoas
    .map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join('');
  const hoje = new Date();
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  $('e-de').value = primeiro.toISOString().slice(0, 10);
  $('e-ate').value = hoje.toISOString().slice(0, 10);
}

$('btn-espelho').addEventListener('click', async () => {
  const id = $('e-trabalhador').value;
  const espelho = await api(`/espelho/${id}?de=${$('e-de').value}&ate=${$('e-ate').value}`);
  $('saida-espelho').innerHTML = `
    <div class="cartao">
      <strong>${esc(espelho.trabalhador.nome)}</strong> —
      ${dataBr(espelho.periodo.de)} a ${dataBr(espelho.periodo.ate)}<br>
      Trabalhado ${hhmm(espelho.totais.trabalhadoMin)} ·
      Previsto ${hhmm(espelho.totais.previstoMin)} ·
      Extras ${hhmm(espelho.totais.extraMin)} ·
      Faltas ${hhmm(espelho.totais.faltaMin)} ·
      Noturno ${hhmm(espelho.totais.noturnoMin)} ·
      Saldo <strong>${hhmm(espelho.totais.saldoMin)}</strong>
    </div>
    <div class="cartao rolagem"><table>
      <tr><th>Data</th><th>Marcações</th><th>Trabalhado</th><th>Previsto</th><th>Saldo</th><th>Ocorrências</th></tr>
      ${espelho.dias.filter((d) => d.marcacoes.length || d.previstoMin).map((d) => `
        <tr>
          <td class="nao-quebra">${dataBr(d.data)}</td>
          <td>${d.marcacoes.map((m) =>
            `<span class="marca">${esc(m.dh.slice(11, 16))}${m.origem === 'tratamento' ? '*' : ''}</span>`).join('')}</td>
          <td>${hhmm(d.trabalhadoMin)}</td>
          <td>${hhmm(d.previstoMin)}</td>
          <td>${hhmm(d.saldoMin)}</td>
          <td class="ocorrencia">${d.ocorrencias.map(esc).join('<br>')}</td>
        </tr>`).join('')}
    </table>
    <p class="legenda" style="margin-top:8px">* marcação incluída por tratamento; o registro
      original do leitor permanece intacto no AFD.</p></div>`;
});

/* --- postos ------------------------------------------------------------- */

async function carregarPostos() {
  const lista = await api('/postos');
  $('tabela-postos').innerHTML = `
    <tr><th>ID</th><th>Nome</th><th>Local</th><th>Situação</th><th>Último uso</th><th></th></tr>
    ${lista.map((p) => `
      <tr>
        <td class="mono">${esc(p.id)}</td><td>${esc(p.nome)}</td><td>${esc(p.local)}</td>
        <td>${p.ativo ? '<span class="pilula ok">ativo</span>' : '<span class="pilula">desativado</span>'}</td>
        <td>${esc(p.ultimo_uso_em || '—')}</td>
        <td>${p.ativo ? `<button class="leve perigo" data-desativar="${esc(p.id)}">Desativar</button>` : ''}</td>
      </tr>`).join('')}`;
  for (const botao of document.querySelectorAll('[data-desativar]')) {
    botao.addEventListener('click', async () => {
      if (!confirm(`Desativar o posto ${botao.dataset.desativar}? Ele deixa de registrar ponto imediatamente.`)) return;
      await api(`/postos/${encodeURIComponent(botao.dataset.desativar)}`, { method: 'DELETE' });
      carregarPostos();
    });
  }
}

$('btn-posto').addEventListener('click', async () => {
  try {
    const resultado = await api('/postos', {
      method: 'POST',
      body: JSON.stringify({ id: $('po-id').value, nome: $('po-nome').value, local: $('po-local').value })
    });
    $('token-novo').innerHTML = `
      <div class="alerta">
        <strong>Token do posto ${esc(resultado.id)}</strong><br>
        <span class="mono">${esc(resultado.token)}</span><br>
        ${esc(resultado.aviso)}
      </div>`;
    carregarPostos();
  } catch (erro) { alert(erro.message); }
});

/* --- fiscal ------------------------------------------------------------- */

async function baixar(rota, nomePadrao) {
  const resposta = await fetch(`/api/admin${rota}`, { headers: { 'x-sessao': sessao } });
  if (!resposta.ok) { alert((await resposta.json()).erro); return; }
  const blob = await resposta.blob();
  const nome = (resposta.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || nomePadrao;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
  carregarExportacoes();
}

$('btn-afd').addEventListener('click', () => baixar(`/afd?de=${$('f-de').value}&ate=${$('f-ate').value}`, 'AFD.txt'));
$('btn-aej').addEventListener('click', () => baixar(`/aej?de=${$('f-de').value}&ate=${$('f-ate').value}`, 'AEJ.txt'));

async function carregarExportacoes() {
  const lista = await api('/exportacoes');
  $('tabela-exportacoes').innerHTML = `
    <tr><th>Tipo</th><th>Período</th><th>Arquivo</th><th>SHA-256</th><th>Por</th><th>Quando</th></tr>
    ${lista.map((e) => `
      <tr><td>${esc(e.tipo)}</td><td class="nao-quebra">${dataBr(e.inicio)} a ${dataBr(e.fim)}</td>
      <td class="mono">${esc(e.arquivo)}</td><td class="mono">${esc(e.sha256.slice(0, 16))}…</td>
      <td>${esc(e.gerado_por)}</td><td>${esc(e.gerado_em)}</td></tr>`).join('')}`;
}

/* --- auditoria ---------------------------------------------------------- */

async function carregarAuditoria() {
  const lista = await api('/auditoria');
  $('tabela-auditoria').innerHTML = `
    <tr><th>Quando</th><th>Ator</th><th>Ação</th><th>Alvo</th><th>Detalhe</th><th>Origem</th></tr>
    ${lista.map((a) => `
      <tr><td class="mono">${esc(a.dh)}</td><td>${esc(a.ator)}</td><td>${esc(a.acao)}</td>
      <td class="mono">${esc(a.alvo)}</td><td>${esc(a.detalhe)}</td>
      <td class="mono">${esc(a.origem_ip)}</td></tr>`).join('')}`;
}

/* --- ponte para os modulos irmaos --------------------------------------- */

// atestados.js reaproveita a sessao e os formatadores daqui, em vez de
// reimplementar chamada de API e escape de HTML.
window.REPP = {
  api,
  esc,
  hhmm,
  dataBr,
  pessoas: () => pessoas,
  carregarPessoas: async () => { pessoas = await api('/trabalhadores?todos=1'); return pessoas; }
};

/* --- inicializacao ------------------------------------------------------ */

$('btn-entrar').addEventListener('click', entrar);
$('senha').addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(); });
$('btn-sair').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST', body: '{}' }); } catch { /* ja invalida */ }
  sair();
});

async function iniciar() {
  try {
    await api('/eu');
    $('tela-login').hidden = true;
    $('app').hidden = false;
    const hoje = new Date();
    $('f-de').value = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
    $('f-ate').value = hoje.toISOString().slice(0, 10);
    await carregarSaude();
  } catch { sair(); }
}

if (sessao) iniciar(); else sair();
