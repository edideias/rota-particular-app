export const MODOS = [
  { id: 'eco', sigla: 'ECO', nome: 'Econômica', chave: 'tarifaEco' },
  { id: 'nor', sigla: 'NOR', nome: 'Normal', chave: 'tarifaNor' },
  { id: 'din', sigla: 'DIN', nome: 'Dinâmica', chave: 'tarifaDin' },
  { id: 'eve', sigla: 'EVE', nome: 'Eventos', chave: 'tarifaEve' },
];

// faixa [ini, fim) em horas 0-23; aceita faixa que cruza a meia-noite (ex.: 22 → 5)
export function naFaixa(h, ini, fim) {
  if (ini === '' || fim === '' || ini == null || fim == null) return false;
  ini = Number(ini); fim = Number(fim);
  if (ini === fim) return false;
  return ini < fim ? h >= ini && h < fim : h >= ini || h < fim;
}

export function modoAutomatico(cfg, data = new Date()) {
  const h = data.getHours();
  if (naFaixa(h, cfg.eveIni, cfg.eveFim)) return 'eve';
  if (naFaixa(h, cfg.dinIni, cfg.dinFim)) return 'din';
  return 'nor';
}

export function calcularValor(cfg, modo, km, { taxi = false } = {}) {
  const m = MODOS.find((x) => x.id === modo) || MODOS[1];
  const porKm = Number(cfg[m.chave]) || 0;
  let v = km * porKm;
  if (taxi) v += Number(cfg.taxaTaxi) || 0;
  const minima = Number(cfg.tarifaMinima) || 0;
  if (v < minima) v = minima;
  return Math.round(v * 100) / 100;
}

export const brl = (n) => 'R$ ' + (Number(n) || 0).toFixed(2).replace('.', ',');
