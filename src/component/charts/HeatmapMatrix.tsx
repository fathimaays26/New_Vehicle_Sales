import { useMemo, useState } from "react";
import { formatNumber } from "../../format";

interface HeatmapMatrixProps {
  rowLabels: string[];
  colLabels: string[];
  matrixData: Record<string, Record<string, number>>; // matrixData[row][col] = count
  emptyMessage?: string;
  rowHeader?: string;
}

export default function HeatmapMatrix({
  rowLabels,
  colLabels,
  matrixData,
  emptyMessage = "No matrix data available",
  rowHeader = "Model",
}: HeatmapMatrixProps) {
  const [hoveredCell, setHoveredCell] = useState<{
    row: string;
    col: string;
    val: number;
  } | null>(null);

  // Compute max value in the entire matrix for color intensity scaling
  const { maxVal, rowTotals, colTotals, grandTotal } = useMemo(() => {
    let max = 0;
    const rTotals: Record<string, number> = {};
    const cTotals: Record<string, number> = {};
    let gTotal = 0;

    for (const r of rowLabels) {
      rTotals[r] = 0;
      for (const c of colLabels) {
        const val = matrixData[r]?.[c] ?? 0;
        if (val > max) max = val;
        rTotals[r] += val;
        cTotals[c] = (cTotals[c] ?? 0) + val;
        gTotal += val;
      }
    }

    return {
      maxVal: max > 0 ? max : 1,
      rowTotals: rTotals,
      colTotals: cTotals,
      grandTotal: gTotal,
    };
  }, [rowLabels, colLabels, matrixData]);

  if (rowLabels.length === 0 || colLabels.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  // Get background color and text color based on cell intensity
  const getCellStyles = (val: number) => {
    if (val === 0) {
      return {
        backgroundColor: "rgba(248, 250, 252, 0.7)",
        color: "#94a3b8",
      };
    }

    const intensity = Math.min(1, Math.max(0.12, val / maxVal));

    return {
      backgroundColor: `rgba(37, 99, 235, ${intensity})`,
      color: intensity > 0.5 ? "#ffffff" : "#1e3a8a",
    };
  };

  return (
    <div className="w-full">
      <div className="overflow-x-auto rounded-xl border border-slate-200/90 shadow-xs">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-700">
              <th className="py-3 px-4 font-bold text-slate-900 tracking-wide uppercase text-[11px]">
                {rowHeader}
              </th>
              {colLabels.map((col) => (
                <th
                  key={col}
                  className="py-3 px-3 text-center font-bold text-slate-800 uppercase text-[11px] whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
              <th className="py-3 px-4 text-center font-bold text-slate-900 bg-slate-100 uppercase text-[11px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rowLabels.map((row) => (
              <tr key={row} className="hover:bg-slate-50/50 transition-colors">
                <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                  {row}
                </td>
                {colLabels.map((col) => {
                  const val = matrixData[row]?.[col] ?? 0;
                  const isHovered =
                    hoveredCell?.row === row && hoveredCell?.col === col;
                  const styles = getCellStyles(val);

                  return (
                    <td
                      key={col}
                      className={`py-3 px-3 text-center font-bold tabular-nums cursor-pointer transition-all duration-150 ${
                        isHovered
                          ? "ring-2 ring-blue-500 ring-inset scale-[1.05] z-10 shadow-sm"
                          : ""
                      }`}
                      style={styles}
                      onMouseEnter={() => setHoveredCell({ row, col, val })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      {formatNumber(val)}
                    </td>
                  );
                })}
                <td className="py-3 px-4 text-center font-black tabular-nums text-slate-900 bg-slate-50/70">
                  {formatNumber(rowTotals[row] ?? 0)}
                </td>
              </tr>
            ))}

            {/* Grand Total row */}
            <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
              <td className="py-3 px-4 font-black uppercase text-[11px]">
                Total Region Sales
              </td>
              {colLabels.map((col) => (
                <td
                  key={col}
                  className="py-3 px-3 text-center font-black tabular-nums text-slate-900"
                >
                  {formatNumber(colTotals[col] ?? 0)}
                </td>
              ))}
              <td className="py-3 px-4 text-center font-black tabular-nums text-blue-700 bg-blue-50">
                {formatNumber(grandTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Heatmap Legend */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-600">Low Volume</span>
          <div className="flex h-3 w-32 rounded-full overflow-hidden bg-gradient-to-r from-blue-100 via-blue-400 to-blue-700 border border-slate-200" />
          <span className="font-semibold text-slate-800">
            Peak Volume ({formatNumber(maxVal)})
          </span>
        </div>
        {hoveredCell ? (
          <div className="font-medium text-slate-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md text-xs">
            {hoveredCell.row} × {hoveredCell.col}:{" "}
            <span className="font-bold text-blue-700">
              {formatNumber(hoveredCell.val)} units
            </span>
          </div>
        ) : (
          <span className="text-slate-400 text-[11px]">
            Hover over any cell to inspect breakdown
          </span>
        )}
      </div>
    </div>
  );
}
