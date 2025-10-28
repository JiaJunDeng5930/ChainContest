import { getTranslations } from "next-intl/server";

import CreateContestForm from "../../../../features/contests/components/CreateContestForm";
import MyCreatedContests from "../../../../features/contests/components/MyCreatedContests";
import { resolveRequestLocale } from "../../../../lib/i18n/requestLocale";

export default async function CreateContestPage() {
  const locale = resolveRequestLocale();
  const t = await getTranslations({ locale });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 py-4">
      <CreateContestForm />
      <aside className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
        <p>{t("contests.create.notice")}</p>
      </aside>
      <MyCreatedContests />
    </div>
  );
}
