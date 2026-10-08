import { ChevronRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PlainShell } from "@/components/top-bar";
import { Avatar, Card, Chip, buttonClass } from "@/components/ui";
import { db } from "@/db/client";
import { requireVerifiedUser } from "@/modules/auth/session";
import { ROLE_LABELS, STATUS_LABELS } from "@/modules/schools/labels";
import { listUserSchools } from "@/modules/schools/queries";

export const metadata: Metadata = { title: "Mis escuelas" };

export default async function SchoolsPage() {
  const user = await requireVerifiedUser();
  const schools = await listUserSchools(db, user.id);

  return (
    <PlainShell userName={user.name}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 pt-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Mis escuelas</h1>
          <p className="mt-1 text-ink-soft">Elige una escuela o crea una nueva.</p>
        </div>
        {schools.length > 0 && (
          <Link href="/nueva-escuela" className={buttonClass("secondary", "h-10")}>
            <Plus className="size-4" /> Crear escuela
          </Link>
        )}
      </div>

      {schools.length === 0 ? (
        <Card className="mx-auto max-w-lg text-center">
          <h2 className="text-xl font-semibold">Aún no tienes escuelas</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Crea tu escuela en menos de un minuto y pruébala gratis durante 30 días. Si te invitaron a una
            escuela, abre el enlace de la invitación.
          </p>
          <Link href="/nueva-escuela" className={buttonClass("primary", "mt-6")}>
            Crear mi escuela
          </Link>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {schools.map((school) => (
            <li key={school.id}>
              <Link href={`/${school.slug}`} className="group block">
                <Card className="flex items-center gap-4 p-5 transition group-hover:ring-2 group-hover:ring-brand/20">
                  <Avatar name={school.name} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{school.name}</p>
                    <p className="truncate text-sm text-ink-soft">
                      {school.city} · {school.roles.map((r) => ROLE_LABELS[r]).join(", ")}
                    </p>
                    <Chip tone={school.status === "ACTIVE" ? "mint" : "brand"} dot className="mt-2">
                      {STATUS_LABELS[school.status]}
                    </Chip>
                  </div>
                  <ChevronRight className="size-5 text-ink-faint transition group-hover:translate-x-0.5" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PlainShell>
  );
}
