/* Portal do trabalhador — somente leitura. Nao existe aqui nenhuma rota capaz
   de registrar ponto: marcar so acontece no terminal, com biometria. */

const $ = (id) => document.getElementById(id);
let token = sessionStorage.getItem('repp.trabalhador') || '';

function esc(t) { const d = document.createElement('div'); d.textContent = t ?? ''; return d.innerHTML; }
function hhmm(m) {
  const s = m < 0 ? '-' : ''; const a = Math.abs(m || 0);
  return `${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

async function api(rota) {
  const resposta = await fetch(`/api/portal${rota}`, { headers: { 'x-sessao-trabalhador': token } });
  const dados = await resposta.json();
  if (!resposta.ok) throw new Error(dados.erro);
  return dados;
}

async function buscar() {
  try {
    const de = $('de').value;
    const ate = $('ate').value;
    const [dados, espelho] = await Promise.all([
      api(`/marcacoes?de=${de}&ate=${ate}`),
      api(`/espelho?de=${de}&ate=${ate}`)
    ]);
    $('identificacao').textContent = `${dados.trabalhador.nome} — CPF ${dados.trabalhador.cpf}`;
    $('tabela').innerHTML = `
      <tr><th>Data</th><th>Hora</th><th>NSR</th><th>Identificacao</th><th>Terminal</th><th>Comprovante</th></tr>
      ${dados.marcacoes.map((m) => `
        <tr>
          <td>${esc(m.dh.slice(8, 10))}/${esc(m.dh.slice(5, 7))}/${esc(m.dh.slice(0, 4))}</td>
          <td class="mono">${esc(m.dh.slice(11, 19))}</td>
          <td class="mono">${String(m.nsr).padStart(9, '0')}</td>
          <td>${m.metodo === 'biometria' ? 'digital' : 'credencial alternativa'}</td>
          <td class="mono">${esc(m.posto)}</td>
          <td><a href="/api/portal/comprovante/${encodeURIComponent(m.nsr)}.pdf?t=${encodeURIComponent(token)}" target="_blank" rel="noopener">PDF</a></td>
        </tr>`).join('')}`;
    $('resumo').innerHTML = `
      <div class="cartao">
        Trabalhado ${hhmm(espelho.totais.trabalhadoMin)} ·
        Previsto ${hhmm(espelho.totais.previstoMin)} ·
        Extras ${hhmm(espelho.totais.extraMin)} ·
        Faltas ${hhmm(espelho.totais.faltaMin)} ·
        Saldo <strong>${hhmm(espelho.totais.saldoMin)}</strong>
        <p class="legenda" style="margin-top:8px">Divergencia? Procure o RH. As marcacoes
          originais nao podem ser apagadas: qualquer correcao entra como ajuste identificado,
          ao lado do registro original.</p>
      </div>`;
  } catch (erro) {
    alert(erro.message);
    encerrar();
  }
}

function encerrar() {
  sessionStorage.removeItem('repp.trabalhador');
  token = '';
  $('com-sessao').hidden = true;
  $('sem-sessao').hidden = false;
}

$('btn-buscar').addEventListener('click', buscar);
$('btn-sair').addEventListener('click', encerrar);

$('btn-verificar').addEventListener('click', async () => {
  const resposta = await fetch('/api/portal/verificar', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nsr: Number($('v-nsr').value), hash: $('v-hash').value.trim() })
  });
  const dados = await resposta.json();
  $('saida-verificacao').innerHTML = dados.autentico
    ? `<div class="alerta ok"><strong>${esc(dados.mensagem)}</strong><br>
        NSR ${esc(String(dados.nsr))} · ${esc(dados.nome)} · CPF ${esc(dados.cpf)}<br>
        Registrado em ${esc(dados.dataHora)}</div>`
    : `<div class="alerta erro">${esc(dados.mensagem)}</div>`;
});

if (token) {
  $('sem-sessao').hidden = true;
  $('com-sessao').hidden = false;
  const hoje = new Date();
  $('de').value = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  $('ate').value = hoje.toISOString().slice(0, 10);
  buscar();
}
