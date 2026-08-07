/**
 * Sound effects, synthesised with WebAudio.
 *
 * No audio files: they would be the largest thing in the bundle, and a handful
 * of short blips is exactly what an oscillator is good at. Everything is built
 * from a tone with an exponential decay, which is enough for taps, reveals and
 * a two-note win/lose sting.
 *
 * The context is created lazily on the first user gesture — mobile browsers
 * refuse to start one otherwise.
 */

export type SoundName = 'tap' | 'pick' | 'reveal' | 'clash' | 'win' | 'hurt' | 'lose' | 'emote';

const STORAGE_KEY = 'delezh.sound';

let ctx: AudioContext | null = null;
let enabled = readEnabled();

function readEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_KEY) !== 'off';
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  window.localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
  if (value) void ensureContext()?.resume();
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

interface Tone {
  freq: number;
  /** Seconds. */
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Frequency to glide to over the tone's life. */
  glideTo?: number;
  /** Seconds to wait before starting. */
  delay?: number;
}

const SOUNDS: Record<SoundName, Tone[]> = {
  tap: [{ freq: 520, duration: 0.05, type: 'triangle', gain: 0.1 }],
  pick: [
    { freq: 420, duration: 0.07, type: 'square', gain: 0.09 },
    { freq: 700, duration: 0.1, type: 'triangle', gain: 0.1, delay: 0.05 },
  ],
  reveal: [{ freq: 330, duration: 0.09, type: 'triangle', gain: 0.1, glideTo: 520 }],
  clash: [
    { freq: 160, duration: 0.16, type: 'sawtooth', gain: 0.12, glideTo: 90 },
    { freq: 240, duration: 0.12, type: 'square', gain: 0.06 },
  ],
  win: [
    { freq: 523, duration: 0.11, type: 'triangle', gain: 0.12 },
    { freq: 784, duration: 0.2, type: 'triangle', gain: 0.12, delay: 0.1 },
  ],
  hurt: [{ freq: 200, duration: 0.18, type: 'sawtooth', gain: 0.11, glideTo: 110 }],
  lose: [
    { freq: 300, duration: 0.16, type: 'sawtooth', gain: 0.1 },
    { freq: 180, duration: 0.3, type: 'sawtooth', gain: 0.1, delay: 0.14 },
  ],
  emote: [{ freq: 880, duration: 0.06, type: 'sine', gain: 0.08, glideTo: 1180 }],
};

export function playSound(name: SoundName): void {
  if (!enabled) return;
  const audio = ensureContext();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();

  const now = audio.currentTime;
  for (const tone of SOUNDS[name]) {
    const start = now + (tone.delay ?? 0);
    const osc = audio.createOscillator();
    const gain = audio.createGain();

    osc.type = tone.type ?? 'sine';
    osc.frequency.setValueAtTime(tone.freq, start);
    if (tone.glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, tone.glideTo), start + tone.duration);
    }

    const peak = tone.gain ?? 0.1;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);

    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + tone.duration + 0.02);
  }
}

const HAPTICS_KEY = 'delezh.haptics';

export function isHapticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(HAPTICS_KEY) !== 'off';
}

export function setHapticsEnabled(value: boolean): void {
  window.localStorage.setItem(HAPTICS_KEY, value ? 'on' : 'off');
}

/** Short vibration where supported. Silently does nothing on iOS Safari. */
export function haptic(pattern: number | number[] = 12): void {
  if (!isHapticsEnabled()) return;
  navigator.vibrate?.(pattern);
}
