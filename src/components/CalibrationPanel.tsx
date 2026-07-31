import { useState } from 'react';
import { Ruler, Crosshair, Check, AlertTriangle } from 'lucide-react';
import { Calibration, UNCALIBRATED, resolveMicronsPerPixel } from '../utils/calibration';

interface CalibrationPanelProps {
  calibration: Calibration;
  imageWidthPx: number;
  imageHeightPx: number;
  /** >1 when an upload was downsampled; used to convert camera-sheet values. */
  downscaleFactor: number;
  onChange: (calibration: Calibration) => void;
  /** Switches the canvas into scale-bar drawing mode. */
  onStartScaleBar: () => void;
  scaleBarActive: boolean;
}

/** Common objective magnifications and their typical sensor-side pixel sizes. */
const PRESETS: { label: string; micronsPerPixel: number }[] = [
  { label: '4× objective', micronsPerPixel: 1.6 },
  { label: '10× objective', micronsPerPixel: 0.65 },
  { label: '20× objective', micronsPerPixel: 0.32 },
  { label: '40× objective', micronsPerPixel: 0.16 },
  { label: '100× oil', micronsPerPixel: 0.065 },
];

export default function CalibrationPanel({
  calibration,
  imageWidthPx,
  imageHeightPx,
  downscaleFactor,
  onChange,
  onStartScaleBar,
  scaleBarActive,
}: CalibrationPanelProps) {
  const [manualValue, setManualValue] = useState('');
  const [fieldWidth, setFieldWidth] = useState('');

  const resolved = resolveMicronsPerPixel(calibration, imageWidthPx);
  const calibrated = resolved !== null;

  const applyManual = () => {
    const raw = parseFloat(manualValue);
    if (!isFinite(raw) || raw <= 0) return;
    // A value read off the microscope refers to the original capture. If we
    // downsampled on upload, one displayed pixel now covers more of the sample.
    const effective = raw * downscaleFactor;
    onChange({
      micronsPerPixel: effective,
      source: 'user',
      note:
        downscaleFactor > 1
          ? `Entered ${raw} µm/px at capture resolution, scaled by ${downscaleFactor.toFixed(2)}× for the resampled image.`
          : `Entered manually: ${raw} µm/px.`,
    });
    setManualValue('');
  };

  const applyFieldWidth = () => {
    const raw = parseFloat(fieldWidth);
    if (!isFinite(raw) || raw <= 0) return;
    onChange({
      fieldWidthMicrons: raw * 1000, // entered in mm
      source: 'user',
      note: `Field of view declared as ${raw} mm across.`,
    });
    setFieldWidth('');
  };

  const fieldMm = resolved
    ? {
        w: ((imageWidthPx * resolved) / 1000).toFixed(2),
        h: ((imageHeightPx * resolved) / 1000).toFixed(2),
      }
    : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5 font-mono">
        <Ruler className="w-3.5 h-3.5 text-cyan-400" />
        Spatial Calibration
      </h3>

      <div
        className={`rounded-lg border p-2.5 mb-3 text-[10px] font-mono leading-relaxed ${
          calibrated
            ? 'bg-cyan-950/20 border-cyan-900/50 text-cyan-300'
            : 'bg-amber-950/20 border-amber-900/50 text-amber-300'
        }`}
      >
        <div className="flex items-center gap-1.5 font-semibold mb-1">
          {calibrated ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          {calibrated ? `1 px = ${resolved!.toPrecision(3)} µm` : 'Uncalibrated — results in pixels'}
        </div>
        <div className="text-zinc-400">
          {calibration.note || 'Set a scale to convert areas and lengths into physical units.'}
        </div>
        {fieldMm && (
          <div className="text-zinc-500 mt-1">
            Field of view: {fieldMm.w} × {fieldMm.h} mm
          </div>
        )}
      </div>

      {/* Scale bar tool — the most reliable route, since it uses whatever
          reference is burned into the image itself. */}
      <button
        onClick={onStartScaleBar}
        className={`w-full mb-3 p-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
          scaleBarActive
            ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
            : 'bg-zinc-950/40 text-zinc-300 border-zinc-800 hover:border-zinc-700'
        }`}
      >
        <Crosshair className="w-3.5 h-3.5" />
        {scaleBarActive ? 'Drag across the scale bar…' : 'Calibrate from scale bar'}
      </button>

      <div className="space-y-2.5">
        <div>
          <label className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider block mb-1">
            µm per pixel{downscaleFactor > 1 ? ' (at capture resolution)' : ''}
          </label>
          <div className="flex gap-1.5">
            <input
              type="number"
              step="any"
              min="0"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyManual()}
              placeholder="0.16"
              className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 font-mono"
            />
            <button
              onClick={applyManual}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 font-semibold transition cursor-pointer shrink-0"
            >
              Set
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider block mb-1">
            Or: field width (mm)
          </label>
          <div className="flex gap-1.5">
            <input
              type="number"
              step="any"
              min="0"
              value={fieldWidth}
              onChange={(e) => setFieldWidth(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFieldWidth()}
              placeholder="90"
              className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-[11px] text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-600 font-mono"
            />
            <button
              onClick={applyFieldWidth}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-[10px] text-zinc-200 font-semibold transition cursor-pointer shrink-0"
            >
              Set
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider block mb-1">
            Typical objectives
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() =>
                  onChange({
                    micronsPerPixel: preset.micronsPerPixel * downscaleFactor,
                    source: 'user',
                    note: `Assumed ${preset.label} (${preset.micronsPerPixel} µm/px nominal).`,
                  })
                }
                className="px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-950/50 text-[9px] text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 font-mono transition cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
            <button
              onClick={() => onChange(UNCALIBRATED)}
              className="px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-950/50 text-[9px] text-zinc-500 hover:text-amber-300 hover:border-amber-900 font-mono transition cursor-pointer"
            >
              clear
            </button>
          </div>
          <p className="text-[9px] text-zinc-600 mt-1.5 leading-relaxed">
            Presets are nominal values for a typical sensor. Use the scale bar for anything you intend to publish.
          </p>
        </div>
      </div>
    </div>
  );
}
