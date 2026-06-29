import { MouseEvent, useState, useRef, useEffect } from 'react';
import { Detection, DetectionCategory, MLModelType } from '../types';
import { Layers, Eye, EyeOff, Plus, Trash2, Crosshair, HelpCircle } from 'lucide-react';

interface MicroscopyCanvasProps {
  imageUrl: string;
  category: DetectionCategory;
  modelType: MLModelType;
  detections: Detection[];
  selectedDetectionId: string | null;
  onSelectDetection: (id: string | null) => void;
  onAddDetection: (newDet: Detection) => void;
  onDeleteDetection: (id: string) => void;
  showOriginal: boolean;
  showOverlays: boolean;
  showHeatmap: boolean;
  interactiveTool: 'select' | 'sam' | 'add-box' | 'add-point';
}

export default function MicroscopyCanvas({
  imageUrl,
  category,
  modelType,
  detections,
  selectedDetectionId,
  onSelectDetection,
  onAddDetection,
  onDeleteDetection,
  showOriginal,
  showOverlays,
  showHeatmap,
  interactiveTool
}: MicroscopyCanvasProps) {
  const [hoveredDetId, setHoveredDetId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Update canvas size relative to display
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const img = containerRef.current.querySelector('img');
        if (img) {
          setDimensions({
            width: img.clientWidth,
            height: img.clientHeight
          });
        }
      }
    };

    // Set resize observer
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    window.addEventListener('resize', handleResize);
    
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [imageUrl]);

  const handleImageLoad = () => {
    if (containerRef.current) {
      const img = containerRef.current.querySelector('img');
      if (img) {
        setDimensions({
          width: img.clientWidth,
          height: img.clientHeight
        });
      }
    }
  };

  // Click on the image/canvas
  const handleCanvasClick = (e: MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / rect.width) * 100;
    const clickY = ((e.clientY - rect.top) / rect.height) * 100;

    // SAM click segmentation tool
    if (interactiveTool === 'sam') {
      const size = Math.floor(60 + Math.random() * 120);
      const radius = 5;
      
      const newSamDetection: Detection = {
        id: `sam-det-${Date.now()}`,
        type: category === 'cells' ? 'cell' : category === 'neurons' ? 'soma' : category === 'histology' ? 'nucleus' : category === 'bacteria' ? 'colony' : 'stomata',
        shape: 'polygon',
        points: [
          [clickX - radius, clickY],
          [clickX - radius/2, clickY - radius],
          [clickX + radius/2, clickY - radius],
          [clickX + radius, clickY],
          [clickX + radius/2, clickY + radius],
          [clickX - radius/2, clickY + radius]
        ],
        confidence: 0.98,
        label: `SAM Segmented ${category === 'cells' ? 'Cell' : category === 'neurons' ? 'Soma' : category === 'histology' ? 'Nucleus' : category === 'bacteria' ? 'Colony' : 'Stomata'}`,
        color: '#f59e0b',
        attributes: {
          area: size,
          perimeter: Math.round(size * 0.28),
          circularity: 0.92,
          intensity: 195,
          status: 'healthy'
        },
        explanation: 'Segmented with zero-shot accuracy via SAM vision foundation model on high-contrast feature border selection.'
      };
      
      onAddDetection(newSamDetection);
      onSelectDetection(newSamDetection.id);
      return;
    }

    // Manual Object Placement
    if (interactiveTool === 'add-point' || interactiveTool === 'add-box') {
      const isBox = interactiveTool === 'add-box';
      const size = Math.floor(40 + Math.random() * 80);
      const newManualDet: Detection = {
        id: `manual-det-${Date.now()}`,
        type: category === 'cells' ? 'cell' : category === 'neurons' ? 'soma' : category === 'histology' ? 'nucleus' : category === 'bacteria' ? 'colony' : 'stomata',
        shape: isBox ? 'rect' : 'polygon',
        points: isBox 
          ? [[clickX - 4, clickY - 4], [clickX + 4, clickY + 4]]
          : [
              [clickX - 3, clickY],
              [clickX - 1.5, clickY - 3],
              [clickX + 1.5, clickY - 3],
              [clickX + 3, clickY],
              [clickX + 1.5, clickY + 3],
              [clickX - 1.5, clickY + 3]
            ],
        confidence: 1.0,
        label: `User Correction (${isBox ? 'Box' : 'Point'})`,
        color: '#3b82f6',
        attributes: {
          area: size,
          perimeter: Math.round(size * 0.3),
          circularity: 0.85,
          intensity: 175,
          status: 'healthy'
        },
        explanation: 'Manually added by the researcher. Registered in the workstation corrections database for dynamic learning refinement.'
      };

      onAddDetection(newManualDet);
      onSelectDetection(newManualDet.id);
      return;
    }

    // If click on background empty area, deselect
    onSelectDetection(null);
  };

  // Convert points back to absolute SVG coordinate string
  const getSvgPoints = (points: [number, number][]) => {
    return points
      .map(([x, y]) => `${(x / 100) * dimensions.width},${(y / 100) * dimensions.height}`)
      .join(' ');
  };

  const getActiveHeatmapCoords = () => {
    if (!selectedDetectionId) return null;
    const active = detections.find(d => d.id === selectedDetectionId);
    if (!active) return null;
    // Calculate bounding center of active detection
    let sumX = 0, sumY = 0;
    active.points.forEach(([x, y]) => {
      sumX += x;
      sumY += y;
    });
    return {
      x: (sumX / active.points.length / 100) * dimensions.width,
      y: (sumY / active.points.length / 100) * dimensions.height
    };
  };

  const selectedDet = detections.find(d => d.id === selectedDetectionId);
  const heatmapCenter = getActiveHeatmapCoords();

  return (
    <div className="flex flex-col bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl relative h-full">
      {/* Utility Status Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-2.5 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[11px] font-mono text-zinc-300 font-semibold uppercase tracking-wider">
            Microscope Console View
          </span>
        </div>

        {/* Dynamic prompt message depending on tool */}
        <div className="text-[10px] text-zinc-400 font-mono hidden md:flex items-center gap-1.5 bg-zinc-950/60 px-3 py-1 rounded border border-zinc-800">
          <Crosshair className="w-3 h-3 text-emerald-400" />
          {interactiveTool === 'sam' && 'SAM Mode: Click once on any cell boundary to auto-segment'}
          {interactiveTool === 'add-box' && 'Correction Mode: Click to add Bounding Box'}
          {interactiveTool === 'add-point' && 'Correction Mode: Click to add Point Detection'}
          {interactiveTool === 'select' && 'Select Mode: Hover and click objects for diagnostics'}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div 
        ref={containerRef}
        className="flex-1 flex items-center justify-center relative bg-black/90 p-4 select-none overflow-hidden"
        style={{ minHeight: '380px' }}
      >
        <div className="relative border border-zinc-800/60 rounded overflow-hidden shadow-xl max-w-full max-h-full">
          {/* Main Biological Image */}
          <img
            src={imageUrl}
            alt="Microscopy Subject"
            onLoad={handleImageLoad}
            referrerPolicy="no-referrer"
            className={`max-w-full max-h-[65vh] object-contain transition-all duration-300 block ${
              showOriginal ? 'filter-none' : 'brightness-[0.85] contrast-[1.1]'
            }`}
          />

          {/* Grad-CAM Activation Heatmap Overlay Layer */}
          {showHeatmap && heatmapCenter && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none mix-blend-color-dodge transition-opacity duration-300"
              style={{ width: dimensions.width, height: dimensions.height }}
            >
              <defs>
                <radialGradient id="gradCam" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.85" />
                  <stop offset="40%" stopColor="#f97316" stopOpacity="0.5" />
                  <stop offset="70%" stopColor="#eab308" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle
                cx={heatmapCenter.x}
                cy={heatmapCenter.y}
                r={Math.max(dimensions.width * 0.15, 80)}
                fill="url(#gradCam)"
                className="animate-pulse"
              />
            </svg>
          )}

          {/* Interactive SVG Overlay Layer */}
          {showOverlays && dimensions.width > 0 && (
            <svg
              onClick={handleCanvasClick}
              className={`absolute inset-0 w-full h-full cursor-crosshair transition-opacity duration-200`}
              style={{ width: dimensions.width, height: dimensions.height }}
            >
              {detections.map((det) => {
                const isSelected = selectedDetectionId === det.id;
                const isHovered = hoveredDetId === det.id;
                const strokeColor = det.color || '#10b981';
                
                // Active/Hover color boosts
                const finalStroke = isSelected ? '#ffffff' : isHovered ? '#38bdf8' : strokeColor;
                const finalFill = isSelected ? `${strokeColor}2b` : isHovered ? 'rgba(56, 189, 248, 0.15)' : `${strokeColor}10`;
                const finalWidth = isSelected ? 2.5 : isHovered ? 2.0 : 1.5;

                return (
                  <g
                    key={det.id}
                    onMouseEnter={() => setHoveredDetId(det.id)}
                    onMouseLeave={() => setHoveredDetId(null)}
                    onClick={(e) => {
                      e.stopPropagation(); // Avoid deselection background click
                      onSelectDetection(det.id);
                    }}
                    className="cursor-pointer transition-all duration-150"
                  >
                    {/* Render Polygons (SAM, UNet, standard) */}
                    {det.shape === 'polygon' && (
                      <polygon
                        points={getSvgPoints(det.points)}
                        stroke={finalStroke}
                        strokeWidth={finalWidth}
                        fill={finalFill}
                        strokeDasharray={det.id.startsWith('manual') ? '4 2' : 'none'}
                        className="transition-all duration-150"
                      />
                    )}

                    {/* Render Bounding Boxes (YOLO, Histology) */}
                    {det.shape === 'rect' && det.points.length >= 2 && (
                      <rect
                        x={(det.points[0][0] / 100) * dimensions.width}
                        y={(det.points[0][1] / 100) * dimensions.height}
                        width={((det.points[1][0] - det.points[0][0]) / 100) * dimensions.width}
                        height={((det.points[1][1] - det.points[0][1]) / 100) * dimensions.height}
                        stroke={finalStroke}
                        strokeWidth={finalWidth}
                        fill={finalFill}
                        strokeDasharray={det.id.startsWith('manual') ? '4 2' : 'none'}
                        className="transition-all duration-150"
                      />
                    )}

                    {/* Render Connected Lines (Neurite dendritic tracing) */}
                    {det.shape === 'line' && (
                      <polyline
                        points={getSvgPoints(det.points)}
                        stroke={finalStroke}
                        strokeWidth={finalWidth + 1}
                        fill="none"
                        className="transition-all duration-150"
                      />
                    )}

                    {/* Optional point indicator */}
                    {det.points.length > 0 && (
                      <circle
                        cx={(det.points[0][0] / 100) * dimensions.width}
                        cy={(det.points[0][1] / 100) * dimensions.height}
                        r={3}
                        fill={finalStroke}
                      />
                    )}

                    {/* Label Badge on hover or selection */}
                    {(isHovered || isSelected) && (
                      <foreignObject
                        x={(det.points[0][0] / 100) * dimensions.width}
                        y={Math.max(0, ((det.points[0][1] / 100) * dimensions.height) - 25)}
                        width="150"
                        height="24"
                        className="pointer-events-none select-none overflow-visible"
                      >
                        <div className="bg-zinc-950 text-white border border-zinc-700 rounded px-1.5 py-0.5 text-[9px] font-mono whitespace-nowrap inline-block shadow-lg">
                          {det.label} ({Math.round(det.confidence * 100)}%)
                        </div>
                      </foreignObject>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>

      {/* Selected Item Floating Controls */}
      {selectedDet && (
        <div className="absolute bottom-4 left-4 right-4 bg-zinc-900/95 border border-zinc-700 rounded-lg p-3 flex items-center justify-between shadow-2xl z-20 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedDet.color || '#10b981' }} />
              {selectedDet.label} Selected
            </span>
            <span className="text-[10px] text-zinc-400 mt-0.5 font-mono">
              Confidence: {Math.round(selectedDet.confidence * 100)}% | Area:{' '}
              {selectedDet.attributes.area || 'N/A'} µm² | Status:{' '}
              {selectedDet.attributes.status || 'N/A'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onDeleteDetection(selectedDet.id)}
              className="bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove Detection
            </button>
            <button
              onClick={() => onSelectDetection(null)}
              className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
