// GRAND PIXEL GAME — diálogos, NPCs e o sistema de missões (3 da história + 30 extras)

// ---------- linhas de diálogo ----------
const LIN = (who, text) => ({ who, text });
const LORE = 'Luz Interior';

export function dialogFor(npc, q, extra) {
  const d = [];
  const sideDone = (extra && extra.sideDone) || 0;
  const sideTotal = (extra && extra.sideTotal) || 30;
  const idle = [
    'A luz guia os passos de quem tem fe.',
    q[0] === 1 ? 'Ainda faltam cristais no Campo Radiante, a leste.'
      : q[1] === 1 ? 'Mira espera pelas Flores de Luz, na clareira a sudoeste.'
        : q[2] === 1 ? 'O bau do Templo Antigo, ao noroeste, guarda segredos. Cuidado com os slimes.'
          : sideDone > 0 ? 'As missoes dos tabuleiros estao te esperando, guardiao. Aperte Q para ver a lista.'
            : 'Explore o vale. Ha muito o que descobrir alem das colinas.',
  ];
  if (npc === 'elder') {
    if (q[0] === 0) {
      d.push(LIN('ORI, o Anciao', 'Entao voce acordou... como a luz. O vale esta escuro ha muito tempo.'));
      d.push(LIN('ORI, o Anciao', 'Os CRISTAIS DA MEMORIA guardavam a ' + LORE + ' deste mundo. Quando se espalharam, a escuridao tomou o Campo Radiante, a leste.'));
      d.push(LIN('ORI, o Anciao', 'Voce sente essa luz dentro de si. Va ao #ff9de0CAMPO RADIANTE#ffd76a e traga 5 fragmentos de cristal.'));
      d.push(LIN('ORI, o Anciao', 'Eles ainda brilham. Eu sei que sim.'));
      d.action = 'q1';
    } else if (q[0] === 2 && q[1] === 0) {
      d.push(LIN('ORI, o Anciao', 'Os cristais pulsaram de novo... Sinto o vale respirar.'));
      d.push(LIN('ORI, o Anciao', 'Agora procure #7de4ffMIRA#ffd76a. Ela prepara algo com as Flores de Luz na cabana a oeste.'));
      d.action = null;
    } else if (q[2] === 2) {
      d.push(LIN('ORI, o Anciao', 'A ' + LORE + ' brilha em voce como brilhava nos antigos guardioes.'));
      d.push(LIN('ORI, o Anciao', 'E o mapa do vale que se abre, guardiao. Aperte #7de4ffQ#ffd76a para ver as missoes dos viajantes.'));
      d.push(LIN('ORI, o Anciao', sideDone + ' de ' + sideTotal + ' missoes concluidas ate agora. O vale agradece.'));
    } else {
      d.push(LIN('ORI, o Anciao', idle[0]));
      d.push(LIN('ORI, o Anciao', idle[1]));
      if (sideDone > 0) d.push(LIN('ORI, o Anciao', 'Voce ja completou ' + sideDone + ' missoes pelo vale. Continue assim, guardiao.'));
    }
  } else if (npc === 'mira') {
    if (q[0] !== 2) {
      d.push(LIN('MIRA, a Alquimista', 'Shhh! Estou destilando orvalho de estrela...'));
      d.push(LIN('MIRA, a Alquimista', 'Sua aura e interessante. Mas volte quando tiver provado seu valor com o Anciao.'));
    } else if (q[1] === 0) {
      d.push(LIN('MIRA, a Alquimista', 'Voce trouxe os cristais? Os olhos dela brilham. Entao posso confiar em voce.'));
      d.push(LIN('MIRA, a Alquimista', 'Preciso de #7de4ffFLORES DE LUZ#ffd76a para um elixir que acende lampadas antigas.'));
      d.push(LIN('MIRA, a Alquimista', 'Elas crescem na #7de4ffCLAREIRA DAS LAGRIMAS#ffd76a, sudoeste. Colha 5 floretes.'));
      d.push(LIN('MIRA, a Alquimista', 'Sao timidos: brilham em azul quando se sentem seguros. Vai logo!'));
      d.action = 'q2';
    } else if (q[1] === 2) {
      d.push(LIN('MIRA, a Alquimista', 'O elixir esta pronto... Veja como ele acende! (Ela agita um frasco azul)'));
      d.push(LIN('MIRA, a Alquimista', 'O #ffd76aKAEL#ffd76a vigia o caminho do Templo Antigo, ao norte. Ele pode precisar de ajuda.'));
      d.push(LIN('MIRA, a Alquimista', 'E quando quiser descansar, a pousada ao sul serve sopa quente.'));
    } else {
      d.push(LIN('MIRA, a Alquimista', q[1] === 1 ? 'Ainda faltam floretes na clareira, sudoeste da vila.'
        : sideDone > 0 ? 'Ouvi dizer que a floresta ao norte esconde bagas doces... e coisas que nao deveriam existir. Aperte Q para ver as missoes.'
          : 'Nao me atrapalhe enquanto eu trabalho!'));
    }
  } else if (npc === 'kael') {
    if (q[1] !== 2) {
      d.push(LIN('KAEL, o Guardiao', 'Ninguem passa para o noroeste enquanto os slimes nao forem contidos.'));
      d.push(LIN('KAEL, o Guardiao', 'Fale com a Mira ou com o Anciao antes. A estrada ainda e perigosa demais para voce.'));
    } else if (q[2] === 0) {
      d.push(LIN('KAEL, o Guardiao', 'Entao a Mira confia em voce. Entao eu confio.'));
      d.push(LIN('KAEL, o Guardiao', 'No #ffd76aTEMPLO ANTIGO#ffd76a, a noroeste, ha um #ffd76aBAU#ffd76a com uma reliquia. Os slimes o cercaram.'));
      d.push(LIN('KAEL, o Guardiao', 'Derrote os slimes das ruinas e abra o bau. Eles sao moles... mas mordem.'));
      d.push(LIN('KAEL, o Guardiao', 'Eu cobriria suas costas, mas alguem precisa vigiar a vila. Boa sorte, guardiao.'));
      d.action = 'q3';
    } else if (q[2] === 2) {
      d.push(LIN('KAEL, o Guardiao', 'Eu vi o clarao do templo. Entao a reliquia foi encontrada...'));
      d.push(LIN('KAEL, o Guardiao', 'A ' + LORE + ' esta em voce agora. Brilhe por todos nos.'));
      d.push(LIN('KAEL, o Guardiao', 'Se quiser mais acao: os penhascos a oeste tem slimes de pedra, e a floresta ao norte esta cheia de wisps. Aperte Q.'));
    } else {
      d.push(LIN('KAEL, o Guardiao', q[2] === 1 ? 'Os slimes ainda rondam as ruinas, a noroeste. Nao volte sem abrir aquele bau.'
        : 'Fique atento. A noite e quando eles se movem.'));
    }
  }
  return d;
}

export const NPC_INFO = {
  elder: { nome: 'ORI', titulo: 'O ANCIao', port: ['#e0b84a', '#f2f2f2', '#8a4a8e'] },
  mira: { nome: 'MIRA', titulo: 'A ALQUIMISTA', port: ['#2c7443', '#3f9a5c', '#aee3bf'] },
  kael: { nome: 'KAEL', titulo: 'O GUARDIAo', port: ['#2b5f7a', '#3a7fa0', '#c9a23c'] },
};

// ---------- MISSÕES SECUNDÁRIAS (30) ----------
// tipo: 'c' = colete need de `item` | 'k' = derrote need (`area`) | 'v' = visite (x,z)
// req: índice da missão anterior no mesmo grupo (para escalonar dificuldade)
export const SIDE = [
  // --- grupo cristais (campo radiante) ---
  { id: 1, tipo: 'c', item: 'crystal', need: 5, req: -1, nome: 'Fragmentos de memoria', desc: 'Colete 5 cristais no Campo Radiante (leste).', x: 36, z: 9, cor: '#ff9de0' },
  { id: 2, tipo: 'c', item: 'crystal', need: 12, req: 0, nome: 'O brilho antigo', desc: 'Colete 12 cristais no Campo Radiante.', x: 36, z: 9, cor: '#ff9de0' },
  { id: 3, tipo: 'c', item: 'crystal', need: 16, req: 1, nome: 'Colheita de estrelas', desc: 'Colete TODOS os 16 cristais do Campo Radiante.', x: 36, z: 9, cor: '#ff9de0' },
  // --- grupo floretes (clareira) ---
  { id: 4, tipo: 'c', item: 'florete', need: 5, req: -1, nome: 'Lagrimas de orvalho', desc: 'Colete 5 Flores de Luz na Clareira das Lagrimas (sudoeste).', x: -32, z: 28, cor: '#7de4ff' },
  { id: 5, tipo: 'c', item: 'florete', need: 12, req: 3, nome: 'Jardim noturno', desc: 'Colete 12 Flores de Luz na Clareira.', x: -32, z: 28, cor: '#7de4ff' },
  { id: 6, tipo: 'c', item: 'florete', need: 16, req: 4, nome: 'Todas as lagrimas', desc: 'Colete TODAS as 16 Flores de Luz.', x: -32, z: 28, cor: '#7de4ff' },
  // --- grupo bagas (floresta) ---
  { id: 7, tipo: 'c', item: 'berry', need: 6, req: -1, nome: 'Doces sombrios', desc: 'Colete 6 bagas na Floresta dos Sussurros (norte).', x: 4, z: -56, cor: '#ff8f7a' },
  { id: 8, tipo: 'c', item: 'berry', need: 14, req: 6, nome: 'Fartura da floresta', desc: 'Colete 14 bagas na Floresta dos Sussurros.', x: 4, z: -56, cor: '#ff8f7a' },
  // --- grupo minérios (mina) ---
  { id: 9, tipo: 'c', item: 'ore', need: 6, req: -1, nome: 'Veios brilhantes', desc: 'Colete 6 minerios luminescentes nos Penhascos da Mina (oeste).', x: -68, z: 4, cor: '#9fd8ff' },
  { id: 10, tipo: 'c', item: 'ore', need: 14, req: 8, nome: 'Riqueza da terra', desc: 'Colete 14 minerios nos Penhascos da Mina.', x: -68, z: 4, cor: '#9fd8ff' },
  // --- grupo conchas (praia) ---
  { id: 11, tipo: 'c', item: 'shell', need: 6, req: -1, nome: 'Voz do mar', desc: 'Colete 6 conchas na Praia das Conchas (sul).', x: 18, z: 66, cor: '#ffe9a8' },
  { id: 12, tipo: 'c', item: 'shell', need: 16, req: 10, nome: 'Tesouro da lagoa', desc: 'Colete 16 conchas na praia e na lagoa nordeste.', x: 18, z: 66, cor: '#ffe9a8' },
  // --- grupo essências (floresta) ---
  { id: 13, tipo: 'c', item: 'essence', need: 4, req: -1, nome: 'Almas inquietas', desc: 'Colete 4 essencias flutuantes na Floresta dos Sussurros.', x: 4, z: -48, cor: '#a5f0ff' },
  { id: 14, tipo: 'c', item: 'essence', need: 10, req: 12, nome: 'Todas as essencias', desc: 'Colete TODAS as 10 essencias da floresta.', x: 4, z: -48, cor: '#a5f0ff' },
  // --- grupo caça: slimes do campo ---
  { id: 15, tipo: 'k', area: 'campo', need: 3, req: -1, nome: 'Limpeza do campo', desc: 'Derrote 3 slimes verdes no Campo Radiante.', x: 36, z: 9, cor: '#7dff8a' },
  { id: 16, tipo: 'k', area: 'campo', need: 7, req: 14, nome: 'Campo seguro', desc: 'Derrote TODOS os slimes do Campo Radiante.', x: 36, z: 9, cor: '#7dff8a' },
  // --- grupo caça: slimes da mina ---
  { id: 17, tipo: 'k', area: 'mina', need: 3, req: -1, nome: 'Pedra que morde', desc: 'Derrote 3 slimes de pedra nos Penhascos da Mina.', x: -68, z: 4, cor: '#c8ccd4' },
  { id: 18, tipo: 'k', area: 'mina', need: 5, req: 16, nome: 'Mina desobstruida', desc: 'Derrote TODOS os slimes de pedra da mina.', x: -68, z: 4, cor: '#c8ccd4' },
  // --- grupo caça: wisps ---
  { id: 19, tipo: 'k', area: 'wisp', need: 3, req: -1, nome: 'Luzes falsas', desc: 'Derrote 3 wisps na Floresta dos Sussurros.', x: 4, z: -56, cor: '#c9a0ff' },
  { id: 20, tipo: 'k', area: 'wisp', need: 7, req: 18, nome: 'Silencio na floresta', desc: 'Derrote TODOS os wisps da Floresta.', x: 4, z: -56, cor: '#c9a0ff' },
  // --- visitas: regiões distantes ---
  { id: 21, tipo: 'v', x: 36, z: 9, need: 1, req: -1, nome: 'Coracao radiante', desc: 'Visite o Campo Radiante, a leste da vila.', x: 36, z: 9, cor: '#ffd76a' },
  { id: 22, tipo: 'v', x: -32, z: 28, need: 1, req: -1, nome: 'Onde o vale chora', desc: 'Visite a Clareira das Lagrimas, a sudoeste.', x: -32, z: 28, cor: '#ffd76a' },
  { id: 23, tipo: 'v', x: 4, z: -56, need: 1, req: -1, nome: 'Floresta dos Sussurros', desc: 'Visite a floresta ao norte (cuidado com os wisps).', x: 4, z: -56, cor: '#ffd76a' },
  { id: 24, tipo: 'v', x: -68, z: 4, need: 1, req: -1, nome: 'Penhascos da Mina', desc: 'Visite os penhascos a oeste.', x: -68, z: 4, cor: '#ffd76a' },
  { id: 25, tipo: 'v', x: 18, z: 66, need: 1, req: -1, nome: 'Praia das Conchas', desc: 'Visite a praia ao sul e ouca o mar.', x: 18, z: 66, cor: '#ffd76a' },
  // --- visitas: marcos da vila e arredores ---
  { id: 26, tipo: 'v', x: 5, z: -7, need: 1, req: -1, nome: 'O obelisco', desc: 'Toque o obelisco que guarda o pacto da luz.', x: 5, z: -7, cor: '#cfe6ff' },
  { id: 27, tipo: 'v', x: 17, z: -11, need: 1, req: -1, nome: 'O moinho', desc: 'Visite o moinho de vento ao norte da vila.', x: 17, z: -11, cor: '#cfe6ff' },
  { id: 28, tipo: 'v', x: 40, z: 40, need: 1, req: -1, nome: 'Lagoa nordeste', desc: 'Contemple a lagoa entre o campo e o santuario.', x: 40, z: 40, cor: '#cfe6ff' },
  { id: 29, tipo: 'v', x: 25, z: 72, need: 1, req: -1, nome: 'Fim do pier', desc: 'Ande ate a ponta do pier da praia.', x: 25, z: 72, cor: '#cfe6ff' },
  { id: 30, tipo: 'v', x: 1, z: 1, need: 1, req: -1, nome: 'Poco dos desejos', desc: 'Visite o poco no centro da vila e faca um pedido.', x: 1, z: 1, cor: '#cfe6ff' },
  // --- desafio final ---
  { id: 31, tipo: 'k', area: 'todos', need: 16, req: -1, nome: 'O domador de slimes', desc: 'Derrote 16 slimes em todo o vale (campo, templo e mina).', x: 0, z: 0, cor: '#ffb35c' },
];

export const SIDE_TOTAL = SIDE.length; // 31? -> ajustado em 31 itens, exibimos 30 ativas
