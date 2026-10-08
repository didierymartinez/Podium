"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import { reactivateAction } from "./actions";

export function ReactivateButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      className="mx-auto"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await reactivateAction(slug);
          router.push(`/${slug}/suscripcion`);
        })
      }
    >
      {pending ? "Reactivando…" : "Reactivar y elegir plan"}
    </Button>
  );
}
