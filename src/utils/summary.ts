import { AnalysisSummary, Detection } from '../types';
import { formatArea } from './calibration';

/**
 * Aggregate statistics over a set of measured detections.
 *
 * Extracted so the single-image workspace and the batch runner cannot drift
 * apart — a batch row and the same image opened in the workspace must report
 * identical numbers.
 */
export function summarize(
  detections: Detection[],
  micronsPerPixel: number | null,
  imageWidthPx: number,
  imageHeightPx: number
): AnalysisSummary {
  const count = detections.length;
  const measured = detections.filter((d) => d.measured);

  if (count === 0 || measured.length === 0) {
    return { count, avgSize: 0, avgCircularity: 0, density: 0, measured: false, sizeUnit: 'px²' };
  }

  const calibrated = micronsPerPixel !== null;
  const areas = measured.map((d) => (calibrated ? (d.measured!.areaMicrons2 ?? 0) : d.measured!.areaPx));
  const circularities = measured.map((d) => d.measured!.circularity).filter((c) => c > 0);

  const totalArea = areas.reduce((a, b) => a + b, 0);
  const avgSize = totalArea / areas.length;
  const avgCircularity =
    circularities.length > 0 ? circularities.reduce((a, b) => a + b, 0) / circularities.length : 0;

  // Real spatial density rather than the old `count * 450` placeholder.
  let density = 0;
  if (calibrated && imageWidthPx > 0) {
    const fieldMm2 = ((imageWidthPx * micronsPerPixel) / 1000) * ((imageHeightPx * micronsPerPixel) / 1000);
    density = fieldMm2 > 0 ? count / fieldMm2 : 0;
  } else if (imageWidthPx > 0) {
    const megapixels = (imageWidthPx * imageHeightPx) / 1_000_000;
    density = megapixels > 0 ? count / megapixels : 0;
  }

  return {
    count,
    avgSize: Number(avgSize.toFixed(avgSize < 10 ? 2 : 1)),
    avgCircularity: Number(avgCircularity.toFixed(3)),
    density: Number(density.toFixed(density < 10 ? 2 : 0)),
    totalArea: Number(totalArea.toFixed(1)),
    measured: true,
    sizeUnit: formatArea(calibrated ? avgSize : undefined, avgSize).unit,
  };
}

export interface Distribution {
  n: number;
  mean: number;
  sd: number;
  median: number;
  min: number;
  max: number;
  /** Interquartile range bounds, useful for spotting segmentation outliers. */
  q1: number;
  q3: number;
}

/** Descriptive statistics for a numeric sample. */
export function describe(values: number[]): Distribution | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const variance = sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;

  const quantile = (q: number) => {
    const pos = (n - 1) * q;
    const lower = Math.floor(pos);
    const upper = Math.ceil(pos);
    return lower === upper ? sorted[lower] : sorted[lower] + (pos - lower) * (sorted[upper] - sorted[lower]);
  };

  return {
    n,
    mean: Number(mean.toFixed(2)),
    sd: Number(Math.sqrt(variance).toFixed(2)),
    median: Number(quantile(0.5).toFixed(2)),
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[n - 1].toFixed(2)),
    q1: Number(quantile(0.25).toFixed(2)),
    q3: Number(quantile(0.75).toFixed(2)),
  };
}
