/**
 * Spatial calibration.
 *
 * Everything measured in this app starts life in pixels of the *decoded* image
 * (the bitmap actually loaded into the canvas, which for uploads may have been
 * downsampled). Calibration is the single place where pixels become microns.
 * If no calibration is available the app reports pixels and says so, rather
 * than inventing a scale.
 */
export type CalibrationSource = 'declared' | 'user' | 'scalebar' | 'none';

export interface Calibration {
  /** Microns per pixel of the decoded image. Undefined means uncalibrated. */
  micronsPerPixel?: number;
  /**
   * Alternative specification: the physical width of the whole field of view.
   * Resolved against the image width once it is known.
   */
  fieldWidthMicrons?: number;
  source: CalibrationSource;
  /** Human-readable provenance, shown in the UI and written into exports. */
  note?: string;
}

export const UNCALIBRATED: Calibration = {
  source: 'none',
  note: 'No spatial calibration — measurements are reported in pixels.',
};

/** Resolves a calibration to microns-per-pixel, or null if uncalibrated. */
export function resolveMicronsPerPixel(cal: Calibration, imageWidthPx: number): number | null {
  if (cal.micronsPerPixel && cal.micronsPerPixel > 0) return cal.micronsPerPixel;
  if (cal.fieldWidthMicrons && cal.fieldWidthMicrons > 0 && imageWidthPx > 0) {
    return cal.fieldWidthMicrons / imageWidthPx;
  }
  return null;
}

export function isCalibrated(cal: Calibration, imageWidthPx: number): boolean {
  return resolveMicronsPerPixel(cal, imageWidthPx) !== null;
}

/**
 * Builds a calibration from a scale-bar measurement: the user drew a line of
 * `pixelLength` px across a feature they know to be `physicalLength` units long.
 */
export function calibrationFromScaleBar(
  pixelLength: number,
  physicalLength: number,
  unit: 'nm' | 'µm' | 'mm'
): Calibration | null {
  if (pixelLength <= 0 || physicalLength <= 0) return null;
  const microns = unit === 'nm' ? physicalLength / 1000 : unit === 'mm' ? physicalLength * 1000 : physicalLength;
  return {
    micronsPerPixel: microns / pixelLength,
    source: 'scalebar',
    note: `Calibrated from a ${physicalLength} ${unit} reference drawn over ${Math.round(pixelLength)} px.`,
  };
}

// ---------------------------------------------------------------------------
// Unit-aware formatting. Colony plates produce areas in the mm² range while
// nuclei sit in the low hundreds of µm²; a single fixed unit reads badly for
// both, so pick a sensible one per value.
// ---------------------------------------------------------------------------

function round(value: number, digits: number): string {
  if (!isFinite(value)) return '—';
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function formatArea(areaMicrons2: number | undefined, areaPx: number): { value: string; unit: string } {
  if (areaMicrons2 === undefined) return { value: round(areaPx, 0), unit: 'px²' };
  if (areaMicrons2 >= 1_000_000) return { value: round(areaMicrons2 / 1_000_000, 2), unit: 'mm²' };
  if (areaMicrons2 < 1) return { value: round(areaMicrons2 * 1_000_000, 0), unit: 'nm²' };
  return { value: round(areaMicrons2, 1), unit: 'µm²' };
}

export function formatLength(lengthMicrons: number | undefined, lengthPx: number): { value: string; unit: string } {
  if (lengthMicrons === undefined) return { value: round(lengthPx, 0), unit: 'px' };
  if (lengthMicrons >= 1000) return { value: round(lengthMicrons / 1000, 2), unit: 'mm' };
  if (lengthMicrons < 1) return { value: round(lengthMicrons * 1000, 0), unit: 'nm' };
  return { value: round(lengthMicrons, 1), unit: 'µm' };
}

/** Compact description of the active calibration for the status strip. */
export function describeCalibration(cal: Calibration, imageWidthPx: number): string {
  const mpp = resolveMicronsPerPixel(cal, imageWidthPx);
  if (mpp === null) return 'Uncalibrated (pixel units)';
  if (mpp >= 1000) return `1 px = ${round(mpp / 1000, 3)} mm`;
  if (mpp < 0.001) return `1 px = ${round(mpp * 1000, 2)} nm`;
  return `1 px = ${round(mpp, 4)} µm`;
}
