"use client";

import { useTranslations } from "next-intl";

export function ContestDetailPageHeader() {
  const t = useTranslations();

  return (
    <header className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
        {t("contests.detail.overview")}
      </h1>
      <p className="text-sm text-slate-300">{t("contests.refresh")}</p>
    </header>
  );
}

export default ContestDetailPageHeader;
