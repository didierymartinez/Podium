"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { setCoachActiveAction } from "./actions";

export function CoachActiveButton({
  slug,
  coachId,
  active,
}: {
  slug: string;
  coachId: string;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      className="h-10"
      disabled={pending}
      onClick={() => startTransition(() => void setCoachActiveAction(slug, coachId, !active))}
    >
      {active ? "Marcar como inactivo" : "Reactivar"}
    </Button>
  );
}
