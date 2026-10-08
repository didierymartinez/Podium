import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { AuthForm } from "@/modules/auth/components/auth-form";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <Card>
      <h1 className="mb-6 text-2xl font-bold">Ingresa a Podium</h1>
      <AuthForm mode="login" />
    </Card>
  );
}
