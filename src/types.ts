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
}

export interface SampleImage {
  id: string;
  name: string;
  category: DetectionCategory;
  imageUrl: string;
  description: string;
  defaultModel: 'unet' | 'yolo' | 'sam' | 'vit';
  scale: string; // e.g., "1 px = 0.25 µm"
  metricUnit: string; // "µm" or "µm²" or "colony"
}

export interface AnalysisResult {
  detections: Detection[];
  summary: {
    count: number;
    avgSize: number;
    avgCircularity: number;
    density: number; // count per mm²
    totalArea?: number;
  };
  histogramData: {
    intensity: number;
    count: number;
  }[];
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
