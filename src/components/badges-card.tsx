import { BADGES, type BadgeCode } from "@/modules/badges/labels";
import { Card, SectionTitle } from "./ui";

/** Insignias ganadas por el alumno (§10). */
export function BadgesCard({
  title = "Insignias",
  badges,
}: {
  title?: string;
  badges: { id: string; badge: BadgeCode; label: string; awardedOn: string }[];
}) {
  return (
    <Card aria-label={title}>
      <SectionTitle>{title}</SectionTitle>
      {badges.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Aún no tiene insignias. ¡Las primeras llegan con la asistencia!
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {badges.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-2 rounded-2xl bg-canvas px-3 py-2 text-sm"
              title={`${BADGES[b.badge].name} · ${b.awardedOn}`}
            >
              <span className="text-xl" aria-hidden>
                {BADGES[b.badge].emoji}
              </span>
              <span>
                <span className="block font-semibold">{b.label}</span>
                <span className="text-xs text-ink-soft">{b.awardedOn}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
