import { Chip } from "@/components/ui";
import type { SessionItem } from "@/modules/attendance/sessions";

export function SessionStatusChip({
  session,
  today,
}: {
  session: Pick<SessionItem, "status" | "recorded" | "date" | "cancelReason">;
  today: string;
}) {
  if (session.status === "CANCELED") return <Chip tone="danger">Cancelada</Chip>;
  if (session.recorded > 0)
    return (
      <Chip tone="mint" dot>
        Tomada · {session.recorded}
      </Chip>
    );
  if (session.date <= today)
    return (
      <Chip tone="sun" dot>
        Pendiente
      </Chip>
    );
  return <Chip>Programada</Chip>;
}
