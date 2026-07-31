import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { HistogramBin, HistogramChannel } from '../types';

interface IntensityHistogramProps {
  data: HistogramBin[];
  channel: HistogramChannel;
  onChannelChange: (channel: HistogramChannel) => void;
  threshold?: number | null;
  loading?: boolean;
}

const CHANNELS: { id: HistogramChannel; label: string; color: string }[] = [
  { id: 'lum', label: 'Grey', color: '#a1a1aa' },
  { id: 'r', label: 'R', color: '#ef4444' },
  { id: 'g', label: 'G', color: '#22c55e' },
  { id: 'b', label: 'B', color: '#3b82f6' },
];

export default function IntensityHistogram({
  data,
  channel,
  onChannelChange,
  threshold,
  loading,
}: IntensityHistogramProps) {
  const active = CHANNELS.find((c) => c.id === channel) ?? CHANNELS[0];

  if (loading) {
    return (
      <div className="h-40 flex items-center justify-center text-xs text-zinc-500 italic">
        Reading pixel data…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-xs text-zinc-500 italic px-4 text-center">
        No pixel data available for this image.
      </div>
    );
  }

  // The chart plots whichever channel is selected; `count` is luma.
  const dataKey = channel === 'lum' ? 'count' : channel;

  return (
    <div className="w-full flex flex-col">
      <div className="flex items-center gap-1 mb-1">
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            onClick={() => onChannelChange(c.id)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold border transition cursor-pointer ${
              channel === c.id
                ? 'border-zinc-600 bg-zinc-800 text-white'
                : 'border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:text-zinc-300'
            }`}
            style={channel === c.id ? { color: c.color } : undefined}
          >
            {c.label}
          </button>
        ))}
        <span className="ml-auto text-[9px] text-zinc-600 font-mono">measured from pixels</span>
      </div>

      <div className="w-full h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 6, left: -26, bottom: 0 }}>
            <defs>
              <linearGradient id={`hist-${channel}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={active.color} stopOpacity={0.45} />
                <stop offset="95%" stopColor={active.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="intensity"
              type="number"
              domain={[0, 255]}
              ticks={[0, 64, 128, 192, 255]}
              tickLine={false}
              axisLine={false}
              tick={{ fill: '#a1a1aa', fontSize: 9 }}
            />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#a1a1aa', fontSize: 9 }} width={44} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#18181b',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#f4f4f5',
              }}
              labelFormatter={(value) => `Intensity ${value}`}
              formatter={(value) => [Number(value ?? 0).toLocaleString(), 'pixels']}
            />
            {threshold != null && (
              <ReferenceLine
                x={threshold}
                stroke="#f59e0b"
                strokeDasharray="3 3"
                label={{ value: 'Otsu', fill: '#f59e0b', fontSize: 9, position: 'insideTopRight' }}
              />
            )}
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={active.color}
              strokeWidth={1.5}
              fillOpacity={1}
              fill={`url(#hist-${channel})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
