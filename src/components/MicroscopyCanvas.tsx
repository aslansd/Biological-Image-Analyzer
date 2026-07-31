import { MouseEvent as ReactMouseEvent, WheelEvent, useState, useRef, useEffect, useCallback } from 'react';
import { Detection, DetectionCategory, MLModelType } from '../types';
import { Trash2, Crosshair, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Calibration, calibrationFromScaleBar } from '../utils/calibration';
import RoiHandles from './RoiHandles';

export type InteractiveTool = 'select' | 'sam' | 'add-box' | 'add-point' | 'calibrate';

interface MicroscopyCanvasProps {
  imageUrl: string;
  category: DetectionCategory;
  modelType: MLModelType;
  detections: Detection[];
  selectedDetectionId: string | null;
  onSelectDetection: (id: string | null) => void;
  onAddDetection: (newDet: Detection) => void;
  onDeleteDetection: (id: string) => void;
  showOriginal: boolean;
  showOverlays: boolean;
  showHeatmap: boolean;
  interactiveTool: InteractiveTool;
  /** Natural pixel dimensions of the decoded image, for calibration maths. */
  imageWidthPx: number;
  imageHeightPx: number;
  micronsPerPixel: number | null;
  onCalibrate: (calibration: Calibration) => void;
  /** Snapshot hook for undo, fired once at the start of each edit gesture. */
  onEditBegin: () => void;
  onDetectionPointsChange: (id: string, points: [number, number][]) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 12;

/** Picks a 1/2/5 x 10^n scale-bar length spanning roughly a fifth of the frame. */
function niceScaleBarMicrons(targetMicrons: number): number {
  if (!isFinite(targetMicrons) || targetMicrons <= 0) return 1;
  const exponent = Math.floor(Math.log10(targetMicrons));
  const base = 10 ** exponent;
  const normalized = targetMicrons / base;
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return step * base;
}

function formatScaleBarLabel(microns: number): string {
  if (microns >= 1000) return `${+(microns / 1000).toFixed(2)} mm`;
  if (microns < 1) return `${+(microns * 1000).toFixed(0)} nm`;
  return `${+microns.toFixed(microns < 10 ? 1 : 0)} µm`;
}

export default function MicroscopyCanvas({
  imageUrl,
  category,
  detections,
  selectedDetectionId,
  onSelectDetection,
  onAddDetection,
  onDeleteDetection,
  showOriginal,
  showOverlays,
  showHeatmap,
  interactiveTool,
  imageWidthPx,
  imageHeightPx,
  micronsPerPixel,
  onCalibrate,
  onEditBegin,
  onDetectionPointsChange,
}: MicroscopyCanvasProps) {
  const [hoveredDetId, setHoveredDetId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // View transform. Zoom and pan are essential here: a 400 px-wide preview of a
  // 1600 px capture cannot show a nucleus boundary well enough to judge whether
  // a segmentation is right, which is the whole premise of a correction loop.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  // Scale-bar calibration drag, in normalized 0-100 coordinates.
  const [calLine, setCalLine] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [calDragging, setCalDragging] = useState(false);
  const [calInput, setCalInput] = useState<{ value: string; unit: 'nm' | 'µm' | 'mm' }>({ value: '', unit: 'µm' });

  const measureDisplay = useCallback(() => {
    const img = containerRef.current?.querySelector('img');
    if (img) setDimensions({ width: img.clientWidth, height: img.clientHeight });
  }, []);

  useEffect(() => {
    const observer = new ResizeObserver(measureDisplay);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', measureDisplay);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measureDisplay);
    };
  }, [measureDisplay]);

  // Reset the view whenever the subject changes.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCalLine(null);
  }, [imageUrl]);

  useEffect(() => {
    if (interactiveTool !== 'calibrate') setCalLine(null);
  }, [interactiveTool]);

  /** Viewport point -> normalized 0-100, for children that lack the event target. */
  const clientToNormalized = useCallback((clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return [((clientX - rect.left) / rect.width) * 100, ((clientY - rect.top) / rect.height) * 100];
  }, []);

  const toNormalized = (e: { clientX: number; clientY: number }, target: SVGSVGElement) => {
    // getBoundingClientRect already reflects the CSS transform, so this stays
    // correct at any zoom or pan without inverting the matrix by hand.
    const rect = target.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  };

  const clampPan = useCallback(
    (next: { x: number; y: number }, z: number) => {
      const maxX = (dimensions.width * (z - 1)) / 2;
      const maxY = (dimensions.height * (z - 1)) / 2;
      return {
        x: Math.max(-maxX, Math.min(maxX, next.x)),
        y: Math.max(-maxY, Math.min(maxY, next.y)),
      };
    },
    [dimensions]
  );

  const applyZoom = useCallback(
    (nextZoom: number) => {
      const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
      setZoom(z);
      setPan((prev) => clampPan(z === 1 ? { x: 0, y: 0 } : prev, z));
    },
    [clampPan]
  );

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) < 1) return;
    applyZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
  };

  const beginPan = (e: ReactMouseEvent) => {
    if (zoom === 1) return;
    panState.current = { startX: e.clientX, startY: e.clientY, originX: pan.x, originY: pan.y };
    setIsPanning(true);
  };

  useEffect(() => {
    if (!isPanning) return;
    const move = (e: globalThis.MouseEvent) => {
      const state = panState.current;
      if (!state) return;
      setPan(
        clampPan(
          { x: state.originX + (e.clientX - state.startX), y: state.originY + (e.clientY - state.startY) },
          zoom
        )
      );
    };
    const up = () => {
      panState.current = null;
      setIsPanning(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [isPanning, zoom, clampPan]);

  // ---- interaction on the overlay layer ---------------------------------

  const typeForCategory = (): Detection['type'] =>
    category === 'cells'
      ? 'cell'
      : category === 'neurons'
        ? 'soma'
        : category === 'histology'
          ? 'nucleus'
          : category === 'bacteria'
            ? 'colony'
            : 'stomata';

  const labelForCategory = () =>
    category === 'cells'
      ? 'Cell'
      : category === 'neurons'
        ? 'Soma'
        : category === 'histology'
          ? 'Nucleus'
          : category === 'bacteria'
            ? 'Colony'
            : 'Stomata';

  const handleSvgMouseDown = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (interactiveTool === 'calibrate') {
      const { x, y } = toNormalized(e, e.currentTarget);
      setCalLine({ x1: x, y1: y, x2: x, y2: y });
      setCalDragging(true);
      setCalInput({ value: '', unit: 'µm' });
      e.preventDefault();
      return;
    }
    if (interactiveTool === 'select') beginPan(e);
  };

  const handleSvgMouseMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!calDragging || !calLine) return;
    const { x, y } = toNormalized(e, e.currentTarget);
    setCalLine({ ...calLine, x2: x, y2: y });
  };

  const handleSvgMouseUp = () => {
    if (calDragging) setCalDragging(false);
  };

  const handleCanvasClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (interactiveTool === 'calibrate') return;

    const { x: clickX, y: clickY } = toNormalized(e, e.currentTarget);

    if (interactiveTool === 'sam') {
      const radius = 5;
      const newSamDetection: Detection = {
        id: `sam-det-${Date.now()}`,
        type: typeForCategory(),
        shape: 'polygon',
        points: [
          [clickX - radius, clickY],
          [clickX - radius / 2, clickY - radius],
          [clickX + radius / 2, clickY - radius],
          [clickX + radius, clickY],
          [clickX + radius / 2, clickY + radius],
          [clickX - radius / 2, clickY + radius],
        ],
        confidence: 0.98,
        label: `SAM ${labelForCategory()}`,
        color: '#f59e0b',
        // Attributes are deliberately left empty. The measurement pass fills in
        // real area, perimeter and intensity from pixels; seeding them with
        // random numbers here is exactly what made the old output untrustworthy.
        attributes: { status: 'healthy' },
        explanation:
          'Placed by click segmentation. Morphometry and intensity below are measured from the enclosed pixels.',
      };
      onAddDetection(newSamDetection);
      onSelectDetection(newSamDetection.id);
      return;
    }

    if (interactiveTool === 'add-point' || interactiveTool === 'add-box') {
      const isBox = interactiveTool === 'add-box';
      const newManualDet: Detection = {
        id: `manual-det-${Date.now()}`,
        type: typeForCategory(),
        shape: isBox ? 'rect' : 'polygon',
        points: isBox
          ? [
              [clickX - 4, clickY - 4],
              [clickX + 4, clickY + 4],
            ]
          : [
              [clickX - 3, clickY],
              [clickX - 1.5, clickY - 3],
              [clickX + 1.5, clickY - 3],
              [clickX + 3, clickY],
              [clickX + 1.5, clickY + 3],
              [clickX - 1.5, clickY + 3],
            ],
        confidence: 1.0,
        label: `User ROI (${isBox ? 'box' : 'polygon'})`,
        color: '#3b82f6',
        attributes: { status: 'healthy' },
        explanation: 'Manually placed. All quantities are measured from the enclosed pixels.',
      };
      onAddDetection(newManualDet);
      onSelectDetection(newManualDet.id);
      return;
    }

    if (!isPanning) onSelectDetection(null);
  };

  // ---- derived render values --------------------------------------------

  const getSvgPoints = (points: [number, number][]) =>
    points.map(([x, y]) => `${(x / 100) * dimensions.width},${(y / 100) * dimensions.height}`).join(' ');

  const selectedDet = detections.find((d) => d.id === selectedDetectionId);

  const heatmapCenter = (() => {
    if (!selectedDet || !selectedDet.points.length) return null;
    const sum = selectedDet.points.reduce((acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }), { x: 0, y: 0 });
    const n = selectedDet.points.length;
    return {
      x: (sum.x / n / 100) * dimensions.width,
      y: (sum.y / n / 100) * dimensions.height,
    };
  })();

  // Scale bar geometry, in display pixels.
  const scaleBar = (() => {
    if (!micronsPerPixel || !dimensions.width || !imageWidthPx) return null;
    const displayPerImagePx = (dimensions.width / imageWidthPx) * zoom;
    const targetMicrons = ((dimensions.width * 0.22) / displayPerImagePx) * micronsPerPixel;
    const barMicrons = niceScaleBarMicrons(targetMicrons);
    const barDisplayPx = ((barMicrons / micronsPerPixel) * displayPerImagePx) / zoom;
    if (!isFinite(barDisplayPx) || barDisplayPx <= 4 || barDisplayPx > dimensions.width * 0.8) return null;
    return { widthPx: barDisplayPx, label: formatScaleBarLabel(barMicrons) };
  })();

  const calPixelLength = (() => {
    if (!calLine || !imageWidthPx || !imageHeightPx) return 0;
    const dx = ((calLine.x2 - calLine.x1) / 100) * imageWidthPx;
    const dy = ((calLine.y2 - calLine.y1) / 100) * imageHeightPx;
    return Math.hypot(dx, dy);
  })();

  const commitCalibration = () => {
    const physical = parseFloat(calInput.value);
    const cal = calibrationFromScaleBar(calPixelLength, physical, calInput.unit);
    if (cal) {
      onCalibrate(cal);
      setCalLine(null);
    }
  };

  const s = 1 / zoom; // keeps stroke weights and labels visually constant

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl relative h-full">
      {/* Status header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-2.5 flex items-center justify-between z-10 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shrink-0" />
          <span className="text-[11px] font-mono text-zinc-300 font-semibold uppercase tracking-wider truncate">
            Microscope Console View
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-[10px] text-zinc-400 font-mono hidden lg:flex items-center gap-1.5 bg-zinc-950/60 px-3 py-1 rounded border border-zinc-800">
            <Crosshair className="w-3 h-3 text-emerald-400" />
            {interactiveTool === 'sam' && 'SAM: click a structure to segment'}
            {interactiveTool === 'add-box' && 'Click to place a box ROI'}
            {interactiveTool === 'add-point' && 'Click to place a polygon ROI'}
            {interactiveTool === 'calibrate' && 'Drag across a known distance'}
            {interactiveTool === 'select' &&
              (selectedDet
                ? 'Drag handles to reshape · double-click an edge to add · alt-click to remove'
                : zoom > 1
                  ? 'Drag to pan · scroll to zoom'
                  : 'Click objects · scroll to zoom')}
          </div>

          <div className="flex items-center gap-0.5 bg-zinc-950/60 rounded border border-zinc-800 p-0.5">
            <button
              onClick={() => applyZoom(zoom / 1.4)}
              disabled={zoom <= MIN_ZOOM}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 transition cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[9px] font-mono text-zinc-400 w-9 text-center tabular-nums">{zoom.toFixed(1)}×</span>
            <button
              onClick={() => applyZoom(zoom * 1.4)}
              disabled={zoom >= MAX_ZOOM}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-30 transition cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
              title="Fit to view"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        className="flex-1 flex items-center justify-center relative bg-black/90 p-4 select-none overflow-hidden"
        style={{ minHeight: '380px' }}
      >
        <div
          className="relative border border-zinc-800/60 rounded overflow-hidden shadow-xl max-w-full max-h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: isPanning || calDragging ? 'none' : 'transform 120ms ease-out',
            cursor:
              interactiveTool === 'calibrate' ? 'crosshair' : isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
          }}
        >
          <img
            src={imageUrl}
            alt="Microscopy subject"
            onLoad={measureDisplay}
            referrerPolicy="no-referrer"
            draggable={false}
            className={`max-w-full max-h-[65vh] object-contain block ${
              showOriginal ? 'filter-none' : 'brightness-[0.85] contrast-[1.1]'
            }`}
          />

          {showHeatmap && heatmapCenter && (
            <svg
              className="absolute inset-0 pointer-events-none mix-blend-color-dodge"
              style={{ width: dimensions.width, height: dimensions.height }}
            >
              <defs>
                <radialGradient id="gradCam" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.85" />
                  <stop offset="40%" stopColor="#f97316" stopOpacity="0.5" />
                  <stop offset="70%" stopColor="#eab308" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle
                cx={heatmapCenter.x}
                cy={heatmapCenter.y}
                r={Math.max(dimensions.width * 0.15, 80) * s}
                fill="url(#gradCam)"
                className="animate-pulse"
              />
            </svg>
          )}

          {dimensions.width > 0 && (
            <svg
              ref={svgRef}
              onClick={handleCanvasClick}
              onMouseDown={handleSvgMouseDown}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
              className="absolute inset-0"
              style={{ width: dimensions.width, height: dimensions.height }}
            >
              {showOverlays &&
                detections.map((det) => {
                  if (!det.points.length) return null;
                  const isSelected = selectedDetectionId === det.id;
                  const isHovered = hoveredDetId === det.id;
                  const strokeColor = det.color || '#10b981';
                  const stroke = isSelected ? '#ffffff' : isHovered ? '#38bdf8' : strokeColor;
                  const fill = isSelected
                    ? `${strokeColor}2b`
                    : isHovered
                      ? 'rgba(56, 189, 248, 0.15)'
                      : `${strokeColor}10`;
                  const width = (isSelected ? 2.5 : isHovered ? 2 : 1.5) * s;
                  const dashed = det.id.startsWith('manual') || det.id.startsWith('sam-det');

                  const anchorX = (det.points[0][0] / 100) * dimensions.width;
                  const anchorY = (det.points[0][1] / 100) * dimensions.height;
                  const labelText = `${det.label} (${Math.round(det.confidence * 100)}%)`;
                  const labelX = Math.max(1, Math.min(anchorX, dimensions.width - (labelText.length * 5.4 + 8) * s));
                  const labelY = Math.max(1, anchorY - 18 * s);

                  return (
                    <g
                      key={det.id}
                      onMouseEnter={() => setHoveredDetId(det.id)}
                      onMouseLeave={() => setHoveredDetId(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDetection(det.id);
                      }}
                      className="cursor-pointer"
                    >
                      {det.shape === 'polygon' && (
                        <polygon
                          points={getSvgPoints(det.points)}
                          stroke={stroke}
                          strokeWidth={width}
                          fill={fill}
                          strokeDasharray={dashed ? `${4 * s} ${2 * s}` : 'none'}
                        />
                      )}

                      {det.shape === 'rect' && det.points.length >= 2 && (
                        <rect
                          x={(Math.min(det.points[0][0], det.points[1][0]) / 100) * dimensions.width}
                          y={(Math.min(det.points[0][1], det.points[1][1]) / 100) * dimensions.height}
                          width={(Math.abs(det.points[1][0] - det.points[0][0]) / 100) * dimensions.width}
                          height={(Math.abs(det.points[1][1] - det.points[0][1]) / 100) * dimensions.height}
                          stroke={stroke}
                          strokeWidth={width}
                          fill={fill}
                          strokeDasharray={dashed ? `${4 * s} ${2 * s}` : 'none'}
                        />
                      )}

                      {det.shape === 'line' && (
                        <polyline
                          points={getSvgPoints(det.points)}
                          stroke={stroke}
                          strokeWidth={width + s}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      )}

                      {det.shape !== 'rect' && <circle cx={anchorX} cy={anchorY} r={3 * s} fill={stroke} />}

                      {(isHovered || isSelected) && (
                        <g pointerEvents="none">
                          <rect
                            x={labelX}
                            y={labelY}
                            width={(labelText.length * 5.4 + 8) * s}
                            height={14 * s}
                            rx={2 * s}
                            fill="#09090b"
                            stroke="#3f3f46"
                            strokeWidth={s}
                          />
                          <text
                            x={labelX + 4 * s}
                            y={labelY + 10 * s}
                            fill="#ffffff"
                            fontSize={9 * s}
                            fontFamily="ui-monospace, monospace"
                          >
                            {labelText}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

              {/* Editing handles for the current selection */}
              {showOverlays && interactiveTool === 'select' && selectedDet && selectedDet.points.length > 0 && (
                <RoiHandles
                  detection={selectedDet}
                  width={dimensions.width}
                  height={dimensions.height}
                  scale={s}
                  clientToNormalized={clientToNormalized}
                  onEditBegin={onEditBegin}
                  onPointsChange={onDetectionPointsChange}
                />
              )}

              {/* Calibration measuring line */}
              {calLine && (
                <g pointerEvents="none">
                  <line
                    x1={(calLine.x1 / 100) * dimensions.width}
                    y1={(calLine.y1 / 100) * dimensions.height}
                    x2={(calLine.x2 / 100) * dimensions.width}
                    y2={(calLine.y2 / 100) * dimensions.height}
                    stroke="#22d3ee"
                    strokeWidth={2 * s}
                  />
                  {[
                    [calLine.x1, calLine.y1],
                    [calLine.x2, calLine.y2],
                  ].map(([cx, cy], i) => (
                    <circle
                      key={i}
                      cx={(cx / 100) * dimensions.width}
                      cy={(cy / 100) * dimensions.height}
                      r={3 * s}
                      fill="#22d3ee"
                    />
                  ))}
                </g>
              )}

              {/* Calibrated scale bar */}
              {scaleBar && (
                <g pointerEvents="none">
                  <rect
                    x={dimensions.width - scaleBar.widthPx - 14 * s}
                    y={dimensions.height - 28 * s}
                    width={scaleBar.widthPx + 10 * s}
                    height={22 * s}
                    rx={2 * s}
                    fill="rgba(9,9,11,0.72)"
                  />
                  <rect
                    x={dimensions.width - scaleBar.widthPx - 9 * s}
                    y={dimensions.height - 12 * s}
                    width={scaleBar.widthPx}
                    height={3 * s}
                    fill="#ffffff"
                  />
                  <text
                    x={dimensions.width - scaleBar.widthPx / 2 - 9 * s}
                    y={dimensions.height - 16 * s}
                    fill="#ffffff"
                    fontSize={9 * s}
                    fontFamily="ui-monospace, monospace"
                    textAnchor="middle"
                  >
                    {scaleBar.label}
                  </text>
                </g>
              )}
            </svg>
          )}
        </div>

        {/* Calibration entry popover */}
        {interactiveTool === 'calibrate' && calLine && !calDragging && calPixelLength > 2 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-zinc-900 border border-cyan-800 rounded-lg p-3 shadow-2xl z-30 flex items-end gap-2">
            <div>
              <div className="text-[10px] text-zinc-400 font-mono mb-1.5">
                Measured {calPixelLength.toFixed(1)} px — what is that in real units?
              </div>
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  type="number"
                  step="any"
                  min="0"
                  value={calInput.value}
                  onChange={(e) => setCalInput({ ...calInput, value: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && commitCalibration()}
                  placeholder="100"
                  className="w-24 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
                <select
                  value={calInput.unit}
                  onChange={(e) => setCalInput({ ...calInput, unit: e.target.value as 'nm' | 'µm' | 'mm' })}
                  className="bg-zinc-950 border border-zinc-700 rounded px-1.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                >
                  <option value="nm">nm</option>
                  <option value="µm">µm</option>
                  <option value="mm">mm</option>
                </select>
              </div>
            </div>
            <button
              onClick={commitCalibration}
              disabled={!parseFloat(calInput.value)}
              className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-xs font-semibold transition cursor-pointer"
            >
              Apply
            </button>
            <button
              onClick={() => setCalLine(null)}
              className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition cursor-pointer"
            >
              Redo
            </button>
          </div>
        )}
      </div>

      {/* Selected item controls */}
      {selectedDet && (
        <div className="absolute bottom-4 left-4 right-4 bg-zinc-900/95 border border-zinc-700 rounded-lg p-3 flex items-center justify-between gap-3 shadow-2xl z-20 backdrop-blur-sm">
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: selectedDet.color || '#10b981' }}
              />
              <span className="truncate">{selectedDet.label}</span>
            </span>
            <span className="text-[10px] text-zinc-400 mt-0.5 font-mono truncate">
              {selectedDet.measured
                ? `${selectedDet.measured.pixelCount.toLocaleString()} px sampled · mean ${
                    selectedDet.measured.meanIntensity
                  } · circularity ${selectedDet.measured.circularity}`
                : `Confidence ${Math.round(selectedDet.confidence * 100)}%`}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onDeleteDetection(selectedDet.id)}
              className="bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
            <button
              onClick={() => onSelectDetection(null)}
              className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
