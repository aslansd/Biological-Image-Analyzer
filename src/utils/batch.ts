import { AnalysisSummary, Detection, DetectionCategory } from '../types';
import { Calibration } from './calibration';
import { loadImagePixels, measureDetection } from './measure';
import { summarize } from './summary';

export type BatchStatus = 'queued' | 'analyzing' | 'measuring' | 'done' | 'error';

export interface BatchItem {
  id: string;
  fileName: string;
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  /** Original capture width / decoded width, so calibration survives resampling. */
  downscaleFactor: number;
  status: BatchStatus;
  error?: string;
  detections: Detection[];
  summary?: AnalysisSummary;
  isSimulated: boolean;
}

/**
 * Calibration for a batch is expressed at CAPTURE resolution, because items may
 * have been downsampled by different amounts. Each item then converts to its own
 * decoded pixel scale. A field-width calibration is resolution-independent and
 * passes through untouched.
 */
export function micronsPerPixelForItem(calibration: Calibration, item: BatchItem): number | null {
  if (calibration.fieldWidthMicrons && item.width > 0) {
    return calibration.fieldWidthMicrons / item.width;
  }
  if (calibration.micronsPerPixel) {
    return calibration.micronsPerPixel * item.downscaleFactor;
  }
  return null;
}

export interface AnalysisRunner {
  (
    dataUrl: string,
    fileName: string,
    mimeType: string,
    category: DetectionCategory
  ): Promise<{ detections: Detection[]; isSimulated: boolean }>;
}

/**
 * Runs one queued item to completion: analysis, then the same pixel measurement
 * pass the interactive workspace uses.
 */
export async function processBatchItem(
  item: BatchItem,
  category: DetectionCategory,
  calibrationAtCapture: Calibration,
  runAnalysis: AnalysisRunner,
  onStatus: (id: string, status: BatchStatus) => void
): Promise<BatchItem> {
  try {
    onStatus(item.id, 'analyzing');
    const { detections, isSimulated } = await runAnalysis(item.dataUrl, item.fileName, item.mimeType, category);

    onStatus(item.id, 'measuring');
    const image = await loadImagePixels(item.dataUrl);

    const withDimensions: BatchItem = { ...item, width: image.width, height: image.height };
    const micronsPerPixel = micronsPerPixelForItem(calibrationAtCapture, withDimensions);

    const measured = detections.map((det) => ({
      ...det,
      measured: measureDetection(det, image, micronsPerPixel) ?? undefined,
    }));

    return {
      ...withDimensions,
      status: 'done',
      detections: measured,
      summary: summarize(measured, micronsPerPixel, image.width, image.height),
      isSimulated,
    };
  } catch (error) {
    return {
      ...item,
      status: 'error',
      error: error instanceof Error ? error.message : 'Processing failed.',
    };
  }
}

/** Converts the workspace calibration into a capture-resolution one. */
export function toCaptureCalibration(calibration: Calibration, currentDownscaleFactor: number): Calibration {
  if (calibration.fieldWidthMicrons || !calibration.micronsPerPixel) return calibration;
  return {
    ...calibration,
    micronsPerPixel: calibration.micronsPerPixel / (currentDownscaleFactor || 1),
  };
}

const csvCell = (value: unknown) => {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

/** One row per detected object, across every completed image. */
export function buildPooledCsv(items: BatchItem[], calibrationLabel: string): string {
  const headers = [
    'source_image', 'detection_id', 'label', 'type', 'shape', 'confidence', 'status',
    'area_px2', 'area_um2', 'perimeter_px', 'perimeter_um', 'length_px', 'length_um',
    'circularity', 'equiv_diameter_px', 'max_feret_px', 'mean_intensity', 'median_intensity',
    'min_intensity', 'max_intensity', 'stddev_intensity', 'integrated_density',
    'mean_r', 'mean_g', 'mean_b', 'pixel_count',
  ];

  const rows: string[] = [];
  for (const item of items) {
    if (item.status !== 'done') continue;
    for (const det of item.detections) {
      const m = det.measured;
      rows.push(
        [
          item.fileName, det.id, det.label, det.type, det.shape,
          det.confidence.toFixed(3), det.attributes.status ?? '',
          m?.areaPx, m?.areaMicrons2, m?.perimeterPx, m?.perimeterMicrons,
          m?.lengthPx, m?.lengthMicrons, m?.circularity, m?.equivalentDiameterPx, m?.maxFeretPx,
          m?.meanIntensity, m?.medianIntensity, m?.minIntensity, m?.maxIntensity,
          m?.stdDev, m?.integratedDensity, m?.channels.r, m?.channels.g, m?.channels.b, m?.pixelCount,
        ]
          .map(csvCell)
          .join(',')
      );
    }
  }

  const provenance = [
    '# BioScan AI batch export (one row per detected object)',
    `# generated: ${new Date().toISOString()}`,
    `# images: ${items.filter((i) => i.status === 'done').length}`,
    `# calibration: ${calibrationLabel}`,
    '# measured columns come from pixel analysis; labels and status come from the detector',
  ].join('\n');

  return `${provenance}\n${headers.join(',')}\n${rows.join('\n')}\n`;
}

/** One row per image. */
export function buildPerImageCsv(items: BatchItem[], calibrationLabel: string): string {
  const headers = [
    'image', 'status', 'width_px', 'height_px', 'object_count',
    'mean_area', 'area_unit', 'mean_circularity', 'density', 'total_area', 'detection_source',
  ];

  const rows = items.map((item) =>
    [
      item.fileName, item.status, item.width, item.height, item.summary?.count ?? 0,
      item.summary?.avgSize ?? '', item.summary?.sizeUnit ?? '', item.summary?.avgCircularity ?? '',
      item.summary?.density ?? '', item.summary?.totalArea ?? '',
      item.isSimulated ? 'local-simulation' : 'gemini',
    ]
      .map(csvCell)
      .join(',')
  );

  return `# BioScan AI batch summary\n# generated: ${new Date().toISOString()}\n# calibration: ${calibrationLabel}\n${headers.join(
    ','
  )}\n${rows.join('\n')}\n`;
}
