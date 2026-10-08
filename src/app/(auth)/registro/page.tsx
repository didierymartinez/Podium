import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { AuthForm } from "@/modules/auth/components/auth-form";

export const metadata: Metadata = { title: "Crea tu cuenta" };

export default function SignupPage() {
  return (
    <Card>
      <h1 className="text-2xl font-bold">Crea tu cuenta</h1>
      <p className="mb-6 mt-1 text-sm text-ink-soft">
        Luego creas tu escuela y la pruebas gratis durante 30 días, sin tarjeta.
      </p>
      <AuthForm mode="signup" />
    </Card>
  );
}
