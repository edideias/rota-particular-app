import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { I, esc, toast } from './ui.js';
import { buscar } from './geo.js';

let vozOk = null;
async function temVoz() {
  if (vozOk !== null) return vozOk;
  try { vozOk = (await SpeechRecognition.available()).available; } catch { vozOk = false; }
  return vozOk;
}

// Campo de endereço com sugestões. ctx() devolve { cidade, uf, outraCidade, perto }
export function campoEndereco({ valor = '', placeholder = 'Endereço, bairro ou local', mic = false, ctx, onPick, onClear }) {
  const wrap = document.createElement('div');
  wrap.className = 'end-wrap';
  wrap.innerHTML = `<div class="ln">${I.pin}<input type="text" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(valor)}"><button type="button" class="icon-btn" data-x style="display:none">${I.x}</button>${mic ? `<button type="button" class="icon-btn" data-mic style="display:none">${I.mic}</button>` : ''}</div><div class="sug" style="display:none"></div>`;
  const inp = wrap.querySelector('input');
  const sug = wrap.querySelector('.sug');
  const bx = wrap.querySelector('[data-x]');
  const bm = wrap.querySelector('[data-mic]');
  let timer, seq = 0;

  const atualizaBotoes = () => {
    bx.style.display = inp.value ? '' : 'none';
    if (bm) bm.style.display = inp.value ? 'none' : '';
  };
  atualizaBotoes();
  if (bm) temVoz().then((ok) => { if (!ok) bm.remove(); });

  const fecha = () => { sug.style.display = 'none'; sug.innerHTML = ''; };
  const mostra = (itens, vazio) => {
    sug.style.display = '';
    sug.innerHTML = itens.length ? itens.map((it, i) => `<button type="button" data-i="${i}">${esc(it.label)}</button>`).join('') : `<div class="vazio">${vazio}</div>`;
    sug.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const it = itens[+b.dataset.i];
      inp.value = it.label; atualizaBotoes(); fecha(); onPick?.(it);
    }));
  };
  const pesquisa = async (txt) => {
    const meu = ++seq;
    sug.style.display = ''; sug.innerHTML = '<div class="vazio">Buscando…</div>';
    const itens = await buscar(txt, ctx?.() || {});
    if (meu !== seq) return;
    mostra(itens, 'Nada encontrado. Tente incluir o bairro ou o nome do lugar.');
  };

  inp.addEventListener('input', () => {
    atualizaBotoes(); clearTimeout(timer);
    if (inp.value.trim().length < 3) { fecha(); return; }
    timer = setTimeout(() => pesquisa(inp.value), 650);
  });
  bx.addEventListener('click', () => { inp.value = ''; atualizaBotoes(); fecha(); onClear?.(); });
  bm?.addEventListener('click', async () => {
    try {
      await SpeechRecognition.requestPermissions();
      const r = await SpeechRecognition.start({ language: 'pt-BR', maxResults: 1, prompt: 'Diga o endereço', partialResults: false, popup: true });
      const t = r?.matches?.[0];
      if (t) { inp.value = t; atualizaBotoes(); pesquisa(t); }
    } catch { toast('Não consegui ouvir. Tente de novo.'); }
  });

  return {
    el: wrap,
    set(label) { inp.value = label || ''; atualizaBotoes(); fecha(); },
    get() { return inp.value; },
  };
}
