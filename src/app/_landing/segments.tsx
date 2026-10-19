"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/components/ui";

type Segment = {
  key: string;
  label: string;
  title: string;
  text: string;
  image: { src: string; alt: string };
  items: { title: string; text: string; tag: string }[];
};

const SEGMENTS: Segment[] = [
  {
    key: "patinaje",
    label: "Escuelas de patinaje",
    title: "Velocidad, artístico, hockey y freestyle",
    text: "Niveles de iniciación a competencia, categorías por edad calculadas solas y pruebas de pista y ruta.",
    image: { src: "/landing/grupos.webp", alt: "Grupos de una escuela de patinaje en Podium" },
    items: [
      { title: "Grupos por nivel y horario", text: "Cupos, profesor titular y aviso de cruces de horario.", tag: "Organización" },
      { title: "Marcas con cronómetro", text: "Toma los tiempos de todo el grupo y detecta las mejores marcas.", tag: "Rendimiento" },
      { title: "Evaluaciones y certificados", text: "Ascenso de nivel con criterios y certificado en PDF.", tag: "Progreso" },
      { title: "Convocatorias a competencias", text: "Autorización de los papás, inscripción y cobro en un solo paso.", tag: "Competencia" },
    ],
  },
  {
    key: "natacion",
    label: "Natación",
    title: "Del agua a la competencia",
    text: "Plantilla lista con niveles de adaptación a perfeccionamiento, pruebas de piscina y reposición de clases.",
    image: { src: "/landing/alumno.webp", alt: "Ficha de un deportista con su progreso" },
    items: [
      { title: "Niveles de natación", text: "Adaptación, desplazamiento, estilos, perfeccionamiento y competencia.", tag: "Formación" },
      { title: "Reposición de clases", text: "Quien falta recupera la clase en otro grupo, sin enredos.", tag: "Asistencia" },
      { title: "Pruebas de piscina", text: "Registra tiempos por estilo y distancia y compara con su categoría.", tag: "Rendimiento" },
      { title: "Certificado de nivel", text: "Las familias reciben el certificado de cada ascenso.", tag: "Familias" },
    ],
  },
  {
    key: "gimnasios",
    label: "Gimnasios y entrenadores",
    title: "Membresías, ingreso y rutinas",
    text: "Para estudios y entrenadores personales que quieren dejar el cuaderno y el Excel.",
    image: { src: "/landing/cobros.webp", alt: "Cobros y cartera en Podium" },
    items: [
      { title: "Membresías con vigencia", text: "Planes por días o meses, renovaciones y vencimientos.", tag: "Cobros" },
      { title: "Ingreso con QR", text: "El socio registra su llegada en recepción con un código.", tag: "Acceso" },
      { title: "Rutinas por socio", text: "Series, repeticiones y cargas con su progreso.", tag: "Entrenamiento" },
      { title: "Valoración física", text: "Medidas y composición corporal con su evolución.", tag: "Seguimiento" },
    ],
  },
  {
    key: "clubes",
    label: "Clubes con varias sedes",
    title: "Crece sin perder el control",
    text: "Varias sedes y modalidades en una sola cuenta, con roles para dirección, secretaría y profesores.",
    image: { src: "/landing/inicio.webp", alt: "Tablero de indicadores de la escuela" },
    items: [
      { title: "Multi-sede", text: "Filtra grupos, alumnos y reportes por sede.", tag: "Organización" },
      { title: "Egresos y utilidad", text: "Registra gastos e inventario y mira la utilidad del mes.", tag: "Finanzas" },
      { title: "Factura electrónica", text: "Facturas DIAN de cada pago conectando tu cuenta de Alegra.", tag: "DIAN" },
      { title: "WhatsApp propio", text: "Avisos y bandeja de mensajes con el número de tu escuela.", tag: "Comunicación" },
    ],
  },
];

/** Pestañas de "Para quién" (sección 4 de la página inicial). */
export function Segments() {
  const [active, setActive] = useState(SEGMENTS[0].key);
  const s = SEGMENTS.find((x) => x.key === active)!;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
      <div>
        <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{s.title}</h3>
        <p className="mt-3 text-ink-soft">{s.text}</p>
        <div className="mt-6 overflow-hidden rounded-3xl border border-line shadow-soft">
          <Image unoptimized src={s.image.src} alt={s.image.alt} width={1600} height={1000} className="h-auto w-full" />
        </div>
      </div>
      <div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Para quién es Podium">
          {SEGMENTS.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={x.key === active}
              onClick={() => setActive(x.key)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition",
                x.key === active
                  ? "bg-ink text-canvas"
                  : "border border-line bg-surface text-ink-soft hover:text-ink",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
        <ul className="mt-6 divide-y divide-line" role="tabpanel" aria-label={s.label}>
          {s.items.map((item) => (
            <li key={item.title} className="flex gap-4 py-4">
              <span className="mt-1 size-2.5 shrink-0 rounded-full bg-brand" aria-hidden />
              <div className="flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {item.title}
                  <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-semibold text-brand">
                    {item.tag}
                  </span>
                </p>
                <p className="mt-1 text-sm text-ink-soft">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
