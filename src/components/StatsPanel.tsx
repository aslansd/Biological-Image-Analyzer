import { Detection, DetectionCategory } from '../types';
import { Layers, CircleDot, Percent, Gauge, Ruler } from 'lucide-react';

interface StatsPanelProps {
  category: DetectionCategory;
  summary: {
    count: number;
    avgSize: number;
    avgCircularity: number;
    density: number;
    totalArea?: number;
  };
  detections: Detection[];
  selectedDetectionId: string | null;
  onSelectDetection: (id: string) => void;
  metricUnit: string;
}

export default function StatsPanel({
  category,
  summary,
  detections,
  selectedDetectionId,
  onSelectDetection,
  metricUnit
}: StatsPanelProps) {
  
  // Custom label based on category
  const getObjectLabel = () => {
    switch (category) {
      case 'cells': return 'Cells Detected';
      case 'neurons': return 'Soma & Axons';
      case 'histology': return 'Nuclei Stains';
      case 'bacteria': return 'Colonies (CFU)';
      case 'plants': return 'Guard Cells/Spots';
      default: return 'Objects';
    }
  };

  const getUnitSymbol = () => {
    return metricUnit;
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-emerald-400" />
          Quantitative Workspace
        </h3>
        <span className="text-xs bg-emerald-950 text-emerald-400 font-mono px-2 py-0.5 rounded border border-emerald-900">
          Live Analysis
        </span>
      </div>

      {/* Grid Stats */}
      <div className="p-4 grid grid-cols-2 gap-3 bg-zinc-900/50">
        {/* Stat 1: Count */}
        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 hover:border-zinc-700 transition">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Total Count</span>
          </div>
          <p className="text-2xl font-bold text-white font-mono">{summary.count}</p>
          <span className="text-[10px] text-zinc-500 font-mono">{getObjectLabel()}</span>
        </div>

        {/* Stat 2: Avg Size */}
        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 hover:border-zinc-700 transition">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
            <Ruler className="w-3.5 h-3.5 text-emerald-400" />
            <span>Avg Size</span>
          </div>
          <p className="text-2xl font-bold text-white font-mono">
            {summary.avgSize}
            <span className="text-xs ml-0.5 text-zinc-400 font-normal">{getUnitSymbol()}</span>
          </p>
          <span className="text-[10px] text-zinc-500 font-mono">Mean Profile Area</span>
        </div>

        {/* Stat 3: Circularity */}
        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 hover:border-zinc-700 transition">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
            <Percent className="w-3.5 h-3.5 text-yellow-500" />
            <span>Circularity</span>
          </div>
          <p className="text-2xl font-bold text-white font-mono">{summary.avgCircularity}</p>
          <span className="text-[10px] text-zinc-500 font-mono">0.0 (irregular) - 1.0 (perfect)</span>
        </div>

        {/* Stat 4: Density */}
        <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800/80 hover:border-zinc-700 transition">
          <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
            <CircleDot className="w-3.5 h-3.5 text-pink-400" />
            <span>Spatial Density</span>
          </div>
          <p className="text-2xl font-bold text-white font-mono">
            {summary.density}
            <span className="text-xs ml-0.5 text-zinc-400 font-normal">
              {category === 'bacteria' ? 'CFU' : '/mm²'}
            </span>
          </p>
          <span className="text-[10px] text-zinc-500 font-mono">Field Distribution</span>
        </div>
      </div>

      {/* Detections List */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2 border-y border-zinc-800 bg-zinc-950 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase font-mono">
          Object Inventory ({detections.length})
        </div>
        
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50 bg-zinc-950/20">
          {detections.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500 italic">
              No structures segmented in this frame. Upload or select a sample above.
            </div>
          ) : (
            detections.map((det) => {
              const isSelected = selectedDetectionId === det.id;
              const statusColorClass = 
                det.attributes.status === 'dead' || det.attributes.status === 'infected' ? 'bg-red-500/10 text-red-400 border-red-900/50' :
                det.attributes.status === 'dividing' ? 'bg-amber-500/10 text-amber-400 border-amber-900/50' :
                det.attributes.status === 'abnormal' ? 'bg-purple-500/10 text-purple-400 border-purple-900/50' :
                'bg-emerald-500/10 text-emerald-400 border-emerald-900/50';

              return (
                <button
                  key={det.id}
                  onClick={() => onSelectDetection(det.id)}
                  className={`w-full text-left p-3 flex items-center justify-between hover:bg-zinc-800/40 active:bg-zinc-800 transition-all font-mono border-l-2 ${
                    isSelected ? 'bg-zinc-800/80 border-l-emerald-400' : 'border-l-transparent'
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-200">
                        {det.label}
                      </span>
                      <span className="text-[9px] text-zinc-500">
                        ({det.confidence * 100}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                      {det.attributes.area && (
                        <span>Area: <strong className="text-zinc-300">{det.attributes.area}</strong> {getUnitSymbol()}</span>
                      )}
                      {det.attributes.length && (
                        <span>Length: <strong className="text-zinc-300">{det.attributes.length}</strong> µm</span>
                      )}
                      {det.attributes.intensity && (
                        <span>MFI: <strong className="text-zinc-300">{det.attributes.intensity}</strong></span>
                      )}
                    </div>
                  </div>

                  {det.attributes.status && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold tracking-wide uppercase ${statusColorClass}`}>
                      {det.attributes.status}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
