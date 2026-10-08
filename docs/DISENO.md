# Sistema de diseño Podium

> Referencias elegidas: un tablero de RR. HH. con calendario de ausencias y un editor de publicaciones con vista previa (estilo "soft UI" claro). Este documento traduce ese estilo a reglas para todas las pantallas.

## 1. Principios
1. **Calma y claridad**: fondo gris muy claro, tarjetas blancas, mucho aire; el color se reserva para estados y acciones.
2. **Todo es redondeado**: tarjetas grandes (28 px), bloques internos (16 px), botones y chips en **píldora**.
3. **Profundidad suave**: sombras difusas y bordes casi invisibles; vidrio esmerilado (`bg-glass` + `backdrop-blur`) solo en barras flotantes y avisos superpuestos.
4. **Estado de un vistazo**: chips de color con punto ("● Aprobado", "● Pendiente") y bloques de color en calendarios.
5. **Celular primero** (PWA): navegación inferior en celular, barra lateral de íconos en escritorio.

## 2. Tokens (`src/app/globals.css`)

| Token | Claro | Uso |
|---|---|---|
| `bg` | `#e8ebf1` | Fondo de la página |
| `canvas` | `#f3f5f9` | Bloques internos, celdas de calendario |
| `surface` | `#ffffff` | Tarjetas |
| `glass` | blanco 72 % | Barras flotantes, superposiciones |
| `brand` | `#2f6bff` | Acción principal, "hoy", navegación activa |
| `violet` | `#7c5cff` | Cobros / permisos / información secundaria |
| `mint` | `#16b364` | Hecho, pagado, presente |
| `sun` | `#fcd34d` | Evento destacado o próximo |
| `danger` | `#e5484d` | Errores, mora, ausencia |
| `shadow-soft` / `shadow-pill` | — | Tarjetas / botones y chips |

Tipografía: **Manrope** (títulos `font-semibold tracking-tight`, 30–36 px en encabezados de página). Modo oscuro con los mismos nombres de token.

## 3. Componentes (`src/components/ui.tsx`)
| Componente | Descripción |
|---|---|
| `Button` / `buttonClass` | Píldora: `primary` (azul), `secondary` (blanco con sombra), `ghost` |
| `IconButton` | Círculo blanco de 40 px (campana, salir, ajustes) |
| `Card` | Tarjeta principal 28 px |
| `Tile` | Bloque interno sobre tarjeta (lienzo) |
| `Chip` | Estado con tono (`brand`, `violet`, `mint`, `sun`, `danger`, `neutral`) y punto opcional |
| `Avatar` | Iniciales con color estable por nombre |
| `SectionTitle` | Título de tarjeta + acción a la derecha ("Ver todo") |
| `WeekBoard` (`week-board.tsx`) | Calendario filas × días: hoy en azul con línea punteada, fines de semana con trama |

## 4. Estructura de pantallas
- **Escritorio**: barra lateral de íconos flotante (izquierda) + barra superior flotante (nombre de la escuela, pestañas píldora, acción principal, campana, avatar).
- **Celular**: barra superior compacta + navegación inferior flotante con 5 secciones.
- Encabezado de página: título grande a la izquierda, filtros/fecha en píldoras a la derecha.

## 5. Cómo se aplica a Podium

| Referencia | Pantalla de Podium |
|---|---|
| Calendario de ausencias (empleados × días, bloques de color, "hoy" punteado) | **Asistencia y clases**: alumnos o grupos × días; bloques: presente (mint), excusa (violet), ausente (danger), clase cancelada (trama) |
| Tarjetas de onboarding con "5/10 tareas" | **Configura tu escuela** y avance de invitaciones de acudientes |
| Evento destacado amarillo "En 15 min" | **Próximos eventos**: competencias, fin de prueba, vencimientos |
| Avatares agrupados "+8" | Profesores de un grupo, convocados a una competencia |
| Editor con vista previa a la derecha | **Avisos y WhatsApp**: redactar a la izquierda, vista previa del mensaje como lo verá el acudiente a la derecha |
| Migas de pan + "Guardar borrador" | Formularios largos (tarifas, competencias, planes de entrenamiento) |
| Asistente "¿En qué te ayudo?" | Futuro: asistente para consultas ("¿quién debe más de 60 días?") |
