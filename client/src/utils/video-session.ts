// Deliberately memory-only: positions expire when this page session ends.
const positions = new Map<string, number>();
export function rememberVideoPosition(key: string, time: number, duration: number, ended: boolean) {
  if (!Number.isFinite(time) || time < 0) return;
  const finished = ended || (Number.isFinite(duration) && duration > 0 && time >= duration - 0.25);
  positions.delete(key);
  positions.set(key, finished ? 0 : time);
  if (positions.size > 200) positions.delete(positions.keys().next().value!);
}
export function videoSessionPosition(key: string) { return positions.get(key) ?? 0; }
