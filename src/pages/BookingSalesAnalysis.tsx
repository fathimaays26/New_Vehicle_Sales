import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../component/DashboardLayout";
import type { DashboardPage } from "../component/Header";
import KPICard from "../component/KpiCard";
import ChartCard from "../component/ChartCard";
import { useFilters } from "../context/FilterContext";
import { formatNumber, formatPercent } from "../format";
import { loadDatabaseSnapshot } from "../dataService";
import type {
  DimCustomer,
  DimRegion,
  DimVModel,
  FactBooking,
  FactSalesTransaction,
} from "../index";
import ClusteredColumnChart from "../component/charts/ClusteredColumnChart";
import HorizontalBarChart from "../component/charts/HorizontalBarChart";

type MatrixRow = {
  vehicleType: string;
  model: string;
  variant: string;
  bookings: number;
  sales: number;
  conversion: number;
};

type HierarchyNode = {
  label: string;
  count: number;
  children: Map<string, HierarchyNode>;
};

const hierarchyLevels = [
  "Booking Status",
  "Vehicle Type",
  "Model",
  "Variant",
] as const;

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item) || "Unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

export default function BookingSalesAnalysis({
  activePage,
  onPageChange,
}: {
  activePage: DashboardPage;
  onPageChange: (page: DashboardPage) => void;
}) {
  const { filters: globalFilters, matchingModelIds } = useFilters();
  const [loading, setLoading] = useState(true);
  const [bookingDrillPath, setBookingDrillPath] = useState<string[]>([]);
  const [bookings, setBookings] = useState<FactBooking[]>([]);
  const [sales, setSales] = useState<FactSalesTransaction[]>([]);
  const [models, setModels] = useState<DimVModel[]>([]);
  const [customers, setCustomers] = useState<DimCustomer[]>([]);
  const [regions, setRegions] = useState<DimRegion[]>([]);

  const activeRegionName = useMemo(() => {
    if (!globalFilters.regionId) return null;
    return regions.find((r) => r.region_id === globalFilters.regionId)
      ?.region_name;
  }, [regions, globalFilters.regionId]);

  useEffect(() => {
    async function loadPageData() {
      setLoading(true);
      try {
        const snapshot = await loadDatabaseSnapshot();
        setBookings(snapshot.bookings);
        setSales(snapshot.sales);
        setModels(snapshot.models);
        setCustomers(snapshot.customers);
        setRegions(snapshot.regions);
      } finally {
        setLoading(false);
      }
    }

    void loadPageData();
  }, []);

  const modelById = useMemo(
    () => new Map(models.map((model) => [model.model_id, model])),
    [models],
  );
  const customerById = useMemo(
    () =>
      new Map(customers.map((customer) => [customer.customer_id, customer])),
    [customers],
  );

  // Filter bookings using global filters
  const filteredBookings = useMemo(() => {
    const salesBookingIds = globalFilters.regionId
      ? new Set(
          sales
            .filter((sale) => sale.region_id === globalFilters.regionId)
            .map((sale) => sale.booking_id),
        )
      : null;

    return bookings.filter((booking) => {
      const model = modelById.get(booking.model_id);
      const customer = customerById.get(booking.customer_id);

      if (
        globalFilters.bookingStatus &&
        booking.booking_status !== globalFilters.bookingStatus
      ) {
        return false;
      }
      if (
        globalFilters.customerType &&
        customer?.customer_type !== globalFilters.customerType
      ) {
        return false;
      }
      if (
        globalFilters.vehicleType &&
        model?.vehicle_type !== globalFilters.vehicleType
      ) {
        return false;
      }
      if (globalFilters.variant && model?.variant !== globalFilters.variant) {
        return false;
      }
      if (globalFilters.modelId && booking.model_id !== globalFilters.modelId) {
        return false;
      }
      if (matchingModelIds && !matchingModelIds.includes(booking.model_id)) {
        return false;
      }
      if (globalFilters.regionId && !salesBookingIds?.has(booking.booking_id)) {
        return false;
      }
      if (
        globalFilters.startDate &&
        booking.booking_date < globalFilters.startDate
      ) {
        return false;
      }
      if (
        globalFilters.endDate &&
        booking.booking_date > globalFilters.endDate
      ) {
        return false;
      }
      return true;
    });
  }, [
    bookings,
    customerById,
    globalFilters,
    matchingModelIds,
    modelById,
    sales,
  ]);

  // Filter sales using global filters
  const filteredSales = useMemo(() => {
    const statusBookingIds = globalFilters.bookingStatus
      ? new Set(
          bookings
            .filter(
              (booking) =>
                booking.booking_status === globalFilters.bookingStatus,
            )
            .map((booking) => booking.booking_id),
        )
      : null;

    return sales.filter((sale) => {
      const model = modelById.get(sale.model_id);
      const customer = customerById.get(sale.customer_id);

      if (statusBookingIds && !statusBookingIds.has(sale.booking_id)) {
        return false;
      }
      if (
        globalFilters.customerType &&
        customer?.customer_type !== globalFilters.customerType
      ) {
        return false;
      }
      if (
        globalFilters.vehicleType &&
        model?.vehicle_type !== globalFilters.vehicleType
      ) {
        return false;
      }
      if (globalFilters.variant && model?.variant !== globalFilters.variant) {
        return false;
      }
      if (globalFilters.modelId && sale.model_id !== globalFilters.modelId) {
        return false;
      }
      if (matchingModelIds && !matchingModelIds.includes(sale.model_id)) {
        return false;
      }
      if (globalFilters.regionId && sale.region_id !== globalFilters.regionId) {
        return false;
      }
      if (globalFilters.startDate && sale.sale_date < globalFilters.startDate) {
        return false;
      }
      if (globalFilters.endDate && sale.sale_date > globalFilters.endDate) {
        return false;
      }
      return true;
    });
  }, [
    bookings,
    customerById,
    globalFilters,
    matchingModelIds,
    modelById,
    sales,
  ]);

  const bookingHierarchy = useMemo(() => {
    const root = new Map<string, HierarchyNode>();

    for (const booking of filteredBookings) {
      const model = modelById.get(booking.model_id);
      const labels = [
        booking.booking_status || "Unknown Status",
        model?.vehicle_type || "Unknown Type",
        model?.model_name || booking.model_id,
        model?.variant || "Unknown Variant",
      ];
      let level = root;

      labels.forEach((label) => {
        let node = level.get(label);
        if (!node) {
          node = { label, count: 0, children: new Map() };
          level.set(label, node);
        }
        node.count += 1;
        level = node.children;
      });
    }

    return root;
  }, [filteredBookings, modelById]);

  const bookingHierarchyView = useMemo(() => {
    let level = bookingHierarchy;
    let selectedNode: HierarchyNode | null = null;

    for (const label of bookingDrillPath) {
      selectedNode = level.get(label) ?? null;
      if (!selectedNode) return { nodes: [], level: 0 };
      level = selectedNode.children;
    }

    return {
      nodes: [...level.values()].sort((a, b) => b.count - a.count),
      level: bookingDrillPath.length,
    };
  }, [bookingDrillPath, bookingHierarchy]);

  useEffect(() => {
    setBookingDrillPath([]);
  }, [filteredBookings]);

  // Chart 3: Sales by Vehicle Type
  const salesByVehicleTypeData = useMemo(() => {
    const counts = countBy(
      filteredSales,
      (sale) => modelById.get(sale.model_id)?.vehicle_type ?? "Unknown",
    );
    return counts.map(([vt, count]) => ({
      label: vt,
      value: count,
      secondaryLabel: `${((count / (filteredSales.length || 1)) * 100).toFixed(1)}%`,
      color: "bg-blue-600",
    }));
  }, [filteredSales, modelById]);

  // Chart 4: Sales by Customer Type
  const salesByCustomerTypeData = useMemo(() => {
    const counts = countBy(
      filteredSales,
      (sale) => customerById.get(sale.customer_id)?.customer_type ?? "Unknown",
    );
    return counts.map(([ct, count]) => ({
      category: ct,
      series: [
        {
          name: "Sales",
          value: count,
          color: "bg-indigo-600",
        },
      ],
    }));
  }, [customerById, filteredSales]);

  // Table: Booking -> Sale Analysis Matrix
  const matrixRows = useMemo<MatrixRow[]>(() => {
    const grouped = new Map<string, { bookings: number; sales: number }>();

    for (const booking of filteredBookings) {
      const model = modelById.get(booking.model_id);
      const key = `${model?.vehicle_type ?? "Unknown"}|${model?.model_name ?? booking.model_id}|${model?.variant ?? "Unknown"}`;
      const row = grouped.get(key) ?? { bookings: 0, sales: 0 };
      row.bookings += 1;
      grouped.set(key, row);
    }

    for (const sale of filteredSales) {
      const model = modelById.get(sale.model_id);
      const key = `${model?.vehicle_type ?? "Unknown"}|${model?.model_name ?? sale.model_id}|${model?.variant ?? "Unknown"}`;
      const row = grouped.get(key) ?? { bookings: 0, sales: 0 };
      row.sales += 1;
      grouped.set(key, row);
    }

    return [...grouped.entries()]
      .map(([key, stats]) => {
        const [vehicleType, model, variant] = key.split("|");
        const conversion =
          stats.bookings > 0 ? (stats.sales / stats.bookings) * 100 : 0;
        return {
          vehicleType,
          model,
          variant,
          bookings: stats.bookings,
          sales: stats.sales,
          conversion,
        };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [filteredBookings, filteredSales, modelById]);

  const cancelledBookings = filteredBookings.filter(
    (booking) => booking.booking_status === "Cancelled",
  ).length;
  const pendingBookings = filteredBookings.filter(
    (booking) => booking.booking_status === "Pending",
  ).length;
  const cancellationRate = filteredBookings.length
    ? (cancelledBookings / filteredBookings.length) * 100
    : 0;

  return (
    <DashboardLayout activePage={activePage} onPageChange={onPageChange}>
      {/* Header Banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Booking &amp; Sales Analysis
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              Page 2
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Analyze customer booking behavior, cancellations, and conversion of
            orders into fulfilled vehicle sales.
          </p>
          {activeRegionName && (
            <span className="mt-2 inline-block rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
              Region: {activeRegionName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3"></div>
      </div>

      {/* KPI Cards Row (Full Width) */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          title="Total Bookings"
          value={formatNumber(filteredBookings.length)}
          subtext="Customer orders placed"
          accentColor="blue"
          loading={loading}
        />
        <KPICard
          title="Pending Bookings"
          value={formatNumber(pendingBookings)}
          subtext="Awaiting fulfillment"
          accentColor="indigo"
          loading={loading}
        />
        <KPICard
          title="Cancelled Orders"
          value={formatNumber(cancelledBookings)}
          subtext="Terminated bookings"
          accentColor="rose"
          loading={loading}
        />
        <KPICard
          title="Cancellation Rate"
          value={formatPercent(cancellationRate)}
          subtext="Of total orders"
          progress={{
            value: cancellationRate,
            max: 100,
            color: cancellationRate > 25 ? "bg-rose-500" : "bg-emerald-500",
          }}
          accentColor={cancellationRate > 25 ? "rose" : "emerald"}
          loading={loading}
        />
      </div>

      {/* Row 1: Hierarchical Booking Status Chart */}
      <div className="mb-5">
        <ChartCard
          title="Booking Status Hierarchy"
          subtitle="Drill from booking status into vehicle type, model, and variant"
          badge="Interactive Drill-down"
          action={
            <button
              type="button"
              onClick={() =>
                setBookingDrillPath((currentPath) =>
                  currentPath.length > 0
                    ? currentPath.slice(0, -1)
                    : currentPath,
                )
              }
              disabled={bookingDrillPath.length === 0}
              className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Drill up one level"
            >
              ↖ Back
            </button>
          }
          height={280}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              {hierarchyLevels.map((level, index) => (
                <span key={level} className="inline-flex items-center gap-1.5">
                  {index > 0 && <span className="text-slate-300">→</span>}
                  <span
                    className={
                      index === bookingDrillPath.length
                        ? "font-semibold text-blue-700"
                        : "text-slate-500"
                    }
                  >
                    {level}
                  </span>
                </span>
              ))}
            </div>
            <span className="text-xs font-medium text-slate-400">
              ↘ Click a bar to drill down
            </span>
          </div>

          <div className="h-[210px] overflow-y-auto pr-1">
            {bookingHierarchyView.nodes.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-slate-500">
                No matching bookings found.
              </p>
            ) : (
              <div className="space-y-3">
                {bookingHierarchyView.nodes.map((node) => {
                  const max = Math.max(
                    1,
                    ...bookingHierarchyView.nodes.map((item) => item.count),
                  );
                  return (
                    <button
                      key={node.label}
                      type="button"
                      onClick={() =>
                        node.children.size > 0 &&
                        setBookingDrillPath((currentPath) => [
                          ...currentPath,
                          node.label,
                        ])
                      }
                      className="group block w-full text-left"
                      aria-label={`Drill down into ${node.label}`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                        <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-700">
                          <span className="truncate">{node.label}</span>
                          {node.children.size > 0 && (
                            <span className="shrink-0 text-[10px] text-blue-500 opacity-0 transition-opacity group-hover:opacity-100">
                              ↘
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums text-slate-600">
                          {formatNumber(node.count)}
                        </span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-md bg-slate-100">
                        <div
                          className="h-full rounded-md bg-blue-600 transition-all duration-300 group-hover:bg-blue-500"
                          style={{ width: `${(node.count / max) * 100}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Row 2: Charts 3 & 4 (Full Width 2-Column Grid) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 mb-5">
        <ChartCard
          title="Sales by Vehicle Type"
          subtitle="Total sales volume delivered across vehicle body styles"
          height={280}
        >
          <div className="h-[210px] overflow-y-auto pr-1">
            <HorizontalBarChart
              data={salesByVehicleTypeData}
              valueFormatter={(val) => formatNumber(val)}
              showRank={true}
            />
          </div>
        </ChartCard>

        <ChartCard
          title="Sales by Customer Type"
          subtitle="Sales delivery volume across Retail, Fleet, and Dealer segments"
          height={280}
        >
          <ClusteredColumnChart
            data={salesByCustomerTypeData}
            valueFormatter={(val) => formatNumber(val)}
            height={210}
            showLegend={false}
          />
        </ChartCard>
      </div>

      {/* Row 3: Booking -> Sale Conversion Matrix (Full Width) */}
      <ChartCard
        title="Booking → Sale Conversion Matrix"
        subtitle="Granular breakdown of orders and conversions (Vehicle Type → Model → Variant)"
      >
        <div className="overflow-x-auto rounded-lg border border-slate-200 mt-2">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <th className="py-3 px-4 font-bold uppercase text-[11px]">
                  Vehicle Type
                </th>
                <th className="py-3 px-4 font-bold uppercase text-[11px]">
                  Model
                </th>
                <th className="py-3 px-4 font-bold uppercase text-[11px]">
                  Variant
                </th>
                <th className="py-3 px-4 text-right font-bold uppercase text-[11px]">
                  Bookings
                </th>
                <th className="py-3 px-4 text-right font-bold uppercase text-[11px]">
                  Sales
                </th>
                <th className="py-3 px-4 text-right font-bold uppercase text-[11px]">
                  Conversion
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {matrixRows.map((row) => (
                <tr
                  key={`${row.vehicleType}-${row.model}-${row.variant}`}
                  className="hover:bg-slate-50/60 transition-colors"
                >
                  <td className="py-3 px-4 font-semibold text-slate-800">
                    {row.vehicleType}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-700">
                    {row.model}
                  </td>
                  <td className="py-3 px-4 text-slate-500">{row.variant}</td>
                  <td className="py-3 px-4 text-right tabular-nums font-semibold text-slate-700">
                    {formatNumber(row.bookings)}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums font-bold text-blue-700">
                    {formatNumber(row.sales)}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums">
                    <span
                      className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                        row.conversion >= 80
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : row.conversion >= 60
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {row.conversion.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </DashboardLayout>
  );
}
