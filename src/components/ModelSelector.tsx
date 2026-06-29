import { MLModel, MLModelType } from '../types';
import { Cpu, Terminal, Layers2 } from 'lucide-react';

interface ModelSelectorProps {
  selectedModelId: MLModelType;
  onSelectModel: (id: MLModelType) => void;
}

const MODELS: MLModel[] = [
  {
    id: 'unet',
    name: 'U-Net CNN',
    description: 'Convolutional encoder-decoder optimized for high-fidelity pixel-level cell and membrane boundary segmentation.',
    badge: 'Segmentation Mask',
    framework: 'PyTorch / TensorFlow'
  },
  {
    id: 'yolo',
    name: 'YOLO v8 Detector',
    description: 'Single-stage localized object detector delivering robust rectangular bounding boxes and rapid counting statistics.',
    badge: 'Bounding Boxes',
    framework: 'Ultralytics Core'
  },
  {
    id: 'sam',
    name: 'Segment Anything (SAM)',
    description: 'Promptable vision foundation model enabling interactive, zero-shot single-point segmentations on coordinate click.',
    badge: 'Interactive Click',
    framework: 'Meta AI Open'
  },
  {
    id: 'vit',
    name: 'Vision Transformer (ViT)',
    description: 'Self-attention transformer architecture mapping image patches to aggregate morphological classes (e.g., cell health).',
    badge: 'Feature Classification',
    framework: 'HuggingFace Hub'
  }
];

export default function ModelSelector({ selectedModelId, onSelectModel }: ModelSelectorProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5 font-mono">
        <Cpu className="w-3.5 h-3.5 text-emerald-400" />
        Neural Processor Engine
      </h3>

      <div className="space-y-2.5">
        {MODELS.map((model) => {
          const isSelected = selectedModelId === model.id;
          return (
            <button
              key={model.id}
              onClick={() => onSelectModel(model.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all relative overflow-hidden group ${
                isSelected 
                  ? 'bg-zinc-950 border-emerald-500/80 shadow-emerald-950/20 shadow-md' 
                  : 'bg-zinc-950/40 border-zinc-800/80 hover:border-zinc-700/80'
              }`}
            >
              {/* Highlight background glow */}
              {isSelected && (
                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 blur-xl rounded-full" />
              )}

              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-semibold font-mono flex items-center gap-1.5 ${isSelected ? 'text-emerald-400' : 'text-zinc-200'}`}>
                  <Terminal className="w-3 h-3 opacity-60" />
                  {model.name}
                </span>
                
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold font-mono uppercase tracking-wide border ${
                  isSelected 
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-900/60' 
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                }`}>
                  {model.badge}
                </span>
              </div>

              <p className="text-[10px] text-zinc-400 leading-relaxed font-sans">
                {model.description}
              </p>

              <div className="mt-2 pt-2 border-t border-zinc-900 flex items-center gap-1.5 text-[8px] text-zinc-500 font-mono">
                <Layers2 className="w-2.5 h-2.5" />
                <span>Backend: {model.framework}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
