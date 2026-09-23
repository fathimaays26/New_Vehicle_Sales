import Overview from "./pages/Overview";
import BookingSalesAnalysis from "./pages/BookingSalesAnalysis";
import DeliveryFulfillment from "./pages/DeliveryFulfillment";
import ModelMarketPerformance from "./pages/ModelMarketPerformance";
import PendingBookingsPipeline from "./pages/PendingBookingsPipeline";
import type { DashboardPage } from "./component/Header";
import { FilterProvider } from "./context/FilterContext";
import { useState } from "react";

export default function App() {
  const [activePage, setActivePage] = useState<DashboardPage>("Overview");

  return (
    <FilterProvider>
      {activePage === "Overview" ? (
        <Overview activePage={activePage} onPageChange={setActivePage} />
      ) : activePage === "Booking & Sales Analysis" ? (
        <BookingSalesAnalysis
          activePage={activePage}
          onPageChange={setActivePage}
        />
      ) : activePage === "Delivery & Fulfillment" ? (
        <DeliveryFulfillment
          activePage={activePage}
          onPageChange={setActivePage}
        />
      ) : activePage === "Model & Market Performance" ? (
        <ModelMarketPerformance
          activePage={activePage}
          onPageChange={setActivePage}
        />
      ) : (
        <PendingBookingsPipeline
          activePage={activePage}
          onPageChange={setActivePage}
        />
      )}
    </FilterProvider>
  );
}
