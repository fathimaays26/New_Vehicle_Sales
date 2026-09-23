import { useMemo, useState } from "react";
import { formatNumber } from "../../format";

export interface DeliveryVolumeRatePoint {
  label: string;
  volume: number;
  rate: number;
}

export default function DeliveryVolumeRateComboChart({
  data,
  height = 220,
}: {
  data: DeliveryVolumeRatePoint[];
  height?: number;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const width = 760;
  const chartHeight = 230;
  const padding = { top: 20, right: 42, bottom: 30, left: 46 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;
  const maxVolume = Math.max(1, ...data.map((point) => point.volume));
  const points = useMemo(
    () =>
      data.map((point, index) => {
        const x =
          padding.left +
          (data.length > 1
            ? (index * plotWidth) / (data.length - 1)
            : plotWidth / 2);
        const y = padding.top + plotHeight - (point.rate / 100) * plotHeight;
        return { ...point, x, y };
      }),
    [data, plotHeight, plotWidth],
  );
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const volumeTicks = [0, 0.25, 0.5, 0.75, 1];
  const rateTicks = [0, 25, 50, 75, 100];

  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-400">
        No delivery data available
      </div>
    );
  }

  return (
    <div className="w-full" style={{ height }}>
      <div className="mb-2 flex flex-wrap items-center gap-4 border-b border-slate-100 pb-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-600" /> Delivery
          Volume
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
          <span className="h-0.5 w-4 bg-amber-500" /> On-Time Rate %
        </span>
      </div>
      <div className="relative w-full" style={{ height: height - 28 }}>
        <svg
          viewBox={`0 0 ${width} ${chartHeight}`}
          className="h-full w-full overflow-visible"
        >
          {volumeTicks.map((tick, index) => {
            const y = padding.top + plotHeight - tick * plotHeight;
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#f1f5f9"
                />
                <text
                  x={padding.left - 7}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="#94a3b8"
                >
                  {formatNumber(Math.round(maxVolume * tick))}
                </text>
                <text
                  x={width - padding.right + 7}
                  y={y + 3}
                  fontSize="10"
                  fill="#94a3b8"
                >
                  {rateTicks[volumeTicks.length - 1 - index]}%
                </text>
              </g>
            );
          })}
          {points.map((point, index) => {
            const barWidth = Math.min(
              34,
              plotWidth / Math.max(data.length * 1.6, 1),
            );
            const barHeight = (point.volume / maxVolume) * plotHeight;
            return (
              <g
                key={point.label}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <rect
                  x={point.x - barWidth / 2}
                  y={padding.top + plotHeight - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx="4"
                  fill="#2563eb"
                  opacity={hoveredIndex === index ? 0.9 : 0.72}
                />
                <text
                  x={point.x}
                  y={chartHeight - 7}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#64748b"
                >
                  {point.label}
                </text>
                {hoveredIndex === index && (
                  <g>
                    <rect
                      x={point.x - 43}
                      y={Math.max(2, point.y - 42)}
                      width="86"
                      height="34"
                      rx="5"
                      fill="#0f172a"
                    />
                    <text
                      x={point.x}
                      y={Math.max(16, point.y - 27)}
                      textAnchor="middle"
                      fontSize="10"
                      fill="white"
                    >
                      {formatNumber(point.volume)} deliveries
                    </text>
                    <text
                      x={point.x}
                      y={Math.max(29, point.y - 14)}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#fcd34d"
                    >
                      {point.rate.toFixed(1)}% on-time
                    </text>
                  </g>
                )}
              </g>
            );
          })}
          <path
            d={linePath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((point, index) => (
            <circle
              key={`rate-${point.label}`}
              cx={point.x}
              cy={point.y}
              r={hoveredIndex === index ? 5 : 3.5}
              fill="white"
              stroke="#f59e0b"
              strokeWidth="2"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
