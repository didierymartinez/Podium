import { CalendarCheck, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { Card, Chip, Logo, buttonClass } from "@/components/ui";
import { getCurrentUser } from "@/modules/auth/session";

const FEATURES = [
  {
    icon: Wallet,
    tone: "bg-violet/12 text-violet",
    title: "Cobros que se hacen solos",
    text: "Mensualidades automáticas, pagos con PSE y Nequi, cartera al día.",
  },
  {
    icon: CalendarCheck,
    tone: "bg-brand/12 text-brand",
    title: "Asistencia en segundos",
    text: "El profesor toma lista desde el celular, incluso sin señal en la pista.",
  },
  {
    icon: TrendingUp,
    tone: "bg-mint/14 text-mint",
    title: "Progreso que se ve",
    text: "Niveles, marcas, competencias y logros para alumnos y familias.",
  },
];

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col bg-[radial-gradient(70rem_36rem_at_50%_-10%,rgb(47_107_255/0.16),transparent)]">
      <header className="mx-auto mt-3 flex w-[calc(100%-1.5rem)] max-w-5xl items-center justify-between rounded-full border border-white/70 bg-glass px-3 py-2 shadow-soft backdrop-blur dark:border-line">
        <Logo className="pl-1 text-lg" />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/escuelas" className={buttonClass("primary", "h-10")}>
              Mis escuelas
            </Link>
          ) : (
            <>
              <Link href="/ingresar" className={buttonClass("ghost", "h-10")}>
                Ingresar
              </Link>
              <Link href="/registro" className={buttonClass("primary", "h-10")}>
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <section className="py-16 text-center sm:py-24">
          <Chip tone="brand" dot>
            Escuelas de patinaje
          </Chip>
          <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Tu escuela deportiva, organizada
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-ink-soft">
            Cobros, asistencia y progreso en un solo lugar. Deja el Excel y los cobros por WhatsApp: prueba
            Podium gratis 30 días, sin tarjeta.
          </p>
          <Link
            href={user ? "/nueva-escuela" : "/registro"}
            className={buttonClass("primary", "mt-8 h-12 px-7 text-base")}
          >
            Crea tu escuela gratis
          </Link>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <span className={`grid size-11 place-items-center rounded-full ${f.tone}`}>
                <f.icon className="size-5" />
              </span>
              <h2 className="mt-4 font-semibold">{f.title}</h2>
              <p className="mt-1.5 text-sm text-ink-soft">{f.text}</p>
            </Card>
          ))}
        </section>
      </main>

      <footer className="py-6 text-center text-xs text-ink-faint">
        <Link href="/terminos">Términos</Link> · <Link href="/privacidad">Privacidad</Link>
      </footer>
    </div>
  );
}
