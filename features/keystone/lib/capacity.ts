/**
 * Seats a show can sell: the smaller of the show's own cap and its room's cap. A show with no room
 * (legacy or hand-made data) is limited by its own cap alone, so capacity maths never throws.
 */
export function showCapacity(show: { capacity?: number | null; room?: { capacity?: number | null } | null }): number {
  const caps = [show.capacity, show.room?.capacity].filter((n): n is number => Number.isFinite(n as number) && (n as number) >= 0);
  return caps.length ? Math.min(...caps) : 0;
}
