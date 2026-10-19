// AMOSTRA 2 — Travas de envio, passagem para o humano e modo "Só rascunho" (trecho real, enxugado e anonimizado)
// Origem: lib/atendimento.js (WhatsApp) e lib/direct-instagram.js (direct do Instagram)
//
// O que mostra:
//  - bloqueio(): lista, em ordem, todos os motivos para NÃO enviar agora. '' = pode enviar.
//    Dono assumiu a conversa, lead pediu para parar, assunto que precisa do dono, IA em dúvida, mensagem velha,
//    fora do horário, teto do dia e teto por conversa.
//  - tratar(): com motivo, a resposta vira RASCUNHO (fica na caixa de texto, não é enviada) e o dono recebe um
//    aviso no Telegram com o texto pronto. Sem motivo, o envio é agendado com espera aleatória (ritmo de gente).
//  - No direct: "modo simulado" e "Só rascunho" entram como motivos a mais. Mesmo com tudo certo, nada sai.
'use strict';

// ---------- padrões (todos configuráveis pelo painel) ----------
const CONFIG_PADRAO_WHATSAPP = {
  responderSozinho: true,
  tetoDia: 40, tetoConversaDia: 8,   // respostas por dia no total / por conversa
  horaInicio: 7, horaFim: 22,
  idadeMaxHoras: 12,                 // mensagem do lead mais velha que isso não é respondida sozinha
  esperaMin: 40, esperaMax: 120,     // segundos de espera antes de responder
  pausaDonoHoras: 12,                // dono respondeu à mão: o robô fica quieto nessa conversa por este tempo
};
const PADRAO_DIRECT = { ligado: false, soRascunho: true, pausaDonoHoras: 12, idadeMaxHoras: 12, horaInicio: 7, horaFim: 22, tetoDia: 30, tetoConversaDia: 8 };
const JANELA_META_H = 24; // a Meta só permite responder dentro de 24 h; idadeMaxHoras é sempre < 24

// ---------- WhatsApp: por que NÃO enviar ----------
function bloqueio(conv, cfg, rasc, { agora, envios, dentroDoHorario }) {
  if (!cfg.responderSozinho) return 'Responder sozinho desligado';
  if (conv.assumida) return 'dono assumiu a conversa';
  if (conv.encerrada) return 'lead pediu para parar';
  if (conv.aguardandoDono) return 'aguardando o dono (assunto de preço/fechamento)';
  if (rasc.duvida) return 'robô em dúvida' + (rasc.problemas.length ? ': ' + rasc.problemas.join(', ') : '');
  const ult = conv.mensagens[conv.mensagens.length - 1];
  if (ult && ult.quando && agora() - new Date(ult.quando).getTime() > (cfg.idadeMaxHoras || 12) * 3600000) return 'mensagem antiga: responda você';
  if (!dentroDoHorario(cfg)) return 'fora do horário (' + cfg.horaInicio + 'h–' + cfg.horaFim + 'h)';
  const e = envios();
  if (e.total >= cfg.tetoDia) return 'teto de ' + cfg.tetoDia + ' respostas hoje';
  if ((e.porConversa[conv.chave] || 0) >= cfg.tetoConversaDia) return 'teto de ' + cfg.tetoConversaDia + ' respostas nesta conversa hoje';
  return '';
}

// ---------- WhatsApp: lead respondeu ----------
async function tratar(conv, cfg, deps) {
  const { fazerRascunho, agendarEnvio, sorteio, navegador, avisar, log } = deps;
  const ultima = conv.mensagens[conv.mensagens.length - 1];
  if (!ultima || ultima.saida || conv.respondidoAte === ultima.id) return;
  const rasc = await fazerRascunho(conv, cfg);   // IA + todas as conferências da amostra 1
  conv.rascunho = rasc;
  if (rasc.tipo === 'silencio') { // despedida, "ok, valeu": não responde e não avisa
    rasc.situacao = 'silencio'; conv.respondidoAte = ultima.id;
    return;
  }
  const motivo = bloqueio(conv, cfg, rasc, deps);
  rasc.bloqueio = motivo;
  if (!motivo) {
    rasc.situacao = 'agendado';
    agendarEnvio(conv.chave, sorteio(cfg.esperaMin, cfg.esperaMax) * 1000);
    return;
  }
  rasc.situacao = 'rascunho';
  log(conv.chave + ': rascunho (não enviado): ' + motivo);
  // deixa o texto na caixa de mensagem (sem apertar Enter) para o dono revisar e enviar
  try { const c = await navegador.colocarTexto(conv.chave, rasc.resposta); rasc.naCaixa = !!(c && c.ok); } catch (_) { rasc.naCaixa = false; }
  const urgente = ['urgente', 'parar'].includes(rasc.tipo) || conv.aguardandoDono;
  await avisar([(urgente ? 'URGENTE: ' : '') + 'Lead respondeu.', 'Rascunho (NÃO enviado, ' + motivo + '):', rasc.resposta].join('\n'));
}
// Na hora de enviar (enviarAgora), a conversa é RELIDA: se o dono escreveu algo no meio-tempo, não envia.

// ---------- Direct do Instagram: as mesmas travas + simulado + "Só rascunho" ----------
function motivoDoDirect(cv, c, simulado, bloqueioDirect) {
  let motivo = bloqueioDirect(cv, c);           // última msg já é nossa, dono respondeu à mão, janela da Meta, horário, tetos
  if (!motivo && simulado) motivo = 'modo simulado (não envia)';
  if (!motivo && c.soRascunho) motivo = 'só rascunho ligado (não envia)';
  return motivo; // com motivo: registra o rascunho no painel e avisa o dono no Telegram
}

module.exports = { CONFIG_PADRAO_WHATSAPP, PADRAO_DIRECT, JANELA_META_H, bloqueio, tratar, motivoDoDirect };
