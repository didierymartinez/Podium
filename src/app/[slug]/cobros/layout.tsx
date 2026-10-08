import { NoAccess } from "@/components/page-header";
import { canManagePeople } from "@/modules/schools/permissions";
import { getSchoolContext } from "../data";
import { BillingTabs } from "./billing-tabs";

export default async function BillingLayout({ children, params }: LayoutProps<"/[slug]/cobros">) {
  const { slug } = await params;
  const { roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1 pt-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Cobros</h1>
          <p className="mt-1 text-ink-soft">Mensualidades, pagos y cartera.</p>
        </div>
        <BillingTabs slug={slug} />
      </div>
      {children}
    </div>
  );
}
