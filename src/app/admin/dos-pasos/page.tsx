import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { requireVerifiedUser } from "@/modules/auth/session";
import { TotpEnrollment } from "./totp-enrollment";

export const metadata: Metadata = { title: "Verificación en dos pasos" };

/** Activar el segundo factor (TOTP) que exige la consola de Podium. */
export default async function TwoFactorPage() {
  const user = await requireVerifiedUser();
  if (!user.isPlatformAdmin) redirect("/escuelas");
  return (
    <div className="mx-auto max-w-lg p-4">
      <Card className="space-y-4">
        <h1 className="text-2xl font-bold">Verificación en dos pasos</h1>
        <p className="text-sm text-ink-soft">
          La consola de Podium exige un segundo factor. Agrega Podium a tu app autenticadora (Google
          Authenticator, 1Password, Authy…) y escribe el código para activarlo. Luego cierra sesión e ingresa
          de nuevo.
        </p>
        <TotpEnrollment email={user.email} />
      </Card>
    </div>
  );
}
