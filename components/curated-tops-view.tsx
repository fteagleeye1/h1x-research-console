"use client";

import { useEffect, useState } from "react";
import ResearchAssistant from "@/components/research-assistant";
import type { CuratedReport } from "@/lib/curated-tops";

/**
 * "Curated Tops" tab — mirrors reddelexc.github.io/hackerone-reports:
 * pick a bug class from the sidebar, browse its all-time top reports.
 * Served entirely from local snapshots; instant and un-rate-limitable.
 */

type Manifest = Record<string, { group: string; name: string; file: string }[]>;

function formatUsd(value: number | null) {
  if (!value || value <= 0) return null;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default function CuratedTopsView() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeName, setActiveName] = useState("");
  const [reports, setReports] = useState<CuratedReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/curated-tops");

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "Unable to load curated corpus.");
        }

        const payload = (await response.json()) as { groups: Manifest };
        const firstGroup = Object.values(payload.groups)[0]?.[0];

        if (!cancelled) {
          setManifest(payload.groups);
          if (firstGroup) void pick(firstGroup.file, firstGroup.name);
        }
      } catch (err) {
        if (!cancelled) {
          setManifestError(err instanceof Error ? err.message : "Unknown error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function pick(file: string, name: string) {
    setActiveFile(file);
    setActiveName(name);
    setLoadingReports(true);

    try {
      const response = await fetch(`/api/curated-tops?file=${encodeURIComponent(file)}`);

      if (!response.ok) throw new Error("Unable to load this category.");

      const payload = (await response.json()) as { reports: CuratedReport[] };
      setReports(payload.reports);
    } catch {
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  }

  if (manifestError) {
    return (
      <div className="grid gap-6 p-6 lg:p-10">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-sm text-amber-200">
          <p className="font-medium">Curated TOP corpus is not synced yet.</p>
          <p className="mt-2 text-xs leading-relaxed text-amber-200/80">
            Run <code className="rounded bg-canvas px-1.5 py-0.5 font-mono">npm run sync-disclosed</code>{" "}
            once to download the static corpus locally. This view then loads instantly
            with no external requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:p-10">
      {/* Category sidebar */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        {!manifest && (
          <p className="px-3 py-1.5 text-xs text-ink-faint">loading categories...</p>
        )}

        {(manifest ? Object.entries(manifest) : []).map(([group, categories]) => (
          <div key={group} className="mb-5">
            <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-ink-faint">
              {group === "tops_100" ? "Leaderboards" : "By vulnerability type"}
            </p>

            <nav className="flex flex-col gap-0.5">
              {categories.map((category) => (
                <button
                  key={category.file}
                  onClick={() => pick(category.file, category.name)}
                  disabled={loadingReports}
                  className={`rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
                    activeFile === category.file
                      ? "bg-accent-dim text-accent"
                      : "text-ink-secondary hover:bg-raised/70 hover:text-ink"
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </nav>
          </div>
        ))}

        <p className="mt-4 hidden max-w-[220px] text-[10px] leading-relaxed text-ink-faint lg:block">
          All-time top disclosed reports per class, from a public curated corpus,
          stored locally by the sync script.
        </p>
      </aside>

      {/* Report list */}
      <main className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink">
            {activeName || "Select a category"}
          </h2>

          <span className="font-mono text-[11px] text-ink-faint">
            {loadingReports ? "..." : `${reports.length} reports`}
          </span>
        </div>

        {loadingReports ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-line/60 bg-surface/60 p-4"
              >
                <div className="h-3 w-full rounded bg-raised/70" />
              </div>
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-12 text-center text-sm text-ink-muted">
            Nothing available for this category.
          </div>
        ) : (
          <ol className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-line bg-surface">
            {reports.map((report, index) => (
              <li key={report.url}>
                <a
                  href={report.reportId ? `/disclosed-reports/${report.reportId}` : report.url}
                  target={report.reportId ? undefined : "_blank"}
                  rel={report.reportId ? undefined : "noreferrer"}
                  className="flex items-baseline gap-4 px-5 py-3.5 transition-colors hover:bg-raised/60"
                >
                  <span className="w-8 shrink-0 text-right font-mono text-xs text-ink-faint">
                    {index + 1}.
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-sm leading-snug text-ink">
                      {report.title}
                    </span>

                    <span className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-ink-faint">
                      <span className="font-mono">
                        {report.program ?? "unknown-program"}
                      </span>
                      {report.reportId && (
                        <span className="font-mono">#{report.reportId}</span>
                      )}
                      {report.votes !== null && (
                        <span>▲ {report.votes.toLocaleString("en-US")}</span>
                      )}
                    </span>
                  </span>

                  {formatUsd(report.bountyAmount) && (
                    <span className="shrink-0 font-mono text-[11px] text-accent/90">
                      {formatUsd(report.bountyAmount)}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ol>
        )}

        {/* Category-level research assistant */}
        {!loadingReports && activeFile && (
          <div className="mt-6">
            <ResearchAssistant
              key={activeFile}
              target={{
                kind: "curated",
                curatedFile: activeFile,
                curatedName: activeName,
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
