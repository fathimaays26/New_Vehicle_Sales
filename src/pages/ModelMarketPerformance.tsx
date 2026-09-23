import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../component/DashboardLayout";
import KPICard from "../component/KpiCard";
import ChartCard from "../component/ChartCard";
import type { DashboardPage } from "../component/Header";
import { useFilters } from "../context/FilterContext";
import { formatNumber } from "../format";
import { loadDatabaseSnapshot } from "../dataService";
import type {
  DimCustomer,
  DimRegion,
  DimVModel,
  FactBooking,
  FactSalesTransaction,
} from "../index";
import HorizontalBarChart from "../component/charts/HorizontalBarChart";
import ClusteredColumnChart from "../component/charts/ClusteredColumnChart";
import MultiLineTrendChart from "../component/charts/MultiLineTrendChart";
import DonutChart from "../component/charts/DonutChart";
import HeatmapMatrix from "../component/charts/HeatmapMatrix";

interface EnrichedSale {
  sale_id: string;
  booking_id: string;
  customer_id: string;
  vehicle_id: string;
  model_id: string;
  region_id: string;
  sale_date: string;
  sale_value: number;
  modelName: string;
  variant: string;
  vehicleType: string;
  regionName: string;
  customerType: string;
  bookingStatus: string;
  month: string;
}

const MONTH_ORDER = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function getMonthLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return "Unknown";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(d);
}

export default function ModelMarketPerformance({
  activePage,
  onPageChange,
}: {
  activePage: DashboardPage;
  onPageChange: (page: DashboardPage) => void;
}) {
  const { filters, matchingModelIds } = useFilters();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<FactSalesTransaction[]>([]);
  const [models, setModels] = useState<DimVModel[]>([]);
  const [regions, setRegions] = useState<DimRegion[]>([]);
  const [customers, setCustomers] = useState<DimCustomer[]>([]);
  const [bookings, setBookings] = useState<FactBooking[]>([]);
  const [customerTypeTimeView, setCustomerTypeTimeView] = useState<"Monthly" | "Yearly">("Yearly");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const snapshot = await loadDatabaseSnapshot();
        setSales(snapshot.sales);
        setModels(snapshot.models);
        setRegions(snapshot.regions);
        setCustomers(snapshot.customers);
        setBookings(snapshot.bookings);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const enrichedSales = useMemo<EnrichedSale[]>(() => {
    const modelMap = new Map(models.map((m) => [m.model_id, m]));
    const regionMap = new Map(regions.map((r) => [r.region_id, r]));
    const customerMap = new Map(customers.map((c) => [c.customer_id, c]));
    const bookingMap = new Map(bookings.map((b) => [b.booking_id, b]));

    return sales.map((s) => {
      const model = modelMap.get(s.model_id);
      const region = regionMap.get(s.region_id);
      const customer = customerMap.get(s.customer_id);
      const booking = bookingMap.get(s.booking_id);

      return {
        sale_id: s.sale_id,
        booking_id: s.booking_id,
        customer_id: s.customer_id,
        vehicle_id: s.vehicle_id,
        model_id: s.model_id,
        region_id: s.region_id,
        sale_date: s.sale_date,
        sale_value: Number(s.sale_value) || 0,
        modelName: model?.model_name || s.model_id,
        variant: model?.variant || "Unknown Variant",
        vehicleType: model?.vehicle_type || "Unknown Type",
        regionName: region?.region_name || s.region_id,
        customerType: customer?.customer_type || "Retail",
        bookingStatus: booking?.booking_status || "Fulfilled",
        month: getMonthLabel(s.sale_date),
      };
    });
  }, [sales, models, regions, customers, bookings]);

  // Apply Global Filters
  const filteredSales = useMemo(() => {
    return enrichedSales.filter((s) => {
      if (filters.startDate && s.sale_date && s.sale_date < filters.startDate) {
        return false;
      }
      if (filters.endDate && s.sale_date && s.sale_date > filters.endDate) {
        return false;
      }
      if (filters.regionId && s.region_id !== filters.regionId) {
        return false;
      }
      if (filters.modelId && s.model_id !== filters.modelId) {
        return false;
      }
      if (matchingModelIds && !matchingModelIds.includes(s.model_id)) {
        return false;
      }
      if (filters.variant && s.variant !== filters.variant) {
        return false;
      }
      if (filters.vehicleType && s.vehicleType !== filters.vehicleType) {
        return false;
      }
      if (filters.customerType && s.customerType !== filters.customerType) {
        return false;
      }
      if (filters.bookingStatus && s.bookingStatus !== filters.bookingStatus) {
        return false;
      }
      return true;
    });
  }, [enrichedSales, filters, matchingModelIds]);

  // Executive Top Stats
  const { topModel, topVariant, topRegion, topModelVolume } = useMemo(() => {
    const modelCounts = new Map<string, number>();
    const variantCounts = new Map<string, number>();
    const regionCounts = new Map<string, number>();

    for (const s of filteredSales) {
      modelCounts.set(s.modelName, (modelCounts.get(s.modelName) || 0) + 1);
      variantCounts.set(s.variant, (variantCounts.get(s.variant) || 0) + 1);
      regionCounts.set(s.regionName, (regionCounts.get(s.regionName) || 0) + 1);
    }

    const sortTop = (map: Map<string, number>) =>
      [...map.entries()].sort((a, b) => b[1] - a[1])[0] || ["—", 0];

    const [tModel, tModelVol] = sortTop(modelCounts);
    const [tVariant] = sortTop(variantCounts);
    const [tRegion] = sortTop(regionCounts);

    return {
      topModel: tModel,
      topModelVolume: tModelVol,
      topVariant: tVariant,
      topRegion: tRegion,
    };
  }, [filteredSales]);

  // 1. Sales by Variant (Horizontal Bar Chart: Y -> Variant, X -> Count of Sale ID)
  const salesByVariantData = useMemo(() => {
    const variantMap = new Map<string, number>();
    for (const s of filteredSales) {
      variantMap.set(s.variant, (variantMap.get(s.variant) || 0) + 1);
    }

    const totalSales = filteredSales.length || 1;
    return Array.from(variantMap.entries())
      .map(([variant, count]) => ({
        label: variant,
        value: count,
        secondaryLabel: `${((count / totalSales) * 100).toFixed(1)}% of total`,
        color: "bg-blue-600",
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredSales]);

  // 2. Model Sales Trend (Line Chart: X -> Month, Y -> Count of Sale ID, Legend -> Model Name)
  const modelSalesTrendData = useMemo(() => {
    const activeModels = Array.from(
      new Set(filteredSales.map((s) => s.modelName)),
    ).sort();

    const modelMonthCounts = new Map<string, Record<string, number>>();
    for (const m of activeModels) {
      const counts: Record<string, number> = {};
      for (const mo of MONTH_ORDER) counts[mo] = 0;
      modelMonthCounts.set(m, counts);
    }

    for (const s of filteredSales) {
      if (MONTH_ORDER.includes(s.month)) {
        const counts = modelMonthCounts.get(s.modelName);
        if (counts) {
          counts[s.month] = (counts[s.month] || 0) + 1;
        }
      }
    }

    const series = activeModels.map((modelName) => {
      const counts = modelMonthCounts.get(modelName) || {};
      return {
        name: modelName,
        color: "", // auto-assigned by palette
        data: MONTH_ORDER.map((mo) => counts[mo] || 0),
      };
    });

    return {
      labels: MONTH_ORDER,
      series,
    };
  }, [filteredSales]);

  // 3. Model Sales Mix (Donut Chart: Legend -> Model Name, Values -> Count of Sale ID)
  const modelSalesMixData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of filteredSales) {
      counts.set(s.modelName, (counts.get(s.modelName) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([modelName, count]) => ({
        label: modelName,
        value: count,
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredSales]);

  // 4. Model × Region Performance (Matrix / Heatmap: Rows -> Model Name, Columns -> Region Name, Values -> Count)
  const heatmapData = useMemo(() => {
    const rowSet = new Set<string>();
    const colSet = new Set<string>();
    const matrix: Record<string, Record<string, number>> = {};

    for (const r of regions) colSet.add(r.region_name);

    for (const s of filteredSales) {
      rowSet.add(s.modelName);
      colSet.add(s.regionName);
      if (!matrix[s.modelName]) matrix[s.modelName] = {};
      matrix[s.modelName][s.regionName] =
        (matrix[s.modelName][s.regionName] || 0) + 1;
    }

    const rowLabels = Array.from(rowSet).sort();
    const colLabels = Array.from(colSet).sort();

    return {
      rowLabels,
      colLabels,
      matrixData: matrix,
    };
  }, [filteredSales, regions]);

  // 5. Model × Customer Type Performance
  // Yearly view: Model -> Retail / Dealer / Fleet
  // Monthly view: Month -> Retail / Dealer / Fleet
  // The global filters remain applied through filteredSales.
  const modelCustomerTypeData = useMemo(() => {
    const customerTypes = ["Retail", "Dealer", "Fleet"];

    if (customerTypeTimeView === "Yearly") {
      const modelSet = Array.from(
        new Set(filteredSales.map((s) => s.modelName)),
      ).sort();

      const grouped = new Map<string, Record<string, number>>();

      for (const modelName of modelSet) {
        const counts: Record<string, number> = {};
        for (const customerType of customerTypes) {
          counts[customerType] = 0;
        }
        grouped.set(modelName, counts);
      }

      for (const sale of filteredSales) {
        const counts = grouped.get(sale.modelName);
        if (counts && customerTypes.includes(sale.customerType)) {
          counts[sale.customerType] += 1;
        }
      }

      return modelSet.map((modelName) => {
        const counts = grouped.get(modelName) || {};
        return {
          category: modelName,
          series: customerTypes.map((customerType) => ({
            name: customerType,
            value: counts[customerType] || 0,
          })),
        };
      });
    }

    const grouped = new Map<string, Record<string, number>>();

    for (const month of MONTH_ORDER) {
      const counts: Record<string, number> = {};
      for (const customerType of customerTypes) {
        counts[customerType] = 0;
      }
      grouped.set(month, counts);
    }

    for (const sale of filteredSales) {
      const counts = grouped.get(sale.month);
      if (counts && customerTypes.includes(sale.customerType)) {
        counts[sale.customerType] += 1;
      }
    }

    return MONTH_ORDER.map((month) => {
      const counts = grouped.get(month) || {};
      return {
        category: month,
        series: customerTypes.map((customerType) => ({
          name: customerType,
          value: counts[customerType] || 0,
        })),
      };
    });
  }, [filteredSales, customerTypeTimeView]);

  return (
    <DashboardLayout activePage={activePage} onPageChange={onPageChange}>
      {/* Header Banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Model &amp; Market Performance
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              Page 4
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Deep dive into which vehicle models and trim variants are performing
            across regional territories and customer segments.
          </p>
        </div>
        <div className="flex items-center gap-3"></div>
      </div>

      {/* Executive Highlights Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Total Vehicles Sold"
          value={formatNumber(filteredSales.length)}
          tooltip="Total vehicle sales transactions matching current filters"
          accentColor="blue"
          loading={loading}
        />
        <KPICard
          title="Top Selling Model"
          value={topModel}
          subtext={`${formatNumber(topModelVolume)} units sold`}
          tooltip="Highest volume vehicle model"
          accentColor="emerald"
          
          loading={loading}
        />
        <KPICard
          title="Top-Selling Variant"
          value={topVariant}
          subtext="Highest sales volume variant"
          tooltip="Highest volume variant across all models"
          accentColor="indigo"
          loading={loading}
        />
        <KPICard
          title="Top Market Region"
          value={topRegion}
          subtext="Highest sales volume territory"
          tooltip="Leading geographical market region"
          accentColor="amber"
          
          loading={loading}
        />
      </div>

      {/* Row 1: Charts 1 & 3 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">
        {/* 1. Sales by Variant */}
        <div className="lg:col-span-5">
          <ChartCard
            title="Sales by Variant"
            subtitle="Sales volume distribution categorized by variant specification"
            
            height={300}
          >
            <div className="h-[230px] overflow-y-auto pr-1">
              <HorizontalBarChart
                data={salesByVariantData}
                valueFormatter={(val) => formatNumber(val)}
                showRank={true}
              />
            </div>
          </ChartCard>
        </div>

        {/* 3. Model Sales Mix */}
        <div className="lg:col-span-7">
          <ChartCard
            title="Model Sales Mix"
            subtitle="Portfolio market share distribution across vehicle model lines"
            
            height={300}
          >
            <DonutChart
              data={modelSalesMixData}
              valueFormatter={(val) => formatNumber(val)}
              height={230}
            />
          </ChartCard>
        </div>
      </div>

      {/* Row 2: Chart 2 */}
      <div className="grid grid-cols-1 gap-5 mb-5">
        <ChartCard
          title="Model Sales Trend"
          subtitle="Monthly sales volume trajectory plotted individually for each Toyota vehicle model"
          
          height={300}
        >
          <MultiLineTrendChart
            labels={modelSalesTrendData.labels}
            series={modelSalesTrendData.series}
            valueFormatter={(val) => formatNumber(val)}
            height={230}
          />
        </ChartCard>
      </div>

      {/* Row 3: Chart 4 (Heatmap Matrix) */}
      <div className="grid grid-cols-1 gap-5 mb-5">
        <ChartCard
          title="Model × Region Performance"
          subtitle="Geographic sales cross-tabulation with dynamic heat intensity shading based on sales volume"
          
        >
          <div className="py-2">
            <HeatmapMatrix
              rowLabels={heatmapData.rowLabels}
              colLabels={heatmapData.colLabels}
              matrixData={heatmapData.matrixData}
              rowHeader="Model Name"
            />
          </div>
        </ChartCard>
      </div>

      {/* Row 4: Chart 5 (Model x Customer Type with Monthly / Yearly Time View) */}
      <div className="grid grid-cols-1 gap-5">
        <ChartCard
          title="Model × Customer Type Performance"
          subtitle={
            customerTypeTimeView === "Yearly"
              ? "Yearly sales volume by vehicle model and customer type"
              : "Monthly sales volume by customer type across the selected period"
          }
          action={
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Time View</span>
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setCustomerTypeTimeView("Monthly")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    customerTypeTimeView === "Monthly"
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerTypeTimeView("Yearly")}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    customerTypeTimeView === "Yearly"
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Yearly
                </button>
              </div>
            </div>
          }
          height={320}
        >
          <ClusteredColumnChart
            data={modelCustomerTypeData}
            valueFormatter={(val) => formatNumber(val)}
            height={240}
            showLegend={true}
          />
        </ChartCard>
      </div>
    </DashboardLayout>
  );
}
