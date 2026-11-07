/** Milliseconds as m:ss.t, the way a race clock reads. */
export function fmt(ms) {
  const t = Math.max(0, Math.floor(ms / 100));
  return `${Math.floor(t / 600)}:${String(Math.floor(t / 10) % 60).padStart(2, '0')}.${t % 10}`;
}
