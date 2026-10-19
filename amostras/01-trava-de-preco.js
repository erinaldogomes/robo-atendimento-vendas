// AMOSTRA 1 — Trava de preço e de promessa (vitrine; trecho real, enxugado e anonimizado)
// Origem: lib/atendimento.js (o "cérebro" único que atende WhatsApp e direct do Instagram)
//
// O que mostra:
//  - conferirTexto(): qualquer número que pareça preço, prazo, vaga ou porcentagem e que NÃO esteja na tabela
//    aprovada pelo dono vira "problema". Com problema, a resposta não é enviada: vira rascunho para o dono.
//  - conferirTrio(): todo valor em reais da mensagem tem que bater com UMA linha da tabela (serviço + pacote +
//    valor do mesmo pacote). "Sistema web" nunca recebe valor livre no chat.
//  - PROIBIDAS + limparIA(): frases que a IA nunca pode mandar (promessa de resultado, urgência inventada,
//    "recebi o pagamento", prova social inventada...). Saem da resposta; se sobrar pouco, vai para o dono.
// A IA (gpt-4o-mini) escreve o texto, mas quem decide se sai é este código, com regras à mostra.
'use strict';

const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// "garantir número eu não posso" é honestidade, não promessa
const GARANTIA_NEGADA_RE = /\b(nao|nem) (posso|consigo|da pra|tem como|vou)( te| lhe)? (garantir|prometer)\b|\bnao (garanto|prometo)\b|\bsem (garantia|prometer)\b/g;

// Problemas que impedem o envio sozinho: número que parece preço/prazo/quantidade fora da oferta.
// permitidos = valores em reais da tabela APROVADA (lista vazia = o robô não pode falar valor nenhum).
function conferirTexto(texto, permitidos) {
  const t = norm(texto), p = [];
  if (!t) p.push('resposta vazia');
  const lista = Array.isArray(permitidos) ? permitidos : [];
  const temTabela = lista.length > 0;
  if (/r\$|\breais\b/.test(t) && !temTabela) p.push('fala de valor sem tabela de preços aprovada');
  if (/garant/.test(t.replace(GARANTIA_NEGADA_RE, ' '))) p.push('promete garantia');
  if (/desconto|\d+ ?% (off|de desconto)|condicao especial|faco por|deixo por/.test(t)) p.push('fala de desconto/condição');
  // prazos e quantidades que existem na oferta oficial; qualquer outro número com unidade é suspeito
  const okTexto = /\b(48 ?h(oras)?|30 dias|(2|3|5|7|10|15) dias uteis|[123] vagas?|1 video|3 videos|15 min(utos)?|50 ?%)\b/g;
  const sobra = t.replace(okTexto, ' ').replace(/r\$ ?\d[\d.,]*/g, ' ');
  if (/\b\d+ ?(h|horas?|dias?|semanas?|meses|mes|clientes?|vagas?|videos?|%)\b/.test(sobra)) p.push('cita prazo/número fora da oferta');
  const valores = (t.match(/r\$ ?\d[\d.,]*/g) || []).map(v => Number(v.replace(/r\$ ?/, '').replace(/[.,]\d{2}$/, '').replace(/\D/g, '')));
  const naTabela = new Set(lista.map(Number));
  if (valores.some(v => !naTabela.has(v))) p.push('valor que não está na tabela aprovada');
  if (t.length > 700) p.push('resposta longa demais');
  return p;
}

// Trio serviço + pacote + valor: todo valor da mensagem tem que bater com UMA linha da tabela (implantação e
// mensalidade do mesmo pacote; o sinal pode ser a metade da implantação). Sistema web nunca tem valor livre.
const SERVICO_NA_FRASE = [['Sistema web', /\bsistema\b/], ['Cardápio digital', /\bcardapio\b/], ['Robô WhatsApp', /\b(robo|chatbot)\b/], ['Landing page', /\b(site|landing|pagina)\b/]];
function conferirTrio(texto, tabela) {
  const p = [];
  if (!Array.isArray(tabela) || !tabela.length) return p;
  let srv = null, pac = null;
  for (const trecho of norm(texto).split(/[!?|;]+|\.(?!\d)/)) {
    let achouSrv = null, pos = Infinity;
    for (const [s, re] of SERVICO_NA_FRASE) { const m = re.exec(trecho); if (m && m.index < pos) { pos = m.index; achouSrv = s; } }
    if (achouSrv) { srv = achouSrv; pac = null; }
    const mp = /\b(essencial|profissional|completo)\b/.exec(trecho);
    if (mp) pac = mp[1].charAt(0).toUpperCase() + mp[1].slice(1);
    const vals = [];
    const re = /r\$ ?(\d[\d.]*(?:,\d{1,2})?)([^$]{0,14})/g;
    let m;
    while ((m = re.exec(trecho))) vals.push({ v: Number(m[1].replace(/\./g, '').replace(',', '.')), mensal: /^\s*(\/ ?mes|por mes|ao mes|mensa)/.test(m[2]) });
    if (!vals.length) continue;
    if (srv === 'Sistema web') {
      const sis = tabela.filter(l => /sistema/i.test(l.servico) && (!pac || l.pacote === pac));
      const okSis = /\ba partir de\b/.test(trecho) && sis.some(l => vals.every(x => x.mensal ? x.v === l.mensalidade : x.v === l.implantacao));
      if (!okSis) p.push('valor de sistema web no chat (só "a partir de" da tabela)');
      continue;
    }
    const cand = tabela.filter(l => !/sistema/i.test(l.servico) && (!srv || l.servico === srv) && (!pac || l.pacote === pac));
    const bate = cand.some(l => vals.every(x => x.mensal ? x.v === l.mensalidade : (x.v === l.implantacao || x.v === Math.round(l.implantacao * 50) / 100)));
    if (!bate) p.push('preço não bate com a tabela (' + (srv || 'serviço?') + (pac ? ' ' + pac : '') + ')');
  }
  return p;
}

// Frases que a IA NUNCA pode mandar (saem da resposta; se sobrar pouco, vira rascunho para o dono).
const PROIBIDAS = [
  { nome: 'promete resultado (clientes, vendas, seguidores)', re: /\b(trazer|atrair|ganhar|ter) mais (clientes|vendas|seguidores|pedidos)\b|\b(aument\w*|dobr\w*|multiplic\w*)\b[^.!?]{0,30}\b(vendas|clientes|faturamento)\b/ },
  { nome: 'pressão/urgência', re: /\baproveit\w* (agora|hoje|enquanto)\b|\bso hoje\b|\bultimas vagas\b|\bnao perca\b|\bvai perder\b|\bpor tempo limitado\b/ },
  // o esboço só existe quando o SISTEMA manda a prévia; antes disso a IA não promete
  { nome: 'promete esboço que ainda não existe', semPrevia: true, re: /\besbo[cç]\w*|\bprevia\b|\bmockup\b/ },
  // o robô não vê o banco: nunca confirma pagamento, só diz que vai conferir e avisa o dono
  { nome: 'afirma pagamento recebido', re: /\b(recebi|recebemos|caiu|chegou|confirm\w*)\b[^.!?]{0,20}\b(pix|pagamento|sinal|transferencia)\b|\b(pix|pagamento|sinal)\b[^.!?]{0,15}\b(recebido|confirmado|caiu)\b/ },
  { nome: 'promete grátis/incluso fora da tabela', re: /\b(sem custo|de graca|sem cobrar|gratuit\w*|gratis)\b/ },
  { nome: 'promessa fora da tabela', re: /\bajustes? (ilimitad\w*|sem limite)|\bquantas vezes (voce )?(quiser|precisar)|\bdinheiro de volta\b/ },
  { nome: 'nega ser assistente automático', re: /\bnao (sou|e) (um |uma )?(robo|bot|ia|assistente virtual)\b|\bsou (humano|humana|uma pessoa)\b/ },
  { nome: 'cita trabalho/cliente não confirmado', re: /\b(sites?|trabalhos?|clientes?) que (ja )?(fizemos|fiz|atendemos)\b|\bnossos clientes\b/ },
];

// ponto colado em letra/número não fecha frase ("1.000", "empresa.exemplo")
const frases = t => (String(t || '').match(/(?:[^.!?]|[.!?](?=[\w/]))+(?:[.!?]+|$)/g) || []).map(s => s.trim()).filter(Boolean);

function limparIA(texto, { previaExiste = false } = {}) {
  const removidas = [];
  const fs_ = frases(texto).filter(f => {
    const p = PROIBIDAS.find(x => !(x.semPrevia && previaExiste) && x.re.test(norm(f)));
    if (p) removidas.push(p.nome);
    return !p;
  });
  return { texto: fs_.join(' '), removidas };
}

module.exports = { conferirTexto, conferirTrio, limparIA, PROIBIDAS };
