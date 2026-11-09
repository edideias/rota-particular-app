// Mapas e rotas grátis: Photon/Nominatim (busca) + OSRM (rota) — dados do OpenStreetMap.
import { Geolocation } from '@capacitor/geolocation';

export async function posicaoAtual() {
  try { await Geolocation.requestPermissions(); } catch { /* web */ }
  const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
  return { lat: p.coords.latitude, lon: p.coords.longitude };
}

// Com o CapacitorHttp ligado, o fetch sai pelo Android (sem bloqueio de CORS) e leva um User-Agent
// que identifica o app, como o OpenStreetMap exige.
export let ultimoErro = '';
const get = async (url) => {
  ultimoErro = '';
  let r;
  try {
    r = await fetch(url, { headers: { Accept: 'application/json', 'Accept-Language': 'pt-BR', 'User-Agent': 'RotaParticular/1.0 (app Android de motorista)' } });
  } catch (e) {
    ultimoErro = 'sem conexão com ' + new URL(url).hostname;
    throw new Error(ultimoErro);
  }
  if (!r.ok) {
    ultimoErro = 'erro ' + r.status + ' em ' + new URL(url).hostname;
    throw new Error(ultimoErro);
  }
  return r.json();
};

const partes = (a) => a.filter(Boolean).join(', ');

export async function reverso({ lat, lon }) {
  const coord = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  const erros = [];
  try {
    const d = await get(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=pt-BR&lat=${lat}&lon=${lon}`);
    const a = d.address || {};
    const rua = a.road || a.pedestrian || a.footway || a.residential || '';
    const cidade = a.city || a.town || a.village || a.municipality || '';
    const via = partes([rua, a.house_number]);
    const label = partes([via, a.suburb || a.neighbourhood || a.quarter, cidade]);
    if (label) return { label, lat, lon, cidade, uf: (a['ISO3166-2-lvl4'] || '').replace('BR-', ''), rua: !!rua };
  } catch { erros.push(ultimoErro); }
  try {
    const d = await get(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`);
    const p = d.features?.[0]?.properties;
    if (p) {
      const cidade = p.city || p.county || '';
      const rua = p.street || p.name || '';
      const label = partes([partes([rua, p.housenumber]), p.district || p.locality, cidade]);
      if (label) return { label, lat, lon, cidade, uf: p.state || '', rua: !!rua };
    }
  } catch { erros.push(ultimoErro); }
  try {
    const d = await get(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`);
    const cidade = d.city || d.locality || '';
    if (cidade) return { label: partes([d.locality && d.locality !== cidade ? d.locality : '', cidade]) + ' (rua não identificada)', lat, lon, cidade, uf: d.principalSubdivisionCode ? d.principalSubdivisionCode.replace('BR-', '') : d.principalSubdivision || '', rua: false };
  } catch { erros.push(ultimoErro); }
  ultimoErro = erros.filter(Boolean).join(' · ');
  return { label: coord, lat, lon, cidade: '', uf: '', rua: false, falhou: true };
}

let centroCache = {};
export async function centroDaCidade(cidade, uf) {
  const k = `${cidade}|${uf}`;
  if (!cidade) return null;
  if (centroCache[k]) return centroCache[k];
  try {
    const d = await get(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(partes([cidade, uf, 'Brasil']))}`);
    if (d[0]) return (centroCache[k] = { lat: +d[0].lat, lon: +d[0].lon });
  } catch { /* ignora */ }
  return null;
}

// Converte um resultado do Photon em sugestão. Empresas/locais aparecem com o nome em destaque.
const daPhoton = (f) => {
  const p = f.properties;
  const rua = p.street || '';
  const num = p.housenumber ? `, ${p.housenumber}` : '';
  const ehLocal = p.name && p.name !== p.street && !(p.osm_key === 'place' || p.osm_key === 'highway');
  const titulo = ehLocal ? p.name : (p.street ? rua + num : p.name || '');
  const sub = partes([ehLocal && rua ? rua + num : '', p.district || p.locality || (p.osm_key === 'place' ? '' : ''), p.city || p.county, p.state]);
  return { titulo, sub, label: partes([titulo, sub]), lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], cidade: p.city || p.county || '', local: ehLocal };
};
const soBR = (f) => (f.properties.countrycode || '').toUpperCase() === 'BR';

const km = (a, b) => {
  const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const daNominatim = (x) => {
  const pt = x.display_name.split(',').map((s) => s.trim());
  const a = x.address || {};
  const cidade = a.city || a.town || a.village || a.municipality || '';
  return { titulo: pt[0], sub: partes([...pt.slice(1, 3), cidade && !pt.includes(cidade) ? cidade : '']), label: pt.slice(0, 4).join(', '), lat: +x.lat, lon: +x.lon, cidade, local: !!x.name && x.type !== 'residential' && x.class !== 'highway' };
};

// Sugestões enquanto digita: primeiro o que está perto de quem busca (sua cidade), do mais perto ao mais
// longe, com empresas/locais em destaque; depois o resto do Brasil. Nunca resultados de outros países.
export async function buscar(texto, { centro, cidade, uf, outraCidade } = {}) {
  const q = texto.trim();
  if (q.length < 3) return [];
  const c = centro || (await centroDaCidade(cidade, uf));
  const bias = c ? `&lat=${c.lat}&lon=${c.lon}` : '';
  const base = `https://photon.komoot.io/api/?lang=default&q=${encodeURIComponent(q)}${bias}`;
  const caixa = c && !outraCidade ? [c.lon - 0.3, c.lat - 0.25, c.lon + 0.3, c.lat + 0.25] : null;
  const fotons = async (url) => ((await get(url)).features || []).filter(soBR).map(daPhoton).filter((x) => x.titulo);
  let perto = [], pais = [], falhas = 0;
  await Promise.all([
    caixa ? fotons(`${base}&limit=15&bbox=${caixa.join(',')}`).then((r) => { perto.push(...r); }).catch(() => { falhas++; }) : null,
    caixa ? get(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10&addressdetails=1&countrycodes=br&accept-language=pt-BR&viewbox=${caixa[0]},${caixa[3]},${caixa[2]},${caixa[1]}&bounded=1&q=${encodeURIComponent(q)}`)
      .then((r) => { perto.push(...r.map(daNominatim)); }).catch(() => { falhas++; }) : null,
    fotons(`${base}&limit=10`).then((r) => { pais = r; }).catch(() => { falhas++; }),
  ]);
  const dist = (x) => (c ? km(c, x) : 0);
  // do mais perto ao mais longe; empresa/local ganha uma folga de 1,5 km
  const ordena = (l) => l.sort((a, b) => (dist(a) - (a.local ? 1.5 : 0)) - (dist(b) - (b.local ? 1.5 : 0)));
  const visto = new Set(); const itens = [];
  const add = (x) => {
    const k = (x.titulo + '|' + Math.round(x.lat * 500) + '|' + Math.round(x.lon * 500)).toLowerCase();
    if (visto.has(k)) return; visto.add(k);
    if (c) { const d = dist(x); x.sub = partes([x.sub, d < 100 ? `${d < 10 ? d.toFixed(1) : Math.round(d)} km` : '']); }
    itens.push(x);
  };
  ordena(perto).forEach(add);
  ordena(pais).forEach(add);
  if (itens.length) return itens.slice(0, 8);
  const vazio = []; vazio.erro = falhas >= (caixa ? 3 : 1); return vazio;
}

// Busca de cidades (para o botão de cidade/estado)
export async function buscarCidade(texto) {
  const q = texto.trim();
  if (q.length < 2) return [];
  const d = await get(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=br&addressdetails=1&accept-language=pt-BR&featuretype=city&q=${encodeURIComponent(q)}`);
  const visto = new Set();
  return d.map((x) => { const a = x.address || {}; const cidade = a.city || a.town || a.village || a.municipality || x.name; const uf = (a['ISO3166-2-lvl4'] || '').replace('BR-', ''); return { cidade, uf, label: partes([cidade, a.state]), lat: +x.lat, lon: +x.lon }; })
    .filter((x) => x.cidade && !visto.has(x.cidade + x.uf) && visto.add(x.cidade + x.uf));
}

// Rota pelas ruas (OSRM). pontos = [{lat,lon}, ...]
export async function rota(pontos) {
  const path = pontos.map((p) => `${p.lon},${p.lat}`).join(';');
  const d = await get(`https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`);
  if (d.code !== 'Ok' || !d.routes?.[0]) throw new Error('Não achei rota entre esses pontos');
  const r = d.routes[0];
  return { km: r.distance / 1000, min: Math.max(1, Math.round(r.duration / 60)), coords: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]) };
}
