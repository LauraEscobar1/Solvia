# Solvia

Aplicación de escritorio para la **gestión inteligente de solicitudes**. Cada solicitud
recorre los estados _recibida → asignada → en proceso → completada_, y una IA (DeepSeek)
detecta retrasos y cuellos de botella.

> **Estado actual:** autenticación, roles y administración; solicitudes de punta a punta (flujo
> de estados, asignación, comentarios, historial, lista, tablero kanban y detalle); SLA,
> alertas automáticas, detección de cuellos de botella y panel de control; y análisis de riesgo
> en dos niveles: reglas propias siempre activas y DeepSeek para explicaciones y recomendaciones.

## Stack

| Parte | Tecnologías |
| --- | --- |
| `backend/` | Python 3.12 · FastAPI · SQLAlchemy 2 (async, asyncpg) · Alembic · Pydantic 2 · structlog · PyJWT · argon2 (pwdlib) · APScheduler |
| `desktop/` | Tauri 2 · React 19 · TypeScript · Vite · Tailwind CSS 4 · i18next · TanStack Query · Zustand · React Router · React Hook Form · Zod · dnd-kit · Recharts |
| Infra | PostgreSQL 16 (Docker) · GitHub Actions · gitleaks |

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [uv](https://docs.astral.sh/uv/) (`brew install uv`): instala Python 3.12 automáticamente
- Node.js 22 o superior (la versión de referencia está en `desktop/.nvmrc`)
- Rust, solo para ejecutar o empaquetar la app de escritorio: `brew install rustup && rustup default stable`
- En Linux, además, las [dependencias de Tauri](https://v2.tauri.app/start/prerequisites/) y `libdbus-1-dev`

> **macOS con Homebrew:** `rustup` no se enlaza en el `PATH`. Añade esta línea a tu `~/.zshrc`:
> `export PATH="/opt/homebrew/opt/rustup/bin:$PATH"`

## 1. Configuración inicial

```bash
cp .env.example .env
```

`.env` está en `.gitignore`: **nunca se versiona**. Ajusta allí los valores locales y, como
mínimo, define el administrador inicial:

```dotenv
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=<mínimo 12 caracteres>
# Usuarios de demostración (supervisor, responsables y solicitantes); necesaria para --demo
SEED_DEMO_PASSWORD=<mínimo 12 caracteres>
```

Si tu `.env` viene de una versión anterior, copia también las variables nuevas de
`.env.example` (`REFRESH_TOKEN_DAYS`, `LOGIN_RATE_LIMIT_*`, `SEED_*`, `ORGANIZATION_TIMEZONE`,
`ALERTS_JOB_*`, `BOTTLENECK_MIN_COUNT`) y cambia `JWT_SECRET`: un secreto de menos de 32
caracteres hace que PyJWT muestre avisos.

| Variable | Por defecto | Uso |
| --- | --- | --- |
| `ORGANIZATION_TIMEZONE` | `America/Bogota` | Zona IANA con la que se agrupan los días del panel y se leen los filtros por fecha; la base de datos guarda siempre UTC |
| `ALERTS_JOB_ENABLED` | `true` | Activa el job de alertas dentro de la API |
| `ALERTS_JOB_INTERVAL_MINUTES` | `15` | Cada cuánto evalúa el job |
| `BOTTLENECK_MIN_COUNT` | `3` | Cantidad mínima de solicitudes en un área y etapa para marcar un cuello de botella por cantidad |

### Activar DeepSeek (opcional)

En `.env`:

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=<tu clave>
```

Con `AI_PROVIDER=none` (valor por defecto) solo se usa el análisis por reglas, sin llamadas
externas. Si eliges `deepseek` sin clave, la API no arranca y muestra un error explícito. Las
demás opciones de la IA se explican en [Inteligencia artificial](#inteligencia-artificial).

## 2. Levantar el backend

### Opción A: todo en Docker

```bash
docker compose up -d --build                                # aplica las migraciones al arrancar
docker compose exec api python -m app.scripts.seed --demo   # admin, áreas, SLA y datos de demo
```

Sin `--demo` la semilla crea solo el admin, las áreas y la matriz SLA.

- Estado: <http://localhost:8000/api/v1/health>
- Documentación interactiva: <http://localhost:8000/docs> (desactivada en producción)

Para ver los logs: `docker compose logs -f api`. Para pararlo: `docker compose down`
(añade `-v` para borrar también los datos de PostgreSQL).

### Opción B: API local con recarga automática

```bash
docker compose up -d postgres          # solo la base de datos
cd backend
uv sync                                # crea .venv con Python 3.12
uv run alembic upgrade head
uv run python -m app.scripts.seed --demo
uv run uvicorn app.main:create_app --factory --reload
```

La API y la semilla leen el `.env` de la raíz del repositorio. La semilla es idempotente:
puedes ejecutarla las veces que quieras y solo crea lo que falta, sin sobrescribir
contraseñas ni políticas SLA editadas.

### Datos de demostración (`--demo`)

Con `--demo` (y `SEED_DEMO_PASSWORD` definida; no se permite en producción) se crean estos
usuarios, todos con la contraseña de `SEED_DEMO_PASSWORD`:

| Email | Rol | Área |
| --- | --- | --- |
| `supervisor@example.com` | supervisor (responsable del área) | Soporte TI |
| `responsable1@example.com` | assignee | Soporte TI |
| `responsable2@example.com` | assignee | Recursos Humanos |
| `responsable3@example.com` | assignee | Finanzas |
| `solicitante1@example.com` · `solicitante2@example.com` | requester | — |

Además se generan 136 solicitudes repartidas entre áreas, prioridades y estados, con historial
realista (asignaciones, devoluciones, retrocesos, comentarios y cierres):

- 36 abiertas con una mezcla realista: alrededor del 15 % vencidas, el 10 % por vencer y el
  20 % sin movimiento.
- 100 cerradas, con cierres repartidos en los últimos 30 días y tiempo en cada etapa
  proporcional a su SLA, para que las tendencias y las medianas de 30 días de los cuellos de
  botella reflejen una carga estable.

La generación es determinista y no se repite si ya existen. Tras sembrar, el job crea las
alertas en su primera ronda (al arrancar la API) o puedes forzarla con
`POST /api/v1/alerts/evaluate` como admin.

### Probar el login con el admin semilla

```bash
curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "<SEED_ADMIN_EMAIL>", "password": "<SEED_ADMIN_PASSWORD>"}'
```

La respuesta incluye `access_token` (30 min), `refresh_token` y el perfil del usuario.

## 3. Levantar la app de escritorio

```bash
cd desktop
npm install
npm run tauri dev      # ventana nativa (necesita Rust)
# o bien
npm run dev            # solo el frontend en http://localhost:1420
```

- Inicia sesión con el admin semilla. Con **Recordarme**, el refresh token se guarda en el
  llavero del sistema (Llavero de macOS, Administrador de credenciales de Windows o Secret
  Service en Linux) y la sesión se restaura al abrir la app. En `npm run dev` (navegador) no
  hay llavero y la sesión vive solo en memoria.
- Al iniciar sesión se aplican el tema y el idioma del perfil; los cambios en
  **Configuración** se guardan en el perfil.
- Los usuarios creados por un admin reciben una contraseña temporal y deben cambiarla al entrar.
- La URL de la API (por defecto `http://localhost:8000`) se cambia desde **Configuración**.

Para generar el instalador: `npm run tauri build`.

## Roles y permisos

**Administración**

| Rol | Puede |
| --- | --- |
| `admin` | Todo: áreas, usuarios y políticas SLA |
| `supervisor` | Ver los usuarios de su área |
| `assignee` · `requester` | Ver y editar su propio perfil |

Reglas adicionales: un admin no puede desactivarse a sí mismo, siempre queda al menos un admin
activo, y desactivar a un usuario cierra sus sesiones al instante.

**Solicitudes**

| Rol | Ve | Puede |
| --- | --- | --- |
| `requester` | Las que creó | Crear, comentar y editar título y descripción mientras está recibida |
| `assignee` | Las asignadas a él, las de su área y las que creó | Crear, comentar y avanzar o devolver las suyas |
| `supervisor` | Las de su área y las que creó | Todo lo anterior en su área, más asignar, reasignar, cancelar, reabrir y editar prioridad y fecha límite |
| `admin` | Todas | Todo; puede asignar fuera del área y queda registrado |

Las reglas viven en `services/request_policy.py` y se prueban aparte.

## Flujo de estados

```mermaid
stateDiagram-v2
    [*] --> received: crear
    received --> assigned: asignar
    assigned --> received: devolver (comentario)
    assigned --> in_progress: iniciar
    in_progress --> completed: completar
    in_progress --> assigned: retroceder (comentario)
    received --> cancelled: cancelar (comentario)
    assigned --> cancelled: cancelar (comentario)
    in_progress --> cancelled: cancelar (comentario)
    completed --> in_progress: reabrir (comentario)
```

- La tabla de transiciones está en un solo lugar: `services/request_workflow.py`. Cualquier
  otra transición devuelve `409 request.invalid_transition` con `{from, to}`.
- Cada cambio actualiza la solicitud, crea su evento (con valores anteriores y nuevos en
  `details`) y actualiza `last_activity_at` en una sola transacción.
- Concurrencia optimista: cada cambio envía la `version` conocida; si no coincide, la API
  responde `409 request.version_conflict` y la app recarga conservando lo escrito.
- `due_at` = recepción + suma de las horas máximas de las tres etapas para su prioridad; se
  recalcula si cambia la prioridad. Los indicadores de SLA se explican en la sección siguiente.

## SLA, alertas y cuellos de botella

Las reglas se expresan una sola vez, como expresiones SQL, en `repositories/sla_rules.py`. Las
usan la lista, el tablero, el detalle, los filtros, el panel y las alertas, así que todos
cuentan lo mismo. El tiempo transcurrido se calcula en una única función (`elapsed_hours`, en
horas calendario) para poder pasar a horario laboral más adelante.

| Tipo | Condición (solo solicitudes abiertas) | Severidad | Se resuelve cuando |
| --- | --- | --- | --- |
| `due_soon` | Consumido ≥ 75 % del tiempo entre la recepción y `due_at`, sin vencer | warning | Baja del 75 %, pasa a vencida o se cierra |
| `overdue` | `ahora ≥ due_at` | critical | `due_at` vuelve al futuro o se cierra |
| `stalled` | Inactividad mayor que el umbral de su prioridad y etapa | warning; critical si la prioridad es alta o crítica | Hay actividad o se cierra |
| `bottleneck` | Área × etapa con al menos `BOTTLENECK_MIN_COUNT` solicitudes (3 por defecto) y más de 1,5 × su mediana de 30 días, o con un promedio de horas en la etapa mayor que el promedio de los máximos SLA de sus solicitudes (este criterio no tiene mínimo) | warning; critical si se cumplen las dos | La condición deja de cumplirse |

- **Una alerta abierta por objetivo:** índices únicos parciales por `(request_id, type)` y,
  para cuellos de botella, por `(area_id, etapa)` mientras `resolved_at` es nulo.
- **Sin textos en la base de datos:** cada alerta guarda `message_code` y `params`, y la app
  construye el texto con i18n.
- **Lectura por usuario:** la tabla `alert_reads` registra qué alertas leyó cada persona.
- **Job:** APScheduler dentro de la API evalúa cada 15 minutos y al arrancar. Un
  `pg_try_advisory_xact_lock` garantiza que, con varias réplicas, solo una procese cada ronda.
  Cada ronda deja el log estructurado `alerts_evaluated` con la duración y las alertas creadas,
  actualizadas y resueltas.
- **Reevaluación inmediata:** tras cada transición, asignación, edición o comentario se
  reevalúan las alertas de esa solicitud en un savepoint. Si falla, se registra en el log y el
  cambio se guarda igual; el job lo corrige en su siguiente ronda.
- **Cuellos de botella** (`services/bottlenecks.py`): el histórico se reconstruye desde
  `request_events`, con una foto al cierre de cada uno de los últimos 30 días en la zona horaria
  de la organización y medianas calculadas en SQL. El tiempo en la etapa cuenta desde que la
  solicitud entró en ella; una reasignación dentro de la misma etapa no lo reinicia.

### Panel y alertas en la app

- **Panel** (inicio):
  - Tarjetas de abiertas, próximas a vencer, vencidas, sin movimiento, completadas en 7 días y
    resolución promedio; cada una abre la lista con su filtro.
  - Barras por estado y líneas de creadas frente a completadas, con los colores del tema activo.
  - Mapa de calor área × etapa, con los cuellos de botella resaltados y el detalle al pasar el
    cursor.
  - Listas «En riesgo» y «Sin movimiento».
  - Recomendaciones de IA (ver [Inteligencia artificial](#inteligencia-artificial)).
  - Filtro de área (admin) y de fechas, y refresco automático cada 60 s.
- **Campana** en el encabezado con las alertas abiertas sin leer, y página **Alertas** con
  filtros, marcar como leídas y enlace a la solicitud. En un cuello de botella, el enlace lleva
  a la lista filtrada por área y etapa.
- **Notificaciones del sistema** para alertas críticas nuevas: se activan en
  **Configuración › Notificaciones** (desactivadas por defecto) y solo funcionan en la app de
  escritorio.
- El estado del sistema (API, base de datos y proveedor de IA) está en **Configuración**.

## Inteligencia artificial

El análisis tiene dos niveles. El primero siempre funciona; el segundo es opcional y, si falla,
la app vuelve al primero sin dejar de funcionar.

### Nivel 1: puntaje de riesgo por reglas

Cada solicitud abierta tiene un riesgo de 0 a 100 calculado en SQL (la lista puede ordenarse
por riesgo), sin costo y sin llamadas externas:

`riesgo = round(100 × Σ peso × factor)`, con cada factor entre 0 y 1:

| Factor | Valor | Peso |
| --- | --- | --- |
| Tiempo en la etapa | min(horas en la etapa ÷ referencia, 1,5) ÷ 1,5 | 0,25 |
| SLA consumido | min(% consumido, 150 %) ÷ 1,5; 0 sin fecha límite | 0,30 |
| Inactividad | min(horas sin actividad ÷ umbral, 2) ÷ 2 | 0,20 |
| Prioridad | crítica 1 · alta 0,7 · media 0,4 · baja 0,1 | 0,15 |
| Carga del responsable | min(abiertas asignadas ÷ 10, 1); sin responsable: 0,5, o 1 si ya superó su referencia | 0,10 |

La referencia es el P90 histórico de 90 días del área × etapa × prioridad (con al menos 10
casos); si no hay datos suficientes, el de etapa × prioridad, y si tampoco, el máximo SLA de la
etapa. El job de 15 minutos lo precalcula en `risk_baselines`. Los pesos están en un solo lugar,
`backend/app/ai/risk_model.py`, y la app muestra cuántos puntos aporta cada factor.

### Nivel 2: DeepSeek

- **Por solicitud:** `deepseek-flash` sin razonamiento y en modo JSON: riesgo, resumen, hasta 3
  causas y hasta 3 acciones.
- **Global o por área:** `DEEPSEEK_MODEL_DEEP` (`deepseek-v4-pro`) con razonamiento y modo JSON:
  resumen, hallazgos y recomendaciones con enlace a una solicitud o a un área y etapa.
- La respuesta se valida con Pydantic; si no es válida se reintenta una vez y, si vuelve a
  fallar, se usa el nivel 1. Cualquier código de solicitud o área que el modelo invente o que
  quede fuera del alcance de quien pide el análisis se descarta.
- Timeouts, 429 y errores 5xx nunca rompen nada: se usa el nivel 1 y se deja un log sin datos
  sensibles. En los jobs se reintenta una vez tras esperar entre 5 y 10 segundos; bajo demanda
  no se reintenta para no hacer esperar a nadie.

**Cuándo corre:**

- Cada día a las 6:00 en la zona de la organización se genera el análisis global en
  `ORGANIZATION_LANGUAGE`. A esa hora de Bogotá (11:00 UTC) DeepSeek cobra tarifa valle (50 %
  menos).
- En la ronda de 15 minutos se analizan las solicitudes con riesgo mayor que 70, como máximo una
  vez cada 24 horas y `AI_AUTOMATIC_MAX_PER_RUN` por ronda. Nunca dentro de la acción de un
  usuario.
- Bajo demanda: «Analizar con IA» en el detalle (quien puede ver la solicitud) y «Regenerar» en
  el panel (admin, o supervisor para su área).
- Si DeepSeek da un riesgo de 80 o más y la solicitud no está vencida, se abre una alerta
  `ai_risk` (warning; critical desde 90), con las mismas reglas de no duplicar y de
  autorresolución que las demás.

### Qué datos se envían

Solo códigos de solicitud (`SOL-0001`), nombres de área, estados, prioridades y métricas
(horas, porcentajes, recuentos y el desglose del nivel 1). **Nunca** se envían nombres, emails
ni identificadores de usuarios. El título y la descripción tampoco se envían salvo que actives
`AI_SEND_REQUEST_TEXT=true`; en ese caso van delimitados y el prompt indica que son contenido
del usuario, no instrucciones. Una prueba automática verifica que el payload no lleve datos de
personas.

### Costos aproximados

Con la semilla demo, en una verificación real:

| Análisis | Modelo | Tokens | Costo aproximado (normal / valle) |
| --- | --- | --- | --- |
| Una solicitud | `deepseek-flash` | ~850 | US$0,0005 / 0,0003 |
| Global | `deepseek-v4-pro` con razonamiento | ~7 300 | US$0,02 / 0,01 |

Con un análisis global diario y unas 10 solicitudes automáticas al día, el gasto queda por
debajo de US$1 al mes. Precios de referencia en <https://api-docs.deepseek.com/quick_start/pricing>.

### Caché, presupuesto y límites

- Un resultado de IA se reutiliza si la solicitud o el panorama no cambiaron (mismo hash de
  entrada) y el idioma coincide, durante `AI_CACHE_HOURS` (6 por defecto).
- `AI_DAILY_TOKEN_BUDGET` (200 000) cuenta los tokens de todos los análisis del día en la zona
  de la organización; al superarlo, todo usa el nivel 1 hasta el día siguiente y la app lo avisa.
- Cada usuario puede pedir `AI_USER_HOURLY_LIMIT` (10) análisis por hora (`ai.rate_limited`).
- **Administración → IA** muestra el proveedor, los modelos, si la clave está configurada (sin
  mostrarla), el consumo del día frente al presupuesto y la última ejecución diaria.
- Los usuarios pueden marcar cada recomendación como útil o no útil (`ai_feedback`), para medir
  la calidad más adelante.

### Cómo apagarla

- `AI_AUTOMATIC_ENABLED=false`: apaga el análisis diario y el automático; el bajo demanda sigue.
- `AI_PROVIDER=none`: apaga DeepSeek por completo; la app sigue con el nivel 1 y muestra
  «La IA está desactivada».
- `AI_DAILY_TOKEN_BUDGET=0`: deja DeepSeek configurado pero sin gasto.

## API (`/api/v1`)

| Recurso | Endpoints |
| --- | --- |
| Auth | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `PATCH /auth/me` |
| Áreas | `GET /areas` · `POST /areas` · `GET /areas/{id}` · `PATCH /areas/{id}` · `POST /areas/{id}/deactivate` · `POST /areas/{id}/activate` |
| Usuarios | `GET /users` · `POST /users` · `GET /users/{id}` · `PATCH /users/{id}` · `POST /users/{id}/deactivate` · `POST /users/{id}/activate` |
| SLA | `GET /sla-policies` · `PUT /sla-policies` |
| Solicitudes | `GET /requests` · `GET /requests/board` · `GET /requests/due-estimates` · `POST /requests` · `GET /requests/{id}` · `PATCH /requests/{id}` · `POST /requests/{id}/transition` · `POST /requests/{id}/assign` · `POST /requests/{id}/comments` · `GET /requests/{id}/events` |
| Panel | `GET /dashboard/summary` · `GET /dashboard/by-status` · `GET /dashboard/at-risk` · `GET /dashboard/stalled` · `GET /dashboard/bottlenecks` · `GET /dashboard/trends` · `GET /dashboard/by-area` |
| Alertas | `GET /alerts` · `GET /alerts/unread-count` · `PATCH /alerts/{id}/read` · `POST /alerts/read-all` · `POST /alerts/evaluate` (admin) |
| IA | `POST /ai/requests/{id}/analyze` · `GET /ai/requests/{id}/insight` · `POST /ai/overview/analyze` · `GET /ai/overview` · `GET /ai/status` (admin) · `POST /ai/insights/{id}/feedback` |
| Estado | `GET /health` |

Las listas se paginan con `?page=1&size=20&q=texto` y responden `{items, total, page, size}`
(`size` máximo 100). `GET /requests` admite además `status` y `priority` repetibles,
`area_id`, `assignee_id`, `requester_id`, `overdue=true`, `sla_status`
(`on_track`, `at_risk` u `overdue`), `stalled=true`, `received_from`, `received_to`,
`completed_from`, `completed_to` (fechas en la zona de la organización) y `sort` (por ejemplo
`-due_at` o `-risk_score`), y siempre aplica el alcance del rol. Cada solicitud abierta trae
su `risk_score` del nivel 1.

El panel acepta `area_id`, `date_from` y `date_to` (por defecto, los últimos 30 días). Las
métricas de estado actual ignoran el rango y aplican el mismo alcance por rol que la lista. La
matriz de cuellos de botella muestra todas las áreas al admin y solo la propia al supervisor y
al responsable; el solicitante no la ve. `GET /alerts` admite `type` y `severity` repetibles,
`is_read`, `state=open|resolved`, `area_id` y `q` (código o título de la solicitud).

**Sesiones:** el access token (JWT de 30 minutos con `sub`, `role` y `area_id`) vive solo en
memoria en el desktop. El refresh token es opaco, se guarda como hash SHA-256, rota en cada uso
y se revoca al cerrar sesión; si se reutiliza uno ya rotado, se revocan todas las sesiones del
usuario. El login admite 5 intentos fallidos por minuto por email+IP y nunca revela si el email
existe.

## Probar el flujo completo con distintos roles

Con la API levantada y la semilla ejecutada con `--demo`, abre la app (`npm run tauri dev`) y
usa, por ejemplo, dos ventanas o cierra sesión entre pasos:

1. **Solicitante** (`solicitante1@example.com`): en **Solicitudes**, pulsa **Nueva solicitud**,
   elige *Soporte TI* y prioridad *Alta*; antes de guardar verás la fecha límite estimada.
   Solo ves tus solicitudes; puedes editar título y descripción mientras esté recibida.
2. **Supervisor** (`supervisor@example.com`): en el tablero, arrastra la nueva tarjeta de
   *Recibida* a *Asignada*; se abrirá el diálogo para elegir responsable (solo de su área).
3. **Responsable** (`responsable1@example.com`): abre la solicitud, pulsa **Iniciar** y luego
   **Completar**. Prueba **Devolver** en otra asignada: exige un comentario y la deja sin
   responsable en la bandeja del supervisor.
4. **Supervisor**: abre la solicitud completada y pulsa **Reabrir** (pide comentario). El
   responsable no ve ese botón.
5. **Conflicto de versión**: abre la misma solicitud como supervisor en dos ventanas, cambia la
   prioridad en una y guarda el título en la otra: verás el aviso de que fue modificada por
   otra persona, la solicitud se recargará y tu título seguirá escrito.
6. **Admin** (`SEED_ADMIN_EMAIL`): ve todas las solicitudes y puede asignar a alguien de otra
   área; el historial lo marca como asignación fuera del área.

En la lista, prueba los filtros combinados (se guardan en la URL), el orden por columna y los
indicadores: rojo vencida, ámbar por vencer y reloj sin movimiento.

## Probar el panel y las alertas con la semilla demo

1. Siembra con `--demo` y arranca la API: el job crea las alertas en su primera ronda. Para
   repetirla al momento, llama a `POST /api/v1/alerts/evaluate` como admin.
2. **Admin**: el panel muestra 36 abiertas, de ellas 4 próximas a vencer, 5 vencidas y 7 sin
   movimiento. Pulsa cada tarjeta: la lista se abre con el filtro correspondiente y con el
   mismo total. En el mapa de calor, *Soporte TI · Recibida* aparece como cuello de botella
   crítico y alguna otra celda puede aparecer como advertencia (varía un poco según la hora,
   porque las medianas usan una foto al cierre de cada día). Pasa el cursor para ver la cantidad, la
   mediana de 30 días y el máximo SLA, y pulsa la celda para ver esas solicitudes. Filtra por
   área o cambia el rango de fechas: todos los bloques se actualizan.
3. **Supervisor** (`supervisor@example.com`): ve solo Soporte TI en el panel y en la matriz, y
   la campana cuenta sus alertas sin leer. Al marcar una como leída, la del admin no cambia.
4. **Solicitante** (`solicitante1@example.com`): ve sus propias cifras, sin matriz de cuellos de
   botella.
5. **Resolución inmediata**: como responsable, completa una solicitud vencida desde su detalle;
   su alerta queda resuelta al instante, sin esperar al job, y la campana se actualiza.
6. **Notificaciones**: en la app de escritorio, activa **Configuración › Notificaciones** y
   acepta el permiso del sistema. Cuando aparezca una alerta crítica nueva (por ejemplo, al
   adelantar la fecha límite de una solicitud como supervisor), recibirás un aviso del sistema
   operativo.

## Pruebas y calidad

Las pruebas del backend usan un PostgreSQL real, separado del de desarrollo:

```bash
docker compose --profile test up -d postgres-test   # puerto 5433, datos en memoria

# Backend
cd backend
uv run ruff check . && uv run ruff format --check .
uv run mypy
uv run pytest            # aplica las migraciones reales y prueba auth, permisos, flujo…

# Desktop
cd desktop
npm run lint
npm run typecheck
npm test
npm run build
```

Si `postgres-test` no está levantado, las pruebas de base de datos se omiten (en CI fallan,
porque se define `REQUIRE_TEST_DB=1`). Para usar otra base, define `TEST_DATABASE_URL`. Las
pruebas de umbrales de SLA congelan el tiempo con `time-machine`, y las de IA usan un DeepSeek
simulado, sin red.

La prueba `tests/test_deepseek_live.py` (marcada `live`) hace una llamada real a DeepSeek si hay
`DEEPSEEK_API_KEY` en tu `.env` y se omite sola si no la hay, como en el CI. Para no gastar
tokens en cada corrida local: `uv run pytest -m "not live"`.

### Rendimiento de las consultas del panel

```bash
cd backend
uv run python -m app.scripts.synthetic_load --requests 50000 --explain
```

El script solo acepta bases cuyo nombre termina en `_test` (por defecto, la de
`postgres-test`). Borra su contenido, genera solicitudes y eventos sintéticos de 180 días y
muestra el `EXPLAIN ANALYZE` de cada consulta del panel, de las alertas y de los filtros SLA.
Con 50 000 solicitudes y unos 197 000 eventos, todas usan índices y tardan menos de 15 ms,
salvo el histórico de cuellos de botella, que tarda unos 150 ms.

GitHub Actions (`.github/workflows/ci.yml`) ejecuta lo mismo en cada push o PR a `main`
(con un servicio PostgreSQL 16), compila el plugin nativo de Tauri con `clippy` y escanea el
historial con **gitleaks** en busca de secretos.

## Migraciones

```bash
cd backend
uv run alembic revision --autogenerate -m "crear tabla x"
uv run alembic upgrade head
uv run alembic check      # verifica que modelos y migraciones coinciden
```

Los modelos nuevos deben importarse en `app/models/__init__.py` para que Alembic los detecte.
Los enums de Postgres, la secuencia `request_code_seq` y la función `next_request_code()`
(códigos `SOL-0001`) se gestionan a mano en la migración `0001`. Nunca se edita una migración
ya aplicada: cada cambio de esquema va en una nueva:

- `0002`: añade `version`, `details` e índices para los filtros de solicitudes.
- `0003`: hace las alertas resolubles (`resolved_at`), les añade el área y la solicitud opcional
  con índices únicos parciales, y crea `alert_reads` en lugar de `alerts.is_read`.
- `0004`: añade un índice sobre `completed_at`.
- `0005`: crea `risk_baselines` (P90 por área, etapa y prioridad).
- `0006`: prepara `ai_insights` como caché (origen, disparador, idioma, hash, contenido, motivo de
  respaldo, quién lo pidió y tokens) y crea `ai_feedback`.
- `0007`: añade el tipo de alerta `ai_risk`.

## Estructura

```
backend/
  app/
    api/v1/        rutas HTTP: auth, areas, users, sla_policies, requests, dashboard, alerts, ai,
                   health
    core/          configuración, logging, errores, seguridad (JWT, argon2), rate limit
    db/            engine, sesión, Base (naming convention, mixins UUID/timestamps)
    models/        areas, users, requests, request_events, sla_policies, alerts, risk_baselines,
                   ai_insights, ai_feedback, refresh_tokens
    schemas/       modelos Pydantic de entrada/salida y paginación
    repositories/  acceso a datos (nunca hacen commit); sla_rules y risk_rules (reglas SLA y
                   puntaje de riesgo en SQL), dashboard y bottleneck (agregaciones)
    services/      reglas de negocio y transacciones; request_workflow (máquina de estados),
                   request_policy (permisos por rol), sla (fechas límite), alerts (evaluación
                   y lectura), bottlenecks (detección), dashboard y ai_insights (caché,
                   presupuesto, límites y respaldo)
    ai/            risk_model (pesos), analytics (nivel 1), payloads y prompts sin datos de
                   personas, content (validación de identificadores y respaldo por reglas),
                   AIProvider + NullProvider + DeepSeekProvider + factory
    scripts/       seed (datos semilla), demo_data (136 solicitudes con historial) y
                   synthetic_load (datos sintéticos y planes de consulta)
    jobs/          APScheduler: ronda de 15 minutos (alertas y análisis automático) y análisis
                   global diario
  alembic/         migraciones (async)
  tests/           pruebas unitarias y tests/db contra PostgreSQL
desktop/
  src/
    components/    layout, guards de rutas, UI compartida, selectores
    pages/         login, panel (con recomendaciones de IA), solicitudes (lista con riesgo,
                   tablero y detalle con tarjeta de riesgo), alertas, administración (con IA),
                   configuración
    lib/           cliente de API con refresco automático, sesión, llavero, formato, colores
                   del tema, mensajes y notificaciones de alertas
    stores/        Zustand (sesión en memoria, tema, configuración)
    locales/       traducciones es/en por módulo
  src-tauri/       contenedor nativo (Rust) con el plugin secure-store y el de notificaciones
```

## Errores de la API

La API nunca devuelve textos: responde con códigos estables que el frontend traduce.

```json
{ "error": { "code": "auth.invalid_credentials", "params": {} } }
```

Las traducciones están en `desktop/src/locales/{es,en}/errors.json`. Una prueba del backend
falla si algún código no tiene traducción.

## Seguridad

- Los secretos (`JWT_SECRET`, `DEEPSEEK_API_KEY`, `DATABASE_URL`, `SEED_*_PASSWORD`) son
  `SecretStr` y se enmascaran en logs y errores.
- En producción la API no arranca si `JWT_SECRET` tiene el valor de ejemplo o menos de 32 caracteres.
- Contraseñas con argon2; refresh tokens guardados solo como hash.
- Los logs pasan por un filtro que oculta claves sensibles, tokens `Bearer`, claves `sk-…`
  y contraseñas en URLs.
- La imagen Docker se ejecuta con un usuario sin privilegios y los puertos solo escuchan en `127.0.0.1`.
