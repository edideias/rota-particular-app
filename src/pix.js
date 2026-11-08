// Gerador de BR Code Pix (estático) — tudo local, sem servidor.
export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const field = (id, value) => id + String(value.length).padStart(2, '0') + value;

export function limpaTexto(s, max) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, max);
}

export function normalizaChave(tipo, chave) {
  const c = String(chave || '').trim();
  switch (tipo) {
    case 'CPF':
    case 'CNPJ':
      return c.replace(/\D/g, '');
    case 'Telefone': {
      const d = c.replace(/\D/g, '');
      if (c.startsWith('+')) return '+' + d;
      return d.startsWith('55') && d.length > 11 ? '+' + d : '+55' + d;
    }
    case 'E-mail':
      return c.toLowerCase();
    default:
      return c; // aleatória
  }
}

export function gerarPix({ tipo, chave, nome, cidade, valor, descricao, txid }) {
  const k = normalizaChave(tipo, chave);
  if (!k) throw new Error('Chave Pix não configurada. Vá em Ajustes.');
  let conta = field('00', 'br.gov.bcb.pix') + field('01', k);
  const desc = limpaTexto(descricao, 40);
  if (desc) conta += field('02', desc);
  let p = field('00', '01') + field('01', '11') + field('26', conta) + field('52', '0000') + field('53', '986');
  if (valor && Number(valor) > 0) p += field('54', Number(valor).toFixed(2));
  p += field('58', 'BR');
  p += field('59', limpaTexto(nome, 25) || 'MOTORISTA');
  p += field('60', limpaTexto(cidade, 15) || 'BRASIL');
  const id = String(txid || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  p += field('62', field('05', id));
  p += '6304';
  return p + crc16(p);
}
