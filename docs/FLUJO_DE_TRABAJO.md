# Flujo de trabajo con GitHub Issues

> Todo el trabajo de Podium —pendientes, avances, decisiones y lo realizado— queda registrado en los **issues de GitHub** del repositorio `didierymartinez/Podium`. Este flujo es obligatorio para personas y asistentes de IA.

## 1. Organización

| Elemento | Uso |
|---|---|
| **Épica** (etiqueta `epic`) | Agrupa un objetivo grande; sus tareas son **sub-issues**. El avance de la épica se ve en su barra de sub-issues. |
| **Tarea** | Una unidad entregable (1 a 5 días). Siempre cuelga de una épica. |
| **Bug** (etiqueta `bug`) | Error encontrado; se enlaza a la épica o tarea relacionada. |
| Issue cerrado | Trabajo terminado y verificado, con el resumen de lo realizado. |

### Épicas actuales
| # | Épica |
|---|---|
| #6 | MVP: Plataforma y puesta en marcha |
| #7 | MVP: Personas, profesores e invitaciones |
| #8 | MVP: Asistencia |
| #9 | MVP: Cobros, pagos y cartera |
| #10 | MVP: Comunicación y portal del acudiente |
| #11 | MVP: Tablero, reportes y calidad |
| #12 | Fase 2: Gestión deportiva y WhatsApp automático (lista de alcance) |
| #13 | Fase 3: Crecimiento (lista de alcance) |

### Etiquetas
- **Área:** `area:plataforma`, `area:administrativo`, `area:deportivo`, `area:comunicaciones`
- **Fase:** `fase:mvp`, `fase:2`, `fase:3`
- **Tipo / estado:** `epic`, `bug`, `documentation`, `enhancement`, `ux`, `calidad`, `seguridad`, `legal`, `prioridad:alta`, `bloqueado`, `en-progreso`

## 2. Ciclo de una tarea

1. **Antes de empezar**
   - Buscar si ya existe un issue (`is:issue` + palabras clave). Si no existe, **crearlo** con la plantilla "Tarea" y colgarlo de su épica.
   - Si un punto de la lista de alcance de Fase 2/3 se va a trabajar, convertirlo en issue propio y enlazarlo en la épica.
   - Marcar el issue con `en-progreso` y comentar el **plan**: enfoque, archivos/módulos a tocar y decisiones abiertas.

2. **Durante el desarrollo**
   - Cada commit referencia el issue en el mensaje: `feat: generación de cuentas de cobro (#35)`.
   - Comentar el **progreso** en el issue en cada hito relevante: qué quedó hecho, qué cambió del plan, decisiones tomadas y por qué, problemas encontrados.
   - Marcar las casillas del "Alcance" a medida que se completan (editando el cuerpo del issue).
   - Si aparece trabajo nuevo fuera del alcance: crear un issue aparte (no ampliar la tarea en silencio).
   - Si algo bloquea (credenciales, decisión del producto, asesoría legal): etiqueta `bloqueado` y comentario con lo que se necesita y de quién.

3. **Al terminar**
   - Verificar: `pnpm lint && pnpm typecheck && pnpm test` y, si hay interfaz, prueba en el navegador (escritorio y celular).
   - Comentario de **cierre** con la plantilla de la sección 3.
   - Cerrar el issue como completado y quitar `en-progreso`. Si un commit en la rama por defecto incluye `Closes #N`, GitHub lo cierra automáticamente; igual se deja el comentario de cierre.
   - Revisar la épica: si todas sus tareas están cerradas, cerrarla con un resumen.

## 3. Plantilla del comentario de cierre

```markdown
## Trabajo realizado
- …

## Decisiones
- …

## Verificación
- Lint, typecheck y N pruebas en verde
- Prueba en navegador: …

## Pendientes que quedan
- #NN …

## Commits
abc1234, def5678
```

## 4. Reglas
- Nada se trabaja sin issue; nada se cierra sin comentario de cierre.
- Los issues se escriben en español; el código en inglés.
- Requisitos del producto se citan por su código (ADM-xx, DEP-xx, COM-xx) y documento en `docs/`.
- No se registran secretos, datos personales reales ni credenciales en issues o comentarios.
- Los comentarios generados por un asistente de IA terminan con la nota de atribución correspondiente.
