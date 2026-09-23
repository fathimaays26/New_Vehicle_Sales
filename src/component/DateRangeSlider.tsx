import { useEffect, useMemo, useState } from "react";

interface DateRangeSliderProps {
  startDate: string | null; // ISO "YYYY-MM-DD"
  endDate: string | null;   // ISO "YYYY-MM-DD"
  minDateStr?: string;      // default "2025-01-01"
  maxDateStr?: string;      // default "2026-12-31"
  onChange: (start: string | null, end: string | null) => void;
}

// Format "YYYY-MM-DD" -> "DD-MM-YYYY"
function toDisplay(iso: string | null | undefined, fallback: string): string {
  if (!iso) return fallback;
  const parts = iso.split("-");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return iso;
}

// Format "DD-MM-YYYY" -> "YYYY-MM-DD"
function toIso(display: string): string | null {
  const parts = display.trim().split("-");
  if (parts.length === 3 && parts[0].length === 2 && parts[1].length === 2 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return null;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export default function DateRangeSlider({
  startDate,
  endDate,
  minDateStr = "2025-01-01",
  maxDateStr = "2026-12-31",
  onChange,
}: DateRangeSliderProps) {
  const minTime = useMemo(() => new Date(minDateStr).getTime(), [minDateStr]);
  const maxTime = useMemo(() => new Date(maxDateStr).getTime(), [maxDateStr]);
  const totalDays = useMemo(
    () => Math.max(1, Math.round((maxTime - minTime) / MS_PER_DAY)),
    [maxTime, minTime],
  );

  const startDay = useMemo(() => {
    if (!startDate) return 0;
    const t = new Date(startDate).getTime();
    if (Number.isNaN(t)) return 0;
    return Math.max(0, Math.min(totalDays, Math.round((t - minTime) / MS_PER_DAY)));
  }, [startDate, minTime, totalDays]);

  const endDay = useMemo(() => {
    if (!endDate) return totalDays;
    const t = new Date(endDate).getTime();
    if (Number.isNaN(t)) return totalDays;
    return Math.max(0, Math.min(totalDays, Math.round((t - minTime) / MS_PER_DAY)));
  }, [endDate, minTime, totalDays]);

  // Local text input state for display
  const [startInput, setStartInput] = useState(() =>
    toDisplay(startDate, toDisplay(minDateStr, "01-01-2025")),
  );
  const [endInput, setEndInput] = useState(() =>
    toDisplay(endDate, toDisplay(maxDateStr, "31-12-2026")),
  );

  // Sync inputs with props
  useEffect(() => {
    setStartInput(toDisplay(startDate, toDisplay(minDateStr, "01-01-2025")));
  }, [startDate, minDateStr]);

  useEffect(() => {
    setEndInput(toDisplay(endDate, toDisplay(maxDateStr, "31-12-2026")));
  }, [endDate, maxDateStr]);

  const startPct = (startDay / totalDays) * 100;
  const endPct = (endDay / totalDays) * 100;

  const handleStartSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const clamped = Math.min(val, endDay - 1);
    const newDate = new Date(minTime + clamped * MS_PER_DAY)
      .toISOString()
      .split("T")[0];
    onChange(newDate, endDate);
  };

  const handleEndSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    const clamped = Math.max(val, startDay + 1);
    const newDate = new Date(minTime + clamped * MS_PER_DAY)
      .toISOString()
      .split("T")[0];
    onChange(startDate, newDate);
  };

  const handleStartBlur = () => {
    const iso = toIso(startInput);
    if (iso && iso >= minDateStr && iso <= (endDate || maxDateStr)) {
      onChange(iso, endDate);
    } else {
      setStartInput(toDisplay(startDate, toDisplay(minDateStr, "01-01-2025")));
    }
  };

  const handleEndBlur = () => {
    const iso = toIso(endInput);
    if (iso && iso <= maxDateStr && iso >= (startDate || minDateStr)) {
      onChange(startDate, iso);
    } else {
      setEndInput(toDisplay(endDate, toDisplay(maxDateStr, "31-12-2026")));
    }
  };

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
      {/* Title matching Image 1: "Date" in deep navy */}
      <h3 className="text-sm font-bold text-[#1e293b] mb-2.5">Date</h3>

      {/* Two input boxes side-by-side matching Image 1 */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <input
            type="text"
            className="w-full rounded-md border border-slate-200/90 bg-white py-1.5 px-2 text-center text-xs font-semibold tabular-nums text-slate-800 shadow-2xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            onBlur={handleStartBlur}
            onKeyDown={(e) => e.key === "Enter" && handleStartBlur()}
            placeholder="DD-MM-YYYY"
            title="Start Date (DD-MM-YYYY)"
          />
        </div>
        <div>
          <input
            type="text"
            className="w-full rounded-md border border-slate-200/90 bg-white py-1.5 px-2 text-center text-xs font-semibold tabular-nums text-slate-800 shadow-2xs focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
            onBlur={handleEndBlur}
            onKeyDown={(e) => e.key === "Enter" && handleEndBlur()}
            placeholder="DD-MM-YYYY"
            title="End Date (DD-MM-YYYY)"
          />
        </div>
      </div>

      {/* Dual Slider matching Image 1 */}
      <div className="relative h-6 flex items-center px-1">
        {/* Base Track */}
        <div className="absolute left-1 right-1 h-1 bg-slate-200 rounded-full" />

        {/* Active Range Track */}
        <div
          className="absolute h-1 bg-slate-700 rounded-full pointer-events-none"
          style={{
            left: `calc(4px + ${startPct * 0.94}%)`,
            width: `${Math.max(0, (endPct - startPct) * 0.94)}%`,
          }}
        />

        {/* Start Slider Handle */}
        <input
          type="range"
          min={0}
          max={totalDays}
          value={startDay}
          onChange={handleStartSlider}
          className="absolute w-full appearance-none bg-transparent pointer-events-none z-20 cursor-pointer
            [&::-webkit-slider-thumb]:pointer-events-auto
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[#374151]
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-slate-200
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-webkit-slider-thumb]:transition-transform
            [&::-moz-range-thumb]:pointer-events-auto
            [&::-moz-range-thumb]:w-5
            [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-[#374151]
            [&::-moz-range-thumb]:border-2
            [&::-moz-range-thumb]:border-slate-200
            [&::-moz-range-thumb]:shadow-md
            [&::-moz-range-thumb]:cursor-pointer"
        />

        {/* End Slider Handle */}
        <input
          type="range"
          min={0}
          max={totalDays}
          value={endDay}
          onChange={handleEndSlider}
          className="absolute w-full appearance-none bg-transparent pointer-events-none z-30 cursor-pointer
            [&::-webkit-slider-thumb]:pointer-events-auto
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[#374151]
            [&::-webkit-slider-thumb]:border-2
            [&::-webkit-slider-thumb]:border-slate-200
            [&::-webkit-slider-thumb]:shadow-md
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-webkit-slider-thumb]:transition-transform
            [&::-moz-range-thumb]:pointer-events-auto
            [&::-moz-range-thumb]:w-5
            [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-[#374151]
            [&::-moz-range-thumb]:border-2
            [&::-moz-range-thumb]:border-slate-200
            [&::-moz-range-thumb]:shadow-md
            [&::-moz-range-thumb]:cursor-pointer"
        />
      </div>
    </div>
  );
}

