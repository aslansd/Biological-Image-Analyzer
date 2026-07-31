import { Detection, DetectionCategory, AnalysisSummary } from '../types';
import { Layers, CircleDot, Percent, Gauge, Ruler, Microscope, TriangleAlert } from 'lucide-react';
import { formatArea, formatLength } from '../utils/calibration';

interface StatsPanelProps {
  category: DetectionCategory;
  summary: AnalysisSummary;
  detections: Detection[];
  selectedDetectionId: string | null;
  onSelectDetection: (id: string) => void;
  calibrated: boolean;
  calibrationLabel: string;
  suggestedThreshold: number | null;
}

export default function StatsPanel({
  category,
  summary,
  detections,
  selectedDetectionId,
  onSelectDetection,
  calibrated,
  calibrationLabel,
  suggestedThreshold,
}: StatsPanelProps) {
  const objectLabel = () => {
    switch (category) {
      case 'cells':
        return 'Cells detected';
      case 'neurons':
        return 'Soma & neurites';
      case 'histology':
        return 'Nuclei';
      case 'bacteria':
        return 'Colonies (CFU)';
      case 'plants':
        return 'Guard cells / spots';
      default:
        return 'Objects';
    }
  };

  const selected = detections.find((d) => d.id === selectedDetectionId);

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-emerald-400" />
          Quantitative Workspace
        </h3>
        <span
          title={calibrationLabel}
          className={`text-[9px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 shrink-0 ${
            calibrated
              ? 'bg-emerald-950 text-emerald-400 border-emerald-900'
              : 'bg-amber-950/40 text-amber-400 border-amber-900/60'
          }`}
        >
          <Microscope className="w-2.5 h-2.5" />
          {calibrated ? 'Calibrated' : 'Pixel units'}
        </span>
      </div>

      {/* Aggregate tiles. Every value below is computed from the actual pixels
          enclosed by each ROI, not estimated by the model. */}
      <div className="p-4 grid grid-cols-2 gap-3 bg-zinc-900/50">
        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Total count</span>
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums">{summary.count}</p>
          <span className="text-[10px] text-zinc-500 font-mono">{objectLabel()}</span>
        </div>

        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
            <Ruler className="w-3.5 h-3.5 text-emerald-400" />
            <span>Mean area</span>
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums leading-tight">
            {summary.avgSize.toLocaleString()}
            <span className="text-xs ml-0.5 text-zinc-400 font-normal">{summary.sizeUnit}</span>
          </p>
          <span className="text-[10px] text-zinc-500 font-mono">Shoelace, measured</span>
        </div>

        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
            <Percent className="w-3.5 h-3.5 text-yellow-500" />
            <span>Circularity</span>
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums">{summary.avgCircularity}</p>
          <span className="text-[10px] text-zinc-500 font-mono">4πA/P², 0–1</span>
        </div>

        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
            <CircleDot className="w-3.5 h-3.5 text-pink-400" />
            <span>Density</span>
          </div>
          <p className="text-2xl font-bold text-white font-mono tabular-nums leading-tight">
            {summary.density.toLocaleString()}
            <span className="text-xs ml-0.5 text-zinc-400 font-normal">{calibrated ? '/mm²' : '/MP'}</span>
          </p>
          <span className="text-[10px] text-zinc-500 font-mono">
            {calibrated ? 'Per field area' : 'Per megapixel'}
          </span>
        </div>
      </div>

      {!calibrated && (
        <div className="mx-4 mb-3 -mt-1 flex items-start gap-2 text-[10px] text-amber-300/90 bg-amber-950/20 border border-amber-900/40 rounded-lg p-2 leading-relaxed">
          <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            No spatial calibration set, so areas and lengths are in pixels. Set a scale to convert to physical units.
          </span>
        </div>
      )}

      {/* Per-object detail for the current selection */}
      {selected?.measured && (
        <div className="mx-4 mb-3 bg-zinc-950 border border-zinc-800 rounded-lg p-3">
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mb-2 truncate">
            {selected.label}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-mono">
            {[
              ['Area', (() => { const f = formatArea(selected.measured.areaMicrons2, selected.measured.areaPx); return `${f.value} ${f.unit}`; })()],
              ['Perimeter', (() => { const f = formatLength(selected.measured.perimeterMicrons, selected.measured.perimeterPx); return `${f.value} ${f.unit}`; })()],
              ['Circularity', selected.measured.circularity.toFixed(3)],
              ['Max Feret', `${selected.measured.maxFeretPx} px`],
              ['Mean grey', selected.measured.meanIntensity.toFixed(1)],
              ['Median', String(selected.measured.medianIntensity)],
              ['Min / Max', `${selected.measured.minIntensity} / ${selected.measured.maxIntensity}`],
              ['Std dev', selected.measured.stdDev.toFixed(1)],
              ['IntDen', selected.measured.integratedDensity.toLocaleString()],
              ['Pixels', selected.measured.pixelCount.toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-zinc-500">{label}</span>
                <span className="text-zinc-200 tabular-nums truncate">{value}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 mt-2 pt-2 border-t border-zinc-900">
            {(['r', 'g', 'b'] as const).map((ch) => (
              <div key={ch} className="flex-1">
                <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full"
                    style={{
                      width: `${(selected.measured!.channels[ch] / 255) * 100}%`,
                      backgroundColor: ch === 'r' ? '#ef4444' : ch === 'g' ? '#22c55e' : '#3b82f6',
                    }}
                  />
                </div>
                <div className="text-[9px] text-zinc-500 font-mono mt-0.5 text-center">
                  {ch.toUpperCase()} {selected.measured!.channels[ch].toFixed(0)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inventory */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2 border-y border-zinc-800 bg-zinc-950 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase font-mono flex items-center justify-between">
          <span>Object inventory ({detections.length})</span>
          {suggestedThreshold !== null && (
            <span className="text-zinc-600 normal-case tracking-normal" title="Otsu threshold of the frame">
              Otsu {suggestedThreshold}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50 bg-zinc-950/20">
          {detections.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500 italic">
              No structures segmented in this frame. Upload an image or select a sample above.
            </div>
          ) : (
            detections.map((det) => {
              const isSelected = selectedDetectionId === det.id;
              const status = det.attributes.status;
              const statusClass =
                status === 'dead' || status === 'infected'
                  ? 'bg-red-500/10 text-red-400 border-red-900/50'
                  : status === 'dividing'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-900/50'
                    : status === 'abnormal'
                      ? 'bg-purple-500/10 text-purple-400 border-purple-900/50'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-900/50';

              const area = det.measured
                ? formatArea(det.measured.areaMicrons2, det.measured.areaPx)
                : null;

              return (
                <button
                  key={det.id}
                  onClick={() => onSelectDetection(det.id)}
                  className={`w-full text-left p-3 flex items-center justify-between gap-2 hover:bg-zinc-800/40 transition font-mono border-l-2 ${
                    isSelected ? 'bg-zinc-800/80 border-l-emerald-400' : 'border-l-transparent'
                  }`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-200 truncate">{det.label}</span>
                      <span className="text-[9px] text-zinc-500 shrink-0">
                        ({Math.round(det.confidence * 100)}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                      {area && (
                        <span>
                          <strong className="text-zinc-300 tabular-nums">{area.value}</strong> {area.unit}
                        </span>
                      )}
                      {det.measured && (
                        <span>
                          grey <strong className="text-zinc-300 tabular-nums">{det.measured.meanIntensity}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {status && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase shrink-0 ${statusClass}`}
                    >
                      {status}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
