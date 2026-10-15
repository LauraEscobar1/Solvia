# Solvia

Aplicación de escritorio para la **gestión inteligente de solicitudes**. Cada solicitud
recorre los estados _recibida → asignada → en proceso → completada_, y una IA (DeepSeek)
detecta retrasos y cuellos de botella.

> **Estado: Fase 0.** Arquitectura base sin lógica de negocio: API con health check,
> proveedor de IA intercambiable, base de datos con migraciones y app de escritorio con
> tema, idiomas y pantalla de estado.

## Stack

| Parte | Tecnologías |
| --- | --- |
| `backend/` | Python 3.12 · FastAPI · SQLAlchemy 2 (async, asyncpg) · Alembic · Pydantic 2 · structlog |
| `desktop/` | Tauri 2 · React 19 · TypeScript · Vite · Tailwind CSS 4 · i18next · TanStack Query · Zustand · React Router |
| Infra | PostgreSQL 16 (Docker) · GitHub Actions · gitleaks |

## Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [uv](https://docs.astral.sh/uv/) (`brew install uv`): instala Python 3.12 automáticamente
- Node.js 22 o superior (la versión de referencia está en `desktop/.nvmrc`)
- Rust, solo para ejecutar o empaquetar la app de escritorio: `brew install rustup && rustup default stable`

> **macOS con Homebrew:** `rustup` no se enlaza en el `PATH`. Añade esta línea a tu `~/.zshrc`:
> `export PATH="/opt/homebrew/opt/rustup/bin:$PATH"`

## 1. Configuración inicial

```bash
cp .env.example .env
```

`.env` está en `.gitignore`: **nunca se versiona**. Ajusta allí los valores locales.

### Activar DeepSeek (opcional)

En `.env`:

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=<tu clave>
```

Con `AI_PROVIDER=none` (valor por defecto) se usa un puntaje heurístico sin llamadas externas.
Si eliges `deepseek` sin clave, la API no arranca y muestra un error explícito.

## 2. Levantar el backend

### Opción A: todo en Docker

```bash
docker compose up -d --build
```

- La API espera a que PostgreSQL esté sano y aplica las migraciones al arrancar.
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
uv run uvicorn app.main:create_app --factory --reload
```

La API lee el `.env` de la raíz del repositorio.

## 3. Levantar la app de escritorio

```bash
cd desktop
npm install
npm run tauri dev      # ventana nativa (necesita Rust)
# o bien
npm run dev            # solo el frontend en http://localhost:1420
```

La URL de la API (por defecto `http://localhost:8000`) se cambia desde **Configuración**.
El **Panel** muestra el estado de la API, la base de datos y el proveedor de IA.

Para generar el instalador: `npm run tauri build`.

## Pruebas y calidad

```bash
# Backend
cd backend
uv run ruff check . && uv run ruff format --check .
uv run mypy
uv run pytest

# Desktop
cd desktop
npm run lint
npm run typecheck
npm test
npm run build
```

GitHub Actions (`.github/workflows/ci.yml`) ejecuta lo mismo en cada push o PR a `main`,
y además escanea el historial con **gitleaks** en busca de secretos.

## Migraciones

```bash
cd backend
uv run alembic revision --autogenerate -m "crear tabla solicitudes"
uv run alembic upgrade head
```

Los modelos nuevos deben importarse en `app/models/__init__.py` para que Alembic los detecte.

## Estructura

```
backend/
  app/
    api/v1/        rutas HTTP (delgadas: validan y delegan)
    core/          configuración, logging, errores, middleware, seguridad
    db/            engine, sesión, Base (naming convention, mixins UUID/timestamps)
    models/        modelos ORM
    schemas/       modelos Pydantic de entrada/salida
    repositories/  acceso a datos
    services/      lógica de aplicación
    ai/            AIProvider + NullProvider + DeepSeekProvider + factory
    jobs/          tareas en segundo plano (fases futuras)
  alembic/         migraciones (async)
  tests/
desktop/
  src/
    components/    layout, selectores de tema e idioma, UI compartida
    pages/         Panel, Solicitudes, Alertas, Administración, Configuración
    lib/           cliente de API, formato con Intl, TanStack Query
    stores/        Zustand (tema, configuración)
    locales/       traducciones es/en por módulo
  src-tauri/       contenedor nativo (Rust)
```

## Errores de la API

La API nunca devuelve textos: responde con códigos estables que el frontend traduce.

```json
{ "error": { "code": "request.not_found", "params": {} } }
```

Las traducciones están en `desktop/src/locales/{es,en}/errors.json`. Una prueba del backend
falla si algún código no tiene traducción.

## Seguridad

- Los secretos (`JWT_SECRET`, `DEEPSEEK_API_KEY`, `DATABASE_URL`) son `SecretStr` y se
  enmascaran en logs y errores.
- En producción la API no arranca si `JWT_SECRET` tiene el valor por defecto o menos de 32 caracteres.
- Los logs pasan por un filtro que oculta claves sensibles, tokens `Bearer`, claves `sk-…`
  y contraseñas en URLs.
- La imagen Docker se ejecuta con un usuario sin privilegios y los puertos solo escuchan en `127.0.0.1`.
