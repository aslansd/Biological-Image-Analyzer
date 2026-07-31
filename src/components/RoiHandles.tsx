import { MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import { Detection } from '../types';
import { rectCorners, rectFromCorner, projectOntoSegment } from '../utils/geometry';

type Point = [number, number];

interface RoiHandlesProps {
  detection: Detection;
  /** Display size of the image, in CSS pixels. */
  width: number;
  height: number;
  /** Inverse zoom, so handles stay a constant on-screen size. */
  scale: number;
  /** Converts a viewport coordinate into the 0-100 normalized space. */
  clientToNormalized: (clientX: number, clientY: number) => Point | null;
  /** Called once when a gesture begins, so the parent can snapshot for undo. */
  onEditBegin: () => void;
  onPointsChange: (id: string, points: Point[]) => void;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

export default function RoiHandles({
  detection,
  width,
  height,
  scale,
  clientToNormalized,
  onEditBegin,
  onPointsChange,
}: RoiHandlesProps) {
  const [drag, setDrag] = useState<
    | { kind: 'vertex'; index: number }
    | { kind: 'move'; origin: Point; startPoints: Point[] }
    | null
  >(null);

  // Held in a ref so the window listener always sees current geometry without
  // being torn down and re-attached on every pointer move.
  const latest = useRef({ detection, drag, clientToNormalized, onPointsChange });
  latest.current = { detection, drag, clientToNormalized, onPointsChange };

  const isRect = detection.shape === 'rect' && detection.points.length >= 2;
  const handlePoints = isRect ? rectCorners(detection.points) : detection.points;

  const toDisplay = (p: Point): Point => [(p[0] / 100) * width, (p[1] / 100) * height];

  const centroid: Point = handlePoints.length
    ? [
        handlePoints.reduce((sum, p) => sum + p[0], 0) / handlePoints.length,
        handlePoints.reduce((sum, p) => sum + p[1], 0) / handlePoints.length,
      ]
    : [50, 50];

  useEffect(() => {
    if (!drag) return;

    const move = (e: globalThis.MouseEvent) => {
      const ctx = latest.current;
      const current = ctx.clientToNormalized(e.clientX, e.clientY);
      if (!current || !ctx.drag) return;

      const det = ctx.detection;
      const next: Point = [clamp(current[0]), clamp(current[1])];

      if (ctx.drag.kind === 'vertex') {
        if (det.shape === 'rect' && det.points.length >= 2) {
          ctx.onPointsChange(det.id, rectFromCorner(det.points, ctx.drag.index, next));
        } else {
          const updated = det.points.map((p) => [...p] as Point);
          updated[ctx.drag.index] = next;
          ctx.onPointsChange(det.id, updated);
        }
        return;
      }

      // Whole-ROI translation, clamped so no vertex leaves the frame.
      const dx = current[0] - ctx.drag.origin[0];
      const dy = current[1] - ctx.drag.origin[1];
      const start = ctx.drag.startPoints;

      const minX = Math.min(...start.map((p) => p[0]));
      const maxX = Math.max(...start.map((p) => p[0]));
      const minY = Math.min(...start.map((p) => p[1]));
      const maxY = Math.max(...start.map((p) => p[1]));

      const boundedDx = Math.max(-minX, Math.min(100 - maxX, dx));
      const boundedDy = Math.max(-minY, Math.min(100 - maxY, dy));

      ctx.onPointsChange(
        det.id,
        start.map(([x, y]) => [x + boundedDx, y + boundedDy] as Point)
      );
    };

    const up = () => setDrag(null);

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [drag]);

  const startVertexDrag = (e: ReactMouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();

    // Alt-click removes a vertex, as long as a polygon stays a polygon.
    if (e.altKey && !isRect && detection.points.length > 3) {
      onEditBegin();
      onPointsChange(
        detection.id,
        detection.points.filter((_, i) => i !== index)
      );
      return;
    }

    onEditBegin();
    setDrag({ kind: 'vertex', index });
  };

  const startMoveDrag = (e: ReactMouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const origin = clientToNormalized(e.clientX, e.clientY);
    if (!origin) return;
    onEditBegin();
    setDrag({ kind: 'move', origin, startPoints: detection.points.map((p) => [...p] as Point) });
  };

  /** Double-clicking an edge inserts a vertex at the nearest point on it. */
  const insertVertex = (e: ReactMouseEvent) => {
    if (isRect || detection.shape === 'line') return;
    e.stopPropagation();
    const click = clientToNormalized(e.clientX, e.clientY);
    if (!click) return;

    let bestIndex = -1;
    let bestDistance = Infinity;
    let bestPoint: Point = click;

    for (let i = 0; i < detection.points.length; i++) {
      const a = detection.points[i];
      const b = detection.points[(i + 1) % detection.points.length];
      const { distance, point } = projectOntoSegment(click, a, b);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
        bestPoint = point;
      }
    }

    if (bestIndex < 0 || bestDistance > 4) return;

    onEditBegin();
    const updated = detection.points.slice();
    updated.splice(bestIndex + 1, 0, bestPoint);
    onPointsChange(detection.id, updated);
  };

  const [cx, cy] = toDisplay(centroid);
  const handleRadius = 4.5 * scale;

  return (
    <g>
      {/* Edge hit-strip for double-click vertex insertion */}
      {!isRect && detection.shape !== 'line' && (
        <polygon
          points={detection.points.map((p) => toDisplay(p).join(',')).join(' ')}
          fill="none"
          stroke="transparent"
          strokeWidth={8 * scale}
          onDoubleClick={insertVertex}
          style={{ cursor: 'copy' }}
        />
      )}

      {/* Move grip at the centroid */}
      <g onMouseDown={startMoveDrag} style={{ cursor: drag?.kind === 'move' ? 'grabbing' : 'move' }}>
        <circle cx={cx} cy={cy} r={7 * scale} fill="rgba(9,9,11,0.8)" stroke="#ffffff" strokeWidth={1.2 * scale} />
        <path
          d={`M ${cx - 3.5 * scale} ${cy} H ${cx + 3.5 * scale} M ${cx} ${cy - 3.5 * scale} V ${cy + 3.5 * scale}`}
          stroke="#ffffff"
          strokeWidth={1.2 * scale}
          strokeLinecap="round"
        />
      </g>

      {/* Vertex / corner handles */}
      {handlePoints.map((point, index) => {
        const [hx, hy] = toDisplay(point);
        const isActive = drag?.kind === 'vertex' && drag.index === index;
        return (
          <rect
            key={index}
            x={hx - handleRadius}
            y={hy - handleRadius}
            width={handleRadius * 2}
            height={handleRadius * 2}
            rx={1.5 * scale}
            fill={isActive ? '#22d3ee' : '#ffffff'}
            stroke="#09090b"
            strokeWidth={1.2 * scale}
            onMouseDown={(e) => startVertexDrag(e, index)}
            style={{ cursor: 'crosshair' }}
          />
        );
      })}
    </g>
  );
}
