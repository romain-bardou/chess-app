/**
 * Bruitage du coup joué : une pièce qui claque sur le plateau.
 *
 * Un seul lecteur, créé à la première utilisation et gardé ouvert : rejouer
 * revient à revenir au début, ce qui évite le temps de chargement audible sur
 * les coups rapides. L'échantillon est court assez pour ne pas traîner d'un
 * coup à l'autre.
 *
 * Le son est un agrément : toute panne côté audio est avalée, elle ne doit
 * jamais empêcher de jouer.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const MOVE_SOURCE = require('@/assets/sounds/move.wav');

let player: AudioPlayer | null = null;
let unavailable = false;

function ensurePlayer(): AudioPlayer | null {
  if (unavailable) return null;
  if (player) return player;
  try {
    // Le mode silencieux d'iOS coupe la lecture par défaut ; un retour de
    // manipulation doit s'entendre comme les autres sons d'interface.
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    }).catch(() => undefined);
    player = createAudioPlayer(MOVE_SOURCE);
    player.volume = 0.85;
  } catch {
    unavailable = true;
    player = null;
  }
  return player;
}

/** Joue le bruit d'un coup posé sur l'échiquier. */
export function playMoveSound(): void {
  const current = ensurePlayer();
  if (!current) return;
  try {
    current.seekTo(0).catch(() => undefined);
    current.play();
  } catch {
    // Lecteur libéré sous nos pieds : on le recréera au prochain coup.
    player = null;
  }
}
