import assert from 'node:assert/strict';
import { crc16, gerarPix, normalizaChave } from '../src/pix.js';
import { calcularValor, modoAutomatico, naFaixa } from '../src/pricing.js';

// vetor padrão CRC16/CCITT-FALSE
assert.equal(crc16('123456789'), '29B1');

// exemplo do manual do BCB (valor 10,00): CRC final confere
const ex = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-426655440000520400005303986540510.005802BR5913Fulano de Tal6008BRASILIA62070503***6304';
console.log('crc manual BCB:', crc16(ex));

const p = gerarPix({ tipo: 'CPF', chave: '123.456.789-09', nome: 'Edmilson', cidade: 'Campo Grande', valor: 10.45 });
assert.ok(p.startsWith('000201010211'));
assert.ok(p.includes('540510.45'));
assert.ok(p.includes('5908EDMILSON'));
assert.ok(p.includes('6012CAMPO GRANDE'));
assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
assert.equal(normalizaChave('Telefone', '(67) 99999-0000'), '+5567999990000');
assert.equal(normalizaChave('CPF', '123.456.789-09'), '12345678909');

const cfg = { tarifaEco: 1.2, tarifaNor: 1.5, tarifaDin: 2, tarifaEve: 3, tarifaMinima: 0, taxaTaxi: 5, dinIni: 17, dinFim: 21, eveIni: 22, eveFim: 5 };
assert.equal(calcularValor(cfg, 'din', 5.225), 10.45); // igual ao print original
assert.equal(calcularValor(cfg, 'nor', 10, { taxi: true }), 20);
assert.equal(calcularValor({ ...cfg, tarifaMinima: 8 }, 'eco', 2), 8);
assert.ok(naFaixa(23, 22, 5) && naFaixa(2, 22, 5) && !naFaixa(12, 22, 5));
assert.equal(modoAutomatico(cfg, new Date(2026, 0, 1, 18)), 'din');
assert.equal(modoAutomatico(cfg, new Date(2026, 0, 1, 23)), 'eve');
assert.equal(modoAutomatico(cfg, new Date(2026, 0, 1, 12)), 'nor');
console.log('OK');
