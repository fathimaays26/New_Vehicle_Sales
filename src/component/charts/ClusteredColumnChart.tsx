import { useMemo, useState } from "react";
import { formatNumber } from "../../format";

export interface ColumnGroupItem {
  category: string;
  series: {
    name: string;
    value: number;
    color?: string;
  }[];
}

interface ClusteredColumnChartProps {
  data: ColumnGroupItem[];
  valueFormatter?: (val: number) => string;
  height?: number;
  emptyMessage?: string;
  showLegend?: boolean;
  benchmark?: { value: number; label: string };
  unit?: string;
}

const DEFAULT_SERIES_COLORS = [
  "bg-blue-600",
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-purple-500",
];

export default function ClusteredColumnChart({
  data,
  valueFormatter = (v) => formatNumber(v),
  height = 260,
  emptyMessage = "No data available",
  showLegend = true,
  benchmark,
}: ClusteredColumnChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<{
    catIdx: number;
    serIdx: number;
  } | null>(null);

  // Extract all unique series names
  const seriesNames = useMemo(() => {
    const names = new Set<string>();
    for (const d of data) {
      for (const s of d.series) {
        names.add(s.name);
      }
    }
    return Array.from(names);
  }, [data]);

  // Determine min and max value
  const { minVal, maxVal } = useMemo(() => {
    let min = 0;
    let max = 0;
    for (const d of data) {
      for (const s of d.series) {
        if (s.value < min) min = s.value;
        if (s.value > max) max = s.value;
      }
    }
    if (benchmark) {
      if (benchmark.value > max) max = benchmark.value;
      if (benchmark.value < min) min = benchmark.value;
    }
    if (min === 0 && max === 0) max = 1;
    // Add 15% headroom for top labels
    const rangeHeadroom = (max - min) * 0.15 || 1;
    return {
      minVal: min < 0 ? min - rangeHeadroom : 0,
      maxVal: max + rangeHeadroom,
    };
  }, [data, benchmark]);

  const totalRange = maxVal - minVal || 1;
  const zeroLinePct = minVal < 0 ? ((0 - minVal) / totalRange) * 100 : 0;

  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  // Grid tick lines
  const gridTicks = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div className="w-full flex flex-col justify-between">
      {/* Legend & Benchmark */}
      {((showLegend && seriesNames.length > 1) || benchmark) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs border-b border-slate-100 pb-2">
          <div className="flex flex-wrap items-center gap-3">
            {seriesNames.map((name, i) => (
              <div key={name} className="flex items-center gap-1.5">
                <span
                  className={`h-2.5 w-2.5 rounded-xs ${
                    DEFAULT_SERIES_COLORS[i % DEFAULT_SERIES_COLORS.length]
                  }`}
                />
                <span className="font-semibold text-slate-700">{name}</span>
              </div>
            ))}
          </div>
          {benchmark && (
            <div className="flex items-center gap-1.5 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              <span className="h-0.5 w-3 bg-rose-500" />
              <span className="text-rose-700 text-[11px] font-semibold">
                {benchmark.label} ({valueFormatter(benchmark.value)})
              </span>
            </div>
          )}
        </div>
      )}

      {/* Chart container */}
      <div className="relative w-full" style={{ height }}>
        {/* Background Grid Lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-7">
          {gridTicks.map((pct) => (
            <div
              key={pct}
              className="w-full border-b border-slate-100 flex items-center justify-end"
            >
              <span className="text-[10px] text-slate-400 tabular-nums pr-1">
                {valueFormatter(minVal + pct * totalRange)}
              </span>
            </div>
          ))}
        </div>

        {/* Benchmark line */}
        {benchmark && (
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-rose-500/80 z-10 pointer-events-none"
            style={{
              bottom: `calc(${((benchmark.value - minVal) / totalRange) * 100}% + 28px)`,
            }}
          />
        )}

        {/* Zero baseline if negative */}
        {minVal < 0 && (
          <div
            className="absolute left-0 right-0 border-b-2 border-slate-300 z-10"
            style={{ bottom: `calc(${zeroLinePct}% + 28px)` }}
          />
        )}

        {/* Bars Container */}
        <div className="relative z-10 flex h-full items-end gap-2 sm:gap-4 px-2 pb-7">
          {data.map((group, catIdx) => (
            <div
              key={group.category}
              className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
            >
              {/* Clustered Bars for this Category */}
              <div className="flex items-end justify-center gap-1.5 w-full h-full">
                {group.series.map((s, serIdx) => {
                  const isHovered =
                    hoveredIdx?.catIdx === catIdx &&
                    hoveredIdx?.serIdx === serIdx;
                  const isPositive = s.value >= 0;
                  const barHeightPct = (Math.abs(s.value) / totalRange) * 100;
                  const color =
                    s.color ||
                    DEFAULT_SERIES_COLORS[
                      serIdx % DEFAULT_SERIES_COLORS.length
                    ];

                  return (
                    <div
                      key={s.name}
                      className="relative flex-1 max-w-[56px] flex flex-col items-center group cursor-pointer"
                      style={{
                        height: `${Math.max(barHeightPct, 4)}%`,
                        marginBottom:
                          minVal < 0 && isPositive
                            ? `${zeroLinePct}%`
                            : undefined,
                      }}
                      onMouseEnter={() => setHoveredIdx({ catIdx, serIdx })}
                      onMouseLeave={() => setHoveredIdx(null)}
                    >
                      {/* Floating / Top value label */}
                      <span
                        className={`absolute -top-5 text-[11px] font-bold tabular-nums transition-opacity duration-200 ${
                          isHovered
                            ? "opacity-100 text-blue-700 scale-110"
                            : "opacity-85 text-slate-700"
                        }`}
                      >
                        {valueFormatter(s.value)}
                      </span>

                      {/* Bar Fill with Track */}
                      <div
                        className={`w-full rounded-t-md transition-all duration-300 shadow-xs ${color} ${
                          isHovered
                            ? "brightness-110 ring-2 ring-blue-400 ring-offset-1"
                            : "hover:brightness-105"
                        } h-full min-h-[4px]`}
                      />

                      {/* Tooltip on hover */}
                      {isHovered && (
                        <div className="absolute bottom-full mb-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-2.5 py-1.5 rounded-lg text-xs shadow-xl z-30 pointer-events-none whitespace-nowrap">
                          <div className="font-semibold text-slate-200">
                            {group.category}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-slate-400">{s.name}:</span>
                            <span className="font-bold text-white">
                              {valueFormatter(s.value)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Category label below baseline */}
              <div className="absolute bottom-0 w-full text-center">
                <span
                  className="block text-[11px] font-semibold text-slate-600 truncate px-1"
                  title={group.category}
                >
                  {group.category}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
