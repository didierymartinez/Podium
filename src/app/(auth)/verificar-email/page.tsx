import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { VerifyEmail } from "@/modules/auth/components/verify-email";
import { requireUser } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Verifica tu email" };

export default async function VerifyEmailPage() {
  const user = await requireUser();
  if (user.emailVerified) redirect("/escuelas");
  return (
    <Card>
      <h1 className="mb-4 text-2xl font-bold">Verifica tu email</h1>
      <VerifyEmail email={user.email} />
    </Card>
  );
}
