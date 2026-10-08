import { Plus } from "lucide-react";
import { BottomNav, SideRail, TopTabs } from "@/components/school-nav";
import { TopBar } from "@/components/top-bar";
import { Chip, LogoMark, buttonClass } from "@/components/ui";
import { trialDaysLeft } from "@/modules/schools/trial";
import { getSchoolContext } from "./data";

export default async function SchoolLayout({ children, params }: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  const { user, school } = await getSchoolContext(slug);
  const daysLeft =
    school.status === "TRIAL" && school.trialEndsAt ? trialDaysLeft(school.trialEndsAt, new Date()) : null;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-3 p-3 sm:p-4">
      <SideRail slug={school.slug} logo={<LogoMark className="size-10" />} />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <TopBar
          userName={user.name}
          actions={
            <span className="hidden sm:block">
              <span
                className={buttonClass("secondary", "h-10 cursor-not-allowed opacity-60")}
                title="Próximamente"
                aria-disabled
              >
                <Plus className="size-4" /> Agregar alumno
              </span>
            </span>
          }
        >
          <div className="shrink-0 md:hidden">
            <LogoMark />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">{school.name}</p>
            {daysLeft !== null && (
              <p className="text-xs text-ink-soft">
                {daysLeft > 0
                  ? `Prueba gratis · ${daysLeft} ${daysLeft === 1 ? "día" : "días"}`
                  : "Prueba terminada"}
              </p>
            )}
          </div>
          <div className="hidden xl:block">
            {daysLeft !== null && daysLeft <= 7 && (
              <Chip tone="sun" dot>
                Elige un plan
              </Chip>
            )}
          </div>
          <div className="ml-auto">
            <TopTabs slug={school.slug} />
          </div>
        </TopBar>
        <main className="flex-1 pb-24 md:pb-6">{children}</main>
      </div>
      <BottomNav slug={school.slug} />
    </div>
  );
}
