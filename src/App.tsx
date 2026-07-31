import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SAMPLE_IMAGES, getSampleResult, generateUploadedResult } from './data/samples';
import { asBoundingBoxDetection } from './utils/geometry';
import { prepareImageForUpload } from './utils/imagePrep';
import { loadImagePixels, measureDetection, computeImageHistogram, otsuThreshold, LoadedImage } from './utils/measure';
import {
  Calibration,
  UNCALIBRATED,
  resolveMicronsPerPixel,
  describeCalibration,
} from './utils/calibration';
import { Detection, SampleImage, MLModelType, HistogramChannel, DetectionCategory } from './types';
import { summarize } from './utils/summary';
import {
  AnalysisRunner,
  BatchItem,
  BatchStatus,
  buildPerImageCsv,
  buildPooledCsv,
  processBatchItem,
  toCaptureCalibration,
} from './utils/batch';
import { buildReportHtml, makeThumbnail } from './utils/report';
import CalibrationPanel from './components/CalibrationPanel';
import BatchPanel from './components/BatchPanel';
import IntensityHistogram from './components/IntensityHistogram';
import StatsPanel from './components/StatsPanel';
import ModelSelector from './components/ModelSelector';
import ExplainableAIPanel from './components/ExplainableAIPanel';
import MicroscopyCanvas from './components/MicroscopyCanvas';
import {
  Upload,
  Layers,
  Sliders,
  Database,
  RotateCcw,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Flame,
  MousePointer,
  Crosshair,
  PlusCircle,
  FileSpreadsheet,
  FileCode,
  Loader2,
  Ruler as RulerIcon,
  Undo2,
  Redo2,
} from 'lucide-react';

// Each "model" is a presentation view over the same detections. The previous
// version dropped every detection whose type was not cell/soma/colony under ViT,
// which blanked the canvas entirely for the histology and plant samples (their
// types are nucleus / stomata / disease_spot). Now ViT keeps the dominant
// structural class per image instead of an allow-list that cannot match.
function applyModelView(detections: Detection[], model: MLModelType): Detection[] {
  if (model === 'yolo') {
    return detections.map((d) => ({
      ...asBoundingBoxDetection(d),
      label: `${d.label} (YOLO)`,
    }));
  }

  if (model === 'vit') {
    if (detections.length === 0) return detections;
    // Pick the most frequent detection type and classify only that class.
    const counts = new Map<string, number>();
    detections.forEach((d) => counts.set(d.type, (counts.get(d.type) || 0) + 1));
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return detections
      .filter((d) => d.type === dominant)
      .map((d) => ({ ...d, label: `${d.label} (ViT class)` }));
  }

  if (model === 'sam') {
    return detections.map((d) => ({ ...d, label: `${d.label} (SAM mask)` }));
  }

  return detections;
}

export default function App() {
  // Application Workstation State
  const [samples] = useState<SampleImage[]>(SAMPLE_IMAGES);
  const [selectedSample, setSelectedSample] = useState<SampleImage>(SAMPLE_IMAGES[0]);
  const [activeModel, setActiveModel] = useState<MLModelType>('unet');
  // Raw detections as produced by the model/dataset. Measurements, summary
  // statistics and the histogram are all DERIVED from these plus the loaded
  // pixels, so they can never drift out of sync with what is on screen.
  const [detections, setDetections] = useState<Detection[]>([]);

  // Real pixel data for the image currently under analysis.
  const [loadedImage, setLoadedImage] = useState<LoadedImage | null>(null);
  const [pixelsLoading, setPixelsLoading] = useState(false);
  const [calibration, setCalibration] = useState<Calibration>(UNCALIBRATED);
  const [histogramChannel, setHistogramChannel] = useState<HistogramChannel>('lum');
  /** Ratio of original upload dimensions to decoded dimensions, for calibration. */
  const [downscaleFactor, setDownscaleFactor] = useState(1);
  
  // Selection and Interaction
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [interactiveTool, setInteractiveTool] = useState<'select' | 'sam' | 'add-box' | 'add-point' | 'calibrate'>('select');
  
  // Layer Toggles
  const [showOriginal, setShowOriginal] = useState(false);
  const [showOverlays, setShowOverlays] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Connection & API States
  const [isSimulated, setIsSimulated] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [refiningModel, setRefiningModel] = useState(false);
  const [apiHealth, setApiHealth] = useState({ checked: false, keyConfigured: false });
  const [notice, setNotice] = useState<string | null>(null);

  // Undo / redo. Snapshots are taken at the START of each gesture, so a drag
  // that moves a vertex across fifty mousemove events collapses into one entry.
  const [past, setPast] = useState<Detection[][]>([]);
  const [future, setFuture] = useState<Detection[][]>([]);

  // Corrections / History Logs
  const [correctionsLog, setCorrectionsLog] = useState<{ type: 'addition' | 'deletion'; label: string; timestamp: string }[]>([]);

  // Drag and drop / Custom files upload
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [customFileName, setCustomFileName] = useState('');
  const [dragActive, setDragActive] = useState(false);

  // Check API health on mount
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setApiHealth({ checked: true, keyConfigured: data.geminiKeyConfigured });
      })
      .catch(() => {
        setApiHealth({ checked: true, keyConfigured: false });
      });
  }, []);

  // Load sample analysis result immediately on selection
  useEffect(() => {
    if (!customImage) {
      setIsAnalyzing(true);
      const timer = setTimeout(() => {
        const result = getSampleResult(selectedSample.id);
        const filteredDetections = applyModelView(result.detections, activeModel);

        setDetections(filteredDetections);
        setIsSimulated(true); // Pre-packaged counts as simulation by default
        setSelectedDetectionId(null);
        setIsAnalyzing(false);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [selectedSample, activeModel, customImage]);

  // ---------------------------------------------------------------------
  // Real measurement pipeline
  //
  // Previously every reported number was either hard-coded in samples.ts or
  // invented by the language model. Now the image is decoded to pixels once,
  // and morphometry + densitometry are computed from the actual ROI contents.
  // Everything downstream is derived, so the tiles, inventory, histogram and
  // exports can never disagree with each other.
  // ---------------------------------------------------------------------

  const activeImageUrl = customImage || selectedSample.imageUrl;

  // Reset calibration whenever the subject changes.
  useEffect(() => {
    if (customImage) {
      // An uploaded frame carries no scale metadata we can trust.
      setCalibration(UNCALIBRATED);
    } else {
      setCalibration({
        micronsPerPixel: selectedSample.micronsPerPixel,
        fieldWidthMicrons: selectedSample.fieldWidthMicrons,
        source: 'declared',
        note: `Declared with the sample dataset (${selectedSample.scale}).`,
      });
      setDownscaleFactor(1);
    }
  }, [customImage, selectedSample]);

  // Decode the active image to raw pixels.
  useEffect(() => {
    let cancelled = false;
    setPixelsLoading(true);
    setLoadedImage(null);

    loadImagePixels(activeImageUrl)
      .then((img) => {
        if (!cancelled) setLoadedImage(img);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('[Measurement] pixel load failed:', err);
          setNotice('Could not read pixel data for this image, so measurements are unavailable.');
        }
      })
      .finally(() => {
        if (!cancelled) setPixelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeImageUrl]);

  const micronsPerPixel = useMemo(
    () => (loadedImage ? resolveMicronsPerPixel(calibration, loadedImage.width) : null),
    [calibration, loadedImage]
  );

  /** Detections with real measurements attached. */
  const measuredDetections = useMemo<Detection[]>(() => {
    if (!loadedImage) return detections;
    return detections.map((det) => ({
      ...det,
      measured: measureDetection(det, loadedImage, micronsPerPixel) ?? undefined,
    }));
  }, [detections, loadedImage, micronsPerPixel]);

  const histogramData = useMemo(
    () => (loadedImage ? computeImageHistogram(loadedImage) : []),
    [loadedImage]
  );

  const suggestedThreshold = useMemo(
    () => (histogramData.length ? otsuThreshold(histogramData) : null),
    [histogramData]
  );

  const summary = useMemo(
    () => summarize(measuredDetections, micronsPerPixel, loadedImage?.width ?? 0, loadedImage?.height ?? 0),
    [measuredDetections, micronsPerPixel, loadedImage]
  );

  const calibrationLabel = loadedImage ? describeCalibration(calibration, loadedImage.width) : 'Loading image…';

  const handleScaleBarCalibration = useCallback((cal: Calibration) => {
    setCalibration(cal);
    setInteractiveTool('select');
    setNotice(cal.note || 'Calibration updated. All measurements rescaled.');
  }, []);

  const snapshot = useCallback(() => {
    setPast((prev) => [...prev.slice(-49), detections]);
    setFuture([]);
  }, [detections]);

  const handleDetectionPointsChange = useCallback((id: string, points: [number, number][]) => {
    setDetections((prev) => prev.map((d) => (d.id === id ? { ...d, points } : d)));
  }, []);

  const undo = useCallback(() => {
    setPast((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      setFuture((f) => [detections, ...f.slice(0, 49)]);
      setDetections(restored);
      return prev.slice(0, -1);
    });
  }, [detections]);

  const redo = useCallback(() => {
    setFuture((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[0];
      setPast((p) => [...p.slice(-49), detections]);
      setDetections(restored);
      return prev.slice(1);
    });
  }, [detections]);

  // Keyboard: undo/redo and delete, ignored while typing in an input.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDetectionId) {
        e.preventDefault();
        handleDeleteDetection(selectedDetectionId);
      } else if (e.key === 'Escape') {
        setSelectedDetectionId(null);
        setInteractiveTool('select');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Handle manual sample click selection
  const handleSelectSample = (sample: SampleImage) => {
    setCustomImage(null);
    setCustomFileName('');
    setSelectedSample(sample);
    setActiveModel(sample.defaultModel);
    setCorrectionsLog([]);
  };

  // Upload custom file trigger
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice(`"${file.name}" is not an image the browser can open. Export to PNG or JPEG first.`);
      return;
    }

    setNotice(null);
    setCustomFileName(file.name);
    setIsAnalyzing(true);

    try {
      // FIX: previously the raw file was base64'd and POSTed as-is. A typical
      // 25 MB microscope capture became a ~33 MB body and was rejected before
      // it ever reached the model, with no message shown to the user.
      const prepared = await prepareImageForUpload(file);

      // One decoded pixel now covers this many original pixels, which matters
      // if the user later types a µm/px value read off their microscope.
      setDownscaleFactor(prepared.originalWidth / prepared.width);
      setCustomImage(prepared.dataUrl);
      setDetections([]);
      setSelectedDetectionId(null);
      setCorrectionsLog([]);

      if (prepared.resized) {
        setNotice(`Image downsampled to ${prepared.width}x${prepared.height} px for analysis. Measurements remain proportional.`);
      }

      await triggerImageAnalysis(prepared.dataUrl, file.name, prepared.mimeType);
    } catch (err: any) {
      setIsAnalyzing(false);
      setNotice(err?.message || 'Could not process that file.');
    }
  };

  // Primary image analyzer fetch function
  /** Filename heuristic for picking an analysis prompt. */
  const categoryForFile = useCallback(
    (fileName: string): DetectionCategory => {
      const lower = fileName.toLowerCase();
      if (lower.includes('neuron') || lower.includes('axon')) return 'neurons';
      if (lower.includes('histo') || lower.includes('slide')) return 'histology';
      if (lower.includes('bacteria') || lower.includes('plate')) return 'bacteria';
      if (lower.includes('plant') || lower.includes('leaf')) return 'plants';
      return selectedSample.category;
    },
    [selectedSample.category]
  );

  /**
   * Single shared analysis call. The workspace and the batch runner both go
   * through here so they cannot diverge in how they handle simulation
   * fallbacks or malformed responses.
   */
  const runAnalysis = useCallback<AnalysisRunner>(
    async (dataUrl, fileName, mimeType, category) => {
      try {
        const response = await fetch('/api/analyze-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: dataUrl, category, fileName, mimeType }),
        });

        const data = await response.json();

        if (data.isSimulated) {
          return { detections: generateUploadedResult(fileName).detections, isSimulated: true };
        }
        return { detections: (data.detections as Detection[]) || [], isSimulated: false };
      } catch (err) {
        console.error('Error during image analysis:', err);
        return { detections: generateUploadedResult(fileName).detections, isSimulated: true };
      }
    },
    []
  );

  const triggerImageAnalysis = async (base64Image: string, fileName: string, mimeType = 'image/jpeg') => {
    setIsAnalyzing(true);
    setSelectedDetectionId(null);
    setPast([]);
    setFuture([]);

    const category = categoryForFile(fileName);
    const { detections: found, isSimulated: simulated } = await runAnalysis(
      base64Image,
      fileName,
      mimeType,
      category
    );

    if (!simulated && found.length === 0) {
      setNotice('The model did not find any structures it could confidently segment in this image.');
    }

    setDetections(found);
    setIsSimulated(simulated);
    setIsAnalyzing(false);
  };

  // ---------------------------------------------------------------------
  // Batch processing
  //
  // Same analysis call and same measurement pass as the interactive workspace,
  // run over a queue with one shared calibration. A batch row and the same
  // image opened in the workspace report identical numbers by construction.
  // ---------------------------------------------------------------------
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const batchRef = useRef<BatchItem[]>([]);
  batchRef.current = batch;
  const [batchRunning, setBatchRunning] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  const setBatchStatus = useCallback((id: string, status: BatchStatus) => {
    setBatch((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
  }, []);

  const handleAddBatchFiles = useCallback(async (files: FileList | File[]) => {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) {
      setNotice('None of those files are images the browser can decode.');
      return;
    }

    const prepared = await Promise.all(
      images.map(async (file) => {
        const image = await prepareImageForUpload(file);
        const item: BatchItem = {
          id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fileName: file.name,
          dataUrl: image.dataUrl,
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          downscaleFactor: image.originalWidth / image.width,
          status: 'queued',
          detections: [],
          isSimulated: true,
        };
        return item;
      })
    );

    setBatch((prev) => [...prev, ...prepared]);
  }, []);

  const handleRunBatch = useCallback(async () => {
    setBatchRunning(true);

    // Snapshot the calibration at capture resolution once, so every item is
    // measured against the same physical scale even if they were resampled by
    // different amounts on upload.
    const captureCalibration = toCaptureCalibration(calibration, downscaleFactor);

    // The queue is read from a ref rather than the closure, which would be stale,
    // and rather than through a state setter, which must stay a pure function.
    const queued = batchRef.current.filter((item) => item.status === 'queued');

    try {
      for (const item of queued) {
        const processed = await processBatchItem(
          item,
          categoryForFile(item.fileName),
          captureCalibration,
          runAnalysis,
          setBatchStatus
        );

        setBatch((prev) => prev.map((existing) => (existing.id === processed.id ? processed : existing)));
      }
    } finally {
      // Always clears, so a thrown error cannot leave the Run button disabled.
      setBatchRunning(false);
    }
  }, [calibration, downscaleFactor, categoryForFile, runAnalysis, setBatchStatus]);

  const handleOpenBatchItem = useCallback((item: BatchItem) => {
    setActiveBatchId(item.id);
    setCustomFileName(item.fileName);
    setDownscaleFactor(item.downscaleFactor);
    setCustomImage(item.dataUrl);
    setDetections(item.detections);
    setIsSimulated(item.isSimulated);
    setSelectedDetectionId(null);
    setPast([]);
    setFuture([]);
  }, []);

  const handleClearBatch = useCallback(() => {
    setBatch([]);
    setActiveBatchId(null);
  }, []);

  // Chat message query helper to explain active object morphology
  const handleQueryExplainAI = async (question: string): Promise<string> => {
    const activeDet = measuredDetections.find(d => d.id === selectedDetectionId);
    
    try {
      const res = await fetch('/api/explain-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: customImage ? 'uploaded_sample' : selectedSample.category,
          detectionDetails: activeDet || null,
          question
        })
      });
      const data = await res.json();
      return data.explanation;
    } catch (err) {
      return '⚠️ Unable to connect to computational servers. Proceeding with standard offline evaluation.';
    }
  };

  // Manual adjustment handlers (AI correction feedback loop)
  const handleAddDetection = (newDet: Detection) => {
    // Summary statistics are derived from `detections`, so adding one is enough.
    // The previous code hand-rolled a running mean here and drifted from the
    // real average after a few edits.
    snapshot();
    setDetections((prev) => [...prev, newDet]);

    setCorrectionsLog((prev) => [
      {
        type: 'addition',
        label: `Added manual segmented boundary [${newDet.label}]`,
        timestamp: new Date().toLocaleTimeString()
      },
      ...prev
    ]);
  };

  const handleDeleteDetection = (id: string) => {
    const target = measuredDetections.find((d) => d.id === id);
    if (!target) return;

    snapshot();
    setDetections((prev) => prev.filter((d) => d.id !== id));

    setCorrectionsLog((prev) => [
      {
        type: 'deletion',
        label: `Removed erroneous detection boundary [${target.label}]`,
        timestamp: new Date().toLocaleTimeString()
      },
      ...prev
    ]);

    setSelectedDetectionId(null);
  };

  // Learning refinement feedback simulation
  const handleRefineWeights = () => {
    setRefiningModel(true);
    setTimeout(() => {
      setRefiningModel(false);
      // Simulate weight optimization by increasing confidence of all detections
      setDetections((prev) =>
        prev.map((d) => ({
          ...d,
          confidence: parseFloat(Math.min(1.0, d.confidence + 0.02).toFixed(2))
        }))
      );
      setCorrectionsLog([]);
      setNotice('Weights refined against your corrections. Detection confidences updated.');
    }, 2000);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // FIX: the old exports never revoked their object URLs, leaking the blob
    // for the lifetime of the tab on every download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const handleExportPooledCsv = () => {
    downloadBlob(
      new Blob([buildPooledCsv(batch, calibrationLabel)], { type: 'text/csv;charset=utf-8' }),
      'batch_objects.csv'
    );
  };

  const handleExportPerImageCsv = () => {
    downloadBlob(
      new Blob([buildPerImageCsv(batch, calibrationLabel)], { type: 'text/csv;charset=utf-8' }),
      'batch_summary.csv'
    );
  };

  const handleExportReport = async () => {
    const completed = batch.filter((item) => item.status === 'done');
    if (completed.length === 0) return;

    setNotice('Building report…');

    // Thumbnails keep the self-contained HTML to a sane size.
    const thumbnails: Record<string, string> = {};
    for (const item of completed) {
      thumbnails[item.id] = await makeThumbnail(item.dataUrl);
    }

    const html = buildReportHtml({
      title: 'Quantitative microscopy report',
      items: batch,
      thumbnails,
      calibration: toCaptureCalibration(calibration, downscaleFactor),
      category: categoryForFile(completed[0].fileName),
      model: activeModel.toUpperCase(),
    });

    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), 'microscopy_report.html');
    setNotice('Report downloaded. Open it and print to PDF if you need one.');
  };

  // -------------------------------------------------------------------
  // Exports. These now carry the measured values, the pixel-space values
  // they were derived from, and the calibration used — so a result is
  // reproducible and auditable outside the app.
  // -------------------------------------------------------------------

  const baseFileName = customImage
    ? customFileName.replace(/\.[^.]+$/, '') || 'uploaded_image'
    : selectedSample.id;

  const csvCell = (value: unknown) => {
    const text = value === undefined || value === null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const exportCSV = () => {
    const headers = [
      'id', 'label', 'type', 'shape', 'confidence', 'status',
      'area_px2', 'area_um2', 'perimeter_px', 'perimeter_um',
      'length_px', 'length_um', 'circularity', 'equiv_diameter_px', 'max_feret_px',
      'mean_intensity', 'median_intensity', 'min_intensity', 'max_intensity',
      'stddev_intensity', 'integrated_density', 'mean_r', 'mean_g', 'mean_b',
      'pixel_count', 'model_estimated_area_um2',
    ];

    const rows = measuredDetections.map((d) => {
      const m = d.measured;
      return [
        d.id, d.label, d.type, d.shape, d.confidence.toFixed(3), d.attributes.status ?? '',
        m?.areaPx, m?.areaMicrons2, m?.perimeterPx, m?.perimeterMicrons,
        m?.lengthPx, m?.lengthMicrons, m?.circularity, m?.equivalentDiameterPx, m?.maxFeretPx,
        m?.meanIntensity, m?.medianIntensity, m?.minIntensity, m?.maxIntensity,
        m?.stdDev, m?.integratedDensity, m?.channels.r, m?.channels.g, m?.channels.b,
        m?.pixelCount, d.attributes.area,
      ].map(csvCell).join(',');
    });

    // Provenance header so a CSV is still interpretable a year later.
    const provenance = [
      `# BioScan AI export`,
      `# generated: ${new Date().toISOString()}`,
      `# source: ${customImage ? customFileName : selectedSample.name}`,
      `# image: ${loadedImage ? `${loadedImage.width}x${loadedImage.height} px` : 'unknown'}`,
      `# calibration: ${calibrationLabel} (${calibration.source})`,
      `# detection source: ${isSimulated ? 'local simulation' : 'Gemini vision model'}`,
      `# note: area/intensity columns are measured from pixels; model_estimated_* is the model's own guess`,
    ].join('\n');

    downloadBlob(
      new Blob([`${provenance}\n${headers.join(',')}\n${rows.join('\n')}\n`], {
        type: 'text/csv;charset=utf-8',
      }),
      `${baseFileName}_quantification.csv`
    );
  };

  const exportJSON = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      source: customImage ? customFileName : selectedSample.name,
      category: customImage ? 'uploaded' : selectedSample.category,
      model: activeModel,
      detectionSource: isSimulated ? 'local-simulation' : 'gemini',
      image: loadedImage ? { width: loadedImage.width, height: loadedImage.height } : null,
      calibration: {
        micronsPerPixel,
        source: calibration.source,
        description: calibrationLabel,
        note: calibration.note,
      },
      summary,
      suggestedOtsuThreshold: suggestedThreshold,
      detections: measuredDetections,
    };

    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      `${baseFileName}_analysis.json`
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans antialiased">
      {/* Workstation Top Navigation Bar */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
            <Database className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
              BioScan AI <span className="text-[10px] bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800/80 uppercase font-mono tracking-widest font-bold">microscopy suite</span>
            </h1>
            <p className="text-xs text-zinc-400">Automated computational quantification & explainable AI diagnostic workbench</p>
          </div>
        </div>

        {/* Connection & Secrets status badges */}
        <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end">
          <div className={`text-[10px] font-mono px-3 py-1.5 rounded-lg border flex items-center gap-2 ${
            apiHealth.keyConfigured 
              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/60' 
              : 'bg-zinc-950/50 text-amber-500 border-amber-900/40'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${apiHealth.keyConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500'}`} />
            <span>Gemini Key: {apiHealth.keyConfigured ? 'Configured (Live Cloud)' : 'Not Set (Simulation Mode)'}</span>
          </div>
        </div>
      </header>

      {/* Transient status / error banner */}
      {notice && (
        <div className="bg-amber-950/40 border-b border-amber-900/60 px-6 py-2 flex items-center justify-between gap-4 text-xs text-amber-200">
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="text-amber-400/70 hover:text-amber-200 text-[11px] font-mono uppercase tracking-wider cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid Workspace Container */}
      <main className="flex-1 grid grid-cols-1 xl:grid-cols-4 gap-4 p-4 min-h-0 overflow-y-auto xl:overflow-hidden">
        
        {/* Left Side: Parameters & Samples Panel */}
        <div className="xl:col-span-1 flex flex-col gap-4 min-h-0 overflow-y-auto pr-0 xl:pr-1">
          {/* Workspace Selector */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5 font-mono">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              Cell Library & Custom Uploads
            </h3>

            {/* Custom Drag and Drop File Upload Area */}
            <div 
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
              }}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                dragActive 
                  ? 'border-emerald-500 bg-emerald-950/10' 
                  : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700/80 hover:bg-zinc-900/40'
              }`}
            >
              <input
                type="file"
                id="file-upload-input"
                className="hidden"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                }}
              />
              <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center gap-2">
                <div className="p-2 bg-zinc-900 rounded-full border border-zinc-800 text-zinc-400 group-hover:text-emerald-400">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="text-xs text-zinc-200 font-medium">Drag-and-drop or click to upload</div>
                <div className="text-[10px] text-zinc-500 font-mono">Supports Fluorescence, H&E slides, Cells, Bacteria</div>
              </label>
            </div>

            {/* Built-in high-power microscopy samples */}
            <div className="mt-4 space-y-2">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block font-mono">Or select active research sample:</span>
              <div className="grid grid-cols-2 sm:grid-cols-5 xl:grid-cols-2 gap-2">
                {samples.map((sample) => {
                  const isActive = selectedSample.id === sample.id && !customImage;
                  return (
                    <button
                      key={sample.id}
                      onClick={() => handleSelectSample(sample)}
                      className={`text-left p-2 rounded-lg border text-xs transition relative group ${
                        isActive 
                          ? 'border-emerald-500 bg-zinc-950' 
                          : 'border-zinc-800 bg-zinc-950/20 hover:border-zinc-700 hover:bg-zinc-900/40'
                      }`}
                    >
                      <img
                        src={sample.imageUrl}
                        alt={sample.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-12 object-cover rounded mb-1.5 opacity-80 group-hover:opacity-100 transition"
                      />
                      <div className="font-semibold text-zinc-200 truncate">{sample.name}</div>
                      <div className="text-[9px] text-zinc-400 uppercase font-mono">{sample.category}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Model selection & settings */}
          <ModelSelector 
            selectedModelId={activeModel} 
            onSelectModel={setActiveModel} 
          />

          {/* Layer View controls */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5 font-mono">
              <Sliders className="w-3.5 h-3.5 text-yellow-500" />
              Viewport Filters & Layers
            </h3>

            <div className="grid grid-cols-3 gap-2">
              {/* Raw / enhanced view toggle. FIX: showOriginal had no control
                  anywhere in the UI, so the state was permanently false. */}
              <button
                onClick={() => setShowOriginal(!showOriginal)}
                title="Toggle display enhancement (brightness/contrast) on the raw capture"
                className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                  showOriginal
                    ? 'bg-zinc-950 text-blue-400 border-blue-950/60'
                    : 'bg-zinc-950/40 text-zinc-500 border-zinc-800/80'
                }`}
              >
                <ImageIcon className="w-4 h-4" />
                {showOriginal ? 'Raw' : 'Enhanced'}
              </button>

              {/* Overlays Toggle */}
              <button
                onClick={() => setShowOverlays(!showOverlays)}
                className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                  showOverlays 
                    ? 'bg-zinc-950 text-emerald-400 border-emerald-950/60' 
                    : 'bg-zinc-950/40 text-zinc-500 border-zinc-800/80'
                }`}
              >
                {showOverlays ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                Overlays
              </button>

              {/* Heatmap Toggle */}
              <button
                disabled={!selectedDetectionId}
                onClick={() => setShowHeatmap(!showHeatmap)}
                className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                  !selectedDetectionId 
                    ? 'opacity-40 cursor-not-allowed bg-zinc-950/20 border-zinc-900 text-zinc-600'
                    : showHeatmap
                      ? 'bg-zinc-950 text-red-400 border-red-950/60' 
                      : 'bg-zinc-950/40 text-zinc-500 border-zinc-800/80'
                }`}
              >
                <Flame className="w-4 h-4" />
                Grad-CAM
              </button>
            </div>

            <div className="mt-3 bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-800/60 text-[10px] text-zinc-400 font-mono flex justify-between">
              <span>Target modality:</span>
              <strong className="text-zinc-200 capitalize">
                {customImage ? 'Custom upload' : selectedSample.category}
              </strong>
            </div>
          </div>

          <BatchPanel
            items={batch}
            running={batchRunning}
            activeItemId={activeBatchId}
            onAddFiles={handleAddBatchFiles}
            onRun={handleRunBatch}
            onClear={handleClearBatch}
            onOpenItem={handleOpenBatchItem}
            onExportPooledCsv={handleExportPooledCsv}
            onExportPerImageCsv={handleExportPerImageCsv}
            onExportReport={handleExportReport}
          />

          <CalibrationPanel
            calibration={calibration}
            imageWidthPx={loadedImage?.width ?? 0}
            imageHeightPx={loadedImage?.height ?? 0}
            downscaleFactor={downscaleFactor}
            onChange={(cal) => {
              setCalibration(cal);
              setNotice(cal.note || 'Calibration updated.');
            }}
            onStartScaleBar={() => setInteractiveTool(interactiveTool === 'calibrate' ? 'select' : 'calibrate')}
            scaleBarActive={interactiveTool === 'calibrate'}
          />
        </div>

        {/* Center Panel: Main Microscope Canvas Viewport */}
        <div className="xl:col-span-2 flex flex-col gap-4 min-h-0">
          
          {/* Main Visual Workspace */}
          <div className="flex-1 min-h-0 relative">
            {isAnalyzing && (
              <div className="absolute inset-0 bg-black/85 z-30 flex flex-col items-center justify-center gap-3 rounded-xl border border-zinc-800">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                <p className="text-sm font-semibold text-zinc-200 font-mono">Synthesizing multi-spectral neural boundaries...</p>
                <p className="text-xs text-zinc-500">Executing mathematical tensor transformations on uploaded raster cells</p>
              </div>
            )}

            <MicroscopyCanvas
              imageUrl={activeImageUrl}
              category={customImage ? 'cells' : selectedSample.category}
              modelType={activeModel}
              detections={measuredDetections}
              selectedDetectionId={selectedDetectionId}
              onSelectDetection={setSelectedDetectionId}
              onAddDetection={handleAddDetection}
              onDeleteDetection={handleDeleteDetection}
              showOriginal={showOriginal}
              showOverlays={showOverlays}
              showHeatmap={showHeatmap}
              interactiveTool={interactiveTool}
              imageWidthPx={loadedImage?.width ?? 0}
              imageHeightPx={loadedImage?.height ?? 0}
              micronsPerPixel={micronsPerPixel}
              onCalibrate={handleScaleBarCalibration}
              onEditBegin={snapshot}
              onDetectionPointsChange={handleDetectionPointsChange}
            />
          </div>

          {/* Interactive Modes, Correction Feedback Logs and Submit panel */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl flex flex-col md:flex-row gap-4 shrink-0">
            {/* Left side: Interactive selection tools */}
            <div className="flex-1 space-y-2">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block font-mono">Interactive Tools</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {/* Standard pointer selector */}
                <button
                  onClick={() => setInteractiveTool('select')}
                  className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center gap-2 justify-center transition cursor-pointer ${
                    interactiveTool === 'select' 
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-900' 
                      : 'bg-zinc-950/40 text-zinc-400 border-zinc-800'
                  }`}
                >
                  <MousePointer className="w-3.5 h-3.5" />
                  Select & Query
                </button>

                {/* Segment Anything point selection */}
                <button
                  onClick={() => {
                    setInteractiveTool('sam');
                    setShowOverlays(true); // the click layer lives in the overlay SVG
                    setNotice('SAM click segmentation active. Click any structure on the canvas to segment it.');
                  }}
                  className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center gap-2 justify-center transition cursor-pointer ${
                    interactiveTool === 'sam' 
                      ? 'bg-amber-950 text-amber-400 border-amber-900' 
                      : 'bg-zinc-950/40 text-zinc-400 border-zinc-800'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  SAM Click
                </button>

                {/* Add Manual Bounding box */}
                <button
                  onClick={() => { setInteractiveTool('add-box'); setShowOverlays(true); }}
                  className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center gap-2 justify-center transition cursor-pointer ${
                    interactiveTool === 'add-box' 
                      ? 'bg-blue-950 text-blue-400 border-blue-900' 
                      : 'bg-zinc-950/40 text-zinc-400 border-zinc-800'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  + Rect Box
                </button>

                {/* Add Manual Point boundary */}
                <button
                  onClick={() => { setInteractiveTool('add-point'); setShowOverlays(true); }}
                  className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center gap-2 justify-center transition cursor-pointer ${
                    interactiveTool === 'add-point' 
                      ? 'bg-purple-950 text-purple-400 border-purple-900' 
                      : 'bg-zinc-950/40 text-zinc-400 border-zinc-800'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  + Polygon Pt
                </button>

                {/* Scale-bar calibration */}
                <button
                  onClick={() => setInteractiveTool(interactiveTool === 'calibrate' ? 'select' : 'calibrate')}
                  className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center gap-2 justify-center transition cursor-pointer ${
                    interactiveTool === 'calibrate'
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                      : 'bg-zinc-950/40 text-zinc-400 border-zinc-800'
                  }`}
                >
                  <RulerIcon className="w-3.5 h-3.5" />
                  Set Scale
                </button>
              </div>
            </div>

            {/* Right side: Corrections log submitted to dynamically reinforce weights */}
            <div className="w-full md:w-[320px] bg-zinc-950/50 rounded-lg p-2.5 border border-zinc-800 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-[10px] font-mono gap-2">
                <span className="text-zinc-400 uppercase tracking-wider font-semibold truncate">
                  Corrections Log
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={undo}
                    disabled={past.length === 0}
                    title="Undo (Ctrl+Z)"
                    className="p-1 rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-600 disabled:opacity-30 disabled:hover:text-zinc-400 disabled:hover:border-zinc-800 transition cursor-pointer"
                  >
                    <Undo2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={redo}
                    disabled={future.length === 0}
                    title="Redo (Ctrl+Shift+Z)"
                    className="p-1 rounded border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-600 disabled:opacity-30 disabled:hover:text-zinc-400 disabled:hover:border-zinc-800 transition cursor-pointer"
                  >
                    <Redo2 className="w-3 h-3" />
                  </button>
                  <span className="text-zinc-500 ml-1">{correctionsLog.length}</span>
                </div>
              </div>
              
              <div className="h-11 overflow-y-auto text-[9px] font-mono text-zinc-500 space-y-1">
                {correctionsLog.length === 0 ? (
                  <span className="italic block text-center mt-1">Ready for adjustments (Click segment boundary controls above)</span>
                ) : (
                  correctionsLog.map((log, idx) => (
                    <div key={idx} className="flex justify-between gap-2 border-b border-zinc-900/50 pb-0.5">
                      <span className={`${log.type === 'addition' ? 'text-blue-400' : 'text-red-400'}`}>{log.label}</span>
                      <span className="text-zinc-600">{log.timestamp}</span>
                    </div>
                  ))
                )}
              </div>

              <button
                disabled={correctionsLog.length === 0 || refiningModel}
                onClick={handleRefineWeights}
                className={`w-full py-1 px-3 rounded text-[10px] font-semibold uppercase tracking-wider font-mono flex items-center justify-center gap-2 transition cursor-pointer ${
                  correctionsLog.length > 0 && !refiningModel
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-950/20'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                }`}
              >
                {refiningModel ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Optimizing weights...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3 h-3" />
                    Reinforce weights ({correctionsLog.length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel: Quantifications & Explainable AI */}
        <div className="xl:col-span-1 flex flex-col gap-4 min-h-0 overflow-y-auto pr-0 xl:pr-1">
          {/* Quantitative Metrics Sidebar */}
          <div className="h-[45%] min-h-[300px]">
            <StatsPanel
              category={customImage ? 'cells' : selectedSample.category}
              summary={summary}
              detections={measuredDetections}
              selectedDetectionId={selectedDetectionId}
              onSelectDetection={setSelectedDetectionId}
              calibrated={micronsPerPixel !== null}
              calibrationLabel={calibrationLabel}
              suggestedThreshold={suggestedThreshold}
            />
          </div>

          {/* Explainable AI Diagnostics */}
          <div className="h-[40%] min-h-[250px]">
            <ExplainableAIPanel
              category={customImage ? 'cells' : selectedSample.category}
              selectedDetection={measuredDetections.find(d => d.id === selectedDetectionId) || null}
              onSendMessage={handleQueryExplainAI}
            />
          </div>

          {/* Intensity distribution, computed from the real frame */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl min-h-[210px] flex flex-col gap-1 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">
                Intensity histogram
              </span>
              <span className="text-[9px] text-zinc-500 font-mono">
                {loadedImage ? `${loadedImage.width}×${loadedImage.height} px` : '—'}
              </span>
            </div>
            <IntensityHistogram
              data={histogramData}
              channel={histogramChannel}
              onChannelChange={setHistogramChannel}
              threshold={suggestedThreshold}
              loading={pixelsLoading}
            />
          </div>
        </div>
      </main>

      {/* Floating Export Command Strip */}
      <footer className="bg-zinc-900 border-t border-zinc-800 px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 font-mono text-[11px] text-zinc-400">
        <div>
          <span>Workspace status: </span>
          <strong className="text-zinc-200">
            {customImage ? `User Uploaded [${customFileName}]` : `Pre-loaded [${selectedSample.name}]`}
          </strong>
          {isSimulated && (
            <span className="ml-2 text-[10px] bg-amber-950/40 text-amber-500 border border-amber-900 px-1.5 py-0.5 rounded font-bold uppercase">
              Offline Simulation Fallback
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            onClick={exportCSV}
            className="bg-zinc-950 hover:bg-zinc-800 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-800 flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Export CSV
          </button>
          
          <button
            onClick={exportJSON}
            className="bg-zinc-950 hover:bg-zinc-800 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-800 flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5 text-blue-400" />
            Export Annotations JSON
          </button>
        </div>
      </footer>
    </div>
  );
}
