import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { listAllSchools } from "@/lib/db/schools";
import { ProvisionSchoolForm } from "@/components/platform/ProvisionSchoolForm";
import { SchoolServicesForm } from "@/components/platform/SchoolServicesForm";
import { SchoolLinks } from "@/components/admin/SchoolLinks";
import { ExternalLink } from "lucide-react";

/** Platform admin page: provisions new schools and lists every school's share links. */
export default async function PlatformSchoolsPage() {
  try {
    await requirePlatformAdmin();
  } catch (e) {
    if (!(e instanceof Response)) throw e;
    if (e.status === 401) redirect("/auth/login");
    // Don't reveal the page to signed-in users who aren't platform admins.
    notFound();
  }

  const [schools, t, requestHeaders] = await Promise.all([
    listAllSchools(),
    getTranslations("platform.schools"),
    headers(),
  ]);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;

  return (
    <main className="mx-auto max-w-4xl space-y-6 bg-[var(--sg-page)] p-4 text-neutral-950 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-neutral-600">{t("subtitle")}</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("createTitle")}</h2>
        <ProvisionSchoolForm />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("listTitle", { count: schools.length })}</h2>
        {schools.map((school) => (
          <article key={school.id} className="space-y-3 rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">
                {school.name} <span className="text-sm font-normal text-neutral-600" dir="ltr">({school.slug})</span>
              </h3>
              <a
                href={`/${school.accessToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-100"
              >
                <ExternalLink className="size-4" aria-hidden />
                {t("open")}
              </a>
            </div>
            <SchoolLinks accessToken={school.accessToken} origin={origin} />
            <SchoolServicesForm schoolId={school.id} services={school.services} />
          </article>
        ))}
      </section>
    </main>
  );
}
