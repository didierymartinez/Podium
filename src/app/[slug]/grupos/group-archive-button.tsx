"use client";

import { Archive, RotateCcw } from "lucide-react";
import { useTransition } from "react";
import { IconButton } from "@/components/ui";
import { setGroupActiveAction } from "./actions";

export function GroupArchiveButton({
  slug,
  groupId,
  active,
  name,
}: {
  slug: string;
  groupId: string;
  active: boolean;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <IconButton
      disabled={pending}
      onClick={() => startTransition(() => void setGroupActiveAction(slug, groupId, !active))}
      title={active ? "Archivar" : "Reactivar"}
      aria-label={active ? `Archivar ${name}` : `Reactivar ${name}`}
    >
      {active ? <Archive className="size-4" /> : <RotateCcw className="size-4" />}
    </IconButton>
  );
}
