import { getTranslations } from "next-intl/server";

import ContestDetail from "../../../../features/contests/components/ContestDetail";

type ContestDetailPageProps = {
  params: {
    contestId: string;
  };
};

export default async function ContestDetailPage({ params }: ContestDetailPageProps) {
  const t = await getTranslations();
  const { contestId } = params;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
          {t("contests.detail.overview")}
        </h1>
        <p className="text-sm text-slate-300">{t("contests.refresh")}</p>
      </header>
      <ContestDetail contestId={contestId} />
    </div>
  );
}
