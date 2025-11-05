"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import WalletConnectButton from "../features/auth/components/WalletConnectButton";
import useSession from "../features/auth/hooks/useSession";
import {
  fetchCreatorContests,
  type CreatorContestListResponse,
  type CreatorContestRecord
} from "../features/contests/api/creatorContests";
import {
  fetchParticipationHistory,
  type UserContestListResponse,
  type UserContestRecord
} from "../features/participation/api/history";

export default function HomePage() {
  const session = useSession();

  if (session.status === "loading") {
    return <LoadingState />;
  }

  if (session.status !== "authenticated" || !session.data) {
    return <UnauthenticatedLanding />;
  }

  return <AuthenticatedDashboard address={session.data.addressChecksum ?? session.data.address ?? ""} />;
}

type LoadingStateProps = {
  message?: string;
};

function LoadingState({ message = "加载中…" }: LoadingStateProps) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-slate-950">
      <div className="rounded-lg bg-slate-900 px-6 py-4 text-slate-200 shadow-lg shadow-slate-900/40">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-ping rounded-full bg-emerald-400" />
          <span className="text-sm font-medium tracking-wide">{message}</span>
        </div>
      </div>
    </main>
  );
}

function UnauthenticatedLanding() {
  return (
    <main className="flex flex-col gap-16 bg-slate-950 pb-20">
      <section className="relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-slate-900 to-slate-950 py-24">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="container relative mx-auto flex max-w-5xl flex-col gap-10 px-6 text-slate-100">
          <div className="inline-flex w-max items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-300">
            On-chain contest orchestration
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            自主发起、实时参与的链上竞赛平台
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-slate-300 sm:text-lg">
            ChainContest 提供组件化的比赛创建、参赛流程与自动化的链上结算。无需复杂脚本，直接在网页完成资金托管、价格监控、奖励发放等全链路操作，让团队和用户都能专注策略本身。
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href="/contests"
              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-base font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              浏览公开竞赛
            </Link>
            <div className="inline-flex items-center">
              <div className="[&>div]:w-full [&>div]:items-center [&>div]:gap-0 [&>div>button]:w-full [&>div>button]:rounded-full [&>div>button]:border [&>div>button]:border-slate-700 [&>div>button]:px-6 [&>div>button]:py-3 [&>div>button]:text-base [&>div>button]:font-semibold [&>div>button]:text-slate-200 [&>div>button]:transition hover:[&>div>button]:border-emerald-400 hover:[&>div>button]:text-emerald-200">
                <WalletConnectButton />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto flex max-w-5xl flex-col gap-10 px-6">
        <h2 className="text-2xl font-semibold text-white">我们为谁打造？</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "运营/产品团队",
              description:
                "无需编写脚本即可组装竞赛组件、设置时间线与保底奖池。可复用的 Vault / PriceSource 组件帮你快速复制成功案例。"
            },
            {
              title: "链上参与者",
              description:
                "一键报名、调仓、领奖与退出本金。所有步骤都通过链上合约执行，透明可审计，支持即时状态反馈。"
            },
            {
              title: "社区与合作伙伴",
              description:
                "将竞赛嵌入你自己的生态中，利用我们提供的 API 和组件快速集成，打造长期可持续的活动体系。"
            }
          ].map((item) => (
            <article
              key={item.title}
              className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-slate-200 shadow-lg shadow-black/20"
            >
              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              <p className="text-sm leading-relaxed text-slate-300">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="container mx-auto flex max-w-5xl flex-col gap-8 px-6">
        <h2 className="text-2xl font-semibold text-white">三步开启链上竞赛</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              step: "01",
              title: "部署可复用组件",
              detail: "通过组件中心部署 Vault 与 Price Source，实现资金托管与链上价格源接入。"
            },
            {
              step: "02",
              title: "配置并发布比赛",
              detail: "设置报名条件、时间线与奖励分配，系统自动生成链上部署计划并提交执行。"
            },
            {
              step: "03",
              title: "实时运营与结算",
              detail: "参赛者调仓、结算和领奖全自动执行，支持多阶段权益解锁，确保流程透明可靠。"
            }
          ].map((item) => (
            <article
              key={item.step}
              className="flex flex-col gap-4 rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-6 text-slate-200"
            >
              <span className="text-sm font-bold uppercase tracking-[0.3em] text-emerald-300">{item.step}</span>
              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              <p className="text-sm leading-relaxed text-slate-300">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-slate-900/70 py-16">
        <div className="container mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 text-center">
          <h2 className="text-2xl font-semibold text-white">准备好让你的策略真正落地了吗？</h2>
          <p className="max-w-2xl text-sm text-slate-300">
            立即连接钱包解锁 ChainContest 全部能力：组件部署、竞赛创建、参赛管理以及链上自动结算。
          </p>
          <div className="[&>div]:items-center [&>div]:gap-0 [&>div>button]:rounded-full [&>div>button]:bg-emerald-500 [&>div>button]:px-6 [&>div>button]:py-3 [&>div>button]:text-base [&>div>button]:font-semibold [&>div>button]:text-slate-950 hover:[&>div>button]:bg-emerald-400">
            <WalletConnectButton />
          </div>
        </div>
      </section>
    </main>
  );
}

type AuthenticatedDashboardProps = {
  address: string;
};

function AuthenticatedDashboard({ address }: AuthenticatedDashboardProps) {
  const createdQuery = useQuery<CreatorContestListResponse>({
    queryKey: ["home", "creator-contests"],
    queryFn: () => fetchCreatorContests({ pageSize: 5 }),
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

  const participationQuery = useQuery<UserContestListResponse>({
    queryKey: ["home", "participation-history"],
    queryFn: () => fetchParticipationHistory({ pageSize: 5 }),
    staleTime: 30_000,
    refetchOnWindowFocus: false
  });

  const createdRecords = createdQuery.data?.items ?? [];
  const participationRecords = participationQuery.data?.items ?? [];

  const stats = useMemo(() => {
    const createdCount = createdRecords.length;
    const activeCreations = createdRecords.filter((record) =>
      isActiveContestStatus(record.contest?.status ?? record.status)
    ).length;

    const participationCount = participationRecords.length;
    const activeParticipations = participationRecords.filter((record) =>
      isActiveContestStatus(record.contest.phase)
    ).length;
    const rewardClaimCount = participationRecords.reduce((total, record) => total + record.rewardClaims.length, 0);

    return [
      {
        label: "已创建竞赛",
        value: createdCount,
        detail: activeCreations > 0 ? `${activeCreations} 场进行中` : "暂无进行中的竞赛"
      },
      {
        label: "参与记录",
        value: participationCount,
        detail: activeParticipations > 0 ? `${activeParticipations} 场正在进行` : "等待下一场开赛"
      },
      {
        label: "已领奖励",
        value: rewardClaimCount,
        detail: rewardClaimCount > 0 ? "恭喜，你已经赢得奖励！" : "快去参赛赢取奖励吧"
      }
    ];
  }, [createdRecords, participationRecords]);

  return (
    <main className="flex flex-col gap-12 bg-slate-950 pb-20 text-slate-100">
      <section className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-950 py-16">
        <div className="container mx-auto flex max-w-5xl flex-col gap-6 px-6">
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">欢迎回来！</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
            你的账户 {address ? `（${address}）` : ""} 已连接。以下为你负责与参与的竞赛概览，继续推进比赛节奏吧。
          </p>
          <div className="grid gap-6 sm:grid-cols-3">
            {stats.map((item) => (
              <article
                key={item.label}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-black/30"
              >
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
                <p className="mt-2 text-xs text-slate-400">{item.detail}</p>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/contests"
              className="inline-flex items-center justify-center rounded-full border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              浏览竞赛广场
            </Link>
            <Link
              href="/components"
              className="inline-flex items-center justify-center rounded-full border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              管理组件
            </Link>
            <Link
              href="/contests/create"
              className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              创建新竞赛
            </Link>
          </div>
        </div>
      </section>

      <DashboardSection
        title="我创建的竞赛"
        description="查看最近部署的竞赛及其当前阶段。列表仅展示最新五条，可前往“我的竞赛”查看更多详情。"
        isLoading={createdQuery.isLoading}
        error={createdQuery.isError ? createdQuery.error : null}
      >
        <CreatedContestList records={createdRecords} />
      </DashboardSection>

      <DashboardSection
        title="我的参赛经历"
        description="汇总你最近参与或关注的竞赛，了解状态、最近事件与奖励获取情况。"
        isLoading={participationQuery.isLoading}
        error={participationQuery.isError ? participationQuery.error : null}
      >
        <ParticipationList records={participationRecords} />
      </DashboardSection>
    </main>
  );
}

type DashboardSectionProps = {
  title: string;
  description: string;
  isLoading: boolean;
  error: unknown;
  children: ReactNode;
};

function DashboardSection({ title, description, isLoading, error, children }: DashboardSectionProps) {
  return (
    <section className="container mx-auto flex max-w-5xl flex-col gap-8 px-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        <p className="text-sm text-slate-400">{description}</p>
      </header>
      {isLoading ? <LoadingCardList count={3} /> : error ? <ErrorState error={error} /> : children}
    </section>
  );
}

function CreatedContestList({ records }: { records: CreatorContestRecord[] }) {
  if (!records.length) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-300">
        暂无创建记录，立即前往{" "}
        <Link href="/contests/create" className="text-emerald-300 hover:underline">
          创建竞赛
        </Link>{" "}
        吧。
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {records.map((record) => {
        const contest = record.contest;
        const artifact = record.artifact;
        const requestPayload = record.request.payload as Record<string, unknown>;
        const titleCandidates = [
          resolveTitleFromMetadata(artifact?.metadata),
          resolveTitleFromMetadata(contest?.metadata),
          resolveTitleFromMetadata(requestPayload.metadata),
          typeof requestPayload.contestId === "string" ? requestPayload.contestId : null,
          record.request.requestId
        ];

        const displayTitle = titleCandidates.find((value) => typeof value === "string" && value.trim().length > 0);
        const status = formatContestStatus(contest?.status ?? record.status);
        const createdAt = artifact?.createdAt ?? record.request.createdAt;
        const contestAddress = contest?.contractAddress ?? artifact?.contestAddress ?? "待部署";
        const chainId = contest?.chainId ?? artifact?.networkId ?? record.request.networkId;

        return (
          <article
            key={record.request.requestId}
            className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300 shadow-lg shadow-black/20"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-white">{displayTitle ?? "未命名竞赛"}</h3>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                {status}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              合约地址：{contestAddress} · 更新时间：{formatDate(createdAt)}
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-slate-400">
              <InfoBadge label="链 ID" value={chainId} />
              <InfoBadge label="部署记录" value={artifact?.transactionHash ?? "尚未确认"} />
              <InfoBadge label="提交状态" value={record.status} />
              <InfoBadge label="计划 ID" value={record.request.requestId} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ParticipationList({ records }: { records: UserContestRecord[] }) {
  if (!records.length) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-300">
        目前还没有参赛记录，前往{" "}
        <Link href="/contests" className="text-emerald-300 hover:underline">
          竞赛广场
        </Link>{" "}
        探索新的挑战。
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {records.map((record) => {
        const contest = record.contest;
        const contestTitle = resolveTitleFromMetadata(contest.metadata) ?? contest.contestId;

        return (
          <article
            key={contest.contestId}
            className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300 shadow-lg shadow-black/20"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">{contestTitle}</h3>
                <p className="text-xs text-slate-400">当前阶段：{formatContestStatus(contest.phase)}</p>
              </div>
              <Link
                href={`/contests/${encodeURIComponent(contest.contestId)}`}
                className="text-xs font-semibold text-emerald-300 hover:underline"
              >
                查看详情
              </Link>
            </div>
            <div className="grid gap-2 text-xs text-slate-400 md:grid-cols-2">
              <InfoBadge label="报名人数" value={contest.registrationCapacity.registered} />
              <InfoBadge label="奖励记录" value={record.rewardClaims.length} />
              <InfoBadge label="参赛操作次数" value={record.participations.length} />
              <InfoBadge label="最近活动" value={formatDate(record.lastActivity)} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

function LoadingCardList({ count }: { count: number }) {
  return (
    <div className="grid gap-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/50"
        />
      ))}
    </div>
  );
}

type ErrorStateProps = {
  error: unknown;
};

function ErrorState({ error }: ErrorStateProps) {
  const message = toErrorMessage(error);
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
      {message}
    </div>
  );
}

function InfoBadge({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="inline-flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{label}</span>
      <span className="text-xs text-slate-200">{value ?? "—"}</span>
    </div>
  );
}

function resolveTitleFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const directTitle = record.title;
  if (typeof directTitle === "string" && directTitle.trim().length > 0) {
    return directTitle;
  }

  const directName = record.name;
  if (typeof directName === "string" && directName.trim().length > 0) {
    return directName;
  }

  const extra = record.extra;
  if (extra && typeof extra === "object") {
    const extraRecord = extra as Record<string, unknown>;
    const extraTitle = extraRecord.title;
    if (typeof extraTitle === "string" && extraTitle.trim().length > 0) {
      return extraTitle;
    }
    const extraName = extraRecord.name;
    if (typeof extraName === "string" && extraName.trim().length > 0) {
      return extraName;
    }
  }

  return null;
}

function formatContestStatus(status: string | number | null | undefined) {
  if (typeof status !== "string") {
    return "未知";
  }

  const normalized = status.toLowerCase();
  switch (normalized) {
    case "registration":
    case "registering":
    case "registered":
      return "报名中";
    case "active":
    case "live":
      return "进行中";
    case "settled":
    case "sealed":
      return "已结算";
    case "claimable":
    case "claiming":
      return "可领奖";
    case "redeemable":
    case "redeeming":
      return "可赎回";
    case "completed":
    case "closed":
      return "已完成";
    case "failed":
    case "errored":
      return "部署失败";
    default:
      return status;
  }
}

function isActiveContestStatus(status: string | number | null | undefined) {
  if (typeof status !== "string") {
    return false;
  }

  const normalized = status.toLowerCase();
  return ["registration", "registering", "registered", "active", "live"].includes(normalized);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "暂无";
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  } catch {
    return value;
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "获取数据失败，请稍后重试。";
}
