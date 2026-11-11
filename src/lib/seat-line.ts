/**
 * Seat holds (Nov 11): asking for a seat holds it, and when every seat is held new
 * riders wait in a short line. The numbers come from trip_seat_counts, which the
 * database keeps up to date and sends live.
 */
export type SeatCounts = {
  confirmed: number; // seats the driver accepted
  waiting: number; // seats held by riders waiting for the driver's answer
  in_line: number; // riders in line (all seats held)
  line_room: number; // places left in the line
};

export type SeatKind = 'confirmed' | 'waiting' | 'free';

export type SeatView = {
  free: number;
  /** One entry per seat, confirmed first, then waiting, then free. */
  seats: SeatKind[];
  /** What a rider without a booking can do: ask (a seat is free), join the line, or nothing. */
  action: 'ask' | 'line' | 'full';
};

export function seatView(total: number, c: SeatCounts | null): SeatView {
  const confirmed = Math.min(Math.max(c?.confirmed ?? 0, 0), total);
  const waiting = Math.min(Math.max(c?.waiting ?? 0, 0), total - confirmed);
  const free = total - confirmed - waiting;
  const seats: SeatKind[] = [
    ...Array<SeatKind>(confirmed).fill('confirmed'),
    ...Array<SeatKind>(waiting).fill('waiting'),
    ...Array<SeatKind>(free).fill('free'),
  ];
  const action = free > 0 ? 'ask' : (c?.line_room ?? 0) > 0 ? 'line' : 'full';
  return { free, seats, action };
}
