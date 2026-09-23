import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../supabaseClient";
import type {
  DimCustomer,
  DimRegion,
  DimVModel,
  DimensionLookups,
  GlobalFilters,
} from "../index";

const EMPTY_FILTERS: GlobalFilters = {
  startDate: null,
  endDate: null,
  regionId: null,
  modelId: null,
  variant: null,
  vehicleType: null,
  customerType: null,
  bookingStatus: null,
};

interface FilterContextValue {
  filters: GlobalFilters;
  setFilter: <K extends keyof GlobalFilters>(
    key: K,
    value: GlobalFilters[K],
  ) => void;
  resetFilters: () => void;
  lookups: DimensionLookups | null;
  loadingLookups: boolean;
  matchingModelIds: string[] | null;
  matchingCustomerIds: string[] | null;
}

const FilterContext = createContext<FilterContextValue | undefined>(undefined);

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = useState<GlobalFilters>(EMPTY_FILTERS);
  const [lookups, setLookups] = useState<DimensionLookups | null>(null);
  const [loadingLookups, setLoadingLookups] = useState(true);

  useEffect(() => {
    async function loadLookups() {
      setLoadingLookups(true);

      if (!supabase) {
        setLookups(null);
        setLoadingLookups(false);
        return;
      }

      const [regionsRes, modelsRes, customersRes, bookingsRes] =
        await Promise.all([
          supabase
            .from("dim_region")
            .select("region_id, region_name, state, country"),
          supabase
            .from("dim_v_model")
            .select("model_id, model_name, variant, vehicle_type"),
          supabase
            .from("dim_customer")
            .select("customer_id, customer_name, customer_type, region_id"),
          supabase.from("fact_booking").select("booking_status"),
        ]);

      const regions = (regionsRes.data ?? []) as DimRegion[];
      const models = (modelsRes.data ?? []) as DimVModel[];
      const customers = (customersRes.data ?? []) as DimCustomer[];
      const bookingStatuses = Array.from(
        new Set(
          (bookingsRes.data ?? [])
            .map((item) => item?.booking_status)
            .filter(
              (value): value is string =>
                typeof value === "string" && value.length > 0,
            ),
        ),
      ).sort();

      setLookups({
        regions,
        models,
        regionsById: new Map(
          regions.map((region) => [region.region_id, region]),
        ),
        modelsById: new Map(models.map((model) => [model.model_id, model])),
        customersById: new Map(
          customers.map((customer) => [customer.customer_id, customer]),
        ),
        variants: Array.from(
          new Set(
            models
              .map((model) => model.variant)
              .filter(
                (value): value is string =>
                  typeof value === "string" && value.length > 0,
              ),
          ),
        ).sort(),
        vehicleTypes: Array.from(
          new Set(
            models
              .map((model) => model.vehicle_type)
              .filter(
                (value): value is string =>
                  typeof value === "string" && value.length > 0,
              ),
          ),
        ).sort(),
        customerTypes: Array.from(
          new Set(
            customers
              .map((customer) => customer.customer_type)
              .filter(
                (value): value is string =>
                  typeof value === "string" && value.length > 0,
              ),
          ),
        ).sort(),
        bookingStatuses,
      });

      setLoadingLookups(false);
    }

    void loadLookups();
  }, []);

  const setFilter: FilterContextValue["setFilter"] = (key, value) => {
    setFilters((previousFilters) => ({ ...previousFilters, [key]: value }));
  };

  const resetFilters = () => setFilters(EMPTY_FILTERS);

  const matchingModelIds = useMemo(() => {
    if (!lookups) return null;
    const modelId = filters.modelId;
    const variant = filters.variant;
    const vehicleType = filters.vehicleType;
    if (!modelId && !variant && !vehicleType) return null;

    return lookups.models
      .filter((model) => (modelId ? model.model_id === modelId : true))
      .filter((model) => (variant ? model.variant === variant : true))
      .filter((model) =>
        vehicleType ? model.vehicle_type === vehicleType : true,
      )
      .map((model) => model.model_id);
  }, [lookups, filters.modelId, filters.variant, filters.vehicleType]);

  const matchingCustomerIds = useMemo(() => {
    if (!lookups) return null;
    const customerType = filters.customerType;
    const regionId = filters.regionId;
    if (!customerType && !regionId) return null;

    return Array.from(lookups.customersById.values())
      .filter((customer) =>
        customerType ? customer.customer_type === customerType : true,
      )
      .filter((customer) => (regionId ? customer.region_id === regionId : true))
      .map((customer) => customer.customer_id);
  }, [lookups, filters.customerType, filters.regionId]);

  return (
    <FilterContext.Provider
      value={{
        filters,
        setFilter,
        resetFilters,
        lookups,
        loadingLookups,
        matchingModelIds,
        matchingCustomerIds,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FilterContext);
  if (!context)
    throw new Error("useFilters must be used within a FilterProvider");
  return context;
}

export { EMPTY_FILTERS };
export type { GlobalFilters, DimensionLookups };
