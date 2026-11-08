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
  try {
    const d = await get(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=pt-BR&lat=${lat}&lon=${lon}`);
    const a = d.address || {};
    const rua = a.road || a.pedestrian || a.footway || '';
    const label = partes([partes([rua, a.house_number].filter(Boolean).join(', ')), a.suburb || a.neighbourhood, a.city || a.town || a.village]);
    return { label: label || d.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon, cidade: a.city || a.town || a.village || '', uf: (a['ISO3166-2-lvl4'] || '').replace('BR-', '') };
  } catch { /* tenta o Photon */ }
  try {
    const d = await get(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}&lang=default`);
    const p = d.features?.[0]?.properties;
    if (p) {
      const cidade = p.city || p.county || '';
      return { label: partes([partes([p.street || p.name, p.housenumber].filter(Boolean).join(', ')), p.district || p.locality, cidade]), lat, lon, cidade, uf: p.state || '' };
    }
  } catch { /* usa coordenadas */ }
  return { label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon, cidade: '', uf: '' };
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

// Sugestões enquanto digita: primeiro o que está na cidade escolhida (inclusive empresas e locais),
// depois o restante do Brasil. Nunca resultados de outros países.
export async function buscar(texto, { cidade, uf, outraCidade, perto } = {}) {
  const q = texto.trim();
  if (q.length < 3) return [];
  const centro = (await centroDaCidade(cidade, uf)) || perto;
  const bias = centro ? `&lat=${centro.lat}&lon=${centro.lon}` : '';
  const base = `https://photon.komoot.io/api/?lang=default&q=${encodeURIComponent(q)}${bias}`;
  const bbox = centro && !outraCidade ? `&bbox=${centro.lon - 0.3},${centro.lat - 0.25},${centro.lon + 0.3},${centro.lat + 0.25}` : '';
  const lista = async (url) => ((await get(url)).features || []).filter(soBR).map(daPhoton).filter((x) => x.titulo);
  let local = [], nacional = [], falhou = 0;
  await Promise.all([
    bbox ? lista(`${base}&limit=10${bbox}`).then((r) => { local = r; }).catch(() => { falhou++; }) : null,
    lista(`${base}&limit=8`).then((r) => { nacional = r; }).catch(() => { falhou++; }),
  ]);
  // empresas/locais primeiro, depois ruas; sempre dentro da cidade antes do resto
  local.sort((a, b) => (b.local ? 1 : 0) - (a.local ? 1 : 0));
  const visto = new Set(); const itens = [];
  [...local, ...(outraCidade ? nacional : nacional.filter((x) => !cidade || (x.cidade && x.cidade !== cidade)))].forEach((x) => {
    if (visto.has(x.label)) return; visto.add(x.label); itens.push(x);
  });
  if (itens.length) return itens.slice(0, 8);
  try {
    const vb = bbox ? `&viewbox=${centro.lon - 0.3},${centro.lat + 0.25},${centro.lon + 0.3},${centro.lat - 0.25}&bounded=1` : '';
    const d = await get(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&countrycodes=br&accept-language=pt-BR${vb}&q=${encodeURIComponent(q)}`);
    return d.map((x) => { const pt = x.display_name.split(',').slice(0, 4); return { titulo: pt[0], sub: pt.slice(1).join(',').trim(), label: pt.join(','), lat: +x.lat, lon: +x.lon }; });
  } catch {
    const vazio = []; vazio.erro = true; return vazio;
  }
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
