import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { requireUser } from "@/modules/auth/session";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Actualizamos los términos" };

/** Nueva versión de términos y política de datos (#22): se pide aceptarla antes de seguir. */
export default async function AcceptTermsPage() {
  const user = await requireUser();
  if (user.legalCurrent) redirect("/escuelas");
  return (
    <Card className="space-y-4">
      <h1 className="text-2xl font-bold">Actualizamos nuestros términos</h1>
      <p className="text-sm text-ink-soft">
        Para seguir usando Podium revisa los{" "}
        <Link href="/terminos" className="font-semibold text-brand underline">
          términos del servicio
        </Link>{" "}
        y la{" "}
        <Link href="/privacidad" className="font-semibold text-brand underline">
          política de tratamiento de datos
        </Link>
        .
      </p>
      <AcceptForm />
    </Card>
  );
}
