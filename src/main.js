import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import QRCode from 'qrcode';
import './style.css';
import { cfg, clientes, corridas, tema, uid, exportar, importar } from './store.js';
import { MODOS, modoAutomatico, calcularValor, brl } from './pricing.js';
import { gerarPix } from './pix.js';
import { posicaoAtual, reverso, rota, buscarCidade } from './geo.js';
import { campoEndereco } from './addr.js';
import { I, esc, $, $$, toast, abrirUrl, compartilhar, copiar, zap, dataBR, mesmoDia, modal, soDigitos } from './ui.js';

const app = document.getElementById('app');
let mapa = null;

const aplicaTema = () => { document.documentElement.dataset.tema = tema.get(); };
aplicaTema();

/* ---------- casca (topo + barra inferior) ---------- */
function casca(ativa, html) {
  const escuro = tema.get() === 'dark';
  app.innerHTML = `
  <header class="topo">
    <img src="${escuro ? 'logo-dark.svg' : 'logo-light.svg'}" alt="Rota Particular" />
    <button class="icon-btn" data-troca-tema aria-label="Tema">${escuro ? I.sun : I.moon}</button>
  </header>
  <main>${html}</main>
  <nav class="bar"><div class="in">
    <button data-go="/" class="${ativa === 'home' ? 'on' : ''}">${I.home}Início</button>
    <button data-go="/historico" class="${ativa === 'hist' ? 'on' : ''}">${I.hist}Histórico</button>
    <button data-go="/nova" class="fab"><i>${I.plus}</i><span>Nova</span></button>
    <button data-go="/clientes" class="${ativa === 'cli' ? 'on' : ''}">${I.users}Clientes</button>
    <button data-go="/ajustes" class="${ativa === 'aj' ? 'on' : ''}">${I.cog}Ajustes</button>
  </div></nav>`;
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $('[data-troca-tema]').addEventListener('click', () => { tema.set(escuro ? 'light' : 'dark'); aplicaTema(); render(); });
  $$('[data-voltar]').forEach((b) => b.addEventListener('click', () => history.back()));
  window.scrollTo(0, 0);
}
const go = (p) => { location.hash = '#' + p; };
const voltar = `<button class="voltar" data-voltar>${I.back.replace('<svg', '<svg width="22" height="22"')} Voltar</button>`;

/* ---------- util de dados ---------- */
const hoje = () => new Date();
const pagasHoje = () => corridas.all().filter((c) => c.status === 'Pago' && mesmoDia(c.pagoEm || c.criadoEm, hoje()));
const nomeCliente = (id) => clientes.all().find((c) => c.id === id)?.nome || '';
const tituloCorrida = (c) => c.tipo === 'cobranca' ? (c.descricao || 'Cobrança rápida') : c.tipo === 'recibo' ? (c.descricao || 'Recibo avulso') : (c.destino?.label || 'Corrida');
const statusTxt = (s) => (s === 'Andamento' ? 'Em andamento' : s);

/* ---------- INÍCIO ---------- */
let mostraGanho = true;
function viewHome() {
  const c = cfg.get();
  const pagas = pagasHoje();
  const total = pagas.reduce((s, x) => s + x.valor, 0);
  const horas = pagas.reduce((s, x) => s + (x.min || 0), 0) / 60;
  const receber = corridas.all().filter((x) => x.status === 'Aguardando' || x.status === 'Andamento').reduce((s, x) => s + x.valor, 0);
  const sete = corridas.all().filter((x) => x.status === 'Pago' && Date.now() - new Date(x.pagoEm || x.criadoEm) < 7 * 864e5).reduce((s, x) => s + x.valor, 0);
  const nome = (c.nome || c.pixNome || '').split(' ')[0];
  casca('home', `
    <p class="sub" style="margin:10px 0 0;font-size:20px">Olá,</p>
    <h1 style="margin-top:0">${esc(nome || 'motorista')}</h1>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center"><span class="eyebrow">Ganhos de hoje</span><button class="icon-btn" data-olho>${mostraGanho ? I.eye : I.eyeoff}</button></div>
      <div class="grande" style="margin-top:18px"><small>R$</small> ${mostraGanho ? total.toFixed(2).replace('.', '<small>,') + '</small>' : '•••'}</div>
      <div class="stats">
        <div>${I.car.replace('<svg', '<svg width="22" height="22" style="color:var(--acc)"')}<b>${pagas.length}</b><span>Corridas</span></div>
        <div>${I.hist.replace('<svg', '<svg width="22" height="22" style="color:var(--acc)"')}<b>${horas.toFixed(1)}h</b><span>Horas</span></div>
        <div>${I.users.replace('<svg', '<svg width="22" height="22" style="color:var(--acc)"')}<b>${clientes.all().length}</b><span>Clientes</span></div>
        <div>${I.receipt.replace('<svg', '<svg width="22" height="22" style="color:var(--acc)"')}<b>${receber.toFixed(0)}</b><span>A receber</span></div>
      </div>
    </div>
    <button class="cta" data-go="/nova"><span class="ic">${I.car}</span><span><b>Nova corrida</b><span>GPS · cálculo automático</span></span><span class="seta">${I.arrow}</span></button>
    <div class="tiles">
      <button class="tile" data-go="/receber"><span class="ic">${I.bolt}</span><b>Receber</b><span>QR Pix na hora</span></button>
      <button class="tile" data-go="/clientes"><span class="ic">${I.users}</span><b>Clientes</b><span>${clientes.all().length} salvos</span></button>
      <button class="tile" data-go="/recibo"><span class="ic">${I.receipt}</span><b>Recibo avulso</b><span>Corrida fechada</span></button>
      <button class="tile" data-go="/relatorios"><span class="ic">${I.chart}</span><b>Relatórios</b><span>Últimos 7 dias</span></button>
      <button class="tile" data-go="/dados"><span class="ic">${I.shield}</span><b>Meus dados</b><span>Backup</span></button>
    </div>
    <div class="linha"><span>Últimos 7 dias</span><b>${brl(sete)}</b></div>`);
  $('[data-olho]').addEventListener('click', () => { mostraGanho = !mostraGanho; viewHome(); });
}

/* ---------- NOVA CORRIDA ---------- */
let nova = null;
const novaVazia = () => ({ modo: modoAutomatico(cfg.get()), origem: null, paradas: [], destino: null, outraCidade: false, taxi: false, rota: null, valor: '', manual: false, clienteId: '' });

function viewNova() {
  const c = cfg.get();
  if (!nova) nova = novaVazia();
  casca('nova', `
    ${voltar}
    <div style="display:flex;gap:14px;align-items:center;margin:6px 0 16px">
      <span class="cta" style="width:62px;height:62px;padding:0;margin:0;justify-content:center;border-radius:20px">${I.plus}</span>
      <div><h1 style="margin:0;font-size:34px">Nova corrida</h1><p class="sub" style="margin:0">GPS + cálculo automático</p></div>
    </div>
    <div class="modos" id="modos"></div>
    <div class="card">
      <button class="cidade-btn" id="cidade" type="button"><div>${I.pin.replace('<svg','<svg width="20" height="20" style="vertical-align:-4px;margin-right:6px"')}<b id="cidTxt"></b></div><span>trocar cidade</span></button>
      <div id="cidBox" class="cidade-box"></div>
      <div class="topo-campo"><b>Origem</b><button class="mini" id="gps">${I.gps}GPS</button></div>
      <div id="orig"></div>
      <div id="paradas"></div>
      <button class="link" id="addp">${I.plusmini.replace('<svg', '<svg width="22" height="22"')} Adicionar parada</button>
      <div class="topo-campo"><b>Destino</b><button class="mini ${nova.outraCidade ? 'on' : ''}" id="outra">Outra cidade</button></div>
      <div id="dest"></div>
    </div>
    <div id="mapa"></div>
    <div class="card">
      <div class="rota-info"><div><div class="eyebrow" id="rinfoL">Rota (OpenStreetMap)</div><div id="rinfo" style="font-size:18px;margin-top:4px">—</div></div><button class="mini ${nova.taxi ? 'on' : ''}" id="taxi">Táxi +${brl(c.taxaTaxi)}</button></div>
      <div class="eyebrow">Valor da corrida</div>
      <div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:34px;font-weight:700;color:var(--suave)">R$</span><input class="valor-in" id="valor" inputmode="decimal" placeholder="0,00" value="${esc(nova.valor)}"></div>
      <label class="campo">Cliente (opcional)</label>
      <select id="cli"><option value="">Sem cliente</option>${clientes.all().map((x) => `<option value="${x.id}" ${x.id === nova.clienteId ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>
    </div>
    <button class="btn" id="gerar">Gerar QR Code Pix</button>
    <p class="aviso">Rota e distância calculadas com dados do OpenStreetMap; podem diferir um pouco do Google. Você pode ajustar o valor à mão.</p>`);

  if (!nova.cidade) { nova.cidade = c.cidade; nova.uf = c.uf; }
  const pintaCidade = () => { $('#cidTxt').textContent = [nova.cidade, nova.uf].filter(Boolean).join(', ') || 'Escolher cidade'; };
  pintaCidade();
  const ctxBusca = () => ({ cidade: nova.cidade, uf: nova.uf, outraCidade: nova.outraCidade, perto: nova.origem });
  $('#cidade').addEventListener('click', () => {
    const box = $('#cidBox');
    if (box.firstChild) { box.innerHTML = ''; return; }
    const f = campoEndereco({ placeholder: 'Digite a cidade', buscaFn: buscarCidade, onPick: (p) => { nova.cidade = p.cidade; nova.uf = p.uf; nova.destino = null; nova.rota = null; viewNova(); } });
    box.appendChild(f.el); f.el.querySelector('input').focus();
  });

  const pintaModos = () => {
    $('#modos').innerHTML = MODOS.map((m) => `<button class="chip ${nova.modo === m.id ? 'on' : ''}" data-m="${m.id}">${m.sigla}</button>`).join('');
    $$('[data-m]').forEach((b) => b.addEventListener('click', () => { nova.modo = b.dataset.m; nova.manual = false; pintaModos(); recalcValor(); }));
  };
  pintaModos();

  const recalcValor = () => {
    if (nova.rota && !nova.manual) {
      nova.valor = calcularValor(cfg.get(), nova.modo, nova.rota.km, { taxi: nova.taxi }).toFixed(2).replace('.', ',');
      $('#valor').value = nova.valor;
    }
  };

  // mapa
  mapa?.remove();
  mapa = L.map('mapa', { zoomControl: false, attributionControl: true }).setView([-20.4697, -54.6201], 12);
  const escuro = tema.get() === 'dark';
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
  $('#mapa').classList.toggle('mapa-escuro', escuro);
  let camada = L.layerGroup().addTo(mapa);
  const desenha = () => {
    camada.clearLayers();
    const pts = [nova.origem, ...nova.paradas.filter(Boolean), nova.destino].filter(Boolean);
    pts.forEach((p, i) => L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 3, fillColor: i === 0 ? '#1bbeb5' : i === pts.length - 1 ? '#8000ff' : '#f5b800', fillOpacity: 1 }).addTo(camada));
    if (nova.rota) {
      const pl = L.polyline(nova.rota.coords, { color: '#f5c518', weight: 5 }).addTo(camada);
      mapa.fitBounds(pl.getBounds(), { padding: [24, 24] });
    } else if (pts.length) mapa.setView([pts[0].lat, pts[0].lon], 15);
  };
  setTimeout(() => { mapa?.invalidateSize(); desenha(); }, 120);

  let seq = 0;
  const calcula = async () => {
    const pts = [nova.origem, ...nova.paradas.filter(Boolean), nova.destino];
    if (!nova.origem || !nova.destino || pts.some((p) => !p)) { desenha(); return; }
    const meu = ++seq;
    $('#rinfo').textContent = 'Calculando rota…';
    try {
      const r = await rota(pts);
      if (meu !== seq) return;
      nova.rota = r;
      $('#rinfo').textContent = `${r.km.toFixed(1)} km · ~${r.min} min`;
      recalcValor(); desenha();
    } catch (e) {
      if (meu !== seq) return;
      nova.rota = null; $('#rinfo').textContent = e.message || 'Falha ao calcular a rota'; desenha();
    }
  };
  if (nova.rota) $('#rinfo').textContent = `${nova.rota.km.toFixed(1)} km · ~${nova.rota.min} min`;

  const origem = campoEndereco({ valor: nova.origem?.label || '', placeholder: 'Onde o passageiro está', ctx: ctxBusca, onPick: (p) => { nova.origem = p; calcula(); }, onClear: () => { nova.origem = null; nova.rota = null; desenha(); } });
  $('#orig').appendChild(origem.el);
  const dest = campoEndereco({ valor: nova.destino?.label || '', placeholder: 'Endereço, bairro ou local', mic: true, ctx: ctxBusca, onPick: (p) => { nova.destino = p; calcula(); }, onClear: () => { nova.destino = null; nova.rota = null; $('#rinfo').textContent = '—'; desenha(); } });
  $('#dest').appendChild(dest.el);

  const gpsOrigem = async () => {
    try {
      origem.set('Buscando GPS…');
      const pos = await posicaoAtual();
      const end = await reverso(pos);
      nova.origem = { label: end.label, lat: pos.lat, lon: pos.lon };
      if (!nova.cidade && end.cidade) { nova.cidade = end.cidade; nova.uf = end.uf; pintaCidade(); }
      origem.set(end.label); calcula(); desenha();
    } catch { origem.set(''); toast('Não consegui pegar o GPS. Ative a localização.'); }
  };
  $('#gps').addEventListener('click', gpsOrigem);
  if (!nova.origem) gpsOrigem();

  // paradas
  const pintaParadas = () => {
    const box = $('#paradas'); box.innerHTML = '';
    nova.paradas.forEach((p, i) => {
      const linha = document.createElement('div'); linha.style.margin = '10px 0';
      const f = campoEndereco({ valor: p?.label || '', placeholder: `Parada ${i + 1}`, ctx: ctxBusca, onPick: (pt) => { nova.paradas[i] = pt; calcula(); }, onClear: () => { nova.paradas[i] = null; nova.rota = null; desenha(); } });
      linha.appendChild(f.el);
      const rm = document.createElement('button'); rm.className = 'link'; rm.style.padding = '4px 0'; rm.textContent = 'Remover parada';
      rm.addEventListener('click', () => { nova.paradas.splice(i, 1); pintaParadas(); calcula(); });
      linha.appendChild(rm); box.appendChild(linha);
    });
  };
  pintaParadas();
  $('#addp').addEventListener('click', () => { nova.paradas.push(null); pintaParadas(); });
  $('#outra').addEventListener('click', (e) => { nova.outraCidade = !nova.outraCidade; e.currentTarget.classList.toggle('on', nova.outraCidade); });
  $('#taxi').addEventListener('click', (e) => { nova.taxi = !nova.taxi; e.currentTarget.classList.toggle('on', nova.taxi); nova.manual = false; recalcValor(); });
  $('#valor').addEventListener('input', (e) => { nova.manual = true; nova.valor = e.target.value; });
  $('#cli').addEventListener('change', (e) => { nova.clienteId = e.target.value; });

  $('#gerar').addEventListener('click', () => {
    const valor = parseFloat(String($('#valor').value).replace(',', '.'));
    if (!(valor > 0)) return toast('Informe destino ou digite o valor da corrida');
    if (!cfg.get().pixChave) { toast('Cadastre sua chave Pix em Ajustes'); return go('/ajustes'); }
    const r = {
      id: uid(), tipo: 'corrida', criadoEm: new Date().toISOString(), status: 'Aguardando', valor: Math.round(valor * 100) / 100,
      origem: nova.origem, paradas: nova.paradas.filter(Boolean), destino: nova.destino || { label: 'Destino a combinar' },
      km: nova.rota?.km || 0, min: nova.rota?.min || 0, modo: nova.modo, clienteId: nova.clienteId,
    };
    corridas.upsert(r); nova = null; go('/corrida/' + r.id);
  });
}

/* ---------- RECEBER (cobrança rápida) / RECIBO AVULSO ---------- */
function viewReceber(tipo) {
  const recibo = tipo === 'recibo';
  casca('home', `${voltar}
    <h1>${recibo ? 'Recibo avulso' : 'Receber'}</h1>
    <p class="sub">${recibo ? 'Registre uma corrida que já foi fechada e gere o recibo.' : 'Cobre agora com um QR Code Pix, sem calcular rota.'}</p>
    <div class="card">
      <label class="campo">Valor (R$)</label><input id="v" inputmode="decimal" placeholder="0,00" style="font-size:34px;font-weight:700">
      <label class="campo">${recibo ? 'Trajeto ou descrição' : 'Descrição (opcional)'}</label><input id="d" placeholder="${recibo ? 'Ex.: Centro → Aeroporto' : 'Ex.: Corrida combinada'}">
      <label class="campo">Cliente (opcional)</label>
      <select id="c"><option value="">Sem cliente</option>${clientes.all().map((x) => `<option value="${x.id}">${esc(x.nome)}</option>`).join('')}</select>
    </div>
    <button class="btn" id="ok">${recibo ? 'Salvar e gerar recibo' : 'Gerar QR Code Pix'}</button>`);
  $('#ok').addEventListener('click', () => {
    const valor = parseFloat($('#v').value.replace(',', '.'));
    if (!(valor > 0)) return toast('Informe o valor');
    if (!recibo && !cfg.get().pixChave) { toast('Cadastre sua chave Pix em Ajustes'); return go('/ajustes'); }
    const agora = new Date().toISOString();
    const r = { id: uid(), tipo: recibo ? 'recibo' : 'cobranca', criadoEm: agora, status: recibo ? 'Pago' : 'Aguardando', pagoEm: recibo ? agora : undefined, valor: Math.round(valor * 100) / 100, descricao: $('#d').value.trim() || (recibo ? 'Corrida fechada' : 'Cobrança rápida'), clienteId: $('#c').value, km: 0, min: 0 };
    corridas.upsert(r); go('/corrida/' + r.id);
  });
}

/* ---------- DETALHE DA CORRIDA + QR ---------- */
function textoRecibo(r) {
  const c = cfg.get();
  const l = ['*Recibo de corrida*', `Motorista: ${c.nome || c.pixNome || '—'}`];
  if (c.veiculoModelo || c.veiculoPlaca) l.push(`Veículo: ${[c.veiculoModelo, c.veiculoCor, c.veiculoPlaca].filter(Boolean).join(' · ')}`);
  if (nomeCliente(r.clienteId)) l.push(`Cliente: ${nomeCliente(r.clienteId)}`);
  if (r.tipo === 'corrida') { if (r.origem?.label) l.push(`Origem: ${r.origem.label}`); r.paradas?.forEach((p, i) => l.push(`Parada ${i + 1}: ${p.label}`)); l.push(`Destino: ${r.destino?.label}`); if (r.km) l.push(`Distância: ${r.km.toFixed(1)} km`); } else l.push(`Descrição: ${r.descricao}`);
  l.push(`Valor: ${brl(r.valor)}`, `Data: ${dataBR(r.pagoEm || r.criadoEm)}`, `Situação: ${statusTxt(r.status)}`);
  return l.join('\n');
}

async function viewCorrida(id) {
  const r = corridas.all().find((x) => x.id === id);
  if (!r) return go('/historico');
  const c = cfg.get();
  const cli = clientes.all().find((x) => x.id === r.clienteId);
  let payload = '';
  const aberta = r.status === 'Aguardando' || r.status === 'Andamento';
  if (aberta && c.pixChave) {
    try { payload = gerarPix({ tipo: c.pixTipo, chave: c.pixChave, nome: c.pixNome || c.nome, cidade: c.pixCidade || c.cidade, valor: r.valor, txid: r.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) }); } catch (e) { toast(e.message); }
  }
  casca('hist', `${voltar}
    <h1>${brl(r.valor)}</h1>
    <p class="sub">${esc(tituloCorrida(r))}<br><span class="st-${r.status}">${statusTxt(r.status)}</span> · ${dataBR(r.criadoEm)}${cli ? ' · ' + esc(cli.nome) : ''}</p>
    ${payload ? `<div class="card" style="text-align:center"><div class="eyebrow">Mostre ao passageiro</div><div class="qr"><canvas id="qr"></canvas></div><div class="copia">${esc(payload)}</div><button class="btn sec" id="cp">${I.copy.replace('<svg', '<svg width="22" height="22" style="vertical-align:-4px"')} Copiar Pix copia e cola</button></div>` : ''}
    ${r.tipo === 'corrida' ? `<div class="card"><div class="eyebrow">Trajeto</div><p style="margin:8px 0 0;line-height:1.6">${r.origem ? esc(r.origem.label) + '<br>' : ''}${(r.paradas || []).map((p) => '→ ' + esc(p.label) + '<br>').join('')}→ ${esc(r.destino?.label || '')}</p>${r.km ? `<p class="sub" style="margin:10px 0 0">${r.km.toFixed(1)} km · ~${r.min} min · ${MODOS.find((m) => m.id === r.modo)?.nome || ''}</p>` : ''}</div>` : ''}
    ${r.status === 'Aguardando' && r.tipo === 'corrida' ? `<button class="btn sec" id="and">Iniciar corrida</button>` : ''}
    ${aberta ? `<button class="btn" id="pago">Pix recebido ✓</button>` : ''}
    <button class="btn sec" id="rec">${I.share.replace('<svg', '<svg width="22" height="22" style="vertical-align:-4px"')} Compartilhar recibo</button>
    ${cli?.telefone || cli?.whatsapp ? `<button class="btn sec" id="wpp">${I.chat.replace('<svg', '<svg width="22" height="22" style="vertical-align:-4px"')} Enviar no WhatsApp</button>` : ''}
    ${aberta ? `<button class="btn perigo" id="canc">Cancelar corrida</button>` : ''}
    <button class="btn perigo" id="del" style="border-color:var(--borda);color:var(--suave)">Excluir do histórico</button>`);
  if (payload) QRCode.toCanvas($('#qr'), payload, { width: 520, margin: 1, errorCorrectionLevel: 'M' });
  const muda = (st) => { const x = { ...r, status: st }; if (st === 'Pago') x.pagoEm = new Date().toISOString(); corridas.upsert(x); viewCorrida(id); };
  $('#cp')?.addEventListener('click', () => copiar(payload));
  $('#and')?.addEventListener('click', () => muda('Andamento'));
  $('#pago')?.addEventListener('click', () => { muda('Pago'); toast('Pagamento registrado'); });
  $('#canc')?.addEventListener('click', () => { if (confirm('Cancelar esta corrida?')) muda('Cancelada'); });
  $('#rec').addEventListener('click', () => compartilhar(textoRecibo(r) + (payload ? `\n\nPix copia e cola:\n${payload}` : '')));
  $('#wpp')?.addEventListener('click', () => abrirUrl(zap(cli.whatsapp || cli.telefone, textoRecibo(r) + (payload ? `\n\nPix copia e cola:\n${payload}` : ''))));
  $('#del').addEventListener('click', () => { if (confirm('Excluir este registro?')) { corridas.remove(id); go('/historico'); } });
}

/* ---------- HISTÓRICO ---------- */
function viewHistorico() {
  const lista = corridas.all().sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
  casca('hist', `<h1>Histórico</h1>${lista.length ? lista.map((r) => `
    <button class="item" data-id="${r.id}"><span class="t"><b>${esc(tituloCorrida(r))}</b><span>${dataBR(r.criadoEm)} · <span class="st-${r.status}">${statusTxt(r.status)}</span></span></span><span class="val">${brl(r.valor)}</span></button>`).join('') : '<div class="vazio-msg">Nenhuma corrida ainda.<br>Toque em “Nova” para começar.</div>'}`);
  $$('[data-id]').forEach((b) => b.addEventListener('click', () => go('/corrida/' + b.dataset.id)));
}

/* ---------- CLIENTES ---------- */
let filtroCli = 'todos', buscaCli = '';
function viewClientes() {
  const todos = clientes.all();
  const lista = todos.filter((x) => (filtroCli === 'todos' || (filtroCli === 'fav' && x.favorito) || x.tipo === filtroCli) && (!buscaCli || (x.nome + ' ' + x.telefone).toLowerCase().includes(buscaCli.toLowerCase())));
  casca('cli', `
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px"><div><h1>Meus<br>Clientes</h1><p class="sub">Sua carteira de passageiros</p></div><button class="btn pequeno" id="novo" style="margin-bottom:22px">+ Novo</button></div>
    <input id="busca" placeholder="Buscar por nome ou telefone" value="${esc(buscaCli)}" style="margin-bottom:14px">
    <div class="chips">${[['todos', 'Todos'], ['fav', '★ Favoritos'], ['Recorrente', 'Recorrentes'], ['VIP', 'VIP']].map(([k, n]) => `<button class="chip ${filtroCli === k ? 'on' : ''}" data-f="${k}">${n}</button>`).join('')}</div>
    ${lista.length ? lista.map((x) => `
      <div class="card cli"><h3>${x.favorito ? `<span class="estrela">${I.star.replace('<svg', '<svg fill="currentColor"')}</span>` : ''}${esc(x.nome)} <span class="tag">${esc(x.tipo || 'Comum')}</span></h3>
        <p>${esc(x.telefone || '')}</p>${x.endereco ? `<p>${esc(x.endereco)}</p>` : ''}
        <div class="acoes"><button data-wa="${x.id}">${I.chat}WhatsApp</button><button data-tel="${x.id}">${I.phone}Ligar</button><button data-sh="${x.id}">${I.share}</button><button data-ed="${x.id}" style="color:var(--txt)">${I.edit}</button><button class="del" data-rm="${x.id}">${I.trash}</button></div></div>`).join('') : '<div class="vazio-msg">Nenhum cliente por aqui.</div>'}`);
  const acha = (id) => todos.find((x) => x.id === id);
  $('#novo').addEventListener('click', () => formCliente());
  let t; $('#busca').addEventListener('input', (e) => { buscaCli = e.target.value; clearTimeout(t); t = setTimeout(() => { viewClientes(); const i = $('#busca'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); });
  $$('[data-f]').forEach((b) => b.addEventListener('click', () => { filtroCli = b.dataset.f; viewClientes(); }));
  $$('[data-wa]').forEach((b) => b.addEventListener('click', () => { const x = acha(b.dataset.wa); abrirUrl(zap(x.whatsapp || x.telefone, `Olá, ${x.nome.split(' ')[0]}!`)); }));
  $$('[data-tel]').forEach((b) => b.addEventListener('click', () => abrirUrl('tel:' + soDigitos(acha(b.dataset.tel).telefone))));
  $$('[data-sh]').forEach((b) => b.addEventListener('click', () => { const x = acha(b.dataset.sh); compartilhar(`${x.nome}\n${x.telefone}\n${x.endereco || ''}`.trim()); }));
  $$('[data-ed]').forEach((b) => b.addEventListener('click', () => formCliente(acha(b.dataset.ed))));
  $$('[data-rm]').forEach((b) => b.addEventListener('click', () => { if (confirm('Excluir este cliente?')) { clientes.remove(b.dataset.rm); viewClientes(); } }));
}
function formCliente(x = {}) {
  modal(`<h2>${x.id ? 'Editar cliente' : 'Novo cliente'}</h2>
    <label class="campo">Nome <span class="req">*</span></label><input id="n" value="${esc(x.nome || '')}">
    <label class="campo">Telefone / WhatsApp <span class="req">*</span></label><input id="t" inputmode="tel" value="${esc(x.telefone || '')}">
    <label class="campo">Endereço (opcional)</label><input id="e" value="${esc(x.endereco || '')}">
    <div class="duas"><div><label class="campo">Tipo</label><select id="tp">${['Comum', 'Recorrente', 'VIP'].map((t) => `<option ${x.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div><label class="campo">Favorito</label><select id="f"><option value="0">Não</option><option value="1" ${x.favorito ? 'selected' : ''}>Sim ★</option></select></div></div>
    <button class="btn" id="s">Salvar</button><button class="btn sec" id="c">Cancelar</button>`, (m, fecha) => {
    $('#c', m).addEventListener('click', fecha);
    $('#s', m).addEventListener('click', () => {
      const nome = $('#n', m).value.trim(), tel = $('#t', m).value.trim();
      if (!nome || !tel) return toast('Preencha nome e telefone');
      clientes.upsert({ id: x.id || uid(), nome, telefone: tel, whatsapp: tel, endereco: $('#e', m).value.trim(), tipo: $('#tp', m).value, favorito: $('#f', m).value === '1' });
      fecha(); viewClientes();
    });
  });
}

/* ---------- RELATÓRIOS ---------- */
function viewRelatorios() {
  const dias = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  const pagas = corridas.all().filter((x) => x.status === 'Pago');
  const por = dias.map((d) => pagas.filter((x) => mesmoDia(x.pagoEm || x.criadoEm, d)).reduce((s, x) => s + x.valor, 0));
  const q = dias.map((d) => pagas.filter((x) => mesmoDia(x.pagoEm || x.criadoEm, d)).length);
  const max = Math.max(...por, 1);
  const tot = por.reduce((a, b) => a + b, 0), n = q.reduce((a, b) => a + b, 0);
  const km = pagas.filter((x) => dias.some((d) => mesmoDia(x.pagoEm || x.criadoEm, d))).reduce((s, x) => s + (x.km || 0), 0);
  casca('home', `${voltar}<h1>Relatórios</h1><p class="sub">Últimos 7 dias (só corridas pagas)</p>
    <div class="card"><div class="eyebrow">Total</div><div class="grande" style="font-size:44px">${brl(tot)}</div>
    <div class="bars">${por.map((v, i) => `<div><em>${v ? v.toFixed(0) : ''}</em><i style="height:${Math.max(2, (v / max) * 100)}%"></i><span>${dias[i].toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span></div>`).join('')}</div></div>
    <div class="tiles"><div class="tile" style="min-height:110px"><b>${n}</b><span>Corridas</span></div><div class="tile" style="min-height:110px"><b>${n ? brl(tot / n) : 'R$ 0,00'}</b><span>Média por corrida</span></div><div class="tile" style="min-height:110px"><b>${km.toFixed(0)} km</b><span>Rodados (rotas)</span></div><div class="tile" style="min-height:110px"><b>${km ? brl(tot / km) : '—'}</b><span>Por km</span></div></div>`);
}

/* ---------- AJUSTES ---------- */
function viewAjustes() {
  const c = cfg.get();
  const n = (id, label, v, extra = '') => `<div><label class="campo">${label}</label><input id="${id}" inputmode="decimal" value="${esc(v)}" ${extra}></div>`;
  casca('aj', `${voltar}<h1>Configurações</h1><p class="sub">Campos marcados com <span style="color:var(--err)">*</span> são obrigatórios.</p>
    <div class="card"><h2>Tarifas por km</h2><p class="sub">Valores usados nos botões da tela de nova corrida. Edite conforme sua operação.</p>
      <div class="duas">${n('tarifaEco', 'ECONÔMICA (R$/km)', c.tarifaEco)}${n('tarifaNor', 'NORMAL (R$/km)', c.tarifaNor)}${n('tarifaDin', 'DINÂMICA (R$/km)', c.tarifaDin)}${n('tarifaEve', 'EVENTOS (R$/km)', c.tarifaEve)}</div>
      <hr style="border:0;border-top:1px solid var(--borda);margin:20px 0 4px">
      <div class="duas">${n('tarifaMinima', 'Tarifa mínima (R$)', c.tarifaMinima)}${n('taxaTaxi', 'Taxa táxi inicial (R$)', c.taxaTaxi)}</div></div>
    <div class="card"><h2>Horários de alta demanda</h2><p class="sub">Faixa horária (0–23) em que a tarifa muda automaticamente. Deixe em branco para não usar.</p>
      <div class="duas">${n('dinIni', 'Dinâmica início (h)', c.dinIni)}${n('dinFim', 'Dinâmica fim (h)', c.dinFim)}${n('eveIni', 'Eventos início (h)', c.eveIni)}${n('eveFim', 'Eventos fim (h)', c.eveFim)}</div></div>
    <div class="card"><h2>Área de operação</h2><p class="sub">Cidade onde você roda. As buscas de endereço vão priorizar essa cidade.</p>
      <button class="btn sec" id="det" style="margin-top:0">${I.pin.replace('<svg', '<svg width="22" height="22" style="vertical-align:-4px"')} Detectar pela minha localização</button>
      <div style="display:grid;grid-template-columns:3fr 1fr;gap:14px"><div><label class="campo">Cidade <span class="req">*</span></label><input id="cidade" value="${esc(c.cidade)}"></div><div><label class="campo">UF <span class="req">*</span></label><input id="uf" maxlength="2" value="${esc(c.uf)}" style="text-transform:uppercase"></div></div></div>
    <div class="card"><h2>Pix</h2><p class="sub">Esses dados aparecem no QR Code do recebimento.</p>
      <label class="campo">Tipo da chave <span class="req">*</span></label><select id="pixTipo">${['CPF', 'CNPJ', 'Telefone', 'E-mail', 'Aleatória'].map((t) => `<option ${c.pixTipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <label class="campo">Chave Pix <span class="req">*</span></label><input id="pixChave" value="${esc(c.pixChave)}">
      <label class="campo">Nome do recebedor (máx 25) <span class="req">*</span></label><input id="pixNome" maxlength="25" value="${esc(c.pixNome)}">
      <label class="campo">Cidade do recebedor (máx 15) <span class="req">*</span></label><input id="pixCidade" maxlength="15" value="${esc(c.pixCidade)}"></div>
    <div class="card"><h2>Seu perfil</h2><p class="sub">Aparece nos recibos que você compartilha.</p>
      <label class="campo">Nome completo <span class="req">*</span></label><input id="nome" value="${esc(c.nome)}">
      <div class="duas"><div><label class="campo">Telefone</label><input id="telefone" inputmode="tel" value="${esc(c.telefone)}"></div><div><label class="campo">WhatsApp <span class="req">*</span></label><input id="whatsapp" inputmode="tel" value="${esc(c.whatsapp)}"></div></div></div>
    <div class="card"><h2>Veículo</h2>
      <label class="campo">Modelo</label><input id="veiculoModelo" value="${esc(c.veiculoModelo)}">
      <div class="duas"><div><label class="campo">Placa</label><input id="veiculoPlaca" value="${esc(c.veiculoPlaca)}" style="text-transform:uppercase"></div><div><label class="campo">Cor</label><input id="veiculoCor" value="${esc(c.veiculoCor)}"></div></div></div>
    <button class="btn" id="salvar">Salvar configurações</button>`);
  $('#det').addEventListener('click', async () => {
    try { const p = await posicaoAtual(); const e = await reverso(p); if (e.cidade) { $('#cidade').value = e.cidade; $('#uf').value = e.uf || ''; if (!$('#pixCidade').value) $('#pixCidade').value = e.cidade.slice(0, 15); toast('Cidade detectada'); } else toast('Não identifiquei a cidade'); }
    catch { toast('Ative a localização do celular'); }
  });
  $('#salvar').addEventListener('click', () => {
    const num = (id) => { const v = String($('#' + id).value).trim().replace(',', '.'); return v === '' ? '' : Number(v); };
    const txt = (id) => $('#' + id).value.trim();
    const novo = { ...c };
    ['tarifaEco', 'tarifaNor', 'tarifaDin', 'tarifaEve', 'tarifaMinima', 'taxaTaxi', 'dinIni', 'dinFim', 'eveIni', 'eveFim'].forEach((k) => { novo[k] = num(k); });
    ['cidade', 'pixTipo', 'pixChave', 'pixNome', 'pixCidade', 'nome', 'telefone', 'whatsapp', 'veiculoModelo', 'veiculoCor'].forEach((k) => { novo[k] = txt(k); });
    novo.uf = txt('uf').toUpperCase(); novo.veiculoPlaca = txt('veiculoPlaca').toUpperCase();
    for (const k of ['tarifaEco', 'tarifaNor', 'tarifaDin', 'tarifaEve', 'tarifaMinima', 'taxaTaxi']) if (novo[k] === '' || Number.isNaN(novo[k])) return toast('Confira os valores de tarifa');
    if (!novo.cidade || !novo.uf) return toast('Informe cidade e UF');
    if (!novo.pixChave || !novo.pixNome || !novo.pixCidade) return toast('Preencha os dados do Pix');
    if (!novo.nome || !novo.whatsapp) return toast('Preencha nome e WhatsApp');
    cfg.set(novo); toast('Configurações salvas');
  });
}

/* ---------- MEUS DADOS (backup) ---------- */
function viewDados() {
  casca('home', `${voltar}<h1>Meus dados</h1><p class="sub">Tudo fica só neste celular. Faça backup de vez em quando e antes de trocar de aparelho.</p>
    <div class="card"><h2>Exportar</h2><p class="sub">Copia seus clientes, corridas e configurações como texto. Cole em um e-mail ou nota para guardar.</p><button class="btn" id="exp" style="margin-top:0">Copiar backup</button><button class="btn sec" id="shr">Compartilhar backup</button></div>
    <div class="card"><h2>Restaurar</h2><p class="sub">Cole aqui o texto do backup. Isso substitui os dados atuais.</p><textarea id="txt" placeholder="Cole o backup aqui"></textarea><button class="btn sec" id="imp">Restaurar backup</button></div>
    <p class="aviso">Rota Particular · mapas © OpenStreetMap contributors, © CARTO · rotas por OSRM.</p>`);
  $('#exp').addEventListener('click', () => copiar(exportar()));
  $('#shr').addEventListener('click', () => compartilhar(exportar(), 'Backup Rota Particular'));
  $('#imp').addEventListener('click', () => { try { if (!confirm('Substituir os dados atuais pelo backup?')) return; importar($('#txt').value.trim()); toast('Backup restaurado'); go('/'); } catch { toast('Texto de backup inválido'); } });
}

/* ---------- roteador ---------- */
function render() {
  const [, rota1, arg] = (location.hash.replace(/^#/, '') || '/').split('/');
  if (rota1 !== 'nova') { mapa?.remove(); mapa = null; }
  switch (rota1) {
    case 'nova': return viewNova();
    case 'receber': return viewReceber('cobranca');
    case 'recibo': return viewReceber('recibo');
    case 'corrida': return viewCorrida(arg);
    case 'historico': return viewHistorico();
    case 'clientes': return viewClientes();
    case 'relatorios': return viewRelatorios();
    case 'ajustes': return viewAjustes();
    case 'dados': return viewDados();
    default: return viewHome();
  }
}
window.addEventListener('hashchange', render);
render();
