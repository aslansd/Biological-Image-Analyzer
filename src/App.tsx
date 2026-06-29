import { useState, useEffect } from 'react';
import { SAMPLE_IMAGES, getSampleResult, generateUploadedResult } from './data/samples';
import { Detection, SampleImage, MLModelType, AnalysisResult } from './types';
import IntensityHistogram from './components/IntensityHistogram';
import StatsPanel from './components/StatsPanel';
import ModelSelector from './components/ModelSelector';
import ExplainableAIPanel from './components/ExplainableAIPanel';
import MicroscopyCanvas from './components/MicroscopyCanvas';
import { 
  Upload, 
  Sparkles, 
  Layers, 
  Sliders, 
  Download, 
  CheckCircle, 
  Database, 
  RotateCcw, 
  HelpCircle, 
  Eye, 
  EyeOff, 
  Flame, 
  MousePointer, 
  Crosshair, 
  PlusCircle, 
  FileSpreadsheet, 
  FileCode, 
  BookOpen, 
  Loader2,
  Info
} from 'lucide-react';

export default function App() {
  // Application Workstation State
  const [samples] = useState<SampleImage[]>(SAMPLE_IMAGES);
  const [selectedSample, setSelectedSample] = useState<SampleImage>(SAMPLE_IMAGES[0]);
  const [activeModel, setActiveModel] = useState<MLModelType>('unet');
  const [detections, setDetections] = useState<Detection[]>([]);
  const [summary, setSummary] = useState<AnalysisResult['summary']>({ count: 0, avgSize: 0, avgCircularity: 0, density: 0 });
  const [histogramData, setHistogramData] = useState<AnalysisResult['histogramData']>([]);
  
  // Selection and Interaction
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [interactiveTool, setInteractiveTool] = useState<'select' | 'sam' | 'add-box' | 'add-point'>('select');
  
  // Layer Toggles
  const [showOriginal, setShowOriginal] = useState(false);
  const [showOverlays, setShowOverlays] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Connection & API States
  const [isSimulated, setIsSimulated] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [refiningModel, setRefiningModel] = useState(false);
  const [apiHealth, setApiHealth] = useState({ checked: false, keyConfigured: false });

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
        
        // Filter detections based on selected ML Model style for educational immersion
        let filteredDetections = [...result.detections];
        if (activeModel === 'yolo') {
          // Convert all polygons/lines to bounding boxes
          filteredDetections = filteredDetections.map(d => ({
            ...d,
            shape: 'rect',
            label: `${d.label} (YOLO)`
          }));
        } else if (activeModel === 'vit') {
          // Highlight high confidence features & add status badges
          filteredDetections = filteredDetections.filter(d => d.type === 'cell' || d.type === 'soma' || d.type === 'colony');
        }

        setDetections(filteredDetections);
        setSummary(result.summary);
        setHistogramData(result.histogramData);
        setIsSimulated(true); // Pre-packaged counts as simulation by default
        setSelectedDetectionId(null);
        setIsAnalyzing(false);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [selectedSample, activeModel, customImage]);

  // Handle manual sample click selection
  const handleSelectSample = (sample: SampleImage) => {
    setCustomImage(null);
    setCustomFileName('');
    setSelectedSample(sample);
    setActiveModel(sample.defaultModel);
    setCorrectionsLog([]);
  };

  // Upload custom file trigger
  const handleFileUpload = (file: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    setCustomFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setCustomImage(base64);
      setDetections([]);
      setSummary({ count: 0, avgSize: 0, avgCircularity: 0, density: 0 });
      setHistogramData([]);
      setSelectedDetectionId(null);
      setCorrectionsLog([]);
      
      // Auto-analyze uploaded image
      triggerImageAnalysis(base64, file.name);
    };
    reader.readAsDataURL(file);
  };

  // Primary image analyzer fetch function
  const triggerImageAnalysis = async (base64Image: string, fileName: string) => {
    setIsAnalyzing(true);
    setSelectedDetectionId(null);

    // Guess a category based on file name or default to active selection
    let category = selectedSample.category;
    const lowerName = fileName.toLowerCase();
    if (lowerName.includes('neuron') || lowerName.includes('axon')) category = 'neurons';
    else if (lowerName.includes('histo') || lowerName.includes('slide')) category = 'histology';
    else if (lowerName.includes('bacteria') || lowerName.includes('plate')) category = 'bacteria';
    else if (lowerName.includes('plant') || lowerName.includes('leaf')) category = 'plants';

    try {
      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Image,
          category,
          fileName
        })
      });

      const data = await response.json();

      if (data.isSimulated) {
        // Fallback to local high-fidelity simulator for custom images if no API key is set
        const simulatedResult = generateUploadedResult(fileName, fileTypeFromBase64(base64Image));
        setDetections(simulatedResult.detections);
        setSummary(simulatedResult.summary);
        setHistogramData(simulatedResult.histogramData);
        setIsSimulated(true);
      } else {
        // Real Gemini analyzed results
        setDetections(data.detections || []);
        setSummary(data.summary);
        setHistogramData(data.histogramData || []);
        setIsSimulated(false);
      }
    } catch (err) {
      console.error('Error during image analysis:', err);
      // Fallback
      const simulatedResult = generateUploadedResult(fileName, fileTypeFromBase64(base64Image));
      setDetections(simulatedResult.detections);
      setSummary(simulatedResult.summary);
      setHistogramData(simulatedResult.histogramData);
      setIsSimulated(true);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const fileTypeFromBase64 = (base64: string) => {
    const match = base64.match(/^data:image\/(\w+);base64,/);
    return match ? match[1] : 'png';
  };

  // Chat message query helper to explain active object morphology
  const handleQueryExplainAI = async (question: string): Promise<string> => {
    const activeDet = detections.find(d => d.id === selectedDetectionId);
    
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
    setDetections((prev) => [...prev, newDet]);
    setSummary((prev) => ({
      ...prev,
      count: prev.count + 1,
      avgSize: parseFloat(((prev.avgSize * prev.count + (newDet.attributes.area || 100)) / (prev.count + 1)).toFixed(1))
    }));

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
    const target = detections.find((d) => d.id === id);
    if (!target) return;

    setDetections((prev) => prev.filter((d) => d.id !== id));
    setSummary((prev) => {
      const nextCount = Math.max(0, prev.count - 1);
      return {
        ...prev,
        count: nextCount,
        avgSize: nextCount > 0 ? parseFloat(((prev.avgSize * prev.count - (target.attributes.area || 0)) / nextCount).toFixed(1)) : 0
      };
    });

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
      alert('⚡ Deep learning weights optimized successfully! Boundaries aligned with local corrections.');
    }, 2000);
  };

  // Export files triggers
  const exportCSV = () => {
    const headers = 'ID,Label,Type,Shape,Area(um2),Circularity,StainingIntensity(MFI),Confidence,Status\n';
    const rows = detections
      .map(
        (d) =>
          `"${d.id}","${d.label}","${d.type}","${d.shape}",${d.attributes.area || 0},${d.attributes.circularity || 0},${
            d.attributes.intensity || 0
          },${d.confidence},"${d.attributes.status || 'healthy'}"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${customImage ? 'uploaded_image' : selectedSample.id}_quantification.csv`;
    link.click();
  };

  const exportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(detections, null, 2));
    const link = document.createElement('a');
    link.href = dataStr;
    link.download = `${customImage ? 'uploaded_image' : selectedSample.id}_labels.json`;
    link.click();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans select-none antialiased">
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

            <div className="grid grid-cols-2 gap-2">
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

            {/* Scale indicator */}
            <div className="mt-3 bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-800/60 text-[10px] text-zinc-400 leading-relaxed font-mono space-y-1">
              <div className="flex justify-between">
                <span>Calibration Scale:</span>
                <strong className="text-zinc-200">{customImage ? 'Dynamic pixel units' : selectedSample.scale}</strong>
              </div>
              <div className="flex justify-between">
                <span>Active Target Modality:</span>
                <strong className="text-zinc-200 capitalize">{customImage ? 'Custom upload' : selectedSample.category}</strong>
              </div>
            </div>
          </div>
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
              imageUrl={customImage || selectedSample.imageUrl}
              category={customImage ? 'cells' : selectedSample.category}
              modelType={activeModel}
              detections={detections}
              selectedDetectionId={selectedDetectionId}
              onSelectDetection={setSelectedDetectionId}
              onAddDetection={handleAddDetection}
              onDeleteDetection={handleDeleteDetection}
              showOriginal={showOriginal}
              showOverlays={showOverlays}
              showHeatmap={showHeatmap}
              interactiveTool={interactiveTool}
            />
          </div>

          {/* Interactive Modes, Correction Feedback Logs and Submit panel */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl flex flex-col md:flex-row gap-4 shrink-0">
            {/* Left side: Interactive selection tools */}
            <div className="flex-1 space-y-2">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider block font-mono">Interactive Tools</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Standard pointer selector */}
                <button
                  onClick={() => setInteractiveTool('select')}
                  className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center gap-2 justify-center transition cursor-pointer ${
                    interactiveTool === 'select' 
                      ? 'bg-emerald-950 text-emerald-400 border-emerald-900' 
                      : 'bg-zinc-950/40 text-zinc-400 border-zinc-850'
                  }`}
                >
                  <MousePointer className="w-3.5 h-3.5" />
                  Select & Query
                </button>

                {/* Segment Anything point selection */}
                <button
                  onClick={() => {
                    setInteractiveTool('sam');
                    alert('🎯 SAM Zero-shot click segmentation activated! Click any point on the microscopy canvas to auto-segment cell boundaries.');
                  }}
                  className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center gap-2 justify-center transition cursor-pointer ${
                    interactiveTool === 'sam' 
                      ? 'bg-amber-950 text-amber-400 border-amber-900' 
                      : 'bg-zinc-950/40 text-zinc-400 border-zinc-850'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  SAM Click
                </button>

                {/* Add Manual Bounding box */}
                <button
                  onClick={() => setInteractiveTool('add-box')}
                  className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center gap-2 justify-center transition cursor-pointer ${
                    interactiveTool === 'add-box' 
                      ? 'bg-blue-950 text-blue-400 border-blue-900' 
                      : 'bg-zinc-950/40 text-zinc-400 border-zinc-850'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  + Rect Box
                </button>

                {/* Add Manual Point boundary */}
                <button
                  onClick={() => setInteractiveTool('add-point')}
                  className={`p-2 rounded-lg border text-[11px] font-semibold flex items-center gap-2 justify-center transition cursor-pointer ${
                    interactiveTool === 'add-point' 
                      ? 'bg-purple-950 text-purple-400 border-purple-900' 
                      : 'bg-zinc-950/40 text-zinc-400 border-zinc-850'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  + Polygon Pt
                </button>
              </div>
            </div>

            {/* Right side: Corrections log submitted to dynamically reinforce weights */}
            <div className="w-full md:w-[320px] bg-zinc-950/50 rounded-lg p-2.5 border border-zinc-850 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-zinc-400 uppercase tracking-wider font-semibold">Local Corrections Log</span>
                <span className="text-zinc-500">Edits: {correctionsLog.length}</span>
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
              detections={detections}
              selectedDetectionId={selectedDetectionId}
              onSelectDetection={setSelectedDetectionId}
              metricUnit={customImage ? 'px' : selectedSample.metricUnit}
            />
          </div>

          {/* Explainable AI Diagnostics */}
          <div className="h-[40%] min-h-[250px]">
            <ExplainableAIPanel
              category={customImage ? 'cells' : selectedSample.category}
              selectedDetection={detections.find(d => d.id === selectedDetectionId) || null}
              onSendMessage={handleQueryExplainAI}
            />
          </div>

          {/* Fluorescence Intensity Distribution Plot */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl h-[15%] min-h-[140px] flex flex-col justify-between shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider font-mono">
                Intensity Spectrum Histogram
              </span>
              <span className="text-[9px] text-zinc-500 font-mono">Mean fluorescence</span>
            </div>
            <IntensityHistogram 
              data={histogramData} 
              color={selectedSample.category === 'cells' ? '#10b981' : selectedSample.category === 'neurons' ? '#ec4899' : '#a855f7'} 
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
            className="bg-zinc-950 hover:bg-zinc-850 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-800 flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            Export CSV
          </button>
          
          <button
            onClick={exportJSON}
            className="bg-zinc-950 hover:bg-zinc-850 text-zinc-200 px-3 py-1.5 rounded-lg border border-zinc-800 flex items-center gap-1.5 transition cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5 text-blue-400" />
            Export Annotations JSON
          </button>
        </div>
      </footer>
    </div>
  );
}
