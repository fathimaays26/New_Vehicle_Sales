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

import ClusteredColumnChart from "../component/charts/ClusteredColumnChart";

interface EnrichedBooking {
  booking_id: string;
  customer_id: string;
  vehicle_id: string;
  model_id: string;
  booking_date: string;
  booking_status: string;
  cancellation_reason: string | null;
  cancellation_date: string | null;
  modelName: string;
  variant: string;
  vehicleType: string;
  customerType: string;
  regionId: string;
  regionName: string;
  ageDays: number;
}

type PendingHierarchyNode = {
  label: string;
  count: number;
  children: Map<string, PendingHierarchyNode>;
};

const pendingHierarchyLevels = [
  "Region",
  "Customer Type",
  "Model",
  "Variant",
] as const;

function formatBookingDate(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export default function PendingBookingsPipeline({
  activePage,
  onPageChange,
}: {
  activePage: DashboardPage;
  onPageChange: (page: DashboardPage) => void;
}) {
  const { filters, matchingModelIds } = useFilters();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<FactBooking[]>([]);
  const [sales, setSales] = useState<FactSalesTransaction[]>([]);
  const [models, setModels] = useState<DimVModel[]>([]);
  const [regions, setRegions] = useState<DimRegion[]>([]);
  const [customers, setCustomers] = useState<DimCustomer[]>([]);

  const [selectedAgeBucket, setSelectedAgeBucket] = useState<string | null>(null);
  const [pendingDrillPath, setPendingDrillPath] = useState<string[]>([]);
  const [showPendingOrders, setShowPendingOrders] = useState(false);
  const [pendingOrdersBucket, setPendingOrdersBucket] = useState("0–30 Days");
  const [tableFilters, setTableFilters] = useState({
    bookingId: "",
    customer: "",
    model: "",
    variant: "",
    region: "",
    customerType: "",
    bookingDate: "",
    age: "",
  });

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const snapshot = await loadDatabaseSnapshot();
        setBookings(snapshot.bookings);
        setSales(snapshot.sales);
        setModels(snapshot.models);
        setRegions(snapshot.regions);
        setCustomers(snapshot.customers);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const [currentDateMs, setCurrentDateMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(
      () => setCurrentDateMs(Date.now()),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  // Enriched bookings directly from Supabase
  const enrichedBookings = useMemo<EnrichedBooking[]>(() => {
    const modelMap = new Map(models.map((m) => [m.model_id, m]));
    const regionMap = new Map(regions.map((r) => [r.region_id, r]));
    const customerMap = new Map(customers.map((c) => [c.customer_id, c]));
    const salesMap = new Map(sales.map((s) => [s.booking_id, s]));

    return bookings.map((b) => {
      const model = modelMap.get(b.model_id);
      const customer = customerMap.get(b.customer_id);
      const sale = salesMap.get(b.booking_id);

      const regionId = sale?.region_id || customer?.region_id || "";
      const region = regionMap.get(regionId);

      // Pending age is measured against the current date, not the latest date in the dataset.
      let ageDays = 0;
      if (b.booking_date) {
        const bTime = new Date(b.booking_date).getTime();
        if (!Number.isNaN(bTime)) {
          ageDays = Math.max(
            0,
            Math.floor((currentDateMs - bTime) / (1000 * 60 * 60 * 24)),
          );
        }
      }

      return {
        booking_id: b.booking_id,
        customer_id: b.customer_id,
        vehicle_id: b.vehicle_id,
        model_id: b.model_id,
        booking_date: b.booking_date,
        booking_status: b.booking_status,
        cancellation_reason: b.cancellation_reason,
        cancellation_date: b.cancellation_date,
        modelName: model?.model_name || b.model_id,
        variant: model?.variant || "Unknown Variant",
        vehicleType: model?.vehicle_type || "Unknown Type",
        customerType: customer?.customer_type || "Retail",
        regionId,
        regionName: region?.region_name || "Unknown Region",
        ageDays,
      };
    });
  }, [bookings, models, regions, customers, sales, currentDateMs]);

  // Apply Global Filters
  const filteredBookings = useMemo(() => {
    return enrichedBookings.filter((b) => {
      if (
        filters.startDate &&
        b.booking_date &&
        b.booking_date < filters.startDate
      ) {
        return false;
      }
      if (
        filters.endDate &&
        b.booking_date &&
        b.booking_date > filters.endDate
      ) {
        return false;
      }
      if (filters.regionId && b.regionId !== filters.regionId) {
        return false;
      }
      if (filters.modelId && b.model_id !== filters.modelId) {
        return false;
      }
      if (matchingModelIds && !matchingModelIds.includes(b.model_id)) {
        return false;
      }
      if (filters.variant && b.variant !== filters.variant) {
        return false;
      }
      if (filters.vehicleType && b.vehicleType !== filters.vehicleType) {
        return false;
      }
      if (filters.customerType && b.customerType !== filters.customerType) {
        return false;
      }
      if (filters.bookingStatus && b.booking_status !== filters.bookingStatus) {
        return false;
      }
      return true;
    });
  }, [enrichedBookings, filters, matchingModelIds]);

  // Pending bookings subset
  const pendingBookings = useMemo(() => {
    return filteredBookings.filter((b) => b.booking_status === "Pending");
  }, [filteredBookings]);

  // KPI 1: Pending Bookings count
  const pendingCount = pendingBookings.length;

  // Average Pending Booking Age (across pending bookings)
  const avgPendingAge = useMemo(() => {
    if (pendingBookings.length === 0) return 0;
    const totalAge = pendingBookings.reduce((acc, b) => acc + b.ageDays, 0);
    return totalAge / pendingBookings.length;
  }, [pendingBookings]);

  // CHART 1: Pending Booking Ageing (Column Chart: 0–30 Days, 31–60 Days, 61–90 Days, 90+ Days)
  const ageingBucketsData = useMemo(() => {
    const buckets = [
      {
        label: "0–30 Days",
        min: 0,
        max: 30,
        count: 0,
        color: "bg-emerald-500",
      },
      { label: "31–60 Days", min: 31, max: 60, count: 0, color: "bg-blue-600" },
      {
        label: "61–90 Days",
        min: 61,
        max: 90,
        count: 0,
        color: "bg-amber-500",
      },
      {
        label: "90+ Days",
        min: 91,
        max: Infinity,
        count: 0,
        color: "bg-rose-500",
      },
    ];

    for (const b of pendingBookings) {
      for (const bucket of buckets) {
        if (b.ageDays >= bucket.min && b.ageDays <= bucket.max) {
          bucket.count += 1;
          break;
        }
      }
    }

    return buckets.map((bucket) => ({
      category: bucket.label,
      series: [
        {
          name: "Pending Orders",
          value: bucket.count,
          color: bucket.color,
        },
      ],
    }));
  }, [pendingBookings]);

  // CHART 2: Pending Booking Breakdown hierarchy
  // Region → Customer Type → Model → Variant
  const pendingHierarchy = useMemo(() => {
    const root = new Map<string, PendingHierarchyNode>();

    for (const booking of pendingBookings) {
      const labels = [
        booking.regionName,
        booking.customerType,
        booking.modelName,
        booking.variant,
      ];

      let level = root;

      labels.forEach((label) => {
        let node = level.get(label);

        if (!node) {
          node = {
            label,
            count: 0,
            children: new Map(),
          };
          level.set(label, node);
        }

        node.count += 1;
        level = node.children;
      });
    }

    return root;
  }, [pendingBookings]);

  const getPendingHierarchyView = useMemo(
    () => (path: string[]) => {
      let level = pendingHierarchy;

      for (const label of path) {
        const node = level.get(label);
        if (!node) return [];
        level = node.children;
      }

      return [...level.values()].sort((a, b) => b.count - a.count);
    },
    [pendingHierarchy],
  );

  const pendingHierarchyView = useMemo(
    () => getPendingHierarchyView(pendingDrillPath),
    [getPendingHierarchyView, pendingDrillPath],
  );

  useEffect(() => {
    setPendingDrillPath([]);
  }, [pendingBookings]);

  // Selected ageing bucket → actual pending orders
  const selectedPendingOrders = useMemo(() => {
    if (!selectedAgeBucket) return [];

    return [...pendingBookings]
      .filter((booking) => {
        if (selectedAgeBucket === "0–30 Days") return booking.ageDays <= 30;
        if (selectedAgeBucket === "31–60 Days") {
          return booking.ageDays >= 31 && booking.ageDays <= 60;
        }
        if (selectedAgeBucket === "61–90 Days") {
          return booking.ageDays >= 61 && booking.ageDays <= 90;
        }
        return booking.ageDays >= 91;
      })
      .sort((a, b) => b.ageDays - a.ageDays);
  }, [pendingBookings, selectedAgeBucket]);

  return (
    <DashboardLayout activePage={activePage} onPageChange={onPageChange}>
      {/* Header Banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Pending Bookings &amp; Fulfillment Pipeline
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              Page 5
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Monitor open order backlogs and track pending booking ageing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block"></div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KPICard
          title="Pending Bookings"
          value={formatNumber(pendingCount)}
          subtext={`Out of ${formatNumber(filteredBookings.length)} total orders`}
          tooltip="Total active unfulfilled vehicle bookings awaiting delivery"
          accentColor="indigo"
          loading={loading}
        />
        <KPICard
          title="Pending Booking %"
          value={`${((pendingCount / (filteredBookings.length || 1)) * 100).toFixed(1)}%`}
          subtext="Pending bookings as a share of filtered orders"
          tooltip="Pending bookings divided by total filtered bookings"
          accentColor="blue"
          loading={loading}
        />
        <KPICard
          title="Average Pending Booking Age"
          value={`${avgPendingAge.toFixed(1)} Days`}
          subtext="Average wait time for active pending bookings"
          tooltip="Average duration current pending bookings have been in the fulfillment pipeline"
          accentColor={avgPendingAge <= 45 ? "emerald" : "amber"}
          loading={loading}
        />
      </div>

      {/* Pending Booking Analysis */}
      <div className="grid grid-cols-1 gap-5">
        {/* 1. Pending Booking Ageing */}
        <ChartCard
          title="Pending Booking Ageing"
          subtitle="Explore pending orders by ageing bucket"
          action={
            <button
              type="button"
              onClick={() => {
                setPendingOrdersBucket("0–30 Days");
                setSelectedAgeBucket("0–30 Days");
                setShowPendingOrders(true);
              }}
              title="View Pending Orders"
              aria-label="View Pending Orders"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600 hover:shadow-md"
            >
              <span className="text-lg leading-none">→</span>
            </button>
          }
          height={330}
        >
          <div className="h-[220px]">
            <ClusteredColumnChart
              data={ageingBucketsData}
              valueFormatter={(val) => formatNumber(val)}
              height={220}
              showLegend={false}
            />
          </div>
        </ChartCard>
        {/* 2. Pending Booking Breakdown hierarchy */}
        <ChartCard
          title="Pending Booking Breakdown"
          subtitle="Drill from region into customer type, model, and variant"
          badge="Interactive Drill-down"
          action={
            <button
              type="button"
              onClick={() =>
                setPendingDrillPath((currentPath) =>
                  currentPath.length > 0 ? currentPath.slice(0, -1) : currentPath,
                )
              }
              disabled={pendingDrillPath.length === 0}
              className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↖ Back
            </button>
          }
          height={360}
        >
          <div className="h-[275px] overflow-y-auto pr-1">
            <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              {pendingHierarchyLevels.map((level, index) => (
                <span key={level} className="inline-flex items-center gap-1.5">
                  {index > 0 && <span className="text-slate-300">→</span>}
                  <span
                    className={
                      index === pendingDrillPath.length
                        ? "font-semibold text-blue-700"
                        : ""
                    }
                  >
                    {level}
                  </span>
                </span>
              ))}
              {pendingDrillPath.length > 0 && (
                <span className="ml-1 text-slate-400">
                  ({pendingDrillPath.join(" → ")})
                </span>
              )}
            </div>

            {pendingHierarchyView.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                No pending bookings match the current filters.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingHierarchyView.map((node) => {
                  const maxCount = Math.max(
                    1,
                    ...pendingHierarchyView.map((item) => item.count),
                  );
                  const canDrill = node.children.size > 0;

                  return (
                    <button
                      key={node.label}
                      type="button"
                      onClick={() =>
                        canDrill &&
                        setPendingDrillPath((currentPath) => [
                          ...currentPath,
                          node.label,
                        ])
                      }
                      className="group block w-full text-left"
                    >
                      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
  <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-700">
    <span className="truncate">{node.label}</span>

    {node.children.size > 0 && (
      <span className="text-[10px] text-blue-500 opacity-0 group-hover:opacity-100">
        ↘
      </span>
    )}
  </span>

  <span className="shrink-0 tabular-nums text-slate-600">
    {formatNumber(node.count)}
  </span>
</div>
                      <div className="h-3 overflow-hidden rounded-md bg-slate-100">
                        <div
                          className="h-full rounded-md bg-blue-600 transition-all duration-300"
                          style={{
                            width: `${Math.max(
                              (node.count / maxCount) * 100,
                              3,
                            )}%`,
                          }}
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

      {/* Pending Orders drill-down overlay */}
      {showPendingOrders && (
        <div className="fixed inset-0 z-50 overflow-auto bg-slate-50">
          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Pending Orders
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Pending booking details by ageing bucket
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPendingOrders(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                ← Back
              </button>
            </div>
          </div>

          <div className="mx-auto max-w-[1600px] space-y-5 p-6">
            {/* Ageing bucket selector */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pending Booking Age
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {["0–30 Days", "31–60 Days", "61–90 Days", "90+ Days"].map(
                  (bucket) => (
                    <button
                      key={bucket}
                      type="button"
                      onClick={() => {
                        setPendingOrdersBucket(bucket);
                        setSelectedAgeBucket(bucket);
                        setTableFilters({
                          bookingId: "",
                          customer: "",
                          model: "",
                          variant: "",
                          region: "",
                          customerType: "",
                          bookingDate: "",
                          age: "",
                        });
                      }}
                      className={`rounded-lg border px-4 py-3 text-sm font-semibold transition-all ${
                        pendingOrdersBucket === bucket
                          ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                      }`}
                    >
                      {bucket}
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-800">
                    Pending Orders — {pendingOrdersBucket}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Filter the active pending orders using the controls in each column.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setTableFilters({
                      bookingId: "",
                      customer: "",
                      model: "",
                      variant: "",
                      region: "",
                      customerType: "",
                      bookingDate: "",
                      age: "",
                    })
                  }
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  Clear Filters
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1250px] text-left text-xs">
                  <thead className="bg-slate-50">
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">
                        <div className="mb-2">Booking ID</div>
                        <input
                          type="text"
                          placeholder="Search..."
                          value={tableFilters.bookingId}
                          onChange={(e) =>
                            setTableFilters((prev) => ({
                              ...prev,
                              bookingId: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal normal-case outline-none focus:border-blue-400"
                        />
                      </th>

                      <th className="px-4 py-3">
                        <div className="mb-2">Customer</div>
                        <input
                          type="text"
                          placeholder="Search..."
                          value={tableFilters.customer}
                          onChange={(e) =>
                            setTableFilters((prev) => ({
                              ...prev,
                              customer: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal normal-case outline-none focus:border-blue-400"
                        />
                      </th>

                      <th className="px-4 py-3">
                        <div className="mb-2">Model</div>
                        <select
                          value={tableFilters.model}
                          onChange={(e) =>
                            setTableFilters((prev) => ({
                              ...prev,
                              model: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal outline-none focus:border-blue-400"
                        >
                          <option value="">All</option>
                          {[...new Set(selectedPendingOrders.map((o) => o.modelName))]
                            .sort()
                            .map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                        </select>
                      </th>

                      <th className="px-4 py-3">
                        <div className="mb-2">Variant</div>
                        <select
                          value={tableFilters.variant}
                          onChange={(e) =>
                            setTableFilters((prev) => ({
                              ...prev,
                              variant: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal outline-none focus:border-blue-400"
                        >
                          <option value="">All</option>
                          {[...new Set(selectedPendingOrders.map((o) => o.variant))]
                            .sort()
                            .map((variant) => (
                              <option key={variant} value={variant}>
                                {variant}
                              </option>
                            ))}
                        </select>
                      </th>

                      <th className="px-4 py-3">
                        <div className="mb-2">Region</div>
                        <select
                          value={tableFilters.region}
                          onChange={(e) =>
                            setTableFilters((prev) => ({
                              ...prev,
                              region: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal outline-none focus:border-blue-400"
                        >
                          <option value="">All</option>
                          {[...new Set(selectedPendingOrders.map((o) => o.regionName))]
                            .sort()
                            .map((region) => (
                              <option key={region} value={region}>
                                {region}
                              </option>
                            ))}
                        </select>
                      </th>

                      <th className="px-4 py-3">
                        <div className="mb-2">Customer Type</div>
                        <select
                          value={tableFilters.customerType}
                          onChange={(e) =>
                            setTableFilters((prev) => ({
                              ...prev,
                              customerType: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal outline-none focus:border-blue-400"
                        >
                          <option value="">All</option>
                          {[...new Set(selectedPendingOrders.map((o) => o.customerType))]
                            .sort()
                            .map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                        </select>
                      </th>

                      <th className="px-4 py-3">
                        <div className="mb-2">Booking Date</div>
                        <input
                          type="date"
                          value={tableFilters.bookingDate}
                          onChange={(e) =>
                            setTableFilters((prev) => ({
                              ...prev,
                              bookingDate: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal outline-none focus:border-blue-400"
                        />
                      </th>

                      <th className="px-4 py-3">
                        <div className="mb-2">Age</div>
                        <input
                          type="number"
                          min="0"
                          placeholder="e.g. 31"
                          value={tableFilters.age}
                          onChange={(e) =>
                            setTableFilters((prev) => ({
                              ...prev,
                              age: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-normal outline-none focus:border-blue-400"
                        />
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {selectedPendingOrders
                      .filter((order) => {
                        const matchesBucket =
                          pendingOrdersBucket === "0–30 Days"
                            ? order.ageDays <= 30
                            : pendingOrdersBucket === "31–60 Days"
                              ? order.ageDays >= 31 && order.ageDays <= 60
                              : pendingOrdersBucket === "61–90 Days"
                                ? order.ageDays >= 61 && order.ageDays <= 90
                                : order.ageDays >= 91;

                        const customerName =
                          customers.find(
                            (c) => c.customer_id === order.customer_id,
                          )?.customer_name || order.customer_id;

                        const matchesBookingId =
                          !tableFilters.bookingId ||
                          order.booking_id
                            .toLowerCase()
                            .includes(tableFilters.bookingId.toLowerCase());

                        const matchesCustomer =
                          !tableFilters.customer ||
                          customerName
                            .toLowerCase()
                            .includes(tableFilters.customer.toLowerCase());

                        const matchesModel =
                          !tableFilters.model || order.modelName === tableFilters.model;

                        const matchesVariant =
                          !tableFilters.variant || order.variant === tableFilters.variant;

                        const matchesRegion =
                          !tableFilters.region || order.regionName === tableFilters.region;

                        const matchesCustomerType =
                          !tableFilters.customerType ||
                          order.customerType === tableFilters.customerType;

                        const matchesDate =
                          !tableFilters.bookingDate ||
                          order.booking_date === tableFilters.bookingDate;

                        const matchesAge =
                          !tableFilters.age ||
                          order.ageDays === Number(tableFilters.age);

                        return (
                          matchesBucket &&
                          matchesBookingId &&
                          matchesCustomer &&
                          matchesModel &&
                          matchesVariant &&
                          matchesRegion &&
                          matchesCustomerType &&
                          matchesDate &&
                          matchesAge
                        );
                      })
                      .map((booking) => {
                        const customerName =
                          customers.find(
                            (c) => c.customer_id === booking.customer_id,
                          )?.customer_name || booking.customer_id;

                        return (
                          <tr
                            key={booking.booking_id}
                            className="hover:bg-slate-50"
                          >
                            <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                              {booking.booking_id}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {customerName}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {booking.modelName}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {booking.variant}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {booking.regionName}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {booking.customerType}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {formatBookingDate(booking.booking_date)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700">
                              {booking.ageDays}d
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}
