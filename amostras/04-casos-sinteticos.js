// AMOSTRA 4 — Casos de teste no formato da bateria (EXEMPLOS SINTÉTICOS)
// Origem do formato: test/bateria-atendimento.js
//
// Os casos abaixo foram ESCRITOS PARA ESTA VITRINE: nomes de negócio, falas e respostas são inventados e não
// vêm de nenhuma conversa real. O formato (campos, expectativas, penalidades) é o mesmo da bateria original.
//
// Campos:
//  neg     negócio da lista de prospecção (null = pessoa desconhecida, só direct do Instagram)
//  abre    a 1ª mensagem que o robô mandou
//  so      'wa' | 'ig' para rodar num canal só (casos de venda); sem ele roda nos dois
//  turnos  cada fala do lead. ia = resposta pronta da IA falsa (modo padrão). codigo = quem responde é o código.
//          espera.deve / espera.naoDeve = [regex, motivo, penalidade]; espera.previa / pix / silencio / podeCalar.
//          tick + dias = o tempo passa sem fala do lead (testa se o robô fica quieto).
'use strict';

const PROSP = n => 'Oi, pessoal da ' + n + '! Aqui é da EMPRESA. Faço sites e robôs de atendimento para negócios locais. Posso te mostrar uma ideia pra vocês?';
const PERG = [/\?/, 'uma pergunta para seguir a conversa', 2];
const NAO_DESCONTO = [/\b(?!50 ?%)\d+ ?%|desconto de|faco (por|um precinho)|sai por menos/, 'inventar desconto', 5];
const NAO_INSISTE = [/r\$|pacote|essencial|profissional|fechar|sinal/, 'insistir na venda', 4];

const CASOS_EXEMPLO = [
  // 1) "Tá caro": o robô não inventa desconto e mostra o que vem incluso
  { id: 'ex-caro', so: 'wa', neg: { nome: 'Doceria Exemplo', categoria: 'Doceria', cidade: 'Cidade X' }, abre: PROSP('Doceria Exemplo'), turnos: [
    { fala: 'quanto fica um site simples?', codigo: true, espera: {} },
    { fala: 'achei salgado, faz um precinho?',
      ia: { resposta: 'Entendo! O valor é o da tabela, mas o pacote mais simples já mostra os produtos e o botão do WhatsApp. Hoje seus clientes pedem pelo direct?', tipo: 'normal' },
      espera: { deve: [[/inclu|whats|botao|simples/, 'mostrar o que vem incluso']], naoDeve: [NAO_DESCONTO] } },
  ] },

  // 2) "Já paguei": o robô nunca confirma pagamento (ele não vê o banco) e avisa o dono
  { id: 'ex-paguei', neg: { nome: 'Oficina Exemplo', categoria: 'Oficina mecânica', cidade: 'Cidade Y' }, abre: PROSP('Oficina Exemplo'), turnos: [
    { fala: 'pronto, já fiz o pagamento do sinal', codigo: true,
      espera: { naoDeve: [[/recebi o (pix|pagamento)|pagamento (confirmado|recebido)/, 'afirmar que o pagamento caiu']], telegram: /informado/ } },
  ] },

  // 3) Lead sem interesse e depois "ok": o robô para, sem pergunta para segurar e sem empurrar venda
  { id: 'ex-sem-interesse', so: 'ig', neg: { nome: 'Papelaria Exemplo', categoria: 'Papelaria', cidade: 'Cidade Z' }, abre: PROSP('Papelaria Exemplo'), turnos: [
    { fala: 'valeu, mas agora não tenho interesse', codigo: true, espera: { semPasso: true, naoDeve: [NAO_INSISTE, [/\?/, 'pergunta para segurar', 3]] } },
    { tick: true, dias: 3, codigo: true, espera: { silencio: true } },
  ] },

  // 4) Curioso declarado pede o esboço: não gera prévia, manda para a página de exemplos
  { id: 'ex-curioso', neg: { nome: 'Floricultura Exemplo', categoria: 'Floricultura', cidade: 'Cidade X' }, abre: PROSP('Floricultura Exemplo'), turnos: [
    { fala: 'é só curiosidade, queria ver como vocês fazem o modelo', codigo: true, espera: { previa: false, deve: [[/empresa\.exemplo/, 'mandar para os exemplos do site']] } },
  ] },
];

module.exports = { CASOS_EXEMPLO, PERG };
