export type DetectionCategory = 'cells' | 'neurons' | 'histology' | 'bacteria' | 'plants';

export type DetectionType = 
  | 'cell' 
  | 'nucleus' 
  | 'soma' 
  | 'dendrite' 
  | 'axon' 
  | 'colony' 
  | 'stomata' 
  | 'disease_spot';

/**
 * Measured, not estimated. Every field here is computed from the actual image
 * pixels enclosed by the detection's ROI. Kept separate from `attributes`,
 * which holds whatever the model or the packaged dataset *claimed*, so the UI
 * can always show the user which is which.
 */
export interface Measurement {
  areaPx: number;
  perimeterPx: number;
  lengthPx?: number;
  circularity: number;
  equivalentDiameterPx: number;
  maxFeretPx: number;
  areaMicrons2?: number;
  perimeterMicrons?: number;
  lengthMicrons?: number;
  meanIntensity: number;
  medianIntensity: number;
  minIntensity: number;
  maxIntensity: number;
  stdDev: number;
  integratedDensity: number;
  channels: { r: number; g: number; b: number };
  pixelCount: number;
}

export interface HistogramBin {
  intensity: number;
  count: number;
  r?: number;
  g?: number;
  b?: number;
}

export type HistogramChannel = 'lum' | 'r' | 'g' | 'b';

export interface Detection {
  id: string;
  type: DetectionType;
  shape: 'rect' | 'polygon' | 'point' | 'line';
  points: [number, number][]; // Normalized coordinates [x, y] from 0 to 100
  confidence: number;
  label: string;
  color?: string;
  attributes: {
    area?: number;        // in µm²
    perimeter?: number;   // in µm
    circularity?: number; // 0 to 1
    intensity?: number;   // 0 to 255 mean fluorescent intensity (MFI)
    status?: 'healthy' | 'dead' | 'dividing' | 'abnormal' | 'normal' | 'infected';
    length?: number;      // in µm (for neurites)
    branchCount?: number; // for neurites
    morphology?: 'coccus' | 'bacillus' | 'spirillum' | 'irregular';
  };
  explanation: string;    // Explainable AI details
  /** Populated by the measurement pass once image pixels are available. */
  measured?: Measurement;
}

export interface SampleImage {
  id: string;
  name: string;
  category: DetectionCategory;
  imageUrl: string;
  description: string;
  defaultModel: 'unet' | 'yolo' | 'sam' | 'vit';
  scale: string; // human-readable, e.g. "1 px = 0.25 µm"
  metricUnit: string; // "µm" or "µm²" or "colony"
  /** Declared spatial calibration for this sample, in µm per pixel. */
  micronsPerPixel?: number;
  /** Alternative: physical width of the entire field of view, in µm. */
  fieldWidthMicrons?: number;
}

export interface AnalysisSummary {
  count: number;
  avgSize: number;
  avgCircularity: number;
  density: number; // count per mm² once calibrated, else count per megapixel
  totalArea?: number;
  /** True when the figures came from the pixel measurement pass. */
  measured?: boolean;
  /** Unit label for avgSize, e.g. "µm²", "mm²" or "px²". */
  sizeUnit?: string;
}

export interface AnalysisResult {
  detections: Detection[];
  summary: AnalysisSummary;
  histogramData: HistogramBin[];
  gradCamOverlay?: string; // Base64 or mock SVG overlay
}

export type MLModelType = 'unet' | 'yolo' | 'sam' | 'vit';

export interface MLModel {
  id: MLModelType;
  name: string;
  description: string;
  badge: string;
  framework: string;
}
