"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconButton } from "@/components/ui";
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
    <IconButton onClick={logout} disabled={pending} title="Salir" aria-label="Salir">
      <LogOut className="size-4" />
    </IconButton>
  );
}
