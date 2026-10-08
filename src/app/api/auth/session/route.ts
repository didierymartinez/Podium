import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { serverEnv } from "@/env";
import { normalizeColombianMobile } from "@/lib/phone";
import { verifyFirebaseIdToken } from "@/modules/auth/firebase-token";
import { endSession, startSession } from "@/modules/auth/session";
import { signIn, type Identity } from "@/modules/auth/users";

const common = {
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  acceptTerms: z.boolean().default(false),
};

const bodySchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("firebase"), idToken: z.string().min(1), ...common }),
  z.object({ provider: z.literal("dev"), email: z.email(), ...common }),
]);

const ERRORS = {
  terms_required: "Para crear tu cuenta debes aceptar los términos y la política de datos.",
  email_in_use: "Ya existe una cuenta con ese email. Ingresa con el método que usaste antes.",
} as const;

function devAuthAllowed() {
  const env = serverEnv();
  return (
    env.NEXT_PUBLIC_AUTH_PROVIDER === "dev" &&
    (process.env.NODE_ENV !== "production" || env.ALLOW_DEV_AUTH === "true")
  );
}

/** Crea la sesión de Podium a partir de una identidad verificada (Firebase o modo dev). */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request", message: "Datos inválidos" }, { status: 400 });
  }
  const body = parsed.data;

  let identity: Identity;
  if (body.provider === "firebase") {
    const projectId = serverEnv().NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json(
        { error: "misconfigured", message: "Firebase no está configurado" },
        { status: 500 },
      );
    }
    try {
      const verified = await verifyFirebaseIdToken(body.idToken, projectId);
      identity = { ...verified, name: verified.name ?? body.name ?? "", phone: null };
    } catch {
      return NextResponse.json(
        { error: "invalid_token", message: "Sesión inválida, ingresa de nuevo" },
        { status: 401 },
      );
    }
  } else {
    if (!devAuthAllowed()) {
      return NextResponse.json({ error: "forbidden", message: "Modo dev deshabilitado" }, { status: 403 });
    }
    identity = {
      firebaseUid: null,
      email: body.email.toLowerCase(),
      emailVerified: true,
      name: body.name ?? "",
      phone: null,
    };
  }

  identity.name ||= identity.email.split("@")[0];
  if (body.phone) {
    identity.phone = normalizeColombianMobile(body.phone);
    if (!identity.phone) {
      return NextResponse.json(
        { error: "invalid_phone", message: "El celular no es válido" },
        { status: 400 },
      );
    }
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const result = await signIn(db, identity, { acceptTerms: body.acceptTerms, ip });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: ERRORS[result.error] }, { status: 409 });
  }

  await startSession(result.user.id);
  const redirectTo = result.user.emailVerifiedAt ? "/escuelas" : "/verificar-email";
  return NextResponse.json({ redirectTo });
}

export async function DELETE() {
  await endSession();
  return new NextResponse(null, { status: 204 });
}
