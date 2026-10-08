"use client";

import { Send } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Input, Select } from "@/components/ui";
import { assignAction, replyAction } from "./actions";

export function ReplyBox({ slug, conversationId }: { slug: string; conversationId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await replyAction(slug, conversationId, body);
          setError(r.ok ? null : (r.message ?? "No se pudo enviar."));
          if (r.ok) setBody("");
        });
      }}
    >
      <div className="flex gap-2">
        <Input
          aria-label="Respuesta"
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" disabled={pending || !body.trim()}>
          <Send className="size-4" /> Enviar
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}

export function AssignSelect({
  slug,
  conversationId,
  value,
  staff,
}: {
  slug: string;
  conversationId: string;
  value: string;
  staff: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label="Asignar a"
      className="h-9 w-auto"
      disabled={pending}
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        start(async () => void (await assignAction(slug, conversationId, v || null)));
      }}
    >
      <option value="">Sin asignar</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}
