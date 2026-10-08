import "server-only";
import { db } from "@/db/client";
import { todayIn } from "@/lib/dates";
import { listFeePlans } from "@/modules/billing/fee-plans";
import { listGroups } from "@/modules/groups/groups";
import type { EnrollmentOptions } from "./enrollment-fields";

export async function loadEnrollmentOptions(school: {
  id: string;
  timezone: string;
}): Promise<EnrollmentOptions> {
  const [groups, plans] = await Promise.all([listGroups(db, school.id), listFeePlans(db, school.id)]);
  return {
    groups: groups
      .filter((g) => g.active)
      .map(({ id, name, capacity, enrolled, defaultFeePlanId }) => ({
        id,
        name,
        capacity,
        enrolled,
        defaultFeePlanId,
      })),
    feePlans: plans
      .filter((p) => p.active)
      .map(({ id, name, monthlyAmount }) => ({ id, name, monthlyAmount })),
    today: todayIn(school.timezone),
  };
}
