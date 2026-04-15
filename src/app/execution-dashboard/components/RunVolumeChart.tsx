'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export interface RunVolumeDatum {
  time: string;
  completed: number;
  failed: number;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 shadow-xl">
      <p className="text-[11px] font-mono text-zinc-400 mb-2">{label}</p>
      {payload.map((p) => (
        <div key={`tip-${p.name}`} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-xs text-zinc-300 font-medium">{p.name}:</span>
          <span className="text-xs font-mono text-zinc-100 tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function RunVolumeChart({ data }: { data: RunVolumeDatum[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[220px]">
        <p className="text-xs text-zinc-600 font-mono">No run data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barGap={2} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="time"
          tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#52525b', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#27272a' }} />
        <Bar dataKey="completed" name="Completed" fill="#22c55e" radius={[3, 3, 0, 0]} />
        <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
