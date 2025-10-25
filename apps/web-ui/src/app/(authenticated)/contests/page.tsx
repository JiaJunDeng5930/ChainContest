import { CONTEST_PHASES, type ContestPhase } from "@chaincontest/shared-i18n";
import { getTranslations } from "next-intl/server";

import ContestExplorer from "../../../features/contests/components/ContestExplorer";
import type { ContestListQuery } from "../../../features/contests/api/contests";

type ContestsPageSearchParams = Record<string, string | string[] | undefined>;

const KNOWN_PHASES = new Set<ContestPhase>(CONTEST_PHASES);

function toSingleValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parseChainId(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

function parseContestPhase(value: string | undefined): ContestPhase | undefined {
  if (!value) {
    return undefined;
  }

  return KNOWN_PHASES.has(value as ContestPhase) ? (value as ContestPhase) : undefined;
}

function parseCursor(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

export function mapSearchParamsToContestQuery(
  searchParams: ContestsPageSearchParams = {}
): ContestListQuery {
  const chainId = parseChainId(toSingleValue(searchParams.chainId));
  const status = parseContestPhase(toSingleValue(searchParams.status));
  const cursor = parseCursor(toSingleValue(searchParams.cursor));

  return {
    chainId,
    status,
    cursor
  };
}

export default async function ContestsPage({
  searchParams = {}
}: {
  searchParams?: ContestsPageSearchParams;
}) {
  const t = await getTranslations();
  const initialQuery = mapSearchParamsToContestQuery(searchParams);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">{t("nav.contests")}</h1>
        <p className="text-sm text-slate-300">{t("contests.refresh")}</p>
      </header>
      <ContestExplorer initialQuery={initialQuery} />
    </div>
  );
}
