import { Detection } from '../types';

/**
 * Axis-aligned bounding box of a point list, in the same 0-100 normalized space
 * the rest of the app uses.
 */
export function boundingBox(points: [number, number][]): [[number, number], [number, number]] {
  if (!points.length) {
    return [
      [0, 0],
      [0, 0],
    ];
  }
  let minX = points[0][0];
  let minY = points[0][1];
  let maxX = points[0][0];
  let maxY = points[0][1];

  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

/**
 * Converts any detection to a rectangle detection using its true bounding box.
 *
 * FIX: the YOLO view previously just flipped `shape` to 'rect' while leaving the
 * original polygon vertex list in place. The rect renderer reads points[0] and
 * points[1] as opposite corners, so a 7-vertex cell outline was drawn as a
 * meaningless sliver between its first two boundary vertices.
 */
export function asBoundingBoxDetection(det: Detection): Detection {
  if (det.shape === 'rect' && det.points.length >= 2) return det;
  return { ...det, shape: 'rect', points: boundingBox(det.points) };
}

/** Signed polygon area via the shoelace formula (absolute value returned). */
export function polygonAreaNormalized(points: [number, number][]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Closed-path perimeter in normalized units. */
export function polygonPerimeterNormalized(points: [number, number][]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
}

/** Open polyline length, for neurite tracing. */
export function polylineLengthNormalized(points: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

/** ISO circularity: 4*pi*A / P^2, clamped to [0, 1]. */
export function circularity(area: number, perimeter: number): number {
  if (perimeter <= 0) return 0;
  return Math.min(1, (4 * Math.PI * area) / (perimeter * perimeter));
}

/**
 * The four draggable corners of a two-point rectangle, in
 * top-left / top-right / bottom-right / bottom-left order.
 */
export function rectCorners(points: [number, number][]): [number, number][] {
  const minX = Math.min(points[0][0], points[1][0]);
  const maxX = Math.max(points[0][0], points[1][0]);
  const minY = Math.min(points[0][1], points[1][1]);
  const maxY = Math.max(points[0][1], points[1][1]);
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
}

/**
 * Rebuilds the stored [[minX,minY],[maxX,maxY]] pair after a corner has been
 * dragged. The dragged corner and the one diagonally opposite define the box,
 * so dragging past the opposite edge flips it rather than inverting it.
 */
export function rectFromCorner(
  points: [number, number][],
  cornerIndex: number,
  next: [number, number]
): [number, number][] {
  const corners = rectCorners(points);
  const opposite = corners[(cornerIndex + 2) % 4];
  return [
    [Math.min(next[0], opposite[0]), Math.min(next[1], opposite[1])],
    [Math.max(next[0], opposite[0]), Math.max(next[1], opposite[1])],
  ];
}

/** Perpendicular distance from p to segment ab, plus the closest point on it. */
export function projectOntoSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): { distance: number; point: [number, number] } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq));
  const point: [number, number] = [a[0] + t * dx, a[1] + t * dy];
  return { distance: Math.hypot(p[0] - point[0], p[1] - point[1]), point };
}
