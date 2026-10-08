"use client";

import { MapPin } from "lucide-react";
import { useState, useTransition } from "react";
import { Alert, Button, Card, Chip, Field, Input, SectionTitle } from "@/components/ui";
import { saveVenueAction, setVenueActiveAction } from "./actions";

type Venue = { id: string; name: string; address: string; mapUrl: string; active: boolean; groups: number };

export function VenuesCard({ slug, canEdit, venues }: { slug: string; canEdit: boolean; venues: Venue[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <SectionTitle>Sedes</SectionTitle>
        <ul className="divide-y divide-line" aria-label="Sedes">
          {venues.map((v) => (
            <li key={v.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <MapPin className="size-4 text-ink-soft" />
                <span className="flex-1 font-semibold">{v.name}</span>
                {!v.active && <Chip>Archivada</Chip>}
                <span className="text-sm text-ink-soft">
                  {v.groups} {v.groups === 1 ? "grupo" : "grupos"}
                </span>
                {canEdit && (
                  <>
                    <Button
                      variant="ghost"
                      className="h-8"
                      onClick={() => setEditing(editing === v.id ? null : v.id)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-8"
                      disabled={pending}
                      aria-label={`${v.active ? "Archivar" : "Activar"} ${v.name}`}
                      onClick={() =>
                        start(async () => {
                          const r = await setVenueActiveAction(slug, v.id, !v.active);
                          setMessage(r.ok ? null : { tone: "danger", text: r.message ?? "No se pudo." });
                        })
                      }
                    >
                      {v.active ? "Archivar" : "Activar"}
                    </Button>
                  </>
                )}
              </div>
              {(v.address || v.mapUrl) && (
                <p className="text-sm text-ink-soft">
                  {v.address}
                  {v.mapUrl && (
                    <>
                      {" "}
                      <a
                        href={v.mapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-brand"
                      >
                        Ver mapa
                      </a>
                    </>
                  )}
                </p>
              )}
              {editing === v.id && (
                <VenueForm
                  initial={v}
                  pending={pending}
                  submitLabel="Guardar sede"
                  onSave={(input) =>
                    start(async () => {
                      const r = await saveVenueAction(slug, input, v.id);
                      setMessage(
                        r.ok
                          ? { tone: "info", text: "Sede actualizada." }
                          : { tone: "danger", text: r.message ?? "No se pudo." },
                      );
                      if (r.ok) setEditing(null);
                    })
                  }
                />
              )}
            </li>
          ))}
        </ul>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </Card>
      {canEdit && (
        <Card>
          <SectionTitle>Nueva sede</SectionTitle>
          <VenueForm
            initial={{ name: "", address: "", mapUrl: "" }}
            pending={pending}
            submitLabel="Crear sede"
            onSave={(input) =>
              start(async () => {
                const r = await saveVenueAction(slug, input);
                setMessage(
                  r.ok
                    ? { tone: "info", text: "Sede creada." }
                    : { tone: "danger", text: r.message ?? "No se pudo." },
                );
              })
            }
          />
        </Card>
      )}
    </div>
  );
}

function VenueForm({
  initial,
  pending,
  submitLabel,
  onSave,
}: {
  initial: { name: string; address: string; mapUrl: string };
  pending: boolean;
  submitLabel: string;
  onSave: (input: { name: string; address: string; mapUrl: string }) => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <Field label="Nombre de la sede">
        <Input
          value={v.name}
          maxLength={80}
          onChange={(e) => setV((s) => ({ ...s, name: e.target.value }))}
        />
      </Field>
      <Field label="Dirección">
        <Input
          value={v.address}
          maxLength={160}
          onChange={(e) => setV((s) => ({ ...s, address: e.target.value }))}
        />
      </Field>
      <Field label="Enlace del mapa" hint="Opcional: Google Maps u otro (https://…)">
        <Input
          value={v.mapUrl}
          maxLength={300}
          onChange={(e) => setV((s) => ({ ...s, mapUrl: e.target.value }))}
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
