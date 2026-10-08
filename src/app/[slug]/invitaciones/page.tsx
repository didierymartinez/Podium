import type { Metadata } from "next";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Card, Chip, SectionTitle, Tile } from "@/components/ui";
import { db } from "@/db/client";
import { listGuardians } from "@/modules/athletes/guardians";
import { invitationStates, listInvitations } from "@/modules/invitations/invitations";
import { INVITATION_ROLE_LABELS, listNames } from "@/modules/invitations/message";
import { canManagePeople } from "@/modules/schools/permissions";
import { PeopleTabs } from "../alumnos/people-tabs";
import { getSchoolContext } from "../data";
import { CancelInvitationButton } from "./cancel-button";
import { SerialSender } from "./serial-sender";

export const metadata: Metadata = { title: "Invitaciones" };

const dateTime = (d: Date | null) =>
  d
    ? d.toLocaleString("es-CO", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Bogota",
      })
    : "—";

export default async function InvitationsPage({ params }: PageProps<"/[slug]/invitaciones">) {
  const { slug } = await params;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;

  const [guardians, invitations] = await Promise.all([
    listGuardians(db, school.id),
    listInvitations(db, school.id),
  ]);
  const states = await invitationStates(db, school.id, "GUARDIAN", guardians);
  const withAccount = guardians.filter((g) => g.hasAccount).length;
  const pct = guardians.length ? Math.round((withAccount / guardians.length) * 100) : 0;
  const pending = guardians
    .filter((g) => !g.hasAccount)
    .map((g) => ({
      id: g.id,
      name: `${g.firstName} ${g.lastName}`,
      phone: g.phone,
      athletes: listNames(g.athletes.map((a) => a.name.split(" ")[0])),
      state: states.get(g.id) ?? "none",
    }))
    // Primero quienes nunca han sido invitados o tienen el link vencido.
    .sort(
      (a, b) => Number(["sent", "opened"].includes(a.state)) - Number(["sent", "opened"].includes(b.state)),
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Invitaciones"
        subtitle="Invita a las familias para que vean clases, asistencia y pagos desde su celular."
        actions={<PeopleTabs slug={slug} active="invitations" />}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <SectionTitle>Familias con cuenta</SectionTitle>
          <p className="text-4xl font-semibold tracking-tight">
            {withAccount} <span className="text-lg font-medium text-ink-soft">de {guardians.length}</span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-mint" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-sm text-ink-soft">{pct} % de los acudientes ya activaron su cuenta.</p>
        </Card>

        <Card>
          <SectionTitle action={<Chip tone="violet">WhatsApp</Chip>}>
            Enviar invitaciones en serie
          </SectionTitle>
          <p className="-mt-2 mb-4 text-sm text-ink-soft">
            Se abre el chat de cada acudiente con el mensaje y su link listos; tú solo tocas “Enviar” y
            vuelves por el siguiente.
          </p>
          <SerialSender slug={slug} people={pending} />
        </Card>
      </div>

      <Card>
        <SectionTitle>Historial</SectionTitle>
        {invitations.length === 0 ? (
          <Tile className="text-center text-sm text-ink-soft">Aún no has enviado invitaciones.</Tile>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="px-2 py-2 font-semibold">Persona</th>
                  <th className="px-2 py-2 font-semibold">Estado</th>
                  <th className="px-2 py-2 font-semibold">Enviada</th>
                  <th className="px-2 py-2 font-semibold">Abierta</th>
                  <th className="px-2 py-2 font-semibold">Aceptada</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invitations.map((i) => (
                  <tr key={i.id}>
                    <td className="px-2 py-2.5">
                      <span className="font-semibold">{i.name}</span>{" "}
                      <span className="text-ink-soft">· {INVITATION_ROLE_LABELS[i.role]}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      {i.status === "ACCEPTED" ? (
                        <Chip tone="mint" dot>
                          Aceptada
                        </Chip>
                      ) : i.status === "CANCELED" ? (
                        <Chip>Reemplazada o cancelada</Chip>
                      ) : i.expired ? (
                        <Chip tone="danger" dot>
                          Vencida
                        </Chip>
                      ) : (
                        <Chip tone={i.openedAt ? "brand" : "violet"} dot>
                          {i.openedAt ? "Abierta" : "Enviada"}
                        </Chip>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-ink-soft">{dateTime(i.sentAt)}</td>
                    <td className="px-2 py-2.5 text-ink-soft">{dateTime(i.openedAt)}</td>
                    <td className="px-2 py-2.5 text-ink-soft">{dateTime(i.acceptedAt)}</td>
                    <td className="px-2 py-2.5 text-right">
                      {i.status === "PENDING" && !i.expired && (
                        <CancelInvitationButton slug={slug} invitationId={i.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
