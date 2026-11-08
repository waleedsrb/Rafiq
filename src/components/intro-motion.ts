import { MARK_BOUNDARY, ROAD_CONTOUR, ROAD_DISTANCE } from './intro-contours.ts';

export const INTRO_END = 7900;
export const REVEAL_END = 6450;
export const UI_START = 6880;
export const INK_ENVELOPE = 'M42 80Q42 57 65 57L480 57C600 57 679 140 679 245C679 345 602 425 497 437L694 648Q712 672 684 672L60 672Q36 672 42 638Z';
export const ROAD_CUTOUT = 'M-1000 1000C-500 800 110 410 262 393C322 386 376 395 384 422C392 452 322 482 323 520C324 565 400 610 436 672L1800 5000L218 5000L218 672C212 560 268 482 330 442Q333 428 304 434C180 470 78 556 42 638C-300 900 -500 1000 -1000 1200Z';

export function progress(time: number, start: number, end: number) {
  'worklet';
  const x = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function roadDrawing(time: number) {
  'worklet';
  if (time <= 350) return '';
  if (time >= 3950) return ROAD_CUTOUT;
  const target = progress(time, 350, 3950) * ROAD_DISTANCE;
  let index = 1;
  while (index < ROAD_CONTOUR.length - 1 && ROAD_CONTOUR[index][4] < target) index++;
  const a = ROAD_CONTOUR[index - 1];
  const b = ROAD_CONTOUR[index];
  const f = Math.max(0, Math.min(1, (target - a[4]) / (b[4] - a[4] || 1)));
  let d = `M${ROAD_CONTOUR[0][0]},${ROAD_CONTOUR[0][1]}`;
  for (let i = 1; i < index; i++) d += `L${ROAD_CONTOUR[i][0]},${ROAD_CONTOUR[i][1]}`;
  d += `L${a[0] + (b[0] - a[0]) * f},${a[1] + (b[1] - a[1]) * f}`;
  d += `L${a[2] + (b[2] - a[2]) * f},${a[3] + (b[3] - a[3]) * f}`;
  for (let i = index - 1; i >= 0; i--) d += `L${ROAD_CONTOUR[i][2]},${ROAD_CONTOUR[i][3]}`;
  return d + 'Z';
}

export function expandedInk(time: number) {
  'worklet';
  const radius = 640 * (1 - progress(time, 4600, 6320));
  let d = INK_ENVELOPE;
  // Union of filled disks avoids the self-intersections of a very thick stroke.
  if (radius > 0.01) {
    for (const [x, y] of MARK_BOUNDARY) {
      d += `M${x + radius},${y}a${radius},${radius} 0 1 1 ${-2 * radius},0a${radius},${radius} 0 1 1 ${2 * radius},0Z`;
    }
  }
  return d;
}

export function sceneTransform(time: number, centerY: number) {
  'worklet';
  const p = progress(time, 4200, 6420);
  const scale = Math.exp(Math.log(2.5) + (Math.log(0.225) - Math.log(2.5)) * p);
  return { scale, x: 180 - (315 + 62 * p) * scale, y: centerY - (505 - 140.5 * p) * scale };
}
