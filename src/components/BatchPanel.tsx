import { Layers3, Play, Trash2, FileSpreadsheet, FileText, Loader2, CircleCheck, CircleAlert } from 'lucide-react';
import { BatchItem } from '../utils/batch';

interface BatchPanelProps {
  items: BatchItem[];
  running: boolean;
  activeItemId: string | null;
  onAddFiles: (files: FileList | File[]) => void;
  onRun: () => void;
  onClear: () => void;
  onOpenItem: (item: BatchItem) => void;
  onExportPooledCsv: () => void;
  onExportPerImageCsv: () => void;
  onExportReport: () => void;
}

const STATUS_ICON = {
  queued: <span className="w-3 h-3 rounded-full border border-zinc-600 block" />,
  analyzing: <Loader2 className="w-3 h-3 animate-spin text-blue-400" />,
  measuring: <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />,
  done: <CircleCheck className="w-3 h-3 text-emerald-400" />,
  error: <CircleAlert className="w-3 h-3 text-red-400" />,
};

export default function BatchPanel({
  items,
  running,
  activeItemId,
  onAddFiles,
  onRun,
  onClear,
  onOpenItem,
  onExportPooledCsv,
  onExportPerImageCsv,
  onExportReport,
}: BatchPanelProps) {
  const done = items.filter((i) => i.status === 'done');
  const queued = items.filter((i) => i.status === 'queued');
  const totalObjects = done.reduce((sum, i) => sum + (i.summary?.count ?? 0), 0);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5 font-mono">
          <Layers3 className="w-3.5 h-3.5 text-indigo-400" />
          Batch Queue
        </h3>
        {items.length > 0 && (
          <span className="text-[9px] font-mono text-zinc-500">
            {done.length}/{items.length} · {totalObjects} objects
          </span>
        )}
      </div>

      <input
        type="file"
        id="batch-upload-input"
        className="hidden"
        accept="image/*"
        multiple
        onChange={(e) => {
          if (e.target.files?.length) onAddFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div className="flex gap-2 mb-3">
        <label
          htmlFor="batch-upload-input"
          className="flex-1 text-center py-1.5 px-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-950/40 text-[11px] text-zinc-300 hover:border-zinc-600 hover:text-white transition cursor-pointer"
        >
          Add images…
        </label>
        <button
          onClick={onRun}
          disabled={running || queued.length === 0}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer ${
            !running && queued.length > 0
              ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          Run {queued.length > 0 ? `(${queued.length})` : ''}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Queue several fields from the same experiment to process them with one calibration and pool the
          statistics. Each image is analysed and measured exactly as it would be in the workspace.
        </p>
      ) : (
        <>
          <div className="max-h-44 overflow-y-auto space-y-1 mb-3 pr-0.5">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => item.status === 'done' && onOpenItem(item)}
                disabled={item.status !== 'done'}
                className={`w-full text-left px-2 py-1.5 rounded border flex items-center gap-2 transition ${
                  activeItemId === item.id
                    ? 'border-indigo-600 bg-indigo-950/30'
                    : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700'
                } ${item.status === 'done' ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className="shrink-0 flex items-center justify-center w-3 h-3">
                  {STATUS_ICON[item.status]}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] text-zinc-200 font-mono truncate">{item.fileName}</span>
                  <span className="block text-[9px] text-zinc-500 font-mono truncate">
                    {item.status === 'error'
                      ? item.error
                      : item.summary
                        ? `${item.summary.count} objects · mean ${item.summary.avgSize} ${item.summary.sizeUnit}`
                        : item.status}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              onClick={onExportPooledCsv}
              disabled={done.length === 0}
              className="py-1.5 px-2 rounded border border-zinc-800 bg-zinc-950/50 text-[10px] text-zinc-300 hover:border-zinc-600 hover:text-white disabled:opacity-40 transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
              Objects CSV
            </button>
            <button
              onClick={onExportPerImageCsv}
              disabled={done.length === 0}
              className="py-1.5 px-2 rounded border border-zinc-800 bg-zinc-950/50 text-[10px] text-zinc-300 hover:border-zinc-600 hover:text-white disabled:opacity-40 transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <FileSpreadsheet className="w-3 h-3 text-blue-400" />
              Per-image CSV
            </button>
            <button
              onClick={onExportReport}
              disabled={done.length === 0}
              className="py-1.5 px-2 rounded border border-zinc-800 bg-zinc-950/50 text-[10px] text-zinc-300 hover:border-zinc-600 hover:text-white disabled:opacity-40 transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <FileText className="w-3 h-3 text-purple-400" />
              Report
            </button>
            <button
              onClick={onClear}
              disabled={running}
              className="py-1.5 px-2 rounded border border-zinc-800 bg-zinc-950/50 text-[10px] text-zinc-400 hover:border-red-900 hover:text-red-300 disabled:opacity-40 transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          </div>

          <p className="text-[9px] text-zinc-600 mt-2 leading-relaxed">
            The report opens as an HTML file — print it to PDF from your browser.
          </p>
        </>
      )}
    </div>
  );
}
