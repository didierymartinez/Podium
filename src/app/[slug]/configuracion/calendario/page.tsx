import type { Metadata } from "next";
import { db } from "@/db/client";
import { addDays, todayIn } from "@/lib/dates";
import { holidaysBetween } from "@/lib/holidays-co";
import { closureOn, listClosures } from "@/modules/calendar/closures";
import { canManageSettings } from "@/modules/schools/permissions";
import { getSchoolContext } from "../../data";
import { readAttendancePolicy } from "@/modules/attendance/alerts";
import { AttendancePolicyCard } from "./attendance-policy-card";
import { ClosuresCard, HolidaysCard } from "./calendar-cards";

export const metadata: Metadata = { title: "Calendario" };

export default async function CalendarSettingsPage({
  params,
}: PageProps<"/[slug]/configuracion/calendario">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  const canEdit = canManageSettings(roles);
  const today = todayIn(school.timezone);
  const until = addDays(today, 365);
  const closures = await listClosures(db, school.id, addDays(today, -60));
  const holidays = [...holidaysBetween(today, until)].map(([date, name]) => ({
    date,
    name,
    closed: Boolean(closureOn(date, closures)),
  }));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-4">
        <ClosuresCard slug={slug} canEdit={canEdit} closures={closures} today={today} />
        <AttendancePolicyCard
          slug={slug}
          canEdit={canEdit}
          policy={readAttendancePolicy(school.settings.attendance)}
        />
      </div>
      <HolidaysCard slug={slug} canEdit={canEdit} holidays={holidays} />
    </div>
  );
}
