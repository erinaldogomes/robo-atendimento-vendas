// AMOSTRA 5 — Robô de comentários do Instagram: "comenta PALAVRA que eu te mando" (trecho real, enxugado e anonimizado)
// Origem: lib/postador-comentarios.js (versão de 19/10/2026)
//
// O que mostra: sem IA. Regras fixas decidem quem recebe UMA resposta privada no direct:
//  - o comentário tem que ser a palavra SOZINHA (sem acento, sem caixa; emoji e pontuação não contam), com no máximo
//    UMA cortesia antes OU depois ("quero SITE", "eu quero o site", "SITE por favor"). "que site lindo, quero o SITE"
//    não dispara: SITE, CARO, POST são palavras comuns e o direct ali seria spam;
//  - comentário que recusa ou ataca ("não quero CARDÁPIO", "isso é golpe, SITE falso") não recebe direct;
//  - ignora comentário da própria conta e comentário com mais de 7 dias (limite da resposta privada da Meta);
//  - 1 resposta por comentário e 1 por pessoa em cada post; no máximo POR_VARREDURA envios por vez, com pausa;
//  - até MAX_TENTATIVAS por comentário; falta de permissão na conta mostra "Reconectar Instagram" no painel;
//  - modo simulado: só registra o que faria.
// No original, estas regras ficam dentro do laço da varredura; aqui foram juntadas em deveResponder() para leitura.
'use strict';

const SETE_DIAS = 7 * 86400000;
const POR_VARREDURA = 5;
const PAUSA_MS = 4000;
const MAX_TENTATIVAS = 3;

const normal = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

const CORTESIAS = new Set([
  'QUERO', 'EU QUERO', 'QUERO O', 'QUERO A', 'EU QUERO O', 'EU QUERO A', 'QUERIA', 'EU QUERIA', 'QUERIA O', 'QUERIA A',
  'MANDA', 'MANDA O', 'MANDA A', 'ME MANDA', 'ME MANDA O', 'ME MANDA A', 'MANDE', 'ENVIA', 'ME ENVIA',
  'POR FAVOR', 'PFV', 'PFVR', 'PF', 'PLS', 'PLIS', 'OBRIGADO', 'OBRIGADA', 'OBG', 'VALEU', 'SIM', 'OI', 'OLA', 'AQUI', 'EU'
]);

function temPalavra(texto, palavra) {
  const p = normal(palavra).replace(/[^A-Z0-9 -]/g, '').trim();
  if (!p) return false;
  // "BOAS-VINDAS" também vale escrito "boas vindas"
  const t = normal(texto).replace(/[^A-Z0-9]+/g, ' ').trim();
  const alvo = p.replace(/[^A-Z0-9]+/g, ' ').trim();
  if (!t || !alvo) return false;
  const s = ' ' + t + ' ';
  const i = s.indexOf(' ' + alvo + ' ');
  if (i < 0) return false;
  const antes = s.slice(0, i).trim();
  const depois = s.slice(i + alvo.length + 2).trim();
  if (!antes && !depois) return true;
  if (antes && depois) return false;
  return CORTESIAS.has(antes || depois);
}

// Comentário com a palavra mas que RECUSA ou ataca não ganha direct.
const RECUSA_RE = / (NAO|NEM|NUNCA) (QUERO|PRECISO|MANDA|MANDE|ME MAND\w*|ENVIA|ENVIE|PRECISA|PEDI) | (PARA|PARE|PAREM) DE | SEM (SPAM|MANDAR) | (GOLPE\w*|FRAUDE|SPAM|LIXO|ENGANACAO|PICARET\w*|MENTIRA|MENTIROS\w*|DENUNCI\w*) /;
const recusa = texto => RECUSA_RE.test(' ' + normal(texto).replace(/[^A-Z0-9-]+/g, ' ') + ' ');

// Decide, para um comentário, se responde (sem efeito colateral; o envio fica com quem chama).
function deveResponder(cm, { estado, alvo, minhaConta, agora, nestaVez }) {
  const id = String(cm.id || '');
  const reg = estado.respondidos[id];
  if (!id || (reg && (reg.ok || (reg.tentativas || 0) >= MAX_TENTATIVAS))) return { ok: false, motivo: 'já tratado' };
  const de = String((cm.from && cm.from.id) || cm.username || '');
  if (!de || de === minhaConta) return { ok: false, motivo: 'própria conta' };
  if (!cm.timestamp || agora() - new Date(cm.timestamp).getTime() > SETE_DIAS) return { ok: false, motivo: 'mais de 7 dias' };
  if (!temPalavra(cm.text, alvo.palavra)) return { ok: false, motivo: 'sem a palavra-chave sozinha' };
  if (recusa(cm.text)) return { ok: false, motivo: 'recusa ou ataque' };
  const chavePessoa = alvo.mediaId + ':' + de;
  if ((estado.pessoas[chavePessoa] && estado.pessoas[chavePessoa] !== id) || nestaVez.has(chavePessoa)) return { ok: false, motivo: 'mesma pessoa, mesmo post' };
  nestaVez.add(chavePessoa);
  return { ok: true, chavePessoa };
}

module.exports = { temPalavra, recusa, deveResponder, POR_VARREDURA, PAUSA_MS };
