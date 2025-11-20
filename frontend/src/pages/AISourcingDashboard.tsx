import { useEffect, useMemo, useState } from "react";
import AIChatFilter, { PromptHistoryEntry } from "@/components/AIChatFilter";
import CompanyExplorer, { CompanyRow, QueryMetadata } from "@/components/CompanyExplorer";

interface AIFilterApiResponse {
  org_numbers: string[];
  result_count: number;
  parsed_sql: string;
  metadata: QueryMetadata;
}

interface CompanyBatchResponse {
  orgnr: string;
  company_name?: string;
  latest_revenue_sek?: number;
  avg_ebitda_margin?: number;
  revenue_growth_yoy?: number;
  revenue_cagr_3y?: number;
}

const PAGE_SIZE = 20;

const AISourcingDashboard = () => {
  const [prompt, setPrompt] = useState("Find growing IT companies in Sweden with stable margins");
  const [history, setHistory] = useState<PromptHistoryEntry[]>([]);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [parsedSql, setParsedSql] = useState<string>("");
  const [metadata, setMetadata] = useState<QueryMetadata>({});
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<string>("");

  const selectedList = useMemo(() => Array.from(selected), [selected]);

  const computeAiScore = (company: CompanyBatchResponse) => {
    const growth = company.revenue_growth_yoy ?? company.revenue_cagr_3y ?? 0;
    const margin = company.avg_ebitda_margin ?? 0;
    const baseScore = 55 + growth * 120 + margin * 60;
    return Math.min(99, Math.max(1, Math.round(baseScore)));
  };

  const fetchCompanyDetails = async (orgNumbers: string[]) => {
    if (orgNumbers.length === 0) return [] as CompanyRow[];
    const response = await fetch("/api/companies/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgnrs: orgNumbers }),
    });
    if (!response.ok) throw new Error("Failed to load companies");
    const data = (await response.json()) as CompanyBatchResponse[];
    return data.map((company) => ({ ...company, aiStrategicScore: computeAiScore(company) }));
  };

  const runFilter = async (targetPage = 1, overridePrompt?: string) => {
    setIsLoading(true);
    const promptToUse = overridePrompt ?? prompt;
    const offset = (targetPage - 1) * PAGE_SIZE;
    try {
      const response = await fetch("/api/ai-filter/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptToUse, limit: PAGE_SIZE, offset }),
      });
      if (!response.ok) {
        throw new Error("AI filter request failed");
      }
      const data = (await response.json()) as AIFilterApiResponse;
      setParsedSql(data.parsed_sql);
      setMetadata(data.metadata || {});
      setTotalCount(data.result_count);
      const companyDetails = await fetchCompanyDetails(data.org_numbers);
      setCompanies(companyDetails);
      setPage(targetPage);
      setHistory((prev) => [
        {
          prompt: promptToUse,
          parsedSql: data.parsed_sql,
          resultCount: data.result_count,
          timestamp: new Date().toISOString(),
        },
        ...prev,
      ]);
      setSelected(new Set());
      setStatusMessage("");
    } catch (error) {
      console.error(error);
      setStatusMessage("Failed to run AI filter. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    runFilter(1, prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePageChange = (nextPage: number) => {
    if (nextPage === page) return;
    runFilter(nextPage);
  };

  const handleSelectAll = () => {
    if (companies.length === 0) return;
    if (companies.every((company) => selected.has(company.orgnr))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(companies.map((company) => company.orgnr)));
    }
  };

  const handleEnrichSelection = async () => {
    if (selectedList.length === 0) return;
    setStatusMessage("Queuing enrichment jobs...");
    try {
      const response = await fetch("/api/enrichment/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_numbers: selectedList }),
      });
      if (!response.ok) throw new Error("Enrichment request failed");
      setStatusMessage("Enrichment started for selected companies.");
    } catch (error) {
      console.error(error);
      setStatusMessage("Failed to start enrichment. Check logs and retry.");
    }
  };

  const handleExportSelection = () => {
    if (selectedList.length === 0) return;
    setStatusMessage(`Prepared ${selectedList.length} companies for CRM export.`);
  };

  const handleViewProfiles = () => {
    if (selectedList.length === 0) return;
    setStatusMessage("Loading AI profiles for selection...");
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-widest text-indigo-300">AI sourcing cockpit</p>
          <h1 className="text-3xl font-semibold">Acquisition targeting assistant</h1>
          <p className="max-w-3xl text-slate-400">
            Ask natural language questions on 13,610 Swedish companies, then enrich the winners with AI summaries.
          </p>
        </div>
        {statusMessage && <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-amber-200">{statusMessage}</div>}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          <AIChatFilter
            prompt={prompt}
            onPromptChange={setPrompt}
            onSubmit={() => runFilter(1)}
            isLoading={isLoading}
            history={history}
            onSelectHistory={(promptFromHistory) => {
              setPrompt(promptFromHistory);
              runFilter(1, promptFromHistory);
            }}
          />
          <CompanyExplorer
            companies={companies}
            totalCount={totalCount}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
            selected={selected}
            onToggleSelect={(orgnr) => {
              const updated = new Set(selected);
              if (updated.has(orgnr)) {
                updated.delete(orgnr);
              } else {
                updated.add(orgnr);
              }
              setSelected(updated);
            }}
            onSelectAll={handleSelectAll}
            onEnrichSelection={handleEnrichSelection}
            onExportSelection={handleExportSelection}
            onViewProfiles={handleViewProfiles}
            parsedSql={parsedSql}
            metadata={metadata}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
};

export default AISourcingDashboard;
