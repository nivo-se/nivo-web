import { useMemo } from "react";

export type CompanyRow = {
  orgnr: string;
  company_name?: string;
  latest_revenue_sek?: number;
  avg_ebitda_margin?: number;
  revenue_growth_yoy?: number;
  revenue_cagr_3y?: number;
  aiStrategicScore?: number;
};

export type QueryMetadata = {
  model?: string;
  fallback_used?: boolean;
  limit?: number;
  offset?: number;
  warnings?: string[];
};

interface CompanyExplorerProps {
  companies: CompanyRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  selected: Set<string>;
  onToggleSelect: (orgnr: string) => void;
  onSelectAll: () => void;
  onEnrichSelection: () => void;
  onExportSelection: () => void;
  onViewProfiles: () => void;
  parsedSql?: string;
  metadata?: QueryMetadata;
  isLoading?: boolean;
}

const formatCurrency = (value?: number) => {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(value);
};

const formatPercent = (value?: number) => {
  if (value === null || value === undefined) return "-";
  return `${(value * 100).toFixed(1)}%`;
};

const CompanyExplorer = ({
  companies,
  totalCount,
  page,
  pageSize,
  onPageChange,
  selected,
  onToggleSelect,
  onSelectAll,
  onEnrichSelection,
  onExportSelection,
  onViewProfiles,
  parsedSql,
  metadata,
  isLoading = false,
}: CompanyExplorerProps) => {
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / pageSize)), [totalCount, pageSize]);
  const allSelected = companies.length > 0 && companies.every((company) => selected.has(company.orgnr));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = totalCount === 0 ? 0 : (page - 1) * pageSize + companies.length;

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Company Explorer</h2>
          <p className="text-sm text-slate-400">
            {totalCount} results • page {page} of {totalPages}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onEnrichSelection}
            disabled={selected.size === 0 || isLoading}
            className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white shadow hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            Enrich selection
          </button>
          <button
            type="button"
            onClick={onExportSelection}
            disabled={selected.size === 0 || isLoading}
            className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium text-white shadow hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            Export to CRM
          </button>
          <button
            type="button"
            onClick={onViewProfiles}
            disabled={selected.size === 0}
            className="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-white hover:border-indigo-500"
          >
            View AI Profile
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
        <div>
          <span className="text-slate-500">SQL where</span>: <span className="font-mono text-[11px] text-indigo-200">{parsedSql || "1=1"}</span>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <span className="rounded bg-slate-800 px-2 py-1 text-[11px]">Model: {String(metadata?.model ?? "n/a")}</span>
          {metadata?.fallback_used && <span className="rounded bg-amber-500/20 px-2 py-1 text-[11px] text-amber-200">Heuristic</span>}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="min-w-full divide-y divide-slate-800 text-sm text-slate-100">
          <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">
                <input type="checkbox" checked={allSelected} onChange={onSelectAll} className="rounded border-slate-700 bg-slate-900" />
              </th>
              <th className="px-3 py-2 text-left">OrgNr</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-right">Revenue (SEK)</th>
              <th className="px-3 py-2 text-right">EBITDA margin</th>
              <th className="px-3 py-2 text-right">Growth</th>
              <th className="px-3 py-2 text-right">AI strategic score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/40">
            {companies.map((company) => (
              <tr key={company.orgnr} className="hover:bg-slate-900/60">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(company.orgnr)}
                    onChange={() => onToggleSelect(company.orgnr)}
                    className="rounded border-slate-700 bg-slate-900"
                  />
                </td>
                <td className="px-3 py-2 font-mono text-[12px] text-indigo-100">{company.orgnr}</td>
                <td className="px-3 py-2">
                  <div className="text-sm font-semibold text-white">{company.company_name || "Unknown"}</div>
                </td>
                <td className="px-3 py-2 text-right">{formatCurrency(company.latest_revenue_sek)}</td>
                <td className="px-3 py-2 text-right">{formatPercent(company.avg_ebitda_margin)}</td>
                <td className="px-3 py-2 text-right">{formatPercent(company.revenue_growth_yoy ?? company.revenue_cagr_3y)}</td>
                <td className="px-3 py-2 text-right">
                  <span className="rounded bg-indigo-500/10 px-2 py-1 text-xs font-semibold text-indigo-200">
                    {company.aiStrategicScore ?? "-"}
                  </span>
                </td>
              </tr>
            ))}
            {companies.length === 0 && !isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No companies found. Try a different prompt.
                </td>
              </tr>
            )}
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  Loading companies...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-300">
        <div>
          Showing {rangeStart} - {rangeEnd} of {totalCount}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1 || isLoading}
            className="rounded-lg border border-slate-700 px-3 py-1 text-sm text-white hover:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-slate-400">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || isLoading}
            className="rounded-lg border border-slate-700 px-3 py-1 text-sm text-white hover:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompanyExplorer;
