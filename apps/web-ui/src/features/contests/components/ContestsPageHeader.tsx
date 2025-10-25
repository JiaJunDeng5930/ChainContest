"use client";

import { useTranslations } from "next-intl";

export function ContestsPageHeader() {
  const t = useTranslations();

  return (
    <header className="space-y-2">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-50">
        {t("nav.contests")}
      </h1>
      <p className="text-sm text-slate-300">{t("contests.refresh")}</p>
    </header>
  );
}

export default ContestsPageHeader;
