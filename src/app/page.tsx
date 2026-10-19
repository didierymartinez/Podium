import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarCheck,
  ChartColumn,
  Check,
  HeartHandshake,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  WifiOff,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LogoMark, cn } from "@/components/ui";
import { formatCOP } from "@/lib/money";
import { getCurrentUser } from "@/modules/auth/session";
import { ANNUAL_MONTHS, PLANS, whatsappQuota } from "@/modules/subscription/plans";
import { Segments } from "./_landing/segments";

export const metadata: Metadata = {
  title: "Podium · Software para escuelas deportivas y gimnasios",
  description:
    "Cobros automáticos, asistencia desde el celular, avisos a las familias y seguimiento deportivo. Prueba Podium gratis 30 días.",
};

const NAV = [
  { href: "#que-es", label: "Qué es" },
  { href: "#beneficios", label: "Beneficios" },
  { href: "#para-quien", label: "Para quién" },
  { href: "#precios", label: "Precios" },
  { href: "#preguntas", label: "Preguntas" },
];

const BENEFITS = [
  { icon: Wallet, title: "Cobros automáticos", text: "Mensualidades el día de corte, recordatorios y pagos con PSE, Nequi o tarjeta." },
  { icon: CalendarCheck, title: "Asistencia en dos toques", text: "El profesor toma lista desde el celular, incluso sin señal en la pista." },
  { icon: Users, title: "Familias informadas", text: "Cada familia ve horarios, asistencia, pagos y avisos en su propia app." },
  { icon: Trophy, title: "Seguimiento deportivo", text: "Niveles, marcas, evaluaciones, competencias e insignias por alumno." },
  { icon: ChartColumn, title: "Números claros", text: "Recaudo, cartera vencida, retención y ocupación de cada grupo." },
  { icon: MessageCircle, title: "Comunicación sin caos", text: "Avisos por grupo o a deudores por la app, WhatsApp o correo." },
];

const FAQ = [
  {
    q: "¿Necesito instalar algo?",
    a: "No. Podium funciona en el navegador y se instala en el celular como una app desde el mismo link, sin pasar por tiendas.",
  },
  {
    q: "¿Cuánto tiempo toma empezar?",
    a: "Creas tu escuela en minutos, importas tus alumnos desde Excel e invitas a profesores y familias por WhatsApp. La prueba de 30 días es gratis y sin tarjeta.",
  },
  {
    q: "¿Cómo pagan las familias?",
    a: "En línea con PSE, Nequi o tarjeta conectando tu cuenta de Wompi, o reportando su transferencia con el comprobante para que la apruebes.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Los datos de cada escuela están aislados de las demás, la información de salud va cifrada y cumplimos la Ley 1581 de 2012. Puedes exportar todo cuando quieras.",
  },
  {
    q: "¿Sirve para mi deporte?",
    a: "Hoy trae plantillas para patinaje, natación y gimnasios o entrenamiento personal. La parte administrativa sirve para cualquier escuela deportiva.",
  },
];

function SectionLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">
      ({n}) {children}
    </p>
  );
}

function Phone({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={cn("rounded-[2rem] bg-[#0b1020] p-1.5 shadow-2xl ring-1 ring-white/10", className)}>
      <div className="overflow-hidden rounded-[1.6rem] bg-[#e8ebf1]">
        <Image unoptimized src={src} alt={alt} width={520} height={1125} className="h-auto w-full" />
      </div>
    </div>
  );
}

/** Fondo de la portada: pista ovalada de patinaje con carriles (SVG, sin fotos de terceros). */
function TrackBackdrop() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.22]"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect
          key={i}
          x={140 - i * 34}
          y={170 - i * 34}
          width={920 + i * 68}
          height={460 + i * 68}
          rx={230 + i * 34}
          fill="none"
          stroke="#9fb7ff"
          strokeWidth={i === 0 ? 2.5 : 1.2}
          strokeDasharray={i % 2 ? "10 14" : undefined}
        />
      ))}
    </svg>
  );
}

export default async function LandingPage() {
  const user = await getCurrentUser();
  const start = user ? "/nueva-escuela" : "/registro";

  return (
    <div className="flex flex-1 flex-col bg-canvas">
      {/* Portada */}
      <section className="relative isolate overflow-hidden bg-[#070d1f] text-white">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60rem_40rem_at_75%_10%,rgb(47_107_255/0.55),transparent),radial-gradient(40rem_30rem_at_10%_90%,rgb(124_92_255/0.35),transparent)]" />
        <TrackBackdrop />
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold">
            <LogoMark /> Podium
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-white/75 md:flex" aria-label="Secciones">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-white">
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link
                href="/escuelas"
                className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-[#070d1f]"
              >
                Mis escuelas
              </Link>
            ) : (
              <>
                <Link href="/ingresar" className="hidden h-10 items-center px-3 text-sm font-semibold text-white/85 hover:text-white sm:inline-flex">
                  Ingresar
                </Link>
                <Link
                  href="/registro"
                  className="inline-flex h-10 items-center rounded-full bg-white px-4 text-sm font-semibold text-[#070d1f]"
                >
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl items-end gap-12 px-4 pb-16 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
              <span className="size-1.5 rounded-full bg-[#fcd34d]" /> Software para escuelas deportivas
            </p>
            <h1 className="mt-6 text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
              Tu escuela, <em className="whitespace-nowrap font-extrabold italic text-[#fcd34d]">al día.</em>
              <br />
              Tú, en la pista.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-white/75">
              Cobros, asistencia, avisos a las familias y progreso de cada deportista en una sola app. Menos Excel
              y menos perseguir pagos por WhatsApp.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={start}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[#fcd34d] px-6 text-base font-semibold text-[#070d1f] shadow-lg shadow-black/20 hover:bg-[#fde68a]"
              >
                Prueba gratis 30 días <ArrowUpRight className="size-4" />
              </Link>
              <a
                href="#que-es"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/25 px-6 text-base font-semibold text-white hover:bg-white/10"
              >
                Ver cómo funciona
              </a>
            </div>
            <p className="mt-4 text-sm text-white/55">Sin tarjeta · Hecho en Colombia · Patinaje, natación y gimnasios</p>
          </div>
          <div className="relative">
            <div className="overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/15">
              <Image unoptimized
                src="/landing/inicio.webp"
                alt="Tablero de Podium con recaudo, cartera y clases de la semana"
                width={1600}
                height={1000}
                priority
                className="h-auto w-full"
              />
            </div>
            <Phone
              src="/landing/celular-familia.webp"
              alt="App de la familia con avisos, próximo pago y clases"
              className="absolute -bottom-10 left-2 w-[30%] min-w-[110px] sm:-left-10"
            />
          </div>
        </div>
      </section>

      <main className="flex-1">
        {/* 1. Qué es */}
        <section id="que-es" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-20 pt-24">
          <SectionLabel n={1}>Qué es Podium</SectionLabel>
          <h2 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Administra tu escuela con <em className="font-extrabold italic text-brand">orden</em> y dedica tu
            tiempo a lo que importa: tus deportistas.
          </h2>
          <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
            <div className="space-y-8">
              <p className="text-lg text-ink-soft">
                <strong className="text-ink">Podium</strong> reúne en una sola app lo que hoy está repartido entre
                un Excel, un cuaderno de asistencia y decenas de chats: matrículas, mensualidades, pagos, horarios,
                asistencia, avisos y el progreso deportivo de cada alumno.
              </p>
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <span className="grid size-10 place-items-center rounded-xl bg-ink text-canvas">
                    <MapPin className="size-5" />
                  </span>
                  <h3 className="mt-4 font-semibold">Hecho en Colombia</h3>
                  <p className="mt-1.5 text-sm text-ink-soft">
                    PSE y Nequi, festivos colombianos, factura electrónica DIAN y la Ley 1581 de datos personales.
                  </p>
                </div>
                <div>
                  <span className="grid size-10 place-items-center rounded-xl bg-ink text-canvas">
                    <HeartHandshake className="size-5" />
                  </span>
                  <h3 className="mt-4 font-semibold">Nuestro propósito</h3>
                  <p className="mt-1.5 text-sm text-ink-soft">
                    Que directores y profesores pasen menos tiempo en lo administrativo y más formando deportistas.
                  </p>
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-3xl border border-line shadow-soft">
              <Image unoptimized
                src="/landing/clase.webp"
                alt="Toma de asistencia de una clase en Podium"
                width={1600}
                height={1000}
                className="h-auto w-full"
              />
            </div>
          </div>
        </section>

        {/* 2. Beneficios */}
        <section id="beneficios" className="scroll-mt-6 bg-surface py-20">
          <div className="mx-auto max-w-6xl px-4">
            <div className="text-center">
              <SectionLabel n={2}>Beneficios</SectionLabel>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Lo que ganas con Podium</h2>
              <p className="mx-auto mt-4 max-w-2xl text-ink-soft">
                Pensado con escuelas reales: lo administrativo paga la cuenta y lo deportivo hace que las familias
                se queden.
              </p>
            </div>
            <div className="mt-14 grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="relative mx-auto flex w-full max-w-md justify-center gap-4">
                <Phone src="/landing/celular-asistencia.webp" alt="Clases del día del profesor" className="w-[46%] translate-y-8" />
                <Phone src="/landing/celular-mis-hijos.webp" alt="Horario y asistencia de un hijo" className="w-[46%]" />
              </div>
              <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {BENEFITS.map((b) => (
                  <div key={b.title} className="border-b border-line py-5">
                    <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand">
                      <b.icon className="size-5" />
                    </span>
                    <h3 className="mt-4 font-semibold">{b.title}</h3>
                    <p className="mt-1.5 text-sm text-ink-soft">{b.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Impacto */}
        <section className="relative isolate overflow-hidden bg-[#070d1f] py-24 text-white">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(50rem_30rem_at_80%_20%,rgb(47_107_255/0.5),transparent)]" />
          <TrackBackdrop />
          <div className="mx-auto max-w-6xl px-4">
            <SectionLabel n={3}>Por qué funciona</SectionLabel>
            <p className="mt-6 max-w-4xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              “Menos tiempo persiguiendo pagos.{" "}
              <em className="font-extrabold italic text-[#fcd34d]">Más tiempo en la pista.</em>”
            </p>
            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {[
                { icon: BellRing, title: "Recordatorios con un clic", text: "A todos los que deben, por WhatsApp o correo, en horario permitido." },
                { icon: WifiOff, title: "Funciona sin señal", text: "La asistencia se guarda en el celular y se sincroniza sola." },
                { icon: ShieldCheck, title: "Tus datos son tuyos", text: "Exportación completa en cualquier momento, sin amarres." },
              ].map((f) => (
                <div key={f.title} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                  <f.icon className="size-5 text-[#fcd34d]" />
                  <h3 className="mt-3 font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-white/70">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Para quién */}
        <section id="para-quien" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-24">
          <SectionLabel n={4}>Para quién</SectionLabel>
          <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
            Una plataforma, <em className="font-extrabold italic text-brand">tu deporte</em>
          </h2>
          <div className="mt-10">
            <Segments />
          </div>
        </section>

        {/* 5. Así se ve */}
        <section className="bg-surface py-24">
          <div className="mx-auto max-w-6xl px-4 text-center">
            <SectionLabel n={5}>Así se ve</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Cada rol, su propia vista</h2>
            <p className="mx-auto mt-4 max-w-2xl text-ink-soft">
              Dirección, secretaría, profesores y familias entran a la misma app y cada uno ve solo lo suyo.
            </p>
          </div>
          <div className="mx-auto mt-14 grid max-w-7xl items-end gap-6 px-4 md:grid-cols-[1fr_0.55fr_1fr]">
            <figure>
              <div className="overflow-hidden rounded-2xl border border-line shadow-soft">
                <Image unoptimized src="/landing/cobros.webp" alt="Cartera y deudores" width={1600} height={1000} className="h-auto w-full" />
              </div>
              <figcaption className="mt-3 text-sm font-semibold">Dirección · Cobros y cartera</figcaption>
            </figure>
            <figure className="mx-auto w-full max-w-[260px]">
              <Phone src="/landing/celular-mis-pagos.webp" alt="Pagos de la familia" />
              <figcaption className="mt-3 text-center text-sm font-semibold">Familias · Mis pagos</figcaption>
            </figure>
            <figure>
              <div className="overflow-hidden rounded-2xl border border-line shadow-soft">
                <Image unoptimized src="/landing/alumno.webp" alt="Ficha y rendimiento de un deportista" width={1600} height={1000} className="h-auto w-full" />
              </div>
              <figcaption className="mt-3 text-sm font-semibold">Profesores · Rendimiento del deportista</figcaption>
            </figure>
          </div>
        </section>

        {/* Precios */}
        <section id="precios" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-24">
          <div className="text-center">
            <SectionLabel n={6}>Precios</SectionLabel>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Paga según el tamaño de tu escuela</h2>
            <p className="mx-auto mt-4 max-w-2xl text-ink-soft">
              Todas las funciones en todos los planes. Plan anual: pagas {ANNUAL_MONTHS} meses y usas 12.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p) => {
              const featured = p.code === "club";
              return (
                <div
                  key={p.code}
                  className={cn(
                    "flex flex-col rounded-3xl border bg-surface p-6 shadow-soft",
                    featured ? "border-brand ring-2 ring-brand/30" : "border-line",
                  )}
                >
                  <p className="flex items-center justify-between font-semibold">
                    {p.name}
                    {featured && <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs text-white">Popular</span>}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    {p.maxAthletes ? `Hasta ${p.maxAthletes} alumnos` : "Alumnos ilimitados"}
                  </p>
                  <p className="mt-5 text-3xl font-semibold tracking-tight">{formatCOP(p.monthly)}</p>
                  <p className="text-sm text-ink-faint">al mes</p>
                  <ul className="mt-5 flex-1 space-y-2 text-sm text-ink-soft">
                    {["Todas las funciones", "App de familias", `${whatsappQuota(p.code).toLocaleString("es-CO")} WhatsApp al mes`].map((t) => (
                      <li key={t} className="flex items-center gap-2">
                        <Check className="size-4 text-mint" /> {t}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={start}
                    className={cn(
                      "mt-6 inline-flex h-11 items-center justify-center rounded-full text-sm font-semibold",
                      featured ? "bg-brand text-white hover:bg-brand-strong" : "border border-line hover:bg-canvas",
                    )}
                  >
                    Empezar gratis
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-center text-xs text-ink-faint">Valores en pesos colombianos.</p>
        </section>

        {/* Preguntas */}
        <section id="preguntas" className="scroll-mt-6 bg-surface py-24">
          <div className="mx-auto max-w-3xl px-4">
            <div className="text-center">
              <SectionLabel n={7}>Preguntas</SectionLabel>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Preguntas frecuentes</h2>
            </div>
            <div className="mt-10 divide-y divide-line rounded-3xl border border-line bg-canvas">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-6 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                    {f.q}
                    <ArrowRight className="size-4 shrink-0 text-ink-faint transition group-open:rotate-90" />
                  </summary>
                  <p className="mt-3 text-ink-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Llamado final */}
        <section className="relative isolate overflow-hidden bg-[#070d1f] py-28 text-center text-white">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(45rem_28rem_at_50%_40%,rgb(47_107_255/0.6),transparent)]" />
          <TrackBackdrop />
          <h2 className="px-4 text-4xl font-extrabold tracking-tight sm:text-7xl">
            Tu próxima temporada, <em className="italic text-[#fcd34d]">en orden</em>
          </h2>
          <p className="mx-auto mt-5 max-w-xl px-4 text-white/75">
            Crea tu escuela en minutos, importa tus alumnos desde Excel e invita a tu equipo. 30 días gratis.
          </p>
          <Link
            href={start}
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-base font-semibold text-[#070d1f] hover:bg-white/90"
          >
            Crear mi escuela <ArrowUpRight className="size-4" />
          </Link>
        </section>
      </main>

      <footer className="bg-[#070d1f] px-4 pb-8 pt-4 text-white/70">
        <div className="mx-auto grid max-w-6xl gap-10 border-t border-white/10 pt-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 text-lg font-bold text-white">
              <LogoMark /> Podium
            </p>
            <p className="mt-4 max-w-sm text-sm">
              Software para escuelas deportivas y gimnasios en Colombia: cobros, asistencia, comunicación y
              seguimiento deportivo en una sola app.
            </p>
          </div>
          <nav className="grid content-start gap-2 text-sm" aria-label="Producto">
            <p className="mb-1 font-semibold text-white">Producto</p>
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-white">
                {n.label}
              </a>
            ))}
          </nav>
          <nav className="grid content-start gap-2 text-sm" aria-label="Cuenta">
            <p className="mb-1 font-semibold text-white">Cuenta</p>
            <Link href="/ingresar" className="hover:text-white">Ingresar</Link>
            <Link href="/registro" className="hover:text-white">Crear cuenta</Link>
            <Link href="/terminos" className="hover:text-white">Términos</Link>
            <Link href="/privacidad" className="hover:text-white">Privacidad</Link>
          </nav>
        </div>
        <p className="mx-auto mt-12 max-w-6xl text-xs text-white/40">
          © {new Date().getFullYear()} Podium. Las imágenes son capturas de Podium con datos de demostración.
        </p>
      </footer>
    </div>
  );
}
