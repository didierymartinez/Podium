import { MessageCircle, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess, PageHeader } from "@/components/page-header";
import { Avatar, Card, Chip, buttonClass, cn, inputClass } from "@/components/ui";
import { db } from "@/db/client";
import { displayPhone } from "@/lib/phone";
import { whatsappLink } from "@/lib/whatsapp";
import { listGuardians } from "@/modules/athletes/guardians";
import { canManagePeople } from "@/modules/schools/permissions";
import { PeopleTabs } from "../alumnos/people-tabs";
import { getSchoolContext } from "../data";

export const metadata: Metadata = { title: "Acudientes" };

export default async function GuardiansPage({ params, searchParams }: PageProps<"/[slug]/acudientes">) {
  const { slug } = await params;
  const sp = await searchParams;
  const { school, roles } = await getSchoolContext(slug);
  if (!canManagePeople(roles)) return <NoAccess />;
  const q = typeof sp.q === "string" ? sp.q : "";
  const guardians = await listGuardians(db, school.id, q);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Acudientes"
        subtitle={`${guardians.length} ${guardians.length === 1 ? "acudiente" : "acudientes"}`}
        actions={<PeopleTabs slug={slug} active="guardians" />}
      />

      <Card className="p-4 sm:p-5">
        <form className="flex gap-2.5" action={`/${slug}/acudientes`}>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre o celular"
              className={cn(inputClass, "pl-10")}
              aria-label="Buscar acudientes"
            />
          </div>
          <button type="submit" className={buttonClass("secondary", "h-11")}>
            Buscar
          </button>
        </form>
      </Card>

      {guardians.length === 0 ? (
        <Card className="text-center text-sm text-ink-soft">
          {q ? "No encontramos acudientes con esa búsqueda." : "Los acudientes aparecen al crear alumnos."}
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {guardians.map((g) => {
            const name = `${g.firstName} ${g.lastName}`;
            return (
              <li key={g.id}>
                <Card className="flex h-full items-start gap-3 p-4">
                  <Avatar name={name} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{name}</p>
                    <p className="text-sm text-ink-soft">{displayPhone(g.phone)}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {g.athletes.map((a) => (
                        <Link key={a.id} href={`/${slug}/alumnos/${a.id}`}>
                          <Chip tone={a.isPayer ? "violet" : "neutral"}>
                            {a.name}
                            {a.isPayer && " · paga"}
                          </Chip>
                        </Link>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Chip tone={g.hasAccount ? "mint" : "neutral"} dot>
                      {g.hasAccount ? "Con cuenta" : "Sin invitar"}
                    </Chip>
                    <a
                      href={whatsappLink(g.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="grid size-10 place-items-center rounded-full border border-line bg-surface text-mint shadow-pill"
                      aria-label={`WhatsApp a ${name}`}
                    >
                      <MessageCircle className="size-4" />
                    </a>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
