import type { Metadata } from "next";
import { PlainShell } from "@/components/top-bar";
import { Card, Chip } from "@/components/ui";
import { requireVerifiedUser } from "@/modules/auth/session";
import { CreateSchoolForm } from "./create-school-form";

export const metadata: Metadata = { title: "Crea tu escuela" };

export default async function NewSchoolPage() {
  const user = await requireVerifiedUser();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "podium.app").replace(/^https?:\/\//, "");

  return (
    <PlainShell userName={user.name}>
      <div className="mx-auto max-w-xl pt-2">
        <Chip tone="mint" dot>
          30 días gratis · sin tarjeta
        </Chip>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Crea tu escuela</h1>
        <p className="mb-6 mt-1 text-ink-soft">
          Cargamos niveles y categorías de patinaje que podrás ajustar después.
        </p>
        <Card>
          <CreateSchoolForm baseUrl={baseUrl} />
        </Card>
      </div>
    </PlainShell>
  );
}
