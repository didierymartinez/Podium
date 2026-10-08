import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card } from "@/components/ui";
import { safeNext } from "@/lib/safe-next";
import { AuthForm } from "@/modules/auth/components/auth-form";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: PageProps<"/ingresar">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  return (
    <Card>
      <h1 className="mb-6 text-2xl font-bold">Ingresa a Podium</h1>
      {sp.mfa === "1" && (
        <div className="mb-4">
          <Alert tone="info">
            La consola de Podium exige verificación en dos pasos. Ingresa de nuevo con tu código; si aún no la
            activaste, hazlo en{" "}
            <Link href="/admin/dos-pasos" className="font-semibold underline">
              verificación en dos pasos
            </Link>
            .
          </Alert>
        </div>
      )}
      <AuthForm mode="login" next={next} />
    </Card>
  );
}
