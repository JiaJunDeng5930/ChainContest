"use client";

import type { ContestListQuery } from "../api/contests";

type ContestExplorerProps = {
  initialQuery: ContestListQuery;
};

export function ContestExplorer({ initialQuery }: ContestExplorerProps) {
  return (
    <section
      aria-live="polite"
      data-initial-chain-id={initialQuery.chainId ?? undefined}
      data-initial-status={initialQuery.status ?? undefined}
      data-initial-cursor={initialQuery.cursor ?? undefined}
      className="rounded-lg border border-slate-800/60 bg-slate-900/40 p-6 text-sm text-slate-300"
    >
      <p>Contests module is initializing. Listing will be available shortly.</p>
    </section>
  );
}

export default ContestExplorer;
