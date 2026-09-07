/**
 * Génère `move.wav` : le bruit d'une pièce posée sur le plateau.
 *
 *     node app/assets/sounds/move.gen.js
 *
 * Le son est synthétisé, pas emprunté — même raison que les pièces dessinées
 * à la main : pas de licence à traîner pour une publication App Store. Ce
 * fichier est la source de l'échantillon ; sans lui, le `.wav` ne serait plus
 * modifiable.
 *
 * Les réglages ne sont pas devinés. Ils viennent de l'analyse d'un son de
 * référence, puis d'un calage en boucle : on rend, on ré-analyse le rendu avec
 * la même méthode, on corrige. Chaque élément du modèle répond à un défaut qui
 * a d'abord été mesuré.
 *
 * ── Le modèle, et pourquoi il a cette forme ──────────────────────────────
 *
 * 1. UN BANC DE RÉSONATEURS, PAS DES SINUSOÏDES.
 *    Une sinusoïde amortie et un résonateur à deux pôles frappé par une
 *    impulsion donnent le même signal. Mais une somme de sinusoïdes laisse le
 *    spectre vide entre ses pics : l'oreille isole chaque composante et entend
 *    un accord, donc du métal. Exciter les résonateurs par une bouffée de
 *    bruit désordonne cette excitation.
 *
 * 2. UN LIT DE BRUIT MIS EN FORME.
 *    Le point 1 ne suffit pas : mesurée en platitude spectrale, une synthèse
 *    modale pure donne 0,001 contre 0,139 pour la référence — 140 fois moins
 *    dense. Il faut un fond large qui remplit les creux pendant toute la
 *    décroissance. Il est fabriqué en filtrant du bruit blanc par l'enveloppe
 *    ci-dessous : une réponse en 48 bandes logarithmiques, soit une
 *    caractérisation grossière de la couleur du matériau.
 *
 * 3. UNE ENVELOPPE DE FOND À DEUX TEMPS.
 *    Une queue lente plus une bosse initiale. La bosse concentre l'énergie
 *    dans les premières millisecondes — c'est la netteté. Comme elle porte le
 *    même spectre que le reste du lit, elle n'ajoute aucun aigu : netteté et
 *    brillance sont deux grandeurs distinctes, et les avoir confondues a coûté
 *    plusieurs essais.
 *
 * 4. UN PASSE-BAS D'ORDRE 3.
 *    Un seul pôle ne coupe qu'à 6 dB/octave. Trop mou pour retirer un excès
 *    d'aigu sans emporter le médium qui porte la netteté — c'est ce qui rendait
 *    le son sifflant quoi qu'on fasse. Trois pôles donnent 18 dB par octave et
 *    laissent la coupure haut placée.
 *
 * 5. UNE BASCULE SPECTRALE.
 *    Pour éclaircir, décaler l'enveloppe vers l'aigu ramène le sifflement, et
 *    transposer les modes ne fait rien du tout : à `partBruit` 0,9 le son est à
 *    90 % du lit, ce sont ses bandes qui portent la tonalité. Une bascule
 *    bornée à 4 kHz relève le médium sans toucher la zone à risque.
 */
const fs = require('fs');
const path = require('path');

const RATE = 44100;

/**
 * Enveloppe spectrale du matériau, en 48 bandes logarithmiques :
 * [fréquence Hz, niveau relatif].
 */
const ENVELOPPE = [
  [126, 0.1038], [137, 0.2466], [150, 0.5419], [164, 0.2969],
  [180, 0.2507], [197, 1.0000], [215, 0.5231], [236, 0.6800],
  [258, 0.4417], [282, 0.1865], [309, 0.2949], [338, 0.0933],
  [369, 0.1864], [404, 0.3093], [442, 0.7659], [484, 0.8075],
  [529, 0.3764], [579, 0.2480], [634, 0.3065], [693, 0.3318],
  [759, 0.2254], [830, 0.1836], [908, 0.5576], [994, 0.3349],
  [1087, 0.2835], [1189, 0.4283], [1301, 0.1647], [1424, 0.1657],
  [1558, 0.2158], [1704, 0.0839], [1865, 0.0580], [2040, 0.0349],
  [2232, 0.0235], [2442, 0.0307], [2672, 0.0140], [2924, 0.0069],
  [3199, 0.0089], [3500, 0.0044], [3829, 0.0033], [4190, 0.0039],
  [4584, 0.0031], [5016, 0.0029], [5488, 0.0027], [6004, 0.0025],
  [6569, 0.0021], [7188, 0.0024], [7864, 0.0012], [8604, 0.0010],
];

const SPEC = {
  duration: 0.127,

  /**
   * [fréquence Hz, amplitude, amortissement 1/s].
   *
   * Relevés sur la référence, puis calés en boucle. Les modes au-dessus de
   * 1100 Hz portent un amortissement multiplié par 2,5 : mesurés tels quels,
   * ils dépassaient leur voisinage de 18 dB de plus que ceux de la référence,
   * et un pic trop pur s'entend comme une note. Amortir élargit le pic.
   */
  modes: [
    [172, 0.275, 40],
    [474, 0.867, 54],
    [603, 0.347, 58],
    [947, 1.0, 80],
    [1077, 0.235, 44],
    [1163, 0.168, 97],
    [1335, 0.548, 197],
    [1550, 0.088, 87],
    [1852, 0.113, 122],
    [1981, 0.067, 110],
    [2153, 0.048, 272],
    [2455, 0.025, 95],
  ],

  /** Excitation : 0 = impulsion (métallique), 1 = bruit seul (mat). */
  excitation: { melange: 0.85, duree: 0.004 },

  /**
   * Fond : queue lente, plus une bosse initiale qui donne la netteté.
   *
   * `accent` est recalé pour ce moteur-ci. Le prototype qui a servi au choix
   * était écrit en Python avec un autre générateur de bruit ; à réglage égal
   * il produisait 88 % d'énergie dans les 6 premières millisecondes contre
   * 71 % ici. Le modèle est le même, le tirage de bruit non — on vise donc la
   * caractéristique mesurée, pas la valeur du paramètre.
   */
  fond: { lente: 55, accent: 7, rapide: 650 },

  /** Contact direct : passe-bande borné en haut, sinon il siffle. */
  contact: { amount: 0.5, bas: 900, haut: 1800, decay: 600 },

  /** Part du lit de bruit dans le mélange. */
  partBruit: 0.9,

  /**
   * Bascule vers l'aigu : exposant, pivot, et borne au-delà de laquelle la
   * pente s'arrête pour ne pas réveiller la zone qui sifflait.
   */
  bascule: { pente: 0.55, pivot: 450, plafond: 4000 },

  /** Passe-bas de sortie : coupure, et nombre de pôles (6 dB/octave chacun). */
  round: 5600,
  ordre: 3,

  attack: 0.0004,
};

/** Bruit déterministe : le fichier produit doit être reproductible. */
function makeNoise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 4294967296) * 2 - 1;
  };
}

/** Coefficient d'un passe-bas à un pôle pour une coupure donnée, en Hz. */
function coeff(hz) {
  return 1 - Math.exp((-2 * Math.PI * hz) / RATE);
}

function passeBas(signal, hz, poles = 1) {
  const a = coeff(hz);
  for (let p = 0; p < poles; p += 1) {
    let etat = 0;
    for (let i = 0; i < signal.length; i += 1) {
      etat += (signal[i] - etat) * a;
      signal[i] = etat;
    }
  }
  return signal;
}

/** Transformée de Fourier sur place, radix-2 : `reel.length` est une puissance de 2. */
function fft(reel, imag, inverse) {
  const n = reel.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [reel[i], reel[j]] = [reel[j], reel[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let pas = 2; pas <= n; pas <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / pas;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let debut = 0; debut < n; debut += pas) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < pas / 2; k += 1) {
        const i1 = debut + k;
        const i2 = i1 + pas / 2;
        const tr = reel[i2] * cr - imag[i2] * ci;
        const ti = reel[i2] * ci + imag[i2] * cr;
        reel[i2] = reel[i1] - tr;
        imag[i2] = imag[i1] - ti;
        reel[i1] += tr;
        imag[i1] += ti;
        const suivant = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = suivant;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i += 1) {
      reel[i] /= n;
      imag[i] /= n;
    }
  }
}

/** Gain de l'enveloppe à une fréquence, interpolé entre les bandes. */
function gainEnveloppe(hz, bascule) {
  const derniere = ENVELOPPE[ENVELOPPE.length - 1];
  if (hz >= derniere[0]) return 0;

  let niveau;
  if (hz <= ENVELOPPE[0][0]) {
    // Sous la première bande, l'énergie s'éteint : un lit qui descend trop bas
    // ajoute une masse sourde que la référence n'a pas.
    niveau = ENVELOPPE[0][1] * 0.05;
  } else {
    let i = 0;
    while (ENVELOPPE[i + 1][0] < hz) i += 1;
    const [f0, n0] = ENVELOPPE[i];
    const [f1, n1] = ENVELOPPE[i + 1];
    niveau = n0 + ((n1 - n0) * (hz - f0)) / (f1 - f0);
  }

  const borne = Math.min(hz, bascule.plafond);
  return niveau * Math.pow(borne / bascule.pivot, bascule.pente);
}

/** Bruit blanc coloré par l'enveloppe, sur une longueur puissance de 2. */
function litDeBruit(taille, bascule, rand) {
  const reel = new Float64Array(taille);
  const imag = new Float64Array(taille);
  for (let i = 0; i < taille; i += 1) reel[i] = rand();

  fft(reel, imag, false);
  for (let i = 0; i <= taille / 2; i += 1) {
    const gain = gainEnveloppe((i * RATE) / taille, bascule);
    reel[i] *= gain;
    imag[i] *= gain;
    if (i > 0 && i < taille / 2) {
      // Symétrie hermitienne : sans elle la transformée inverse rend un signal
      // complexe, dont la partie réelle seule a perdu la moitié du niveau.
      reel[taille - i] = reel[i];
      imag[taille - i] = -imag[i];
    }
  }
  fft(reel, imag, true);
  return reel;
}

/** Filtre à deux pôles : décroît en exp(-decay·t), résonne à `freq`. */
function resonateur(excitation, freq, decay) {
  const r = Math.exp(-decay / RATE);
  const a1 = 2 * r * Math.cos((2 * Math.PI * freq) / RATE);
  const a2 = -(r * r);
  const sortie = new Float64Array(excitation.length);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < excitation.length; i += 1) {
    const y = excitation[i] + a1 * y1 + a2 * y2;
    sortie[i] = y;
    y2 = y1;
    y1 = y;
  }
  return sortie;
}

function normalise(signal) {
  let peak = 0;
  for (const v of signal) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < signal.length; i += 1) signal[i] /= peak;
  return signal;
}

function render(spec) {
  const n = Math.round(RATE * spec.duration);
  const rand = makeNoise(20260904);

  // Excitation commune à tous les résonateurs.
  const burst = new Float64Array(n);
  const longueur = Math.max(1, Math.round(RATE * spec.excitation.duree));
  for (let i = 0; i < longueur; i += 1) {
    burst[i] = rand() * Math.exp((-5 * i) / longueur) * spec.excitation.melange;
  }
  burst[0] += 1 - spec.excitation.melange;

  // Chaque résonateur est normalisé sur son propre pic : le gain d'un
  // deux-pôles dépend de sa fréquence et de son amortissement, viser
  // l'amplitude mesurée demande de neutraliser ça.
  const modal = new Float64Array(n);
  for (const [freq, amp, decay] of spec.modes) {
    const voix = resonateur(burst, freq, decay);
    let sommet = 0;
    for (const v of voix) sommet = Math.max(sommet, Math.abs(v));
    if (sommet > 0) {
      for (let i = 0; i < n; i += 1) modal[i] += (voix[i] / sommet) * amp;
    }
  }
  normalise(modal);

  let taille = 1;
  while (taille < n) taille <<= 1;
  const brut = litDeBruit(taille, spec.bascule, rand);
  const fond = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / RATE;
    fond[i] =
      brut[i] *
      Math.exp(-spec.fond.lente * t) *
      (1 + spec.fond.accent * Math.exp(-spec.fond.rapide * t));
  }
  normalise(fond);

  const out = new Float64Array(n);
  const part = spec.partBruit;
  for (let i = 0; i < n; i += 1) out[i] = modal[i] * (1 - part) + fond[i] * part;

  // Contact direct : passe-bande, une arête brève au-dessus des résonances.
  const blanc = new Float64Array(n);
  for (let i = 0; i < n; i += 1) blanc[i] = rand();
  const bas = passeBas(Float64Array.from(blanc), spec.contact.bas);
  const aigu = new Float64Array(n);
  for (let i = 0; i < n; i += 1) aigu[i] = blanc[i] - bas[i];
  passeBas(aigu, spec.contact.haut);
  for (let i = 0; i < n; i += 1) {
    out[i] +=
      aigu[i] * spec.contact.amount * Math.exp((-spec.contact.decay * i) / RATE);
  }

  passeBas(out, spec.round, spec.ordre);

  // Fondus courts aux deux bouts : sans eux, la troncature claque.
  const montee = Math.max(1, Math.round(RATE * spec.attack));
  for (let i = 0; i < montee; i += 1) out[i] *= i / montee;
  const chute = Math.round(RATE * 0.012);
  for (let i = 0; i < chute; i += 1) out[n - 1 - i] *= i / chute;

  normalise(out);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i += 1) {
    const sample = Math.round(out[i] * 0.94 * 32767);
    data.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2);
  }
  return data;
}

/** En-tête WAV PCM 16 bits mono. */
function wav(data) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const fichier = path.join(__dirname, 'move.wav');
const octets = wav(render(SPEC));
fs.writeFileSync(fichier, octets);
console.log(
  `move.wav : ${octets.length} octets, ${Math.round(SPEC.duration * 1000)} ms`
);
