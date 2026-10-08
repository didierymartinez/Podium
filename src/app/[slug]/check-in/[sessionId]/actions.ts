"use server";

import { refresh } from "next/cache";
import { db } from "@/db/client";
import { asPortalUser } from "@/db/portal";
import { serverEnv } from "@/env";
import { checkIn, validCheckInToken, type CheckInResult } from "@/modules/attendance/check-in";
import { getActionContext } from "../../action-context";

/** Check-in de la familia desde el QR de la clase (DEP-25); nunca se bloquea por la suscripción. */
export async function checkInAction(
  slug: string,
  sessionId: string,
  token: string,
  athleteIds: string[],
): Promise<CheckInResult | { ok: false; error: "forbidden" }> {
  const member = await getActionContext(slug, () => true, { allowReadOnly: true });
  if (!member || !validCheckInToken(serverEnv().SESSION_SECRET, sessionId, token))
    return { ok: false, error: "forbidden" };
  const result = await asPortalUser(member.user.id, () =>
    checkIn(
      db,
      { schoolId: member.school.id, userId: member.user.id, timeZone: member.school.timezone },
      sessionId,
      athleteIds,
      new Date(),
    ),
  );
  if (result.ok) refresh();
  return result;
}
