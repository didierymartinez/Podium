"use client";

import { X } from "lucide-react";
import { useTransition } from "react";
import { IconButton } from "@/components/ui";
import { cancelInvitationAction } from "./actions";

export function CancelInvitationButton({ slug, invitationId }: { slug: string; invitationId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <IconButton
      disabled={pending}
      title="Cancelar invitación"
      aria-label="Cancelar invitación"
      onClick={() => startTransition(() => void cancelInvitationAction(slug, invitationId))}
    >
      <X className="size-4" />
    </IconButton>
  );
}
