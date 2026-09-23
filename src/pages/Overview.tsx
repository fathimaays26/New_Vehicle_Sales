import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../component/DashboardLayout";
import KPICard from "../component/KpiCard";
import ChartCard from "../component/ChartCard";
import type { DashboardPage } from "../component/Header";
import { useFilters } from "../context/FilterContext";
import { formatCurrency, formatNumber, formatPercent } from "../format";
import { loadDatabaseSnapshot } from "../dataService";
import type {
  DimCustomer,
  DimRegion,
  DimVModel,
  FactBooking,
  FactSalesTarget,
  FactSalesTransaction,
  OverviewKpis,
} from "../index";
import HorizontalBarChart from "../component/charts/HorizontalBarChart";
import ClusteredColumnChart from "../component/charts/ClusteredColumnChart";
import MultiLineTrendChart from "../component/charts/MultiLineTrendChart";

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

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function monthLabelFromDate(dateValue: string | null | undefined): string {
  if (!dateValue) return "Unknown";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
}

export default function Overview({
  activePage,
  onPageChange,
}: {
  activePage: DashboardPage;
  onPageChange: (page: DashboardPage) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<FactSalesTransaction[]>([]);
  const [bookings, setBookings] = useState<FactBooking[]>([]);
  const [models, setModels] = useState<DimVModel[]>([]);
  const [regions, setRegions] = useState<DimRegion[]>([]);
  const [customers, setCustomers] = useState<DimCustomer[]>([]);
  const [targets, setTargets] = useState<FactSalesTarget[]>([]);

  const { filters, matchingModelIds, lookups } = useFilters();

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const snapshot = await loadDatabaseSnapshot();
        setSales(snapshot.sales);
        setBookings(snapshot.bookings);
        setModels(snapshot.models);
        setRegions(snapshot.regions);
        setCustomers(snapshot.customers);
        setTargets(snapshot.targets);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  // Apply Global Filters to real data
  const filteredData = useMemo(() => {
    let filteredSales = sales;
    let filteredBookings = bookings;

    if (filters.startDate || filters.endDate) {
      filteredSales = filteredSales.filter((sale) => {
        if (!sale.sale_date) return true;
        if (filters.startDate && sale.sale_date < filters.startDate)
          return false;
        if (filters.endDate && sale.sale_date > filters.endDate) return false;
        return true;
      });

      filteredBookings = filteredBookings.filter((booking) => {
        if (!booking.booking_date) return true;
        if (filters.startDate && booking.booking_date < filters.startDate)
          return false;
        if (filters.endDate && booking.booking_date > filters.endDate)
          return false;
        return true;
      });
    }

    if (filters.regionId) {
      filteredSales = filteredSales.filter(
        (sale) => sale.region_id === filters.regionId,
      );
      const allowedBookingIds = new Set(
        filteredSales.map((sale) => sale.booking_id),
      );
      filteredBookings = filteredBookings.filter((booking) =>
        allowedBookingIds.has(booking.booking_id),
      );
    }

    if (filters.modelId || matchingModelIds) {
      const allowedModelIds = new Set(
        (matchingModelIds ?? (filters.modelId ? [filters.modelId] : [])).filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        ),
      );
      filteredSales = filteredSales.filter((sale) =>
        allowedModelIds.has(sale.model_id),
      );
      filteredBookings = filteredBookings.filter((booking) =>
        allowedModelIds.has(booking.model_id),
      );
    }

    if (filters.variant && lookups) {
      const variantModelIds = new Set(
        lookups.models
          .filter((model) => model.variant === filters.variant)
          .map((model) => model.model_id),
      );
      filteredSales = filteredSales.filter((sale) =>
        variantModelIds.has(sale.model_id),
      );
      filteredBookings = filteredBookings.filter((booking) =>
        variantModelIds.has(booking.model_id),
      );
    }

    if (filters.vehicleType && lookups) {
      const vehicleTypeModelIds = new Set(
        lookups.models
          .filter((model) => model.vehicle_type === filters.vehicleType)
          .map((model) => model.model_id),
      );
      filteredSales = filteredSales.filter((sale) =>
        vehicleTypeModelIds.has(sale.model_id),
      );
      filteredBookings = filteredBookings.filter((booking) =>
        vehicleTypeModelIds.has(booking.model_id),
      );
    }

    if (filters.customerType) {
      const allowedCustomerIds = new Set(
        customers
          .filter((customer) => customer.customer_type === filters.customerType)
          .map((customer) => customer.customer_id),
      );
      filteredSales = filteredSales.filter((sale) =>
        allowedCustomerIds.has(sale.customer_id),
      );
      filteredBookings = filteredBookings.filter((booking) =>
        allowedCustomerIds.has(booking.customer_id),
      );
    }

    if (filters.bookingStatus) {
      filteredBookings = filteredBookings.filter(
        (booking) => booking.booking_status === filters.bookingStatus,
      );
    }

    return { filteredSales, filteredBookings };
  }, [sales, bookings, customers, filters, matchingModelIds, lookups]);

  // Compute KPIs & Charts
  const {
    totalVehiclesSold,
    totalSalesRevenue,
    avgSalesValue,
    totalBookings,
    conversionRate,
    targetAchievement,
    topSellingModel,
    salesTrendData,
    salesByModelData,
    salesByRegionData,
    targetActualData,
  } = useMemo(() => {
    const { filteredSales, filteredBookings } = filteredData;
    const soldCount = filteredSales.length;
    const revenue = filteredSales.reduce(
      (sum, sale) => sum + toNumber(sale.sale_value),
      0,
    );
    const avgVal = soldCount > 0 ? revenue / soldCount : 0;
    const bookCount = filteredBookings.length;
    const convRate = bookCount > 0 ? (soldCount / bookCount) * 100 : 0;

    const filteredTargetRows = targets.filter((row) => {
      if (filters.regionId && row.region_id !== filters.regionId) return false;
      if (filters.modelId && row.model_id !== filters.modelId) return false;
      if (matchingModelIds && !matchingModelIds.includes(row.model_id))
        return false;
      return true;
    });

    const totalTarget = filteredTargetRows.reduce(
      (sum, row) => sum + toNumber(row.sales_target),
      0,
    );
    const targetAchieve = totalTarget > 0 ? (soldCount / totalTarget) * 100 : 0;

    // Sales by Model
    const modelMap = new Map<string, number>();
    for (const sale of filteredSales) {
      const model = models.find((item) => item.model_id === sale.model_id);
      const label = model?.model_name ?? sale.model_id;
      modelMap.set(label, (modelMap.get(label) ?? 0) + 1);
    }

    // Sales by Region
    const regionMap = new Map<string, number>();
    for (const sale of filteredSales) {
      const region = regions.find((item) => item.region_id === sale.region_id);
      const label = region?.region_name ?? sale.region_id;
      regionMap.set(label, (regionMap.get(label) ?? 0) + 1);
    }

    // Target by Region
    const targetMap = new Map<string, number>();
    for (const row of filteredTargetRows) {
      const region = regions.find((item) => item.region_id === row.region_id);
      const label = region?.region_name ?? row.region_id;
      targetMap.set(
        label,
        (targetMap.get(label) ?? 0) + toNumber(row.sales_target),
      );
    }

    // Monthly Trend
    const trendMap = new Map<string, number>();
    for (const mo of MONTH_ORDER) trendMap.set(mo, 0);
    for (const sale of filteredSales) {
      const label = monthLabelFromDate(sale.sale_date);
      if (MONTH_ORDER.includes(label)) {
        trendMap.set(label, (trendMap.get(label) ?? 0) + 1);
      }
    }

    const topModel =
      [...modelMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

    const sTrend = {
      labels: MONTH_ORDER,
      series: [
        {
          name: "Vehicles Sold",
          color: "#2563eb",
          data: MONTH_ORDER.map((mo) => trendMap.get(mo) ?? 0),
        },
      ],
    };

    const sModel = [...modelMap.entries()]
      .map(([label, value]) => ({
        label,
        value,
        secondaryLabel: `${((value / (soldCount || 1)) * 100).toFixed(1)}% of volume`,
        color: "bg-blue-600",
      }))
      .sort((a, b) => b.value - a.value);

    const sRegion = [...regionMap.entries()]
      .map(([label, value]) => ({
        label,
        value,
        secondaryLabel: `${((value / (soldCount || 1)) * 100).toFixed(1)}% share`,
        color: "bg-indigo-600",
      }))
      .sort((a, b) => b.value - a.value);

    // Target vs Actual Clustered Column
    const tActual = regions.map((reg) => {
      const actual = regionMap.get(reg.region_name) ?? 0;
      const target = targetMap.get(reg.region_name) ?? 0;
      return {
        category: reg.region_name,
        series: [
          { name: "Actual Sold", value: actual, color: "bg-blue-600" },
          { name: "Target", value: target, color: "bg-slate-300" },
        ],
      };
    });

    return {
      totalVehiclesSold: soldCount,
      totalSalesRevenue: revenue,
      avgSalesValue: avgVal,
      totalBookings: bookCount,
      conversionRate: convRate,
      targetAchievement: targetAchieve,
      topSellingModel: topModel,
      salesTrendData: sTrend,
      salesByModelData: sModel,
      salesByRegionData: sRegion,
      targetActualData: tActual,
    };
  }, [filteredData, targets, filters, matchingModelIds, models, regions]);

  const kpis: OverviewKpis = useMemo(
    () => ({
      totalVehiclesSold,
      totalSalesRevenue,
      avgSalesValue,
      totalBookings,
      conversionRate,
      targetAchievement,
      topSellingModel,
    }),
    [
      totalVehiclesSold,
      totalSalesRevenue,
      avgSalesValue,
      totalBookings,
      conversionRate,
      targetAchievement,
      topSellingModel,
    ],
  );

  return (
    <DashboardLayout activePage={activePage} onPageChange={onPageChange}>
      {/* Header Banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Executive Overview
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              Page 1
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            High-level executive summary of new vehicle bookings, revenue, and
            target performance across all markets.
          </p>
        </div>
        
      </div>

      {/* KPI Cards Row (7 Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-7 gap-3.5 mb-6">
        <KPICard
          title="Vehicles Sold"
          value={formatNumber(kpis.totalVehiclesSold)}
          subtext="Total units delivered"
          tooltip="Total count of confirmed vehicle sales transactions"
          accentColor="blue"
          loading={loading}
        />
        <KPICard
          title="Sales Revenue"
          value={formatCurrency(kpis.totalSalesRevenue)}
          subtext="Gross top-line revenue"
          tooltip="Total cumulative value of all vehicle sales transactions"
          accentColor="emerald"
          loading={loading}
        />
        <KPICard
          title="Avg Sales Value"
          value={formatCurrency(kpis.avgSalesValue)}
          subtext="Per vehicle average"
          tooltip="Average revenue per vehicle sold"
          accentColor="indigo"
          loading={loading}
        />
        <KPICard
          title="Total Bookings"
          value={formatNumber(kpis.totalBookings)}
          subtext="All customer bookings"
          tooltip="Total customer booking orders logged in the database"
          accentColor="blue"
          loading={loading}
        />
        <KPICard
          title="Conversion"
          value={formatPercent(kpis.conversionRate)}
          subtext="Bookings to sales"
          tooltip="Vehicles sold ÷ Total customer bookings"
          progress={{
            value: kpis.conversionRate,
            max: 100,
            color: "bg-blue-600",
          }}
          accentColor="emerald"
          loading={loading}
        />
        <KPICard
          title="Target Achieved"
          value={formatPercent(kpis.targetAchievement)}
          subtext="vs annual target"
          tooltip="Actual vehicles sold ÷ Sales targets quota"
          progress={{
            value: Math.min(100, kpis.targetAchievement),
            max: 100,
            color:
              kpis.targetAchievement >= 100 ? "bg-emerald-500" : "bg-amber-500",
          }}
          accentColor={kpis.targetAchievement >= 100 ? "emerald" : "amber"}
          loading={loading}
        />
        <KPICard
          title="Top Model"
          value={kpis.topSellingModel}
          subtext="Volume champion"
          tooltip="Highest selling Toyota model line"
          badge="Top Performer"
          accentColor="indigo"
          loading={loading}
        />
      </div>

      {/* Row 1: Sales Trend & Target vs Actual */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">
        {/* Sales Trend */}
        <div className="lg:col-span-7">
          <ChartCard
            title="Sales Trend"
            subtitle="Overall monthly new vehicle sales volume across the operational calendar"
            
            height={290}
          >
            <MultiLineTrendChart
              labels={salesTrendData.labels}
              series={salesTrendData.series}
              valueFormatter={(v) => formatNumber(v)}
              height={220}
            />
          </ChartCard>
        </div>

        {/* Target vs Actual */}
        <div className="lg:col-span-5">
          <ChartCard
            title="Target vs Actual"
            subtitle="Actual vehicles sold vs sales targets comparison by region"
            
            height={290}
          >
            <ClusteredColumnChart
              data={targetActualData}
              valueFormatter={(v) => formatNumber(v)}
              height={220}
              showLegend={true}
            />
          </ChartCard>
        </div>
      </div>

      {/* Row 2: Sales by Model & Sales by Region */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Sales by Model */}
        <ChartCard
          title="Sales by Model"
          subtitle="Total vehicle sales volume ranked across all Toyota model lines"
          
          height={280}
        >
          <div className="h-[210px] overflow-y-auto pr-1">
            <HorizontalBarChart
              data={salesByModelData}
              valueFormatter={(v) => formatNumber(v)}
              showRank={true}
            />
          </div>
        </ChartCard>

        {/* Sales by Region */}
        <ChartCard
          title="Sales by Region"
          subtitle="Regional market sales volume contribution across operating territories"
          
          height={280}
        >
          <div className="h-[210px] overflow-y-auto pr-1">
            <HorizontalBarChart
              data={salesByRegionData}
              valueFormatter={(v) => formatNumber(v)}
              barColor="bg-indigo-600"
              showRank={true}
            />
          </div>
        </ChartCard>
      </div>
    </DashboardLayout>
  );
}
