import { Detection, Measurement, HistogramBin } from '../types';

export interface LoadedImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  pixels: Uint8ClampedArray;
}

/**
 * Decodes an image URL (bundled asset or data URL) into raw pixels.
 *
 * Both sources are same-origin, so the canvas is never tainted and getImageData
 * is safe. If that ever changes, this is the single place that needs a CORS
 * strategy.
 */
export function loadImagePixels(url: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onerror = () => reject(new Error('Could not decode the image for measurement.'));

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable.'));
        return;
      }

      ctx.drawImage(img, 0, 0);

      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve({ width: canvas.width, height: canvas.height, pixels: data.data });
      } catch (err) {
        reject(new Error('Pixel data is not readable (canvas is cross-origin tainted).'));
      }
    };

    img.src = url;
  });
}

/** Rec. 601 luma. Matches what ImageJ calls "grey value" for RGB stacks. */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Ray-casting point-in-polygon, on pixel coordinates. */
function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Converts normalized 0-100 detection coordinates into image pixel coordinates. */
function toPixelPoints(points: [number, number][], width: number, height: number): [number, number][] {
  return points.map(([x, y]) => [(x / 100) * width, (y / 100) * height] as [number, number]);
}

interface Accumulator {
  n: number;
  sum: number;
  sumSq: number;
  min: number;
  max: number;
  sumR: number;
  sumG: number;
  sumB: number;
  /** 256-bin histogram, used for an exact median without sorting. */
  bins: Uint32Array;
}

function newAccumulator(): Accumulator {
  return {
    n: 0,
    sum: 0,
    sumSq: 0,
    min: 255,
    max: 0,
    sumR: 0,
    sumG: 0,
    sumB: 0,
    bins: new Uint32Array(256),
  };
}

function sample(acc: Accumulator, img: LoadedImage, x: number, y: number): void {
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= img.width || py >= img.height) return;

  const i = (py * img.width + px) * 4;
  const r = img.pixels[i];
  const g = img.pixels[i + 1];
  const b = img.pixels[i + 2];
  const l = luma(r, g, b);

  acc.n++;
  acc.sum += l;
  acc.sumSq += l * l;
  if (l < acc.min) acc.min = l;
  if (l > acc.max) acc.max = l;
  acc.sumR += r;
  acc.sumG += g;
  acc.sumB += b;
  acc.bins[Math.round(l)]++;
}

function medianFromBins(bins: Uint32Array, n: number): number {
  if (n === 0) return 0;
  const target = n / 2;
  let cumulative = 0;
  for (let v = 0; v < 256; v++) {
    cumulative += bins[v];
    if (cumulative >= target) return v;
  }
  return 0;
}

/** Maximum Feret diameter: the largest distance between any two boundary vertices. */
function maxFeret(points: [number, number][]): number {
  let max = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
      if (d > max) max = d;
    }
  }
  return max;
}

/**
 * Measures one detection against the real image pixels.
 *
 * Morphometry comes from the ROI geometry (shoelace area, closed-path
 * perimeter); densitometry comes from every pixel enclosed by the ROI. Nothing
 * here is estimated — if the ROI is wrong, the numbers are wrong in a way the
 * user can see and correct, which is the point.
 */
export function measureDetection(
  det: Detection,
  img: LoadedImage,
  micronsPerPixel: number | null
): Measurement | null {
  if (!det.points.length) return null;

  const pts = toPixelPoints(det.points, img.width, img.height);
  const acc = newAccumulator();

  let areaPx = 0;
  let perimeterPx = 0;
  let lengthPx: number | undefined;

  if (det.shape === 'line') {
    // Neurite trace: length along the path, intensity sampled in a narrow band
    // centred on it (a zero-width line encloses no pixels).
    lengthPx = 0;
    for (let s = 1; s < pts.length; s++) {
      lengthPx += Math.hypot(pts[s][0] - pts[s - 1][0], pts[s][1] - pts[s - 1][1]);
    }
    perimeterPx = lengthPx;

    const bandHalfWidth = 1.5;
    for (let s = 1; s < pts.length; s++) {
      const [x1, y1] = pts[s - 1];
      const [x2, y2] = pts[s];
      const segLength = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(1, Math.ceil(segLength));
      const nx = segLength > 0 ? -(y2 - y1) / segLength : 0;
      const ny = segLength > 0 ? (x2 - x1) / segLength : 0;

      for (let t = 0; t <= steps; t++) {
        const cx = x1 + ((x2 - x1) * t) / steps;
        const cy = y1 + ((y2 - y1) * t) / steps;
        for (let o = -bandHalfWidth; o <= bandHalfWidth; o += 1) {
          sample(acc, img, cx + nx * o, cy + ny * o);
        }
      }
    }
  } else {
    const polygon: [number, number][] =
      det.shape === 'rect' && pts.length >= 2
        ? [
            [Math.min(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1])],
            [Math.max(pts[0][0], pts[1][0]), Math.min(pts[0][1], pts[1][1])],
            [Math.max(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])],
            [Math.min(pts[0][0], pts[1][0]), Math.max(pts[0][1], pts[1][1])],
          ]
        : pts;

    // Shoelace in pixel space. Normalized-space area cannot be used directly
    // because x and y are scaled by different factors on a non-square image.
    let shoelace = 0;
    for (let i = 0; i < polygon.length; i++) {
      const [x1, y1] = polygon[i];
      const [x2, y2] = polygon[(i + 1) % polygon.length];
      shoelace += x1 * y2 - x2 * y1;
      perimeterPx += Math.hypot(x2 - x1, y2 - y1);
    }
    areaPx = Math.abs(shoelace) / 2;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of polygon) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }

    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
        if (pointInPolygon(x + 0.5, y + 0.5, polygon)) sample(acc, img, x, y);
      }
    }
  }

  const mean = acc.n > 0 ? acc.sum / acc.n : 0;
  const variance = acc.n > 0 ? Math.max(0, acc.sumSq / acc.n - mean * mean) : 0;

  const circularity =
    perimeterPx > 0 && areaPx > 0 ? Math.min(1, (4 * Math.PI * areaPx) / (perimeterPx * perimeterPx)) : 0;

  const mpp = micronsPerPixel;

  return {
    areaPx: Number(areaPx.toFixed(1)),
    perimeterPx: Number(perimeterPx.toFixed(1)),
    lengthPx: lengthPx !== undefined ? Number(lengthPx.toFixed(1)) : undefined,
    circularity: Number(circularity.toFixed(3)),
    equivalentDiameterPx: Number((2 * Math.sqrt(areaPx / Math.PI)).toFixed(1)),
    maxFeretPx: Number(maxFeret(pts).toFixed(1)),
    areaMicrons2: mpp !== null ? Number((areaPx * mpp * mpp).toFixed(3)) : undefined,
    perimeterMicrons: mpp !== null ? Number((perimeterPx * mpp).toFixed(3)) : undefined,
    lengthMicrons: mpp !== null && lengthPx !== undefined ? Number((lengthPx * mpp).toFixed(3)) : undefined,
    meanIntensity: Number(mean.toFixed(1)),
    medianIntensity: medianFromBins(acc.bins, acc.n),
    minIntensity: acc.n > 0 ? Math.round(acc.min) : 0,
    maxIntensity: acc.n > 0 ? Math.round(acc.max) : 0,
    stdDev: Number(Math.sqrt(variance).toFixed(1)),
    // ImageJ's RawIntDen: the summed grey value over the ROI. The metric that
    // actually matters for comparing fluorescence between conditions.
    integratedDensity: Number(acc.sum.toFixed(0)),
    channels: {
      r: acc.n > 0 ? Number((acc.sumR / acc.n).toFixed(1)) : 0,
      g: acc.n > 0 ? Number((acc.sumG / acc.n).toFixed(1)) : 0,
      b: acc.n > 0 ? Number((acc.sumB / acc.n).toFixed(1)) : 0,
    },
    pixelCount: acc.n,
  };
}

/**
 * Real intensity histogram of the whole frame, per channel plus luma.
 *
 * `stride` subsamples for speed; at stride 2 a 1600x1200 frame still
 * contributes ~480k pixels, which is far more than enough for a distribution.
 */
export function computeImageHistogram(img: LoadedImage, bins = 64, stride = 2): HistogramBin[] {
  const lum = new Float64Array(bins);
  const red = new Float64Array(bins);
  const green = new Float64Array(bins);
  const blue = new Float64Array(bins);
  const binWidth = 256 / bins;

  for (let y = 0; y < img.height; y += stride) {
    for (let x = 0; x < img.width; x += stride) {
      const i = (y * img.width + x) * 4;
      const r = img.pixels[i];
      const g = img.pixels[i + 1];
      const b = img.pixels[i + 2];

      lum[Math.min(bins - 1, Math.floor(luma(r, g, b) / binWidth))]++;
      red[Math.min(bins - 1, Math.floor(r / binWidth))]++;
      green[Math.min(bins - 1, Math.floor(g / binWidth))]++;
      blue[Math.min(bins - 1, Math.floor(b / binWidth))]++;
    }
  }

  const result: HistogramBin[] = [];
  for (let i = 0; i < bins; i++) {
    result.push({
      intensity: Math.round(i * binWidth + binWidth / 2),
      count: lum[i],
      r: red[i],
      g: green[i],
      b: blue[i],
    });
  }
  return result;
}

/**
 * Suggests a global threshold using Otsu's method on the luma histogram.
 * Exposed for the stats panel's "suggested threshold" readout — a genuine,
 * deterministic image-processing result rather than a model guess.
 */
export function otsuThreshold(histogram: HistogramBin[]): number {
  const total = histogram.reduce((s, h) => s + h.count, 0);
  if (total === 0) return 128;

  let sumAll = 0;
  histogram.forEach((h) => (sumAll += h.intensity * h.count));

  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 128;

  for (const bin of histogram) {
    weightB += bin.count;
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;

    sumB += bin.intensity * bin.count;
    const meanB = sumB / weightB;
    const meanF = (sumAll - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;

    if (between > best) {
      best = between;
      threshold = bin.intensity;
    }
  }

  return Math.round(threshold);
}
