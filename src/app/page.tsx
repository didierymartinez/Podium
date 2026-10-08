import Link from "next/link";
import { Logo } from "@/components/ui";
import { getCurrentUser } from "@/modules/auth/session";

const FEATURES = [
  {
    title: "Cobros que se hacen solos",
    text: "Mensualidades automáticas, pagos con PSE y Nequi, cartera al día.",
  },
  {
    title: "Asistencia en segundos",
    text: "El profesor toma lista desde el celular, incluso sin señal en la pista.",
  },
  { title: "Progreso que se ve", text: "Niveles, marcas, competencias y logros para alumnos y familias." },
];

export default async function LandingPage() {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-5">
        <Logo className="text-lg" />
        <nav className="flex items-center gap-2 text-sm">
          {user ? (
            <Link href="/escuelas" className="rounded-lg bg-brand px-4 py-2 font-semibold text-white">
              Mis escuelas
            </Link>
          ) : (
            <>
              <Link href="/ingresar" className="px-3 py-2 font-medium text-ink-soft hover:text-ink">
                Ingresar
              </Link>
              <Link href="/registro" className="rounded-lg bg-brand px-4 py-2 font-semibold text-white">
                Crear cuenta
              </Link>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4">
        <section className="py-16 text-center sm:py-24">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand">
            Escuelas de patinaje
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Tu escuela deportiva, organizada: cobros, asistencia y progreso en un solo lugar
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-ink-soft">
            Deja el Excel y los cobros por WhatsApp. Prueba Podium gratis durante 30 días, sin tarjeta.
          </p>
          <Link
            href={user ? "/nueva-escuela" : "/registro"}
            className="mt-8 inline-flex h-12 items-center rounded-xl bg-brand px-6 font-semibold text-white hover:bg-brand-strong"
          >
            Crea tu escuela gratis
          </Link>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-surface p-6">
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-2 text-sm text-ink-soft">{f.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-ink-faint">
        <Link href="/terminos">Términos</Link> · <Link href="/privacidad">Privacidad</Link>
      </footer>
    </div>
  );
}
