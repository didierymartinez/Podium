import { Plus } from "lucide-react";
import Link from "next/link";
import { BottomNav, SideRail, TopTabs } from "@/components/school-nav";
import { InstallPrompt, SyncAgent } from "@/components/pwa";
import { TopBar } from "@/components/top-bar";
import { Chip, LogoMark, buttonClass } from "@/components/ui";
import { canManagePeople, canManageSettings, canManageSubscription } from "@/modules/schools/permissions";
import { db } from "@/db/client";
import { fileHref } from "@/modules/files/files";
import { unreadCount } from "@/modules/notifications/notify";
import { trialDaysLeft } from "@/modules/schools/trial";
import { getSchoolContext } from "./data";
import { SchoolBlocked, SubscriptionBanner } from "./subscription-banner";
import { SupportBanner } from "@/app/admin/support-banner";

export default async function SchoolLayout({ children, params }: LayoutProps<"/[slug]">) {
  const { slug } = await params;
  const { user, school, roles, support } = await getSchoolContext(slug);
  const unread = await unreadCount(db, school.id, user.id);
  const access = {
    manager: canManagePeople(roles),
    admin: canManageSettings(roles),
    coach: roles.includes("COACH"),
    family: roles.includes("GUARDIAN"),
    gym: school.type === "GYM",
  };
  const isOwner = canManageSubscription(roles);
  const daysLeft =
    access.manager && school.status === "TRIAL" && school.trialEndsAt
      ? trialDaysLeft(school.trialEndsAt, new Date())
      : null;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-1 gap-3 p-3 sm:p-4">
      <SideRail slug={school.slug} logo={<LogoMark className="size-10" />} access={access} />
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <TopBar
          userName={user.name}
          notifications={{ href: `/${school.slug}/notificaciones`, unread }}
          actions={
            access.manager && (
              <span className="hidden sm:block">
                <Link href={`/${school.slug}/alumnos/nuevo`} className={buttonClass("secondary", "h-10")}>
                  <Plus className="size-4" /> Agregar alumno
                </Link>
              </span>
            )
          }
        >
          <div className="shrink-0 md:hidden">
            <LogoMark />
          </div>
          {school.logoFileId && (
            // eslint-disable-next-line @next/next/no-img-element -- URL firmada temporal
            <img
              src={fileHref(school.slug, school.logoFileId)}
              alt=""
              className="hidden size-9 shrink-0 rounded-xl object-contain sm:block"
            />
          )}
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
              <Link href={`/${school.slug}/suscripcion`}>
                <Chip tone="sun" dot>
                  Elige un plan
                </Chip>
              </Link>
            )}
          </div>
          <div className="ml-auto">
            <TopTabs slug={school.slug} access={access} />
          </div>
        </TopBar>
        <main className="flex-1 space-y-4 pb-24 md:pb-6">
          {support && <SupportBanner schoolId={school.id} reason={support.reason} />}
          <InstallPrompt />
          {access.manager && (
            <SubscriptionBanner slug={school.slug} status={school.status} isOwner={isOwner} />
          )}
          <div>
            {school.suspendedAt ? (
              <SchoolBlocked
                slug={school.slug}
                kind="suspended"
                isOwner={isOwner}
                reason={school.suspendedReason}
              />
            ) : school.status === "CANCELED" ? (
              <SchoolBlocked slug={school.slug} kind="canceled" isOwner={isOwner} />
            ) : (
              children
            )}
          </div>
        </main>
        <SyncAgent />
      </div>
      <BottomNav slug={school.slug} access={access} />
    </div>
  );
}
