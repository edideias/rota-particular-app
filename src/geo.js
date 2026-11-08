// Mapas e rotas grátis: Photon/Nominatim (busca) + OSRM (rota) — dados do OpenStreetMap.
import { Geolocation } from '@capacitor/geolocation';

export async function posicaoAtual() {
  try { await Geolocation.requestPermissions(); } catch { /* web */ }
  const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
  return { lat: p.coords.latitude, lon: p.coords.longitude };
}

// Com o CapacitorHttp ligado, o fetch sai pelo Android (sem bloqueio de CORS) e leva um User-Agent
// que identifica o app, como o OpenStreetMap exige.
const get = async (url) => {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'Accept-Language': 'pt-BR', 'User-Agent': 'RotaParticular/1.0 (app Android de motorista)' } });
  if (!r.ok) throw new Error('Falha de rede (' + r.status + ')');
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
  } catch {
    return { label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon, cidade: '', uf: '' };
  }
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

// Sugestões enquanto digita (Photon, com viés para a cidade de operação)
export async function buscar(texto, { cidade, uf, outraCidade, perto } = {}) {
  const q = texto.trim();
  if (q.length < 3) return [];
  const centro = outraCidade ? null : perto || (await centroDaCidade(cidade, uf));
  const bias = centro ? `&lat=${centro.lat}&lon=${centro.lon}` : '';
  const consulta = !outraCidade && cidade && !q.toLowerCase().includes(cidade.toLowerCase()) ? `${q} ${cidade}` : q;
  let falhou = 0;
  try {
    const d = await get(`https://photon.komoot.io/api/?limit=6&lang=default&q=${encodeURIComponent(consulta)}${bias}`);
    const itens = (d.features || [])
      .filter((f) => (f.properties.countrycode || 'BR') === 'BR')
      .map((f) => {
        const p = f.properties;
        const rua = p.street || p.name || '';
        const num = p.housenumber ? `, ${p.housenumber}` : '';
        const label = partes([rua + num, p.district || p.locality, p.city || p.county, p.state]);
        return { label, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
      });
    if (itens.length) return itens;
  } catch { falhou++; /* cai no Nominatim */ }
  try {
    const d = await get(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(consulta)}`);
    return d.map((x) => ({ label: x.display_name.split(',').slice(0, 4).join(','), lat: +x.lat, lon: +x.lon }));
  } catch {
    const vazio = [];
    vazio.erro = true;
    return vazio;
  }
}

// Rota pelas ruas (OSRM). pontos = [{lat,lon}, ...]
export async function rota(pontos) {
  const path = pontos.map((p) => `${p.lon},${p.lat}`).join(';');
  const d = await get(`https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson`);
  if (d.code !== 'Ok' || !d.routes?.[0]) throw new Error('Não achei rota entre esses pontos');
  const r = d.routes[0];
  return { km: r.distance / 1000, min: Math.max(1, Math.round(r.duration / 60)), coords: r.geometry.coordinates.map(([lon, lat]) => [lat, lon]) };
}
