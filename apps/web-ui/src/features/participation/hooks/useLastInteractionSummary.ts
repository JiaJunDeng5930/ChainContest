"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";

import type { ContestSnapshot } from "../../contests/api/contests";
import { fetchParticipationHistory } from "../api/history";
import type { ParticipationEvent, RewardClaimEvent, UserContestListResponse } from "../api/types";

export type LastInteractionSummary = {
  contest: ContestSnapshot;
  action: "participation" | "reward";
  amount: string;
  timestamp: string;
};

export type InteractionSummaryOptions = {
  networkId?: number;
  enabled?: boolean;
  pageSize?: number;
};

type RawInteraction = {
  contest: ContestSnapshot;
  amount: string;
  timestamp: string;
  action: "participation" | "reward";
};

function flattenInteractions(response: UserContestListResponse | undefined): RawInteraction[] {
  if (!response?.items?.length) {
    return [];
  }

  const interactions: RawInteraction[] = [];

  response.items.forEach((record) => {
    const { contest } = record;

    record.participations?.forEach((event: ParticipationEvent) => {
      if (!event?.occurredAt) {
        return;
      }
      interactions.push({
        contest,
        amount: event.amount,
        timestamp: event.occurredAt,
        action: "participation"
      });
    });

    record.rewardClaims?.forEach((event: RewardClaimEvent) => {
      if (!event?.claimedAt) {
        return;
      }
      interactions.push({
        contest,
        amount: event.amount,
        timestamp: event.claimedAt,
        action: "reward"
      });
    });
  });

  return interactions;
}

function selectSummary(response: UserContestListResponse | undefined): LastInteractionSummary | null {
  const interactions = flattenInteractions(response);
  if (!interactions.length) {
    return null;
  }

  const latest = interactions.reduce<RawInteraction | null>((current, candidate) => {
    if (!candidate.timestamp) {
      return current;
    }

    if (!current) {
      return candidate;
    }

    return new Date(candidate.timestamp).getTime() > new Date(current.timestamp).getTime() ? candidate : current;
  }, null);

  if (!latest) {
    return null;
  }

  return {
    contest: latest.contest,
    action: latest.action,
    amount: latest.amount,
    timestamp: latest.timestamp
  };
}

export default function useLastInteractionSummary({ networkId, enabled = true, pageSize = 5 }: InteractionSummaryOptions = {}) {
  const query = useQuery<UserContestListResponse, unknown>({
    queryKey: ["participation-summary", networkId ?? null, pageSize] as const,
    queryFn: () =>
      fetchParticipationHistory({
        pageSize,
        networkId
      }),
    enabled
  });

  const summary = useMemo(() => selectSummary(query.data), [query.data]);

  const baseResult: Pick<UseQueryResult<UserContestListResponse, unknown>, "data" | "error" | "isLoading" | "isError" | "isFetching" | "refetch"> = {
    data: query.data,
    error: query.error,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refetch: query.refetch
  };

  return {
    ...baseResult,
    summary
  };
}
