import DashboardLayout from "../component/DashboardLayout";
import type { DashboardPage } from "../component/Header";

export default function PagePlaceholder({
  page,
  onPageChange,
}: {
  page: Exclude<DashboardPage, "Overview">;
  onPageChange: (page: DashboardPage) => void;
}) {
  return (
    <DashboardLayout activePage={page} onPageChange={onPageChange}>
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{page}</h1>
        <p className="mt-2 text-sm text-slate-500">
          This page is connected to the dashboard navigation. Its Supabase
          analysis view is ready to be added without changing the global
          filters.
        </p>
      </div>
    </DashboardLayout>
  );
}
