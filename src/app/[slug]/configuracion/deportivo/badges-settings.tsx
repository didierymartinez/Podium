"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Card, SectionTitle } from "@/components/ui";
import { BADGES, BADGE_CODES, type BadgeCode } from "@/modules/badges/labels";
import { updateBadgeSettingsAction } from "./badges-actions";

/** Activar o desactivar cada insignia automática (§10). */
export function BadgesSettings({
  slug,
  canEdit,
  disabled,
}: {
  slug: string;
  canEdit: boolean;
  disabled: BadgeCode[];
}) {
  const [off, setOff] = useState<BadgeCode[]>(disabled);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Card>
      <SectionTitle>Insignias automáticas</SectionTitle>
      <ul className="space-y-2 text-sm" aria-label="Insignias">
        {BADGE_CODES.map((code) => (
          <li key={code}>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                disabled={!canEdit}
                checked={!off.includes(code)}
                onChange={(e) => {
                  setSaved(false);
                  setOff((l) => (e.target.checked ? l.filter((c) => c !== code) : [...l, code]));
                }}
              />
              <span>
                <span className="font-semibold">
                  {BADGES[code].emoji} {BADGES[code].name}
                </span>
                <span className="block text-ink-soft">{BADGES[code].rule}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="mt-3 space-y-2">
          {saved && <Alert tone="info">Insignias actualizadas.</Alert>}
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateBadgeSettingsAction(slug, off);
                setSaved(r.ok);
              })
            }
          >
            Guardar insignias
          </Button>
        </div>
      )}
    </Card>
  );
}
