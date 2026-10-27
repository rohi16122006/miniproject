import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTooltipValue } from "../simulationDisplay.js";

function CustomTooltip({ active, payload, label, unit }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900/95 text-white border border-slate-700 p-3 rounded-lg shadow-2xl text-xs backdrop-blur-md min-w-[200px]">
        <div className="font-mono text-slate-400 border-b border-slate-800 pb-1.5 mb-2 flex justify-between gap-4 text-xs">
          <span>Simulation Time:</span>
          <span className="text-teal-400 font-bold">{label} hours</span>
        </div>
        <div className="space-y-1.5">
          {payload.map((entry, idx) => (
            <div key={idx} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-slate-200 font-medium">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: entry.color }} />
                {entry.name}:
              </span>
              <span className="font-mono font-bold text-white text-xs">
                {formatTooltipValue(entry.value)} {unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

export default function Trend({ title, data, lines, unit, refs = [], height = 300 }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
          {title}
        </h3>
        <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
          {unit}
        </span>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 24, left: -10, bottom: 6 }}>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t_h"
              tick={{ fontSize: 12, fill: "#475569", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}
              stroke="#CBD5E1"
              unit="h"
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#475569", fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}
              stroke="#CBD5E1"
              domain={["auto", "auto"]}
            />
            <Tooltip content={<CustomTooltip unit={unit} />} />
            {refs.map((r, i) => (
              <ReferenceLine
                key={i}
                y={r.y}
                stroke={r.color || "#E11D48"}
                strokeDasharray="4 4"
                label={{
                  value: r.text,
                  fontSize: 11,
                  fill: r.color || "#E11D48",
                  position: "insideBottomRight",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                }}
              />
            ))}
            {lines.map((l) => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={l.w || 2.5}
                dot={false}
                strokeDasharray={l.dash}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
