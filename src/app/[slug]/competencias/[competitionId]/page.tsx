import { Download, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MedalDot } from "@/components/medal-count";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, Chip, SectionTitle, buttonClass, cn } from "@/components/ui";
import { db } from "@/db/client";
import { runInTenant } from "@/db/rls";
import { todayIn } from "@/lib/dates";
import { formatCOP } from "@/lib/money";
import { candidates, competitionEntriesList, getCompetition } from "@/modules/competitions/competitions";
import { ENTRY_STATUS_LABELS, KIND_LABELS } from "@/modules/competitions/labels";
import { listGroups } from "@/modules/groups/groups";
import { canManagePeople } from "@/modules/schools/permissions";
import { coachGroupIds } from "@/modules/sports/performances";
import { getSchoolContext } from "../../data";
import { InvitePanel, RemoveInvitationButton } from "./invite-panel";
import { ImportResultsForm, ResultEditor } from "./results";

export const metadata: Metadata = { title: "Competencia" };

export default async function CompetitionPage({
  params,
  searchParams,
}: PageProps<"/[slug]/competencias/[competitionId]">) {
  const { slug, competitionId } = await params;
  const query = await searchParams;
  const { school, user, roles } = await getSchoolContext(slug);
  const manager = canManagePeople(roles);
  if (!manager && !roles.includes("COACH")) return <NoAccess />;
  if (!/^[0-9a-f-]{36}$/i.test(competitionId)) notFound();
  const competition = await getCompetition(db, school.id, competitionId);
  if (!competition) notFound();
  const today = todayIn(school.timezone);
  const all = (await listGroups(db, school.id)).filter((g) => g.active);
  const mine = manager
    ? all
    : await runInTenant(db, { schoolId: school.id }, (tx) => coachGroupIds(tx, user.id)).then((ids) =>
        all.filter((g) => ids.includes(g.id)),
      );
  const group = mine.find((g) => g.id === query.grupo) ?? mine[0];
  const open = today <= competition.registrationDeadline;
  const [entries, list] = await Promise.all([
    competitionEntriesList(db, school.id, competitionId),
    open && group ? candidates(db, school.id, competitionId, group.id, today) : [],
  ]);
  const accepted = entries.filter((e) => e.status === "ACCEPTED");
  const base = `/${slug}/competencias/${competitionId}`;

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: `/${slug}/competencias`, label: "Competencias" }}
        title={competition.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Chip>{KIND_LABELS[competition.kind]}</Chip>
            <span>
              {competition.startsOn === competition.endsOn
                ? competition.startsOn
                : `${competition.startsOn} a ${competition.endsOn}`}
            </span>
            {(competition.city || competition.venue) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" />{" "}
                {[competition.venue, competition.city].filter(Boolean).join(", ")}
              </span>
            )}
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-1 text-sm">
          <SectionTitle>Detalles</SectionTitle>
          <p>
            Inscripciones hasta <span className="font-semibold">{competition.registrationDeadline}</span>
            {!open && " (cerradas)"}
          </p>
          <p>Pruebas: {competition.events.join(", ")}</p>
          <p>Inscripción: {formatCOP(competition.entryFee)}</p>
          {competition.extras.map((x) => (
            <p key={x.name}>
              {x.name} (opcional): {formatCOP(x.amount)}
            </p>
          ))}
          {competition.requireNoDebt && <p>Requiere estar al día en pagos.</p>}
          {competition.notes && <p className="text-ink-soft">{competition.notes}</p>}
        </Card>
        <Card className="space-y-2 lg:col-span-2">
          <SectionTitle>Listas</SectionTitle>
          <p className="text-sm text-ink-soft">
            {accepted.length} inscritos · {entries.filter((e) => e.status === "INVITED").length} por responder
            · {entries.filter((e) => e.status === "DECLINED").length} no asisten
          </p>
          <div className="flex flex-wrap gap-2">
            <a href={`${base}/inscritos`} className={buttonClass("secondary", "h-10")}>
              <Download className="size-4" /> Inscritos para la liga
            </a>
            {manager && (
              <a href={`${base}/viaje`} className={buttonClass("secondary", "h-10")}>
                <Download className="size-4" /> Lista de viaje
              </a>
            )}
          </div>
          {manager && (
            <p className="text-xs text-ink-soft">
              La lista de viaje trae contactos de emergencia y datos médicos: descárgala en el celular para
              tenerla sin conexión el día del evento.
            </p>
          )}
        </Card>
      </div>

      {open && (
        <Card>
          <SectionTitle>Convocar</SectionTitle>
          {mine.length === 0 ? (
            <p className="text-sm text-ink-soft">No tienes grupos activos.</p>
          ) : (
            <>
              <nav className="mb-3 flex flex-wrap gap-2" aria-label="Grupos">
                {mine.map((g) => (
                  <Link
                    key={g.id}
                    href={`${base}?grupo=${g.id}`}
                    className={cn(
                      "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold",
                      g.id === group?.id ? "bg-brand text-white" : "bg-muted text-ink-soft",
                    )}
                  >
                    {g.name}
                  </Link>
                ))}
              </nav>
              <InvitePanel
                key={group?.id}
                slug={slug}
                competitionId={competitionId}
                events={competition.events}
                candidates={list.map((c) => ({
                  id: c.id,
                  name: `${c.firstName} ${c.lastName}`,
                  issues: c.issues,
                  invited: c.invited,
                }))}
              />
            </>
          )}
        </Card>
      )}

      <Card>
        <SectionTitle>Convocados</SectionTitle>
        <ul className="divide-y divide-line" aria-label="Convocados">
          {entries.map((e) => (
            <li key={e.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 font-semibold">{e.name}</span>
                <span className="text-sm text-ink-soft">{e.events.join(", ")}</span>
                <Chip tone={ENTRY_STATUS_LABELS[e.status].tone}>{ENTRY_STATUS_LABELS[e.status].label}</Chip>
                {e.status === "INVITED" && (
                  <RemoveInvitationButton slug={slug} entryId={e.id} name={e.name} />
                )}
              </div>
              {e.warnings.length > 0 && (
                <p className="text-xs text-danger">Convocado con observaciones: {e.warnings.join(", ")}</p>
              )}
              {e.status === "ACCEPTED" && (
                <>
                  {e.respondedAt && (
                    <p className="text-xs text-ink-soft">
                      Autorizado el {e.respondedAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                      {e.authorizationIp ? ` desde ${e.authorizationIp}` : ""}
                      {e.extras.length ? ` · Servicios: ${e.extras.join(", ")}` : ""}
                    </p>
                  )}
                  <ul className="flex flex-wrap gap-3 text-sm">
                    {e.results.map((r) => (
                      <li key={r.id} className="inline-flex items-center gap-2">
                        {r.event}: {r.position ? `${r.position}.º` : "—"} {r.mark}
                        {r.medal && <MedalDot medal={r.medal} />}
                      </li>
                    ))}
                  </ul>
                  {today >= competition.startsOn && (
                    <ResultEditor
                      slug={slug}
                      entryId={e.id}
                      name={e.name}
                      events={e.events.length ? e.events : competition.events}
                    />
                  )}
                </>
              )}
            </li>
          ))}
          {entries.length === 0 && <li className="py-2 text-sm text-ink-soft">Aún no hay convocados.</li>}
        </ul>
      </Card>

      {today >= competition.startsOn && accepted.length > 0 && (
        <Card>
          <SectionTitle>Importar resultados</SectionTitle>
          <p className="mb-2 text-sm text-ink-soft">
            Descarga la{" "}
            <a href={`${base}/plantilla-resultados`} className="font-semibold text-brand">
              plantilla de resultados
            </a>
            , llénala con la posición, marca y medalla (Oro, Plata o Bronce) y súbela.
          </p>
          <ImportResultsForm slug={slug} competitionId={competitionId} />
        </Card>
      )}
    </div>
  );
}
