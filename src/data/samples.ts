import { SampleImage, Detection, AnalysisResult, DetectionCategory, DetectionType } from '../types';

// FIX: these were previously referenced as literal '/src/assets/images/...' paths.
// That only resolves while the Vite dev server is running. In a production build
// nothing under /src is emitted, so all five sample thumbnails 404'd on Cloud Run.
// Importing them lets Vite fingerprint and emit them into dist/assets.
import fluorescenceImg from '../assets/images/sample_fluorescence_1782718007522.jpg';
import neuronImg from '../assets/images/sample_neuron_1782718022988.jpg';
import histologyImg from '../assets/images/sample_histology_1782718038594.jpg';
import bacteriaImg from '../assets/images/sample_bacteria_1782718052920.jpg';
import plantImg from '../assets/images/sample_plant_1782718067828.jpg';

export const SAMPLE_IMAGES: SampleImage[] = [
  {
    id: 'sample-fluorescence',
    name: 'Fluorescence Cells',
    category: 'cells',
    imageUrl: fluorescenceImg,
    description: 'Fluorescence confocal microscopy of bovine pulmonary artery endothelial cells. Blue stains nuclei (DAPI); green stains F-actin microfilaments.',
    defaultModel: 'unet',
    scale: '1 px = 0.16 µm',
    metricUnit: 'µm²',
    micronsPerPixel: 0.16,
  },
  {
    id: 'sample-neuron',
    name: 'Cortical Neuron Tracing',
    category: 'neurons',
    imageUrl: neuronImg,
    description: 'Fluorescent silver-stained cortical pyramidal neuron showing extensive dendritic branching and a distinctive primary apical dendrite.',
    defaultModel: 'sam',
    scale: '1 px = 0.32 µm',
    metricUnit: 'µm',
    micronsPerPixel: 0.32,
  },
  {
    id: 'sample-histology',
    name: 'Breast Tissue H&E Slide',
    category: 'histology',
    imageUrl: histologyImg,
    description: 'Hematoxylin and eosin (H&E) stained histology section from breast needle biopsy, featuring lobular epithelium and surrounding stroma.',
    defaultModel: 'yolo',
    scale: '1 px = 0.25 µm',
    metricUnit: 'µm²',
    micronsPerPixel: 0.25,
  },
  {
    id: 'sample-bacteria',
    name: 'Bacterial Colony Counter',
    category: 'bacteria',
    imageUrl: bacteriaImg,
    description: 'Microbial culture agar plate exhibiting distinct colony forming units (CFUs) of Escherichia coli after 24 hours incubation.',
    defaultModel: 'yolo',
    scale: '1 plate = 90 mm',
    metricUnit: 'colony',
    fieldWidthMicrons: 90000, // 90 mm standard petri plate spans the frame
  },
  {
    id: 'sample-plant',
    name: 'Foliar Stomata & Lesions',
    category: 'plants',
    imageUrl: plantImg,
    description: 'Microscopic scanning of a plant leaf epidermis, showing active stomata guard cells and microscopic chlorotic lesions from early fungal inoculation.',
    defaultModel: 'unet',
    scale: '1 px = 0.45 µm',
    metricUnit: 'µm²',
    micronsPerPixel: 0.45,
  }
];

// Pre-packaged high-fidelity detections for our sample images
const FLUO_DETECTIONS: Detection[] = [
  {
    id: 'fl-cell-1',
    type: 'cell',
    shape: 'polygon',
    points: [[15, 20], [28, 12], [42, 18], [48, 35], [38, 52], [22, 48], [12, 35]],
    confidence: 0.94,
    label: 'Healthy Cell',
    color: '#10b981',
    attributes: {
      area: 284.5,
      perimeter: 68.2,
      circularity: 0.81,
      intensity: 184,
      status: 'healthy'
    },
    explanation: 'Classified as healthy due to uniform F-actin microfilament organization, stable cytoplasm spread, and absence of nuclear pyknosis.'
  },
  {
    id: 'fl-nuc-1',
    type: 'nucleus',
    shape: 'polygon',
    points: [[24, 25], [32, 22], [36, 28], [34, 36], [26, 38], [22, 32]],
    confidence: 0.98,
    label: 'Cell Nucleus',
    color: '#3b82f6',
    attributes: {
      area: 58.2,
      perimeter: 28.5,
      circularity: 0.94,
      intensity: 220,
      status: 'normal'
    },
    explanation: 'Clean nuclear envelope with robust blue DAPI fluorescence intensity. Normal nucleoplasm with no signs of karyorrhexis.'
  },
  {
    id: 'fl-cell-2',
    type: 'cell',
    shape: 'polygon',
    points: [[52, 40], [68, 30], [82, 38], [88, 58], [76, 75], [58, 70], [48, 55]],
    confidence: 0.96,
    label: 'Dividing Cell',
    color: '#eab308',
    attributes: {
      area: 342.1,
      perimeter: 76.4,
      circularity: 0.78,
      intensity: 198,
      status: 'dividing'
    },
    explanation: 'Classified as actively dividing (mitotic/late anaphase) due to prominent cytoplasmic elongation, microfilament cleavage furrow constriction, and high metabolic marker expression.'
  },
  {
    id: 'fl-nuc-2a',
    type: 'nucleus',
    shape: 'polygon',
    points: [[58, 48], [63, 44], [67, 49], [64, 55], [59, 53]],
    confidence: 0.95,
    label: 'Dividing Nucleus A',
    color: '#3b82f6',
    attributes: {
      area: 32.4,
      perimeter: 21.0,
      circularity: 0.91,
      intensity: 215,
      status: 'normal'
    },
    explanation: 'Daughter chromosome cluster condensing on the left pole, robust mitotic spindle attachments visible.'
  },
  {
    id: 'fl-nuc-2b',
    type: 'nucleus',
    shape: 'polygon',
    points: [[72, 54], [78, 50], [82, 55], [79, 61], [74, 59]],
    confidence: 0.95,
    label: 'Dividing Nucleus B',
    color: '#3b82f6',
    attributes: {
      area: 33.1,
      perimeter: 21.5,
      circularity: 0.90,
      intensity: 212,
      status: 'normal'
    },
    explanation: 'Daughter chromosome cluster condensing on the right pole, normal mitotic segregation.'
  },
  {
    id: 'fl-cell-3',
    type: 'cell',
    shape: 'polygon',
    points: [[20, 60], [35, 58], [42, 68], [38, 80], [25, 82], [15, 74]],
    confidence: 0.89,
    label: 'Apoptotic Cell',
    color: '#ef4444',
    attributes: {
      area: 145.2,
      perimeter: 49.8,
      circularity: 0.65,
      intensity: 85,
      status: 'dead'
    },
    explanation: 'Classified as apoptotic (dead) cell due to marked cell shrinkage, fragmentation of F-actin structural network, and low average fluorescent intensity.'
  },
  {
    id: 'fl-nuc-3',
    type: 'nucleus',
    shape: 'polygon',
    points: [[26, 68], [31, 66], [33, 71], [29, 74], [25, 71]],
    confidence: 0.91,
    label: 'Pyknotic Nucleus',
    color: '#3b82f6',
    attributes: {
      area: 21.5,
      perimeter: 17.2,
      circularity: 0.58,
      intensity: 110,
      status: 'abnormal'
    },
    explanation: 'Exhibits pyknosis and nuclear condensation, highly characteristic of early programmed cell death.'
  }
];

const NEURON_DETECTIONS: Detection[] = [
  {
    id: 'nr-soma',
    type: 'soma',
    shape: 'polygon',
    points: [[45, 45], [55, 42], [58, 50], [52, 58], [44, 54]],
    confidence: 0.99,
    label: 'Neuron Soma',
    color: '#f97316',
    attributes: {
      area: 482.0,
      perimeter: 82.5,
      circularity: 0.84,
      intensity: 245,
      status: 'healthy'
    },
    explanation: 'Soma detected with high confidence (99%). Displays dense cytoplasm, strong orange-red immunoreactivity, intact nuclear boundaries, and robust dendritic roots.'
  },
  {
    id: 'nr-dendrite-1',
    type: 'dendrite',
    shape: 'line',
    points: [[45, 45], [30, 38], [18, 30], [10, 22]],
    confidence: 0.92,
    label: 'Apical Dendrite',
    color: '#ec4899',
    attributes: {
      length: 124.5,
      branchCount: 3,
      intensity: 160
    },
    explanation: 'Primary apical dendrite projecting upwards. Shows uniform microtubule-associated protein-2 staining, and numerous active post-synaptic dendritic spines.'
  },
  {
    id: 'nr-dendrite-1-b1',
    type: 'dendrite',
    shape: 'line',
    points: [[30, 38], [25, 48], [15, 52]],
    confidence: 0.85,
    label: 'Basal Dendrite A',
    color: '#ec4899',
    attributes: {
      length: 56.2,
      branchCount: 1,
      intensity: 135
    },
    explanation: 'Secondary dendritic branch emerging at a 45-degree angle from the main trunk, showing intact cytoskeleton structure.'
  },
  {
    id: 'nr-dendrite-2',
    type: 'dendrite',
    shape: 'line',
    points: [[55, 42], [70, 35], [82, 28], [92, 20]],
    confidence: 0.90,
    label: 'Lateral Dendrite B',
    color: '#ec4899',
    attributes: {
      length: 110.8,
      branchCount: 2,
      intensity: 155
    },
    explanation: 'Healthy lateral dendritic branch extending horizontally with rich synaptic connectivity nodes.'
  },
  {
    id: 'nr-axon',
    type: 'axon',
    shape: 'line',
    points: [[52, 58], [56, 72], [62, 85], [68, 96]],
    confidence: 0.88,
    label: 'Primary Axon',
    color: '#a855f7',
    attributes: {
      length: 168.4,
      branchCount: 0,
      intensity: 190
    },
    explanation: 'Thin primary axon projecting downwards from the axonal hillock. Shows uniform neurofilament staining, representing standard signal transduction pathway.'
  }
];

const HISTO_DETECTIONS: Detection[] = [
  {
    id: 'hs-nuc-1',
    type: 'nucleus',
    shape: 'rect',
    points: [[15, 12], [24, 20]],
    confidence: 0.96,
    label: 'Tumor Nucleus',
    color: '#a855f7',
    attributes: {
      area: 94.2,
      perimeter: 36.4,
      circularity: 0.72,
      status: 'abnormal'
    },
    explanation: 'Classified as abnormal/tumor nucleus. Exhibits significant hyperchromatism (dark staining), irregular shape, and enlarged nucleo-cytoplasmic ratio (> 1:2).'
  },
  {
    id: 'hs-nuc-2',
    type: 'nucleus',
    shape: 'rect',
    points: [[30, 25], [38, 33]],
    confidence: 0.94,
    label: 'Tumor Nucleus',
    color: '#a855f7',
    attributes: {
      area: 112.5,
      perimeter: 41.0,
      circularity: 0.68,
      status: 'abnormal'
    },
    explanation: 'Severe nuclear pleomorphism, severe anisokaryosis (highly variable nuclear size), and granular chromatin distribution typical of invasive carcinoma.'
  },
  {
    id: 'hs-nuc-3',
    type: 'nucleus',
    shape: 'rect',
    points: [[55, 18], [61, 24]],
    confidence: 0.95,
    label: 'Normal Nucleus',
    color: '#10b981',
    attributes: {
      area: 45.8,
      perimeter: 24.1,
      circularity: 0.88,
      status: 'healthy'
    },
    explanation: 'Classified as healthy stromal cell nucleus. Displays small circular profile, smooth borders, and uniform, light purple hematoxylin staining.'
  },
  {
    id: 'hs-nuc-4',
    type: 'nucleus',
    shape: 'rect',
    points: [[72, 45], [79, 52]],
    confidence: 0.91,
    label: 'Tumor Nucleus',
    color: '#a855f7',
    attributes: {
      area: 88.6,
      perimeter: 34.5,
      circularity: 0.75,
      status: 'abnormal'
    },
    explanation: 'Nuclear enlargement with visible nucleolar organizers and irregular nuclear envelope indentation.'
  },
  {
    id: 'hs-nuc-5',
    type: 'nucleus',
    shape: 'rect',
    points: [[22, 60], [29, 67]],
    confidence: 0.92,
    label: 'Normal Nucleus',
    color: '#10b981',
    attributes: {
      area: 48.2,
      perimeter: 24.8,
      circularity: 0.87,
      status: 'healthy'
    },
    explanation: 'Normal epithelial cell nucleus, typical of benign mammary ducts; small, compact, and circular shape.'
  },
  {
    id: 'hs-nuc-6',
    type: 'nucleus',
    shape: 'rect',
    points: [[44, 72], [52, 80]],
    confidence: 0.93,
    label: 'Mitotic Nucleus',
    color: '#f59e0b',
    attributes: {
      area: 125.0,
      perimeter: 48.2,
      circularity: 0.61,
      status: 'dividing'
    },
    explanation: 'Active atypical mitotic figure detected in tissue section (metaphase stage). Confirms high proliferative index within lesion area.'
  }
];

const BACTERIA_DETECTIONS: Detection[] = [
  {
    id: 'bc-colony-1',
    type: 'colony',
    shape: 'polygon',
    points: [[18, 22], [28, 16], [32, 24], [26, 32], [16, 28]],
    confidence: 0.99,
    label: 'E. coli Colony (Large)',
    color: '#f59e0b',
    attributes: {
      area: 1824.5,
      perimeter: 154.2,
      circularity: 0.91,
      morphology: 'irregular'
    },
    explanation: 'Standard large bacterial colony. Smooth circular margin (entire), cream-white dome shape, consistent with high-growth colony-forming unit.'
  },
  {
    id: 'bc-colony-2',
    type: 'colony',
    shape: 'polygon',
    points: [[52, 14], [58, 10], [62, 15], [59, 21], [53, 19]],
    confidence: 0.98,
    label: 'E. coli Colony (Medium)',
    color: '#f59e0b',
    attributes: {
      area: 942.0,
      perimeter: 110.4,
      circularity: 0.95,
      morphology: 'coccus'
    },
    explanation: 'Medium-sized circular colony. High density with standard mucoid texture and uniform bacterial colony parameters.'
  },
  {
    id: 'bc-colony-3',
    type: 'colony',
    shape: 'polygon',
    points: [[72, 38], [76, 35], [79, 39], [77, 43], [73, 41]],
    confidence: 0.97,
    label: 'E. coli Colony (Small)',
    color: '#f59e0b',
    attributes: {
      area: 412.5,
      perimeter: 72.8,
      circularity: 0.98,
      morphology: 'coccus'
    },
    explanation: 'Young bacterial colony unit, showing solid circular profile with high turgidity and uniform borders.'
  },
  {
    id: 'bc-colony-4',
    type: 'colony',
    shape: 'polygon',
    points: [[35, 62], [42, 58], [46, 64], [41, 71], [34, 67]],
    confidence: 0.98,
    label: 'E. coli Colony (Medium)',
    color: '#f59e0b',
    attributes: {
      area: 1120.2,
      perimeter: 120.5,
      circularity: 0.94,
      morphology: 'coccus'
    },
    explanation: 'Typical discrete E. coli colony showing high contrast against agar background. Safe morphological limits.'
  },
  {
    id: 'bc-colony-5',
    type: 'colony',
    shape: 'polygon',
    points: [[60, 68], [68, 62], [74, 69], [69, 78], [61, 74]],
    confidence: 0.96,
    label: 'Contaminant Colony',
    color: '#ef4444',
    attributes: {
      area: 2150.8,
      perimeter: 182.4,
      circularity: 0.74,
      morphology: 'irregular',
      status: 'abnormal'
    },
    explanation: 'Classified as microscopic fungal mold contaminant. Displays fuzzy/filamentous edges, dark-greenish sporulating center, distinct from standard smooth bacterial colonies.'
  }
];

const PLANT_DETECTIONS: Detection[] = [
  {
    id: 'pl-stomata-1',
    type: 'stomata',
    shape: 'polygon',
    points: [[22, 28], [30, 24], [34, 30], [28, 36], [21, 32]],
    confidence: 0.97,
    label: 'Active Stomata',
    color: '#10b981',
    attributes: {
      area: 124.5,
      perimeter: 42.6,
      circularity: 0.88,
      status: 'normal'
    },
    explanation: 'Open stomatal complex with two swollen guard cells. Normal transpiration activity and physiological cell health.'
  },
  {
    id: 'pl-stomata-2',
    type: 'stomata',
    shape: 'polygon',
    points: [[65, 20], [71, 17], [75, 22], [71, 27], [66, 25]],
    confidence: 0.95,
    label: 'Closed Stomata',
    color: '#3b82f6',
    attributes: {
      area: 98.2,
      perimeter: 38.4,
      circularity: 0.85,
      status: 'normal'
    },
    explanation: 'Closed stomata guard cells. Standard response under low light or high turgor stress conditions to prevent water loss.'
  },
  {
    id: 'pl-lesion-1',
    type: 'disease_spot',
    shape: 'polygon',
    points: [[40, 50], [52, 42], [60, 52], [52, 65], [42, 60]],
    confidence: 0.94,
    label: 'Early Chlorotic Lesion',
    color: '#ef4444',
    attributes: {
      area: 452.8,
      perimeter: 84.5,
      circularity: 0.71,
      status: 'infected'
    },
    explanation: 'Early fungal foliar spot (suspected Alternaria tenuis). Exhibits concentric necrotic center ring, brown dead cell walls, and surrounding yellow chlorotic halo.'
  },
  {
    id: 'pl-stomata-3',
    type: 'stomata',
    shape: 'polygon',
    points: [[25, 68], [31, 65], [34, 70], [30, 75], [26, 73]],
    confidence: 0.91,
    label: 'Stomata (Infected)',
    color: '#f59e0b',
    attributes: {
      area: 110.2,
      perimeter: 40.5,
      circularity: 0.86,
      status: 'infected'
    },
    explanation: 'Stomatal opening blocked by early hyphal growth. Impeded gas exchange, highly vulnerable to structural plant tissue damage.'
  }
];

// Helper to generate a highly convincing intensity histogram based on category
export function generateIntensityHistogram(category: DetectionCategory) {
  const data = [];
  let baseMean = 120;
  let dev = 40;
  if (category === 'cells') {
    // Bimodal distribution: DAPI & GFP peaks
    for (let i = 0; i <= 255; i += 5) {
      const peak1 = 120 * Math.exp(-Math.pow(i - 45, 2) / 400); // Background/Nuclei
      const peak2 = 240 * Math.exp(-Math.pow(i - 180, 2) / 800); // Cytoplasm/high fluorescence
      const noise = Math.random() * 5;
      data.push({ intensity: i, count: Math.round(peak1 + peak2 + noise + 2) });
    }
  } else if (category === 'neurons') {
    // Sharp peak for soma background, tapering off for neurites
    for (let i = 0; i <= 255; i += 5) {
      const peak = 300 * Math.exp(-Math.pow(i - 20, 2) / 200); // Background
      const signal = 100 * Math.exp(-Math.pow(i - 140, 2) / 2000); // Tracing
      const noise = Math.random() * 4;
      data.push({ intensity: i, count: Math.round(peak + signal + noise + 1) });
    }
  } else if (category === 'histology') {
    // H&E standard cell intensity (eosin pink 180, hematoxylin purple 80)
    for (let i = 0; i <= 255; i += 5) {
      const eosin = 200 * Math.exp(-Math.pow(i - 190, 2) / 500); // Pink
      const hematoxylin = 160 * Math.exp(-Math.pow(i - 85, 2) / 600); // Purple
      const noise = Math.random() * 6;
      data.push({ intensity: i, count: Math.round(eosin + hematoxylin + noise + 3) });
    }
  } else {
    // Gaussian distribution with uniform background
    for (let i = 0; i <= 255; i += 5) {
      const g = 250 * Math.exp(-Math.pow(i - baseMean, 2) / (dev * dev));
      const noise = Math.random() * 5;
      data.push({ intensity: i, count: Math.round(g + noise + 5) });
    }
  }
  return data;
}

// Function to calculate aggregate stats from detections
export function computeStats(detections: Detection[], category: DetectionCategory): AnalysisResult['summary'] {
  const count = detections.length;
  if (count === 0) {
    return { count: 0, avgSize: 0, avgCircularity: 0, density: 0 };
  }

  let totalSize = 0;
  let sizeCount = 0;
  let totalCircularity = 0;
  let circularityCount = 0;

  detections.forEach((d) => {
    if (d.attributes.area) {
      totalSize += d.attributes.area;
      sizeCount++;
    }
    if (d.attributes.circularity) {
      totalCircularity += d.attributes.circularity;
      circularityCount++;
    }
  });

  const avgSize = sizeCount > 0 ? parseFloat((totalSize / sizeCount).toFixed(1)) : 0;
  const avgCircularity = circularityCount > 0 ? parseFloat((totalCircularity / circularityCount).toFixed(2)) : 0;
  
  // Calculate a convincing simulated density per mm²
  let density = 0;
  if (category === 'cells') {
    density = Math.round(count * 450); // cells per mm²
  } else if (category === 'neurons') {
    density = Math.round(count * 85);
  } else if (category === 'histology') {
    density = Math.round(count * 620);
  } else if (category === 'bacteria') {
    density = Math.round(count * 12); // cfus per plate
  } else {
    density = Math.round(count * 180);
  }

  return {
    count,
    avgSize,
    avgCircularity,
    density,
    totalArea: parseFloat(totalSize.toFixed(1))
  };
}

// Full AnalysisResult for the pre-packaged sample images
export function getSampleResult(sampleId: string): AnalysisResult {
  let detections: Detection[] = [];
  let category: DetectionCategory = 'cells';

  switch (sampleId) {
    case 'sample-fluorescence':
      detections = JSON.parse(JSON.stringify(FLUO_DETECTIONS));
      category = 'cells';
      break;
    case 'sample-neuron':
      detections = JSON.parse(JSON.stringify(NEURON_DETECTIONS));
      category = 'neurons';
      break;
    case 'sample-histology':
      detections = JSON.parse(JSON.stringify(HISTO_DETECTIONS));
      category = 'histology';
      break;
    case 'sample-bacteria':
      detections = JSON.parse(JSON.stringify(BACTERIA_DETECTIONS));
      category = 'bacteria';
      break;
    case 'sample-plant':
      detections = JSON.parse(JSON.stringify(PLANT_DETECTIONS));
      category = 'plants';
      break;
    default:
      detections = JSON.parse(JSON.stringify(FLUO_DETECTIONS));
  }

  return {
    detections,
    summary: computeStats(detections, category),
    histogramData: generateIntensityHistogram(category)
  };
}

// Function to generate high-fidelity simulated results for custom user-uploaded images on the fly
export function generateUploadedResult(fileName: string): AnalysisResult {
  // Try to parse suitable parameters based on file name or default to cells
  const lowerName = fileName.toLowerCase();
  let category: DetectionCategory = 'cells';
  let prefix = 'up-cell-';
  let type: DetectionType = 'cell';
  
  if (lowerName.includes('neuron') || lowerName.includes('brain') || lowerName.includes('nerve')) {
    category = 'neurons';
    prefix = 'up-nr-';
    type = 'soma';
  } else if (lowerName.includes('histo') || lowerName.includes('slide') || lowerName.includes('tissue') || lowerName.includes('biopsy')) {
    category = 'histology';
    prefix = 'up-hs-';
    type = 'nucleus';
  } else if (lowerName.includes('bacteria') || lowerName.includes('plate') || lowerName.includes('colony') || lowerName.includes('petri')) {
    category = 'bacteria';
    prefix = 'up-bc-';
    type = 'colony';
  } else if (lowerName.includes('plant') || lowerName.includes('leaf') || lowerName.includes('root') || lowerName.includes('stoma')) {
    category = 'plants';
    prefix = 'up-pl-';
    type = 'stomata';
  }

  // Generate 4-8 randomized but highly scientific detections
  const numDetections = Math.floor(Math.random() * 5) + 5;
  const detections: Detection[] = [];

  for (let i = 0; i < numDetections; i++) {
    const confidence = parseFloat((0.82 + Math.random() * 0.17).toFixed(2));
    const size = Math.floor(50 + Math.random() * 200);
    const circularity = parseFloat((0.65 + Math.random() * 0.33).toFixed(2));
    const intensity = Math.floor(100 + Math.random() * 140);
    
    // Position of object
    const cx = Math.floor(10 + Math.random() * 80);
    const cy = Math.floor(10 + Math.random() * 80);
    const radius = Math.floor(3 + Math.random() * 7);

    // Make polygon points or rectangle points
    let shape: 'rect' | 'polygon' | 'point' | 'line' = 'polygon';
    let points: [number, number][] = [];
    let label = 'Detected Feature';
    let color = '#3b82f6';
    let specificType: DetectionType = type;

    if (category === 'cells') {
      const isNucleus = Math.random() > 0.5;
      specificType = isNucleus ? 'nucleus' : 'cell';
      shape = 'polygon';
      color = isNucleus ? '#3b82f6' : '#10b981';
      label = isNucleus ? 'Nucleus' : 'Cell Object';
      
      // Hexagon-ish points
      points = [
        [cx - radius, cy],
        [cx - radius/2, cy - radius],
        [cx + radius/2, cy - radius],
        [cx + radius, cy],
        [cx + radius/2, cy + radius],
        [cx - radius/2, cy + radius]
      ];
    } else if (category === 'neurons') {
      const isSoma = i === 0; // Exactly one soma, others dendrites
      specificType = isSoma ? 'soma' : 'dendrite';
      shape = isSoma ? 'polygon' : 'line';
      color = isSoma ? '#f97316' : '#ec4899';
      label = isSoma ? 'Neuron Soma' : 'Neurite Segment';

      if (isSoma) {
        points = [
          [50, 50], [56, 46], [62, 52], [55, 58], [48, 55]
        ];
      } else {
        points = [
          [50, 50],
          [cx, cy],
          [cx + (Math.random() > 0.5 ? 10 : -10), cy + (Math.random() > 0.5 ? 10 : -10)]
        ];
      }
    } else if (category === 'histology') {
      specificType = 'nucleus';
      shape = 'rect';
      const isAbnormal = Math.random() > 0.6;
      color = isAbnormal ? '#a855f7' : '#10b981';
      label = isAbnormal ? 'Tumor Nucleus' : 'Normal Nucleus';
      points = [
        [cx - radius, cy - radius],
        [cx + radius, cy + radius]
      ];
    } else if (category === 'bacteria') {
      specificType = 'colony';
      shape = 'polygon';
      const isAbnormal = Math.random() > 0.8;
      color = isAbnormal ? '#ef4444' : '#f59e0b';
      label = isAbnormal ? 'Contaminant' : 'Colony CFU';
      points = [
        [cx, cy - radius],
        [cx + radius, cy - radius/2],
        [cx + radius, cy + radius/2],
        [cx, cy + radius],
        [cx - radius, cy + radius/2],
        [cx - radius, cy - radius/2]
      ];
    } else {
      // Plants
      const isLesion = Math.random() > 0.6;
      specificType = isLesion ? 'disease_spot' : 'stomata';
      shape = 'polygon';
      color = isLesion ? '#ef4444' : '#10b981';
      label = isLesion ? 'Necrotic Lesion' : 'Foliar Stomata';
      points = [
        [cx - radius, cy],
        [cx - radius/2, cy - radius],
        [cx + radius/2, cy - radius],
        [cx + radius, cy],
        [cx + radius/2, cy + radius],
        [cx - radius/2, cy + radius]
      ];
    }

    detections.push({
      id: `${prefix}${i}`,
      type: specificType,
      shape,
      points,
      confidence,
      label,
      color,
      attributes: {
        area: size,
        perimeter: Math.round(size * 0.25),
        circularity,
        intensity,
        status: category === 'histology' 
          ? (label.includes('Tumor') ? 'abnormal' : 'healthy')
          : (category === 'cells' && Math.random() > 0.7 ? 'dead' : 'healthy'),
        length: category === 'neurons' ? Math.round(size * 0.8) : undefined,
        branchCount: category === 'neurons' && shape === 'line' ? Math.floor(Math.random() * 3) : undefined,
        morphology: category === 'bacteria' ? (Math.random() > 0.5 ? 'coccus' : 'irregular') : undefined
      },
      explanation: `Detections resolved with ${Math.round(confidence * 100)}% visual alignment probability. Morphology matches standard criteria for experimental biological imaging.`
    });
  }

  return {
    detections,
    summary: computeStats(detections, category),
    histogramData: generateIntensityHistogram(category)
  };
}
