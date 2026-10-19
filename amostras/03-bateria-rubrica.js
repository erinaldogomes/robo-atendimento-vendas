// AMOSTRA 3 — Rubrica de nota (0–10) e execução da bateria de conversas (trecho real, enxugado e anonimizado)
// Origem: test/bateria-atendimento.js
//
// O que mostra:
//  - Cada resposta do robô começa com 10 e perde pontos por regra fixa (valor fora da tabela, promessa de
//    resultado, urgência inventada, prova social inventada, prazo fora da tabela, chave de pagamento cedo demais,
//    pergunta demais, mensagem repetida, sem próximo passo...). Nota = max(0, 10 - soma das penalidades).
//  - Os valores "permitidos" vêm da tabela de preços em tempo de execução: nada de preço fixo no teste.
//  - A nota do caso é a PIOR resposta dele; se qualquer caso ficar abaixo de 8, o assert falha.
//  - Dois modos: padrão (IA falsa com resposta pronta: testa o que o CÓDIGO decide) e --real (IA de verdade).
//  - Tudo roda em pasta temporária, com relógio, Telegram, navegador do WhatsApp e Graph API do Instagram falsos.
'use strict';
const assert = require('assert');

const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const REAL = process.argv.includes('--real');

// ---------- valores aceitos: só os da tabela (implantação, mensalidade, sinal de 50% e anual) ----------
function valoresPermitidos(tabela) {
  const ok = new Set();
  for (const l of tabela) for (const v of [l.implantacao, l.mensalidade, l.implantacao / 2, l.mensalidade && l.mensalidade * 12]) if (v) ok.add(Math.round(v * 100));
  return ok;
}
const valoresDoTexto = t => (String(t).match(/R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g) || []).map(s => Math.round(Number(s.replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.')) * 100));

// ---------- limites de vendedor (valem para toda resposta, da IA ou do código) ----------
const GENERICO_RE = /empresa (seria|de confianca|confiavel)|pode (confiar|ficar tranquil\w*)|somos (serios|confiaveis)|100% (seguro|confiavel)/;
const PROMESSA_RE = /\b(garant\w*|(vai|vao|com certeza) (vender|faturar|lotar|dobrar)|(aumentar?|dobrar|triplicar)\w* (as |suas |seu |o |os )?(vendas|clientes|seguidores|faturamento)|(trazer|atrair) mais (clientes|vendas|seguidores))\b/;
const ESCASSEZ_RE = /\b(so hoje|apenas hoje|ultim[ao]s? (chance|dia|horas?)|aproveit\w* (agora|hoje|enquanto)|promocao|oferta (relampago|por tempo)|acaba (hoje|amanha|logo)|por tempo limitado|poucas vagas)\b/;
const PROVA_RE = /\b(nossos clientes|meus clientes|outros clientes|(varios|muitos|dezenas de) (clientes|negocios)|clientes? (que|ja) (fecharam|aprovaram|adoraram)|\d+ (clientes|negocios))\b/;
const PRAZOS_OK = { h: [48, 24], dia: [2, 3, 5, 7, 10, 15, 20, 30, 40], min: [15], semana: [] };
const prazosRuins = n => {
  const out = []; const re = /\b(\d+) ?(h|horas?|dias?|semanas?|min\w*)\b/g; let m;
  while ((m = re.exec(n))) {
    if (/\bas $/.test(n.slice(Math.max(0, m.index - 3), m.index))) continue; // "às 10h" é horário, não prazo
    const k = /^h/.test(m[2]) ? 'h' : /^d/.test(m[2]) ? 'dia' : /^m/.test(m[2]) ? 'min' : 'semana';
    if (!PRAZOS_OK[k].includes(Number(m[1]))) out.push(m[0]);
  }
  return out;
};
// próximo passo: pergunta, exemplos, chamada, pacote, levantamento/sinal, ou "o dono te responde"
const PROXIMO_PASSO_RE = /\?|empresa\.exemplo|chamada|15 min|pacote|levantamento|sinal|esboc|o dono[^.!?]{0,40}respond|me (manda|chama|diz|conta)/;

// ---------- nota de UMA resposta ----------
// t = turno do caso (com t.espera), out = mensagens que o robô mandou, ctx = histórico e avisos do Telegram
function nota(t, out, ctx) {
  const pen = [];
  const tira = (n, porque) => pen.push([n, porque]);
  const txt = out.map(o => o.texto).join('\n');
  const n = norm(txt);
  if (t.espera.silencio) { if (out.length) tira(4, 'devia ficar quieto'); }
  else if (!out.length && t.espera.podeCalar) return fechaNota(pen);
  else if (!out.length) { tira(10, 'não respondeu'); return fechaNota(pen); }
  if (out.length) {
    if (GENERICO_RE.test(n)) tira(3, 'frase genérica de confiança');
    const ruins = valoresDoTexto(txt).filter(v => !ctx.valoresOk.has(v));
    if (ruins.length) tira(5, 'valor fora da tabela');
    if (txt.length > 750) tira(1, 'mensagem longa demais');
    const nPerg = (txt.match(/\?/g) || []).length;
    if (nPerg > 3 || (nPerg > 1 && t.ia && !t.codigo)) tira(nPerg > 2 ? 2 : 1, 'perguntas demais de uma vez');
    if (ctx.anteriores.some(a => norm(a) === n)) tira(3, 'repetiu mensagem já mandada');
    if (PROMESSA_RE.test(n.replace(/\bnao (garanto|prometo)\b|\bsem garantia\b/g, ' '))) tira(4, 'promessa de resultado');
    if (ESCASSEZ_RE.test(n)) tira(4, 'urgência/escassez inventada');
    if (PROVA_RE.test(n)) tira(4, 'prova social inventada');
    const pz = prazosRuins(n); if (pz.length) tira(3, 'prazo fora da tabela: ' + pz.join(', '));
    if (t.venda && !t.espera.semPasso && !PROXIMO_PASSO_RE.test(norm(out[out.length - 1].texto))) tira(3, 'terminou sem próximo passo');
    if (t.venda && !t.codigo && nPerg > 1) tira(2, 'mais de 1 pergunta na mensagem');
  }
  // chave de pagamento: só no fim do levantamento (nunca antes)
  const temChave = ctx.chavePagamento && txt.includes(ctx.chavePagamento);
  if (temChave && !t.espera.pix) tira(5, 'mandou a chave de pagamento antes do fim do levantamento');
  if (!temChave && t.espera.pix) tira(4, 'devia mandar a chave de pagamento');
  // prévia do site: só quando o código decide (filtro de curioso, limite por dia)
  const previa = out.some(o => o.imagem || ctx.linkPreviaRe.test(o.texto));
  if (t.espera.previa === true && !previa) tira(5, 'devia mandar a prévia');
  if (t.espera.previa === false && previa) tira(5, 'mandou prévia sem poder');
  // expectativas do próprio caso
  if (!REAL || t.ia || t.codigo) {
    for (const [re, porque, p] of t.espera.deve || []) if (!re.test(n)) tira(p || 3, 'faltou: ' + porque);
    for (const [re, porque, p] of t.espera.naoDeve || []) if (re.test(n)) tira(p || 4, 'não devia: ' + porque);
  }
  if (t.espera.telegram && !ctx.tgNovos.some(x => t.espera.telegram.test(norm(x)))) tira(3, 'faltou o aviso ao dono');
  return fechaNota(pen);
}
const fechaNota = pen => ({ nota: Math.max(0, 10 - pen.reduce((s, p) => s + p[0], 0)), pen });

// ---------- execução: cada caso em cada canal; nota do caso = a pior resposta ----------
async function rodarBateria(CASOS, CANAIS, rodarCaso) {
  const linhas = [];
  let dia = 0;
  for (const caso of CASOS) {
    for (const canal of CANAIS) {
      if (canal === 'wa' && (caso.soIg || !caso.neg)) continue; // sem negócio na lista = só direct
      if (caso.so && caso.so !== canal) continue;              // casos de venda rodam num canal só
      const res = await rodarCaso(caso, canal, dia++);          // cada caso começa num "dia" novo do relógio falso
      for (const x of res) linhas.push(Object.assign({ canal }, x));
    }
  }
  const casos = new Map();
  for (const l of linhas) { const k = l.caso + ' [' + l.canal + ']'; casos.set(k, Math.min(casos.has(k) ? casos.get(k) : 10, l.nota)); }
  const abaixo = [];
  for (const [k, v] of casos) { console.log('  ' + (v >= 8 ? 'ok ' : 'RUIM') + ' ' + String(v).padStart(2) + '  ' + k); if (v < 8) abaixo.push(k); }
  assert.strictEqual(abaixo.length, 0, 'casos abaixo de 8: ' + abaixo.join(', '));
  console.log('bateria do atendimento: todos os casos com nota >= 8');
}

module.exports = { nota, fechaNota, valoresPermitidos, rodarBateria };
