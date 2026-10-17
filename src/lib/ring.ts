import type { Tone } from "@/lib/markets";

let ctx: AudioContext | null = null;
let activeStop: (() => void) | null = null;
let master: GainNode | null = null;
let wakeLock: WakeLockSentinel | null = null;

function context(): AudioContext {
  if (!ctx) {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) throw new Error("Audio isn't available in this browser.");
    ctx = new Ctx();
  }
  return ctx;
}

export async function unlockAudio(): Promise<boolean> {
  try {
    const audio = context();
    if (audio.state === "suspended") await audio.resume();
    return audio.state === "running";
  } catch {
    return false;
  }
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 0.8;
  return Math.min(1, Math.max(0.05, volume));
}

function tone(
  audio: AudioContext,
  dest: AudioNode,
  freq: number,
  start: number,
  duration: number,
  gain: number,
  type: OscillatorType = "sine",
) {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0001), start + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp);
  amp.connect(dest);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function playPhone(audio: AudioContext, dest: AudioNode, t: number) {
  const notes = [659.25, 783.99, 659.25, 987.77, 783.99, 659.25];
  notes.forEach((freq, index) => {
    tone(audio, dest, freq, t + index * 0.16, 0.22, 0.22);
    tone(audio, dest, freq / 2, t + index * 0.16, 0.22, 0.05);
  });
}

function playBell(audio: AudioContext, dest: AudioNode, t: number) {
  tone(audio, dest, 880, t, 0.7, 0.24);
  tone(audio, dest, 1320, t, 0.4, 0.08);
  tone(audio, dest, 660, t + 0.45, 0.8, 0.16);
}

function playSiren(audio: AudioContext, dest: AudioNode, t: number) {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(440, t);
  osc.frequency.linearRampToValueAtTime(880, t + 0.35);
  osc.frequency.linearRampToValueAtTime(440, t + 0.7);
  osc.frequency.linearRampToValueAtTime(880, t + 1.02);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
  osc.connect(amp);
  amp.connect(dest);
  osc.start(t);
  osc.stop(t + 1.08);
}

export function startRingtone(kind: Tone, volume: number): () => void {
  activeStop?.();
  const audio = context();
  const gain = audio.createGain();
  gain.gain.value = clampVolume(volume);
  gain.connect(audio.destination);
  master = gain;
  let stopped = false;
  let timer = 0;

  const loop = () => {
    if (stopped) return;
    const t = audio.currentTime + 0.03;
    if (kind === "phone") playPhone(audio, gain, t);
    else if (kind === "bell") playBell(audio, gain, t);
    else playSiren(audio, gain, t);
    const wait = kind === "siren" ? 1200 : kind === "bell" ? 1700 : 1500;
    timer = window.setTimeout(loop, wait);
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    const now = audio.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, 0.03);
    window.setTimeout(() => {
      gain.disconnect();
      if (master === gain) master = null;
    }, 180);
    if (activeStop === stop) activeStop = null;
  };

  activeStop = stop;
  loop();
  return stop;
}

let customAudio: HTMLAudioElement | null = null;

/**
 * Loop a user-imported sound (data URL from an <input type="file">).
 * Returns a stop function with the same contract as startRingtone.
 */
export function startCustomRingtone(dataUrl: string, volume: number): () => void {
  activeStop?.();
  const audio = new Audio(dataUrl);
  audio.loop = true;
  audio.volume = clampVolume(volume);
  customAudio = audio;
  void audio.play().catch(() => {
    /* autoplay blocked — the on-screen alarm still fires */
  });
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    audio.pause();
    audio.removeAttribute("src");
    if (customAudio === audio) customAudio = null;
    if (activeStop === stop) activeStop = null;
  };
  activeStop = stop;
  return stop;
}

export function setRingVolume(volume: number) {
  if (customAudio) customAudio.volume = clampVolume(volume);
  if (!master || !ctx) return;
  master.gain.setTargetAtTime(clampVolume(volume), ctx.currentTime, 0.02);
}

export function stopRingtone() {
  activeStop?.();
}

export async function holdAwake(on: boolean) {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  try {
    if (on) {
      if (wakeLock && !wakeLock.released) return;
      wakeLock = await navigator.wakeLock.request("screen");
      return;
    }
    await wakeLock?.release();
    wakeLock = null;
  } catch {
    wakeLock = null;
  }
}
