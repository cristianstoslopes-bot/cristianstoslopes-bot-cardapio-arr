"use client";

/**
 * Alerta sonoro sintetizado com Web Audio (sem arquivo de áudio).
 * Navegadores só liberam áudio após interação do usuário: chame `unlockAudio()`
 * em um clique (ex.: botão "Ativar som" no painel de pedidos).
 */
let ctx: AudioContext | null = null;

export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx.state !== "closed";
}

export function isAudioUnlocked() {
  return ctx?.state === "running";
}

export function playNewOrderSound() {
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  // Ding-dong em duas notas (E6 → C6), repetido 2x
  [0, 0.5].forEach((offset) => {
    [1318.5, 1046.5].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + offset + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  });
}
