import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { safeNext } from "@/lib/safe-next";
import { AuthForm } from "@/modules/auth/components/auth-form";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: PageProps<"/ingresar">) {
  const next = safeNext((await searchParams).next);
  return (
    <Card>
      <h1 className="mb-6 text-2xl font-bold">Ingresa a Podium</h1>
      <AuthForm mode="login" next={next} />
    </Card>
  );
}
