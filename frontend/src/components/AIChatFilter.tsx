import { useMemo } from "react";

export type PromptHistoryEntry = {
  prompt: string;
  parsedSql?: string;
  resultCount?: number;
  timestamp: string;
};

interface AIChatFilterProps {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  history: PromptHistoryEntry[];
  onSelectHistory?: (prompt: string) => void;
}

const AIChatFilter = ({
  prompt,
  onPromptChange,
  onSubmit,
  isLoading = false,
  history,
  onSelectHistory,
}: AIChatFilterProps) => {
  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [history]
  );

  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-inner">
      <div>
        <h2 className="text-lg font-semibold text-white">AI Sourcing Chat</h2>
        <p className="text-sm text-slate-400">
          Describe the companies you want to find. The AI will translate your prompt into
          financial filters.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        <label className="text-sm font-medium text-slate-200" htmlFor="ai-filter-prompt">
          Prompt
        </label>
        <textarea
          id="ai-filter-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          className="min-h-[160px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white shadow focus:border-indigo-500 focus:outline-none"
          placeholder="e.g. Find growing IT companies in Sweden with stable margins"
        />
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-slate-400">AI will auto-apply revenue, growth, and margin filters.</div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-600 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {isLoading ? "Searching..." : "Run AI filter"}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <div className="mb-2 flex items-center justify-between text-sm text-slate-300">
          <span>Prompt history</span>
          <span className="text-xs text-slate-500">Latest first</span>
        </div>
        <div className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1 text-sm">
          {sortedHistory.length === 0 && <div className="text-slate-500">No prompts yet.</div>}
          {sortedHistory.map((entry) => (
            <button
              key={entry.timestamp}
              type="button"
              onClick={() => onSelectHistory?.(entry.prompt)}
              className="w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-left text-slate-200 transition hover:border-indigo-500 hover:text-white"
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{new Date(entry.timestamp).toLocaleString()}</span>
                {entry.resultCount !== undefined && (
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-indigo-200">
                    {entry.resultCount} matches
                  </span>
                )}
              </div>
              <div className="mt-1 line-clamp-2 text-sm text-white">{entry.prompt}</div>
              {entry.parsedSql && (
                <div className="mt-1 text-xs text-slate-400">
                  SQL: <span className="font-mono text-[11px]">{entry.parsedSql}</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AIChatFilter;
