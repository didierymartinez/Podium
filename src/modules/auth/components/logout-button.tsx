"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { firebaseAuth } from "@/lib/firebase-client";
import { publicEnv } from "@/lib/public-env";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    if (publicEnv.authProvider === "firebase") {
      const { signOut } = await import("firebase/auth");
      await signOut(firebaseAuth()).catch(() => {});
    }
    await fetch("/api/auth/session", { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  return (
    <Button variant="ghost" className="h-9" onClick={logout} disabled={pending}>
      Salir
    </Button>
  );
}
