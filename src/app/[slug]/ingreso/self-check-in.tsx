"use client";

import { useState, useTransition } from "react";
import { Alert, Button } from "@/components/ui";
import { selfCheckInAction } from "../membresias/actions";

export function SelfCheckIn({
  slug,
  token,
  people,
}: {
  slug: string;
  token: string;
  people: { id: string; name: string }[];
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      {people.map((p) => (
        <Button
          key={p.id}
          className="w-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await selfCheckInAction(slug, token, p.id);
              setMsg({ ok: r.ok, text: r.message ?? "" });
            })
          }
        >
          Registrar ingreso de {p.name}
        </Button>
      ))}
      {msg && <Alert tone={msg.ok ? "info" : "danger"}>{msg.text}</Alert>}
    </div>
  );
}
