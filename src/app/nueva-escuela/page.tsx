import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui";
import { requireVerifiedUser } from "@/modules/auth/session";
import { CreateSchoolForm } from "./create-school-form";

export const metadata: Metadata = { title: "Crea tu escuela" };

export default async function NewSchoolPage() {
  const user = await requireVerifiedUser();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "podium.app").replace(/^https?:\/\//, "");

  return (
    <>
      <AppHeader userName={user.name} />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-8">
        <Card>
          <h1 className="text-2xl font-bold">Crea tu escuela</h1>
          <p className="mb-6 mt-1 text-sm text-ink-soft">
            30 días gratis con todas las funciones. Cargamos niveles y categorías de patinaje que podrás
            ajustar.
          </p>
          <CreateSchoolForm baseUrl={baseUrl} />
        </Card>
      </main>
    </>
  );
}
