import { useEffect, useMemo, useState } from "react";
import DashboardLayout from "../component/DashboardLayout";
import KPICard from "../component/KpiCard";
import ChartCard from "../component/ChartCard";
import type { DashboardPage } from "../component/Header";
import { useFilters } from "../context/FilterContext";
import { formatNumber, formatPercent } from "../format";
import { loadDatabaseSnapshot } from "../dataService";
import type {
  DimCustomer,
  DimRegion,
  DimVehicle,
  DimVModel,
  FactBooking,
  FactNVVehicleDelivery,
  FactSalesTransaction,
} from "../index";
import HorizontalBarChart from "../component/charts/HorizontalBarChart";
import DeliveryVolumeRateComboChart from "../component/charts/DeliveryVolumeRateComboChart";

interface EnrichedDelivery {
  delivery_id: string;
  booking_id: string;
  vehicle_id: string;
  planned_delivery_date: string;
  actual_delivery_date: string | null;
  delivery_status: string;
  isOnTime: boolean;
  varianceDays: number | null;
  regionId?: string;
  regionName: string;
  modelId?: string;
  modelName: string;
  variant: string;
  vehicleType: string;
  customerType: string;
  bookingStatus: string;
  deliveryMonth: string; // e.g. "Jan"
  deliveryDate: string;
}

type DeliveryHierarchyNode = {
  label: string;
  count: number;
  onTime: number;
  varianceSum: number;
  children: Map<string, DeliveryHierarchyNode>;
};

const deliveryHierarchyLevels = [
  "Region",
  "Vehicle Type",
  "Model",
  "Variant",
] as const;

const varianceHierarchyLevels = ["Vehicle Type", "Model", "Variant"] as const;

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

function calculateVarianceDays(
  actual: string | null | undefined,
  planned: string | null | undefined,
): number | null {
  if (!actual || !planned) return null;
  const act = new Date(actual);
  const pln = new Date(planned);
  if (Number.isNaN(act.getTime()) || Number.isNaN(pln.getTime())) return null;
  const diffMs = act.getTime() - pln.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

function DeliveryHierarchyChart({
  nodes,
  path,
  levels,
  metric,
  onBack,
  onDrill,
}: {
  nodes: DeliveryHierarchyNode[];
  path: string[];
  levels: readonly string[];
  metric: "rate" | "variance";
  onBack: () => void;
  onDrill: (label: string) => void;
}) {
  const max = Math.max(1, ...nodes.map((node) => node.count));
  return (
    <div className="h-[220px] overflow-y-auto pr-1">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          {levels.map((level, index) => (
            <span key={level} className="inline-flex items-center gap-1.5">
              {index > 0 && <span className="text-slate-300">→</span>}
              <span
                className={
                  index === path.length ? "font-semibold text-blue-700" : ""
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
      {/*{path.length > 0 && (
         <button
          type="button"
          onClick={onBack}
          className="mb-3 text-xs font-semibold text-blue-600 hover:text-blue-800"
        >
          ↖ Back to {levels[path.length - 1]}
        </button>  
      )} */}
      {nodes.length === 0 ? (
        <p className="flex h-32 items-center justify-center text-sm text-slate-500">
          No matching delivery rows found.
        </p>
      ) : (
        <div className="space-y-3">
          {nodes.map((node) => {
            const value =
              metric === "rate"
                ? node.count > 0
                  ? (node.onTime / node.count) * 100
                  : 0
                : node.count > 0
                  ? node.varianceSum / node.count
                  : 0;
            return (
              <button
                key={node.label}
                type="button"
                onClick={() => node.children.size > 0 && onDrill(node.label)}
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
                    {metric === "rate"
                      ? `${value.toFixed(1)}%`
                      : `${value >= 0 ? "+" : ""}${value.toFixed(1)}d`}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-md bg-slate-100">
                  <div
                    className={`h-full rounded-md transition-all duration-300 ${metric === "rate" ? "bg-blue-600" : value >= 0 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{
                      width: `${metric === "rate" ? (value / 100) * 100 : Math.max((node.count / max) * 100, 3)}%`,
                    }}
                  />
                </div>
                <span className="mt-0.5 block text-[10px] text-slate-400">
                  {formatNumber(node.count)} deliveries
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DeliveryFulfillment({
  activePage,
  onPageChange,
}: {
  activePage: DashboardPage;
  onPageChange: (page: DashboardPage) => void;
}) {
  const { filters, matchingModelIds } = useFilters();
  const [loading, setLoading] = useState(true);
  const [deliveries, setDeliveries] = useState<FactNVVehicleDelivery[]>([]);
  const [bookings, setBookings] = useState<FactBooking[]>([]);
  const [sales, setSales] = useState<FactSalesTransaction[]>([]);
  const [vehicles, setVehicles] = useState<DimVehicle[]>([]);
  const [models, setModels] = useState<DimVModel[]>([]);
  const [regions, setRegions] = useState<DimRegion[]>([]);
  const [customers, setCustomers] = useState<DimCustomer[]>([]);
  const [regionDrillPath, setRegionDrillPath] = useState<string[]>([]);
  const [varianceDrillPath, setVarianceDrillPath] = useState<string[]>([]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const snapshot = await loadDatabaseSnapshot();
        setDeliveries(snapshot.deliveries);
        setBookings(snapshot.bookings);
        setSales(snapshot.sales);
        setVehicles(snapshot.vehicles);
        setModels(snapshot.models);
        setRegions(snapshot.regions);
        setCustomers(snapshot.customers);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  // Enriched and joined delivery dataset directly from Supabase
  const enrichedDeliveries = useMemo<EnrichedDelivery[]>(() => {
    const bookingMap = new Map(bookings.map((b) => [b.booking_id, b]));
    const salesMap = new Map(sales.map((s) => [s.booking_id, s]));
    const vehicleMap = new Map(
      vehicles.map((vehicle) => [vehicle.vehicle_id, vehicle]),
    );
    const modelMap = new Map(models.map((m) => [m.model_id, m]));
    const regionMap = new Map(regions.map((r) => [r.region_id, r]));
    const customerMap = new Map(customers.map((c) => [c.customer_id, c]));

    return deliveries.map((del) => {
      const b = bookingMap.get(del.booking_id);
      const s = salesMap.get(del.booking_id);

      const modelId =
        vehicleMap.get(del.vehicle_id)?.model_id || b?.model_id || s?.model_id;
      const model = modelId ? modelMap.get(modelId) : undefined;

      const customerId = b?.customer_id || s?.customer_id;
      const customer = customerId ? customerMap.get(customerId) : undefined;

      const regionId = s?.region_id || customer?.region_id;
      const region = regionId ? regionMap.get(regionId) : undefined;

      const variance = calculateVarianceDays(
        del.actual_delivery_date,
        del.planned_delivery_date,
      );

      // On-time if actual delivery date <= planned delivery date
      const isOnTime =
        del.actual_delivery_date && del.planned_delivery_date
          ? new Date(del.actual_delivery_date).getTime() <=
            new Date(del.planned_delivery_date).getTime()
          : false;

      const effectiveDate =
        del.actual_delivery_date || del.planned_delivery_date || "";

      return {
        delivery_id: del.delivery_id,
        booking_id: del.booking_id,
        vehicle_id: del.vehicle_id,
        planned_delivery_date: del.planned_delivery_date,
        actual_delivery_date: del.actual_delivery_date,
        delivery_status: del.delivery_status,
        isOnTime,
        varianceDays: variance,
        regionId,
        regionName: region?.region_name || "Unknown Region",
        modelId,
        modelName: model?.model_name || "Unknown Model",
        variant: model?.variant || "Unknown Variant",
        vehicleType: model?.vehicle_type || "Unknown Type",
        customerType: customer?.customer_type || "Retail",
        bookingStatus: b?.booking_status || "Fulfilled",
        deliveryMonth: getMonthLabel(effectiveDate),
        deliveryDate: effectiveDate,
      };
    });
  }, [deliveries, bookings, sales, vehicles, models, regions, customers]);

  // Apply Global Filters
  const filteredDeliveries = useMemo(() => {
    return enrichedDeliveries.filter((d) => {
      // Date filter
      if (
        filters.startDate &&
        d.deliveryDate &&
        d.deliveryDate < filters.startDate
      ) {
        return false;
      }
      if (
        filters.endDate &&
        d.deliveryDate &&
        d.deliveryDate > filters.endDate
      ) {
        return false;
      }

      // Region filter
      if (filters.regionId && d.regionId !== filters.regionId) {
        return false;
      }

      // Model filter
      if (filters.modelId && d.modelId !== filters.modelId) {
        return false;
      }
      if (
        matchingModelIds &&
        d.modelId &&
        !matchingModelIds.includes(d.modelId)
      ) {
        return false;
      }

      // Variant filter
      if (filters.variant && d.variant !== filters.variant) {
        return false;
      }

      // Vehicle Type filter
      if (filters.vehicleType && d.vehicleType !== filters.vehicleType) {
        return false;
      }

      // Customer Type filter
      if (filters.customerType && d.customerType !== filters.customerType) {
        return false;
      }

      // Booking Status filter
      if (filters.bookingStatus && d.bookingStatus !== filters.bookingStatus) {
        return false;
      }

      return true;
    });
  }, [enrichedDeliveries, filters, matchingModelIds]);

  // KPIs
  const totalDeliveries = filteredDeliveries.length;

  const deliveriesWithDates = useMemo(
    () =>
      filteredDeliveries.filter(
        (d) => d.actual_delivery_date && d.planned_delivery_date,
      ),
    [filteredDeliveries],
  );

  const onTimeCount = useMemo(
    () => deliveriesWithDates.filter((d) => d.isOnTime).length,
    [deliveriesWithDates],
  );

  const onTimeDeliveryRate =
    totalDeliveries > 0 ? (onTimeCount / totalDeliveries) * 100 : 0;

  const avgDeliveryVariance = useMemo(() => {
    const valid = filteredDeliveries.filter((d) => d.varianceDays !== null);
    if (valid.length === 0) return 0;
    const sum = valid.reduce((acc, curr) => acc + (curr.varianceDays ?? 0), 0);
    return sum / valid.length;
  }, [filteredDeliveries]);

  const buildDeliveryHierarchy = useMemo(() => {
    return (
      labelsFor: (delivery: EnrichedDelivery) => string[],
      includeVariance: boolean,
    ) => {
      const root = new Map<string, DeliveryHierarchyNode>();
      for (const delivery of filteredDeliveries) {
        const labels = labelsFor(delivery);
        let level = root;
        labels.forEach((label) => {
          let node = level.get(label);
          if (!node) {
            node = {
              label,
              count: 0,
              onTime: 0,
              varianceSum: 0,
              children: new Map(),
            };
            level.set(label, node);
          }
          node.count += 1;
          if (delivery.isOnTime) node.onTime += 1;
          if (includeVariance && delivery.varianceDays !== null) {
            node.varianceSum += delivery.varianceDays;
          }
          level = node.children;
        });
      }
      return root;
    };
  }, [filteredDeliveries]);

  const regionHierarchy = useMemo(
    () =>
      buildDeliveryHierarchy(
        (delivery) => [
          delivery.regionName,
          delivery.vehicleType,
          delivery.modelName,
          delivery.variant,
        ],
        false,
      ),
    [buildDeliveryHierarchy],
  );

  const varianceHierarchy = useMemo(
    () =>
      buildDeliveryHierarchy(
        (delivery) => [
          delivery.vehicleType,
          delivery.modelName,
          delivery.variant,
        ],
        true,
      ),
    [buildDeliveryHierarchy],
  );

  const getHierarchyView = (
    root: Map<string, DeliveryHierarchyNode>,
    path: string[],
  ) => {
    let level = root;
    for (const label of path) {
      const node = level.get(label);
      if (!node) return [];
      level = node.children;
    }
    return [...level.values()].sort((a, b) => b.count - a.count);
  };

  const regionHierarchyView = useMemo(
    () => getHierarchyView(regionHierarchy, regionDrillPath),
    [regionDrillPath, regionHierarchy],
  );

  const varianceHierarchyView = useMemo(
    () => getHierarchyView(varianceHierarchy, varianceDrillPath),
    [varianceDrillPath, varianceHierarchy],
  );

  useEffect(() => {
    setRegionDrillPath([]);
    setVarianceDrillPath([]);
  }, [filteredDeliveries]);

  const monthlyDeliveryComboData = useMemo(() => {
    const monthly = new Map<
      string,
      { volume: number; total: number; onTime: number }
    >();
    for (const month of MONTH_ORDER)
      monthly.set(month, { volume: 0, total: 0, onTime: 0 });
    for (const delivery of filteredDeliveries) {
      const row = monthly.get(delivery.deliveryMonth);
      if (!row) continue;
      row.volume += 1;
      row.total += 1;
      if (delivery.isOnTime) row.onTime += 1;
    }
    return MONTH_ORDER.map((month) => {
      const row = monthly.get(month)!;
      return {
        label: month,
        volume: row.volume,
        rate:
          row.total > 0
            ? Number(((row.onTime / row.total) * 100).toFixed(1))
            : 0,
      };
    });
  }, [filteredDeliveries]);

  // CHART 4: On-Time Delivery Rate by Model (Horizontal Bar Chart: Y -> Model, X -> On-Time Rate)
  const rateByModelData = useMemo(() => {
    const modelMap = new Map<string, { total: number; onTime: number }>();

    for (const d of filteredDeliveries) {
      if (!d.actual_delivery_date || !d.planned_delivery_date) continue;
      const m = d.modelName;
      const current = modelMap.get(m) || { total: 0, onTime: 0 };
      current.total += 1;
      if (d.isOnTime) current.onTime += 1;
      modelMap.set(m, current);
    }

    return Array.from(modelMap.entries())
      .map(([modelName, stats]) => {
        const rate =
          stats.total > 0
            ? Number(((stats.onTime / stats.total) * 100).toFixed(1))
            : 0;
        return {
          label: modelName,
          value: rate,
          secondaryLabel: `${stats.onTime}/${stats.total} on-time`,
          color:
            rate >= 80
              ? "bg-emerald-500"
              : rate >= 60
                ? "bg-blue-600"
                : "bg-amber-500",
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [filteredDeliveries]);

  return (
    <DashboardLayout activePage={activePage} onPageChange={onPageChange}>
      {/* Header Banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Delivery &amp; Fulfillment
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              Page 3
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Understand how efficiently booked and sold vehicles are delivered
            against planned logistics schedules.
          </p>
        </div>
        <div className="flex items-center gap-3"></div>
      </div>

      {/* KPI Cards Row (3 Cards per spec, omitting Delivered Vehicles) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <KPICard
          title="Total Deliveries"
          value={formatNumber(totalDeliveries)}
          subtext={`Delivery Records`}
          tooltip="Total vehicle deliveries matching active filters (omitting Delivered Vehicles count since all deliveries are Delivered in backend data)"
          accentColor="blue"
          loading={loading}
        />
        <KPICard
          title="On-Time Delivery Rate"
          value={formatPercent(onTimeDeliveryRate)}
          subtext={`${formatNumber(onTimeCount)} of ${formatNumber(deliveriesWithDates.length)} fulfilled on or ahead of schedule`}
          tooltip="Percentage of deliveries where actual delivery date is on or before planned delivery date"
          trend={{
            direction: onTimeDeliveryRate >= 75 ? "up" : "down",
            label: `${onTimeDeliveryRate >= 75 ? "Optimal" : "Review Needed"}`,
          }}
          progress={{
            value: onTimeDeliveryRate,
            max: 100,
            color: "bg-blue-600",
          }}
          accentColor="emerald"
          loading={loading}
        />
        <KPICard
          title="Average Delivery Variance"
          value={`${avgDeliveryVariance >= 0 ? "+" : ""}${avgDeliveryVariance.toFixed(1)} Days`}
          subtext="Actual date minus planned delivery date"
          tooltip="Average variance in days: lower or negative numbers indicate faster delivery ahead of schedule."
          trend={{
            direction: avgDeliveryVariance <= 0 ? "up" : "down",
            label: avgDeliveryVariance <= 0 ? "Ahead of Schedule" : "Delayed",
          }}
          accentColor={avgDeliveryVariance <= 0 ? "emerald" : "amber"}
          loading={loading}
        />
      </div>

      {/* Row 1: Drillable delivery hierarchies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <ChartCard
          title="Delivery Performance by Region"
          subtitle="Drill from region into vehicle type, model, and variant"
          badge="Interactive Drill-down"
          action={
            <button
              type="button"
              onClick={() =>
                setRegionDrillPath((currentPath) =>
                  currentPath.length > 0
                    ? currentPath.slice(0, -1)
                    : currentPath,
                )
              }
              disabled={regionDrillPath.length === 0}
              className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↖ Back
            </button>
          }
          height={280}
        >
          <DeliveryHierarchyChart
            nodes={regionHierarchyView}
            path={regionDrillPath}
            levels={deliveryHierarchyLevels}
            metric="rate"
            onBack={() =>
              setRegionDrillPath((currentPath) => currentPath.slice(0, -1))
            }
            onDrill={(label) =>
              setRegionDrillPath((currentPath) => [...currentPath, label])
            }
          />
        </ChartCard>

        <ChartCard
          title="Average Delivery Variance by Vehicle Type"
          subtitle="Drill from vehicle type into model and variant"
          badge="Interactive Drill-down"
          action={
            <button
              type="button"
              onClick={() =>
                setVarianceDrillPath((currentPath) =>
                  currentPath.length > 0
                    ? currentPath.slice(0, -1)
                    : currentPath,
                )
              }
              disabled={varianceDrillPath.length === 0}
              className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ↖ Back
            </button>
          }
          height={280}
        >
          <DeliveryHierarchyChart
            nodes={varianceHierarchyView}
            path={varianceDrillPath}
            levels={varianceHierarchyLevels}
            metric="variance"
            onBack={() =>
              setVarianceDrillPath((currentPath) => currentPath.slice(0, -1))
            }
            onDrill={(label) =>
              setVarianceDrillPath((currentPath) => [...currentPath, label])
            }
          />
        </ChartCard>
      </div>

      {/* Row 2: Monthly delivery volume and on-time rate */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">
        <div className="lg:col-span-7">
          <ChartCard
            title="Monthly Delivery Volume & On-Time Delivery Rate"
            subtitle="Columns show delivery volume; line shows on-time delivery rate"
            
            height={290}
          >
            <DeliveryVolumeRateComboChart
              data={monthlyDeliveryComboData}
              height={220}
            />
          </ChartCard>
        </div>

        {/* 4. On-Time Delivery Rate by Model */}
        <div className="lg:col-span-5">
          <ChartCard
            title="On-Time Delivery Rate by Model"
            subtitle="Fulfillment punctuality ranked across Toyota vehicle models"
            height={290}
          >
            <div className="h-[220px] overflow-y-auto pr-1">
              <HorizontalBarChart
                data={rateByModelData}
                valueFormatter={(val) => `${val}%`}
                maxVal={100}
                showRank={true}
              />
            </div>
          </ChartCard>
        </div>
      </div>
    </DashboardLayout>
  );
}
