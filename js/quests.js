// SOLARIA — 70 missões (11 capítulos + 59 secundárias), 10 artefatos
// e diálogos dinâmicos. Cada missão é um objeto com objetivo avaliável pelo
// jogo (eventos: coletar/matar/visitar/falar/abrir/obter).
import { POIS } from './world.js';

// ---------- artefatos míticos ----------
export const ARTIFACTS = [
  { id: 'a0', nome: 'Coroa de Solaria',     desc: 'Relíquia da fundadora. +1 coração máximo.', efeito: 'hp' },
  { id: 'a1', nome: 'Botas Aladas',         desc: 'O Núcleo de Pedra do Golem, forjado em botas. Pulo duplo.', efeito: 'jump' },
  { id: 'a2', nome: 'Anel Vital',           desc: 'Pulsa como um segundo coração. +2 de vida máxima.', efeito: 'hp2' },
  { id: 'a3', nome: 'Amuleto de Fúria',     desc: 'O ódio dos antigos guerreiros. +1 de dano.', efeito: 'dmg' },
  { id: 'a4', nome: 'Capa do Vento',        desc: 'Tecida com brisas do cume. Anda mais rápido.', efeito: 'speed' },
  { id: 'a5', nome: 'Lâmina do Alvorecer',  desc: 'Corta a escuridão. Golpes maiores e mais longos.', efeito: 'reach' },
  { id: 'a6', nome: 'Olho do Cartógrafo',   desc: 'Revela cada canto do mapa.', efeito: 'map' },
  { id: 'a7', nome: 'Semente Estelar',      desc: 'Brota luz a cada coleta. Curar ao coletar.', efeito: 'healpick' },
  { id: 'a8', nome: 'Coração da Ilha',      desc: 'O núcleo do mundo. Mata inimigos para se curar. +1 coração.', efeito: 'hp' },
  { id: 'a9', nome: 'Lente da Verdade',     desc: 'Enxerga segredos e perigos ocultos no mapa.', efeito: 'secret' },
];

export const have = (arts, id) => arts.indexOf(id) !== -1;

// ---------- história (11 capítulos) ----------
export const MAIN = [
  { idx: 0, nome: 'O Chamado', npc: 'elder', regiao: 'vila',
    texto: 'Ori, o ancião de Solaria, sentiu você acordar. Vá falar com ele na praça.',
    local: { txt: 'FALE COM ORI — praça central de Solaria', x: 7.6, z: -2.8, cor: '#ffd76a' } },
  { idx: 1, nome: 'Memórias do Campo', tipo: 'collect', item: 'crystal', n: 5, regiao: 'campo',
    texto: 'O Campo Radiante, a leste, guarda cristais da memória. Ori precisa de 5 para despertar o primeiro selo.',
    local: { txt: 'CRISTAIS DA MEMÓRIA 5 — Campo Radiante (leste)', x: 36, z: 9, cor: '#ff9de0' } },
  { idx: 2, nome: 'O Primeiro Selo', tipo: 'interact', selo: 'selo_vila', regiao: 'vila',
    texto: 'Leve a luz dos cristais até o obelisco de Solaria e acenda o primeiro selo.',
    local: { txt: 'ACENDA O SELO — obelisco da praça', x: 6.5, z: -3.5, cor: '#ffe9a8' } },
  { idx: 3, nome: 'Lágrimas de Luz', npc: 'mira', regiao: 'vila',
    texto: 'Mira, a curandeira da cabana oeste, sabe onde nascem as flores que choram luz.',
    local: { txt: 'FALE COM MIRA — cabana oeste da vila', x: -12.6, z: 3.6, cor: '#7de4ff' } },
  { idx: 4, nome: 'A Clareira', tipo: 'collect', item: 'florete', n: 5, regiao: 'clareira',
    texto: 'Colete 5 Flores de Luz na Clareira das Lágrimas, a sudoeste.',
    local: { txt: 'FLORES DE LUZ 5 — Clareira das Lágrimas', x: -32, z: 28, cor: '#7de4ff' } },
  { idx: 5, nome: 'O Segundo Selo', tipo: 'interact', selo: 'selo_clareira', regiao: 'clareira',
    texto: 'Acenda o segundo selo no santuário da clareira. Dois selos já pulsam.',
    local: { txt: 'ACENDA O SELO — santuário da Clareira', x: -33, z: 27, cor: '#ffe9a8' } },
  { idx: 6, nome: 'O Peso da Pedra', npc: 'kael', regiao: 'mina',
    texto: 'Kael, o mineiro na estrada oeste, ouviu algo se mexer no fundo da mina.',
    local: { txt: 'FALE COM KAEL — estrada oeste', x: -4.8, z: -5.2, cor: '#8fd6ff' } },
  { idx: 7, nome: 'Minérios de Alma', tipo: 'collect', item: 'ore', n: 6, regiao: 'mina',
    texto: 'Colete 6 Minérios de Alma nos Penhascos da Mina e forje uma chave de luz.',
    local: { txt: 'MINÉRIOS DE ALMA 6 — Penhascos da Mina (oeste)', x: -68, z: 4, cor: '#8fd6ff' } },
  { idx: 8, nome: 'O Golem do Vale', tipo: 'boss', boss: 'golem', regiao: 'mina',
    texto: 'O Golem do Vale desperta na boca da mina. Derrote-o e tome o Núcleo de Pedra.',
    local: { txt: 'DERROTE O GOLEM — boca da mina', x: -70, z: 0, cor: '#ffb35c' } },
  { idx: 9, nome: 'A Cripta Esquecida', tipo: 'interact', selo: 'gate_cripta', regiao: 'mina',
    texto: 'Com o Núcleo de Pedra, abra o portal da Cripta Esquecida na entrada da mina.',
    local: { txt: 'ABRA O PORTAL — arco da Cripta, leste da mina', x: -57, z: 11, cor: '#c9a0ff' } },
  { idx: 10, nome: 'O Guardião Sombrio', tipo: 'boss', boss: 'guardian', regiao: 'cripta',
    texto: 'No coração da Cripta, o Guardião Sombrio devora a luz da ilha. É hora de acabar com isso.',
    local: { txt: 'DERROTE O GUARDIÃO SOMBRIO — Cripta Esquecida', x: -150, z: 150, cor: '#ff5f9e' } },
];
export const MAIN_END = 10; // índice do último capítulo
export const MAIN_TOTAL = MAIN.length;

// ---------- 59 secundárias ----------
// tipo: talk | collect | kill | visit | open | obtain | boss
// pre (condição de desbloqueio; vazio = começa liberada):
//   { main:n }  concluir capítulo n da história
//   { side:[i...] } concluir estas secundárias (índice no array abaixo)
//   { visit:'poi' } | { obtain:'aX' } | { boss:'golem' } | { talk:'elder' }
const S = []; // índice 0..58
const Q = (regiao, nome, tipo, alvo, pre, texto, cor = '#ffd76a', recompensa) => {
  S.push({ i: S.length, regiao, nome, tipo, alvo, pre: pre || null, texto, cor, recompensa: recompensa || null });
};

// ---- Solaria & arredores (6) ----
Q('vila', 'Água Fresca', 'talk', { npc: 'elder' }, null,
  'Ori pede para você beber do poço da praça e descansar perto da fogueira. Conversar com ele basta para começar.', '#ffd76a');
Q('vila', 'O Poço dos Desejos', 'visit', { poi: 'poco' }, { main: 0 },
  'Dizem que o poço de Solaria guarda um segredo para quem o visita à noite.', '#9be8ff', { cura: true });
Q('vila', 'Conheça a Vila', 'visit', { poi: 'praca' }, { main: 0 },
  'Explore a praça: a fogueira, o moinho e a pousada formam o coração da vila.', '#9be8ff');
Q('vila', 'Bom Vizinho', 'talk', { npc: 'mira' }, { main: 1 },
  'Mira quer saber como você está depois do despertar dos cristais.', '#7de4ff', { cura: true });
Q('vila', 'O Mineiro Teimoso', 'talk', { npc: 'kael' }, { main: 1 },
  'Kael não acredita em lendas. Prove que os cristais são reais conversando com ele.', '#8fd6ff');
Q('vila', 'Peregrinação', 'visit', { poi: 'selo_campo' }, { main: 5 },
  'Visite o selo do Campo Radiante e acenda sua luz em respeito aos antigos.', '#ffe9a8', { cura: true });

// ---- Campo Radiante (7) ----
Q('campo', 'Limpeza no Campo I', 'kill', { area: 'campo', n: 3 }, { main: 1 },
  'Os slimes verdes tomaram o Campo Radiante. Derrote 3 para os cristais respirarem.', '#9be89b');
Q('campo', 'Limpeza no Campo II', 'kill', { area: 'campo', n: 7 }, { side: [6] },
  'Ainda restam invasores no campo. Limpe todos os slimes da região.', '#9be89b');
Q('campo', 'Colecionador I', 'collect', { item: 'crystal', n: 5 }, { main: 1 },
  'Além da missão de Ori, junte 5 cristais para os estudiosos da vila.', '#ff9de0');
Q('campo', 'Colecionador II', 'collect', { item: 'crystal', n: 12 }, { side: [8] },
  'Doze cristais formam um conjunto raro. Continue coletando no campo.', '#ff9de0');
Q('campo', 'Colecionador III', 'collect', { item: 'crystal', n: 20 }, { side: [9] },
  'Vinte cristais! O altar da vila brilhará por uma década.', '#ff9de0', { art: 'a0' });
Q('campo', 'Sussurros na Lagoa', 'visit', { poi: 'lagoa' }, { main: 2 },
  'A lagoa a nordeste do campo esconde algo entre as conchas.', '#9be8ff', { cura: true });
Q('campo', 'Bravo do Campo', 'boss', { boss: 'golem' }, { boss: 'golem' },
  'Conte a lenda do Golem que você derrotou para os slimes do campo... derrotando mais 3.', '#ffb35c');


// ---- Clareira das Lágrimas (6) ----
Q('clareira', 'Flores para Mira', 'collect', { item: 'florete', n: 5 }, { main: 4 },
  'Mira prepara um unguento que precisa de flores da clareira. Traga 5.', '#7de4ff');
Q('clareira', 'Jardim da Memória', 'collect', { item: 'florete', n: 12 }, { side: [14] },
  'Doze flores para o memorial da clareira, em memória dos que se perderam.', '#7de4ff');
Q('clareira', 'Guardiões da Clareira', 'visit', { poi: 'selo_clareira' }, { main: 5 },
  'Sente-se em silêncio junto ao selo aceso da clareira.', '#ffe9a8');
Q('clareira', 'Choro da Terra', 'kill', { area: 'clareira', n: 2 }, { main: 8 },
  'Algo nasce do chão molhado de lágrimas. Derrote 2 slimes musgosos que rondam a clareira.', '#9be89b');
Q('clareira', 'Poema de Luz', 'collect', { item: 'essence', n: 3 }, { main: 5 },
  'Essências flutuam perto da clareira. Junte 3 para Mira estudar.', '#6fd9ff', { cura: true });
Q('clareira', 'A Última Flor', 'collect', { item: 'florete', n: 20 }, { side: [15] },
  'Vinte flores: a lenda diz que a última guarda uma lágrima de estrela.', '#7de4ff', { art: 'a7' });

// ---- Templo Antigo (6) ----
Q('templo', 'Ruínas Silenciosas', 'visit', { poi: 'templo' }, { main: 5 },
  'Explore as ruínas do templo antigo a noroeste e respeite o que restou.', '#9be8ff', { cura: true });
Q('templo', 'Musgo e Fúria', 'kill', { area: 'ruinas', n: 3 }, { main: 8 },
  'Três slimes de musgo guardam as lajes do templo. Limpe o caminho.', '#9be89b');
Q('templo', 'A Câmara do Altar', 'visit', { poi: 'altar_templo' }, { side: [19] },
  'Encontre o altar escondido atrás das colunas quebradas.', '#9be8ff', { cura: true });
Q('templo', 'Ecos de Batalha', 'kill', { area: 'ruinas', n: 6 }, { side: [20] },
  'Todos os guardiões do templo devem cair para o silêncio voltar.', '#9be89b');
Q('templo', 'Herança dos Reis', 'open', { n: 2 }, { main: 8 },
  'Abra 2 baús esquecidos pelo vale e recupere as heranças dos antigos.', '#ffd76a');
Q('templo', 'Relíquia Esquecida', 'obtain', { art: 'a3' }, { open: 3 },
  'Há um baú no templo que ninguém conseguiu abrir. Sua força pode mudar isso. (Amuleto de Fúria)', '#ff9de0');

// ---- Floresta dos Sussurros (8) ----
Q('floresta', 'Bom Apetite', 'collect', { item: 'berry', n: 6 }, { main: 1 },
  'As bagas da floresta alimentam a vila inteira. Junte 6.', '#ff6b7a');
Q('floresta', 'Cesto Cheio', 'collect', { item: 'berry', n: 15 }, { side: [25] },
  'Quinze bagas para o inverno que (dizem) vem aí.', '#ff6b7a');
Q('floresta', 'Dia de Caça', 'kill', { area: 'wisp', n: 3 }, { main: 8 },
  'Os wisps ficaram agressivos. Derrote 3 para acalmar a floresta.', '#8fd6ff');
Q('floresta', 'Noite dos Sussurros', 'kill', { area: 'wisp', n: 6 }, { side: [27] },
  'Seis wisps... a floresta sussurra mais alto a cada queda.', '#8fd6ff');
Q('floresta', 'Silêncio Total', 'kill', { area: 'wisp', n: 10 }, { side: [28] },
  'Derrote todos os wisps da floresta e devolva o silêncio aos pinheiros.', '#8fd6ff', { art: 'a5' });
Q('floresta', 'Coração da Floresta', 'visit', { poi: 'clareira_verde' }, { main: 8 },
  'Encontre a clareira verde no meio da mata densa.', '#9be8ff', { cura: true });
Q('floresta', 'Essência Selvagem', 'collect', { item: 'essence', n: 6 }, { side: [17] },
  'Seis essências selvagens para o caldeirão de Mira.', '#6fd9ff');
Q('floresta', 'A Matriarca', 'boss', { boss: 'matriarca' }, { kill: 'wisp' },
  'A Matriarca dos Sussurros não perdoa a morte de seus filhos. Ela espera por você na clareira.', '#d0a2ff', { art: 'a4' });

// ---- Penhascos da Mina (7) ----
Q('mina', 'Minério para Kael', 'collect', { item: 'ore', n: 6 }, { main: 7 },
  'Kael precisa de minério para reparar as ferramentas da vila. 6 peças bastam.', '#8fd6ff');
Q('mina', 'Vetor de Pedra', 'kill', { area: 'mina', n: 3 }, { main: 8 },
  'Slimes de pedra surgem das rachaduras. Derrote 3 na mina.', '#c9d2e0');
Q('mina', 'Geólogo Amador', 'collect', { item: 'ore', n: 14 }, { side: [33] },
  'Catorze minérios: Kael vai te ensinar a diferença entre alma e pedra.', '#8fd6ff', { cura: true });
Q('mina', 'O Fim da Escavação', 'kill', { area: 'mina', n: 7 }, { side: [34] },
  'Esvazie a mina de slimes de pedra para os mineiros voltarem.', '#c9d2e0');
Q('mina', 'A Boca da Mina', 'visit', { poi: 'boca_mina' }, { main: 7 },
  'Desça até a boca da mina e sinta o vento frio que sobe das profundezas.', '#9be8ff');
Q('mina', 'Portal Antigo', 'visit', { poi: 'gate_cripta' }, { main: 8 },
  'O arco da Cripta está na encosta leste da mina. Estude seus entalhes.', '#c9a0ff', { cura: true });
Q('mina', 'Núcleo de Pedra', 'obtain', { art: 'a1' }, { boss: 'golem' },
  'Nas profundezas da mina, um baú lacrado espera por quem provou seu valor contra o Golem. (Botas Aladas)', '#ff9de0');

// ---- Praia das Conchas (5) ----
Q('praia', 'Coleção de Conchas', 'collect', { item: 'shell', n: 8 }, { main: 1 },
  'O mar devolve conchas brilhantes à praia. Junte 8 para decorar a pousada.', '#ffc86b');
Q('praia', 'Voz do Mar', 'collect', { item: 'shell', n: 16 }, { side: [40] },
  'Dezesseis conchas formam um carrilhão que imita o mar. A pousada vai amar.', '#ffc86b', { cura: true });
Q('praia', 'Pôr do Sol no Píer', 'visit', { poi: 'pier' }, { main: 2 },
  'Vá até a ponta do píer quando o céu ficar alaranjado.', '#9be8ff', { cura: true });

Q('praia', 'Guardiões da Areia', 'kill', { area: 'praia', n: 3 }, { main: 8 },
  'Caranguejos? Não... slimes de areia. Derrote 3 na praia sul.', '#9be89b');
Q('praia', 'O Naufrágio', 'visit', { poi: 'naufragio' }, { main: 8 },
  'Um naufrágio antigo aponta para a Ilha do Recife, no nordeste.', '#9be8ff', { cura: true });

// ---- Santuário do Cume (6) ----
Q('santuario', 'Caminho do Cume', 'visit', { poi: 'cume' }, { main: 5 },
  'Suba até o Santuário do Cume e veja o vale inteiro aos seus pés.', '#9be8ff', { cura: true });
Q('santuario', 'Ar Puro', 'collect', { item: 'essence', n: 4 }, { main: 5 },
  'No cume, o ar é tão puro que essências nascem do nada. Junte 4.', '#6fd9ff');
Q('santuario', 'Vento Cortante', 'kill', { area: 'cume', n: 3 }, { main: 8 },
  'Slimes prateados vivem entre as rochas do cume. Derrote 3.', '#c9d2e0');
Q('santuario', 'Olhar do Viajante', 'visit', { poi: 'mirante' }, { main: 10 },
  'Depois de tudo, volte ao mirante do cume e contemple o que você salvou.', '#9be8ff', { art: 'a6' });
Q('santuario', 'O Segredo da Torrente', 'visit', { poi: 'torrente' }, { main: 8 },
  'A torrente que desce do cume esconde uma gruta atrás da cortina d\'água.', '#9be8ff', { cura: true });
Q('santuario', 'Tesouro do Cume', 'open', { n: 4 }, { side: [24] },
  'Abra 4 baús pelo vale. O cume guarda o mais antigo deles.', '#ffd76a');

// ---- Recife & segredos (6) ----
Q('recife', 'Atravesse o Mar', 'visit', { poi: 'recife' }, { main: 10 },
  'Nade até a Ilha do Recife, a nordeste. Dizem que ninguém voltou de lá.', '#9be8ff', { cura: true });
Q('recife', 'Faro do Recife', 'visit', { poi: 'farol_recife' }, { visit: 'recife' },
  'Acenda a luz no alto do farol da ilha. O vale inteiro verá.', '#9be8ff', { art: 'a2' });
Q('recife', 'Sombras da Ilha', 'kill', { area: 'recife', n: 3 }, { visit: 'recife' },
  'A ilha é habitada por wraiths das marés. Derrote 3.', '#b4a8ff');
Q('recife', 'Concha do Marinheiro', 'collect', { item: 'shell', n: 20 }, { visit: 'recife' },
  'Vinte conchas, contadas uma a uma, como fazia o velho marinheiro.', '#ffc86b', { cura: true });
Q('recife', 'O Baú do Corsário', 'open', { n: 6 }, { visit: 'recife' },
  'Abra 6 baús. O corsário enterrou o dele na ilha.', '#ffd76a');
Q('recife', 'Segredo dos Náufragos', 'visit', { poi: 'segredo_recife' }, { visit: 'recife' },
  'Atrás das palmeiras da ilha, algo foi enterrado na areia.', '#9be8ff', { art: 'a9' });

// ---- Cripta & o fim (0 aqui não precisa: guardião é main) ----
Q('cripta', 'O Eco da Cripta', 'boss', { boss: 'guardian' }, { main: 9 },
  'A lenda diz que quem ouvir o eco da Cripta nunca mais dorme em paz. Prove que está enganada.', '#ff5f9e', { cura: true });
Q('cripta', 'Colecionador de Histórias', 'talk', { npc: 'elder' }, { main: 10 },
  'Depois da vitória, Ori quer ouvir a história inteira, do início ao fim.', '#ffd76a');

// validações
export const SIDE = S;
export const SIDE_TOTAL = S.length;
if (MAIN_TOTAL + SIDE_TOTAL !== 70) {
  throw new Error('Total de missões deve ser 70 (main=' + MAIN_TOTAL + ' side=' + SIDE_TOTAL + ')');
}
// recompensa textual para o diário
export const rewText = r => {
  if (!r) return '';
  if (r.art) { const a = ARTIFACTS.find(x => x.id === r.art); return 'Recompensa: artefato ' + a.nome; }
  if (r.cura) return 'Recompensa: cura completa';
  return '';
};

// ---------- rótulos de condição para o diário ----------
export const whyLocked = pre => {
  if (!pre) return 'disponível';
  if (pre.main !== undefined) return 'história: conclua o capítulo ' + (pre.main + 1) + ' (' + MAIN[pre.main].nome + ')';
  if (pre.side) return 'conclua: ' + pre.side.map(i => SIDE[i].nome).join(' e ');
  if (pre.visit) return 'descubra: ' + poiName(pre.visit);
  if (pre.obtain) { const a = ARTIFACTS.find(x => x.id === pre.obtain); return 'obtenha: ' + a.nome; }
  if (pre.boss) return 'derrote: ' + bossName(pre.boss);
  if (pre.kill) return 'combata na região para liberar';
  if (pre.talk) return 'converse mais com os guardiões';
  if (pre.open !== undefined) return 'abra ' + pre.open + ' baús pelo vale';
  return 'condição especial';
};
const BOSS_NAME = { golem: 'Golem do Vale', matriarca: 'Matriarca dos Sussurros', guardian: 'Guardião Sombrio' };
const poiName = id => { const p = POIS.find(x => x.id === id); return p ? p.nome : id; };
const bossName = id => BOSS_NAME[id] || id;
