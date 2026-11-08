// Armazenamento 100% local (localStorage). Nada sai do aparelho.
const K = { cfg: 'rp.cfg', clientes: 'rp.clientes', corridas: 'rp.corridas', tema: 'rp.tema' };

export const PADRAO = {
  tarifaEco: 1.2, tarifaNor: 1.5, tarifaDin: 2, tarifaEve: 3,
  tarifaMinima: 0, taxaTaxi: 5,
  dinIni: 17, dinFim: 21, eveIni: 22, eveFim: 5,
  cidade: '', uf: '',
  pixTipo: 'CPF', pixChave: '', pixNome: '', pixCidade: '',
  nome: '', telefone: '', whatsapp: '',
  veiculoModelo: '', veiculoPlaca: '', veiculoCor: '',
};

const ler = (k, def) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
};
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.error(e); } };

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const cfg = {
  get: () => ({ ...PADRAO, ...ler(K.cfg, {}) }),
  set: (v) => gravar(K.cfg, v),
};
export const clientes = {
  all: () => ler(K.clientes, []),
  save: (list) => gravar(K.clientes, list),
  upsert(c) {
    const list = this.all();
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list[i] = c; else list.unshift(c);
    this.save(list);
  },
  remove(id) { this.save(this.all().filter((x) => x.id !== id)); },
};
export const corridas = {
  all: () => ler(K.corridas, []),
  save: (list) => gravar(K.corridas, list),
  upsert(c) {
    const list = this.all();
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list[i] = c; else list.unshift(c);
    this.save(list);
  },
  remove(id) { this.save(this.all().filter((x) => x.id !== id)); },
};
export const tema = {
  get: () => ler(K.tema, matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  set: (t) => gravar(K.tema, t),
};

export function exportar() {
  return JSON.stringify({ v: 1, cfg: cfg.get(), clientes: clientes.all(), corridas: corridas.all() });
}
export function importar(txt) {
  const d = JSON.parse(txt);
  if (!d || typeof d !== 'object' || !d.cfg) throw new Error('Backup inválido');
  cfg.set(d.cfg);
  clientes.save(d.clientes || []);
  corridas.save(d.corridas || []);
}
