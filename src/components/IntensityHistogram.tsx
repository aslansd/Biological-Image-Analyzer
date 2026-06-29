import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface IntensityHistogramProps {
  data: { intensity: number; count: number }[];
  color?: string;
}

export default function IntensityHistogram({ data, color = '#10b981' }: IntensityHistogramProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-44 flex items-center justify-center text-xs text-zinc-400 italic">
        No intensity data available
      </div>
    );
  }

  return (
    <div className="w-full h-44 mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 5, right: 5, left: -25, bottom: 0 }}
        >
          <defs>
            <linearGradient id="intensityColor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.4} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="intensity" 
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#a1a1aa', fontSize: 9 }}
            domain={[0, 255]}
          />
          <YAxis 
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#a1a1aa', fontSize: 9 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#18181b',
              border: '1px solid #3f3f46',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#f4f4f5'
            }}
            labelFormatter={(value) => `Intensity: ${value}`}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={1.5}
            fillOpacity={1}
            fill="url(#intensityColor)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
