"use client";

import Link from "next/link";

import WalletConnectButton from "../features/auth/components/WalletConnectButton";
import useSession from "../features/auth/hooks/useSession";

export default function HomePage() {
  const session = useSession();

  if (session.status === "loading") {
    return <LoadingState />;
  }

  if (session.status !== "authenticated" || !session.data) {
    return <UnauthenticatedLanding />;
  }

  return <AuthenticatedWelcome address={session.data.addressChecksum ?? session.data.address ?? ""} />;
}

function LoadingState() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-slate-950">
      <div className="rounded-lg bg-slate-900 px-6 py-4 text-slate-200 shadow-lg shadow-slate-900/40">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 animate-ping rounded-full bg-emerald-400" />
          <span className="text-sm font-medium tracking-wide">加载中…</span>
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

type AuthenticatedWelcomeProps = {
  address?: string | null;
};

function AuthenticatedWelcome({ address }: AuthenticatedWelcomeProps) {
  return (
    <main className="flex flex-col gap-12 bg-slate-950 pb-20 text-slate-100">
      <section className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-950 py-16">
        <div className="container mx-auto flex max-w-5xl flex-col gap-6 px-6">
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">欢迎回来！</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-300 sm:text-base">
            你的账户 {address ? `（${address}）` : ""} 已连接。进入竞赛控制台，继续管理你创建的活动或参与中的赛事。
          </p>
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

      <section className="container mx-auto flex max-w-5xl flex-col gap-6 px-6">
        <h2 className="text-xl font-semibold text-white">常用入口</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: "我的竞赛",
              description: "快速查看你已经创建或部署的竞赛，管理生命周期和获奖信息。",
              href: "/me/contests"
            },
            {
              title: "参赛记录",
              description: "回顾近期的参赛操作，跟进奖励发放和本金赎回进度。",
              href: "/me/participation"
            },
            {
              title: "操作指南",
              description: "熟悉部署组件、发布竞赛、参赛操作的详细步骤与常见问题。",
              href: "/docs/getting-started"
            }
          ].map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-left text-slate-200 shadow-lg shadow-black/20 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              <h3 className="text-lg font-semibold text-white">{item.title}</h3>
              <p className="text-sm leading-relaxed text-slate-300">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
