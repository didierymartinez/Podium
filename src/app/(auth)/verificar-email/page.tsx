import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { safeNext } from "@/lib/safe-next";
import { VerifyEmail } from "@/modules/auth/components/verify-email";
import { requireUser } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Verifica tu email" };

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verificar-email">) {
  const next = safeNext((await searchParams).next);
  const user = await requireUser();
  if (user.emailVerified) redirect(next ?? "/escuelas");
  return (
    <Card>
      <h1 className="mb-4 text-2xl font-bold">Verifica tu email</h1>
      <VerifyEmail email={user.email} next={next} />
    </Card>
  );
}
