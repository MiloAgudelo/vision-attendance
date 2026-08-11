/** Arranca el refresco periódico de la sesión en vivo (3–5 s). */
export function startLivePolling(refresh: () => void, intervalMs = 4000): () => void {
  const interval = Math.min(Math.max(intervalMs, 3000), 5000);
  const timer = setInterval(refresh, interval);
  return () => clearInterval(timer);
}
