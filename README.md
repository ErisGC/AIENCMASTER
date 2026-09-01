<h1 align="center">AIENC — Portal institucional</h1>

<p align="center">
  Plataforma pública + panel administrativo multi-rol para la
  <strong>Asociación de Iglesias Evangélicas del Norte de Colombia</strong>.
  <br/>
  Monorepo <strong>NestJS · Next.js · Flutter</strong> con cadena de
  confianza ROOT→ROOT, multi-iglesia con permisos granulares y app móvil
  Android firmada distribuida vía GitHub Releases.
</p>

<p align="center">
  <a href="https://github.com/ErisGC/AIENCMASTER/actions"><img alt="tests" src="https://img.shields.io/badge/tests-48_passing-brightgreen?style=flat-square"></a>
  <img alt="api" src="https://img.shields.io/badge/api-NestJS_11-E0234E?style=flat-square&logo=nestjs&logoColor=white">
  <img alt="web" src="https://img.shields.io/badge/web-Next.js_16-000000?style=flat-square&logo=next.js&logoColor=white">
  <img alt="app" src="https://img.shields.io/badge/app-Flutter_3.41-02569B?style=flat-square&logo=flutter&logoColor=white">
  <img alt="db" src="https://img.shields.io/badge/db-PostgreSQL-336791?style=flat-square&logo=postgresql&logoColor=white">
</p>

---

## 🎯 ¿Qué resuelve este sistema?

Una asociación con **múltiples iglesias** y administradores distribuidos
necesitaba un sistema donde:

- Cada **pastor** pueda subir informes, anuncios y gestionar su iglesia
- Una cuenta **principal (ROOT)** controle todo, apruebe nuevos admins y
  audite cada acción
- Los **administradores móviles** no usen el navegador — sólo una app firmada
  distribuida controladamente
- **Ningún admin pueda auto-promoverse**: la cadena de confianza es
  estrictamente ROOT→ROOT

## ✨ Highlights técnicos

### 🔐 Cadena cerrada ROOT→ROOT con 5 capas de validación

Crear una segunda cuenta ROOT requiere **todas las condiciones al mismo
tiempo**:

1. Sesión activa como ROOT (`RootRoleGuard`)
2. Dispositivo registrado como `ROOT_DEVICE` (`RootDeviceGuard`)
3. Origin válido (`AdminOriginGuard` — acepta tanto la web como el
   esquema custom de la app)
4. Re-verificación del rol del actor contra la BD al crear la invitación
   (defensa en profundidad — no se confía solo en el JWT)
5. Re-verificación del creador como ROOT activo **al momento de aceptar**
   la invitación (cierra la ventana de race condition entre crear y
   aceptar; si quedó degradado en el medio, la invitación se REVOKED
   automáticamente)

### 🏛️ Permisos granulares multi-iglesia

Un admin no-ROOT puede ser asignado a varias iglesias con permisos
distintos en cada una (`AdminChurchAssignment` con `permissions jsonb`).
Templates predefinidos: Pastor, Tesorero, Secretario, Custom.

### 📱 App Flutter Android con distribución controlada

- Detección automática de móvil en la web → redirige a
  `/admin/mobile-required` con deep link `aiencadmin://invite?token=...`
- APK firmado **automáticamente en CI** (`.github/workflows/admin-app-release.yml`)
  al pushear un tag `admin-app-v*`
- Identidad de dispositivo estable (`shared_preferences`) — el bug típico de
  "no me deja entrar desde el mismo teléfono" está corregido y cubierto
  por tests E2E
- Mapa OpenStreetMap (sin API keys), image picker, file picker para
  adjuntos, biometría como TODO documentado

### 📊 Auditoría diferenciada

Eventos críticos tienen su propio `actionType` (no se mezclan con metadata):
`ROOT_INVITATION_CREATED`, `ROOT_ACCOUNT_CREATED`, `ROLE_PROMOTED_TO_ROOT`,
`ROLE_DEMOTED_TO_ADMIN`. Cualquier alerta SIEM puede dispararse sin parsear
campos custom.

### 🧪 48 tests passing en backend

```bash
cd apps/api && npm test
# Test Suites: 10 passed, 10 total
# Tests:       48 passed, 48 total
```

Cobertura: cadena ROOT→ROOT, cambio de rol (incl. protección "último
ROOT"), `AdminOriginGuard` (incluyendo bug de seguridad encontrado y
corregido durante QA), retry-login con mismo deviceId, rate limiting,
acceso pending→approved→active.

---

## 🗂 Estructura

```
apps/
├─ api/         ← Backend NestJS 11 + Fastify + TypeORM (PostgreSQL) + Cloudinary
├─ web/         ← Frontend Next.js 16 (App Router) + TypeScript + Tailwind
└─ admin_app/   ← App Flutter Android (Dart 3.11) firmada
```

| App | Stack | Despliegue |
|---|---|---|
| `api/` | NestJS 11, Fastify, TypeORM, Helmet, rate-limit, JWT cookies HttpOnly | Railway |
| `web/` | Next.js 16, React 19, Tailwind, Server Actions, proxy interno para cookies cross-origin | Vercel |
| `admin_app/` | Flutter 3.41, dio + cookie jar persistente, go_router, flutter_map (OSM), Material 3 dark theme | GitHub Releases (APK firmado) |

---

## 🚀 Setup local en 3 comandos

### Requisitos

- Node.js 20 o 22
- PostgreSQL 14+
- Flutter 3.41+ (solo si vas a tocar la app)
- Cuenta de Cloudinary (gratis)

### Pasos

1. Crear `apps/api/.env` (basado en `apps/api/.env.example`) y
   `apps/web/.env.local` con `NEXT_PUBLIC_API_URL=http://localhost:3001`.
2. Arrancar:

```bash
# Terminal 1 — API
cd apps/api && npm install && npm run start:dev

# Terminal 2 — Web
cd apps/web && npm install && npm run dev

# Terminal 3 — App Android (opcional)
cd apps/admin_app && flutter pub get && flutter run
```

- Web: <http://localhost:3000>
- API: <http://localhost:3001>

El esquema lo crean las migraciones, que corren solas al arrancar la API
(`migrationsRun: true`): basta con una base de datos vacía. Después se va a
`/admin/bootstrap` para crear la cuenta ROOT inicial.

---

## 🧪 Tests

```bash
cd apps/api
npm test          # Jest, 48 tests, ~12s
```

```bash
cd apps/admin_app
flutter analyze   # 0 issues
flutter test      # smoke tests
```

```bash
cd apps/web
npx tsc --noEmit  # type check
npm run build     # build prod
```

---

## 📦 Distribución del APK

```bash
# Una sola vez por vida del proyecto: generar keystore
pwsh apps/admin_app/scripts/setup-release-keystore.ps1  # Windows
bash apps/admin_app/scripts/setup-release-keystore.sh   # macOS/Linux

# Cada release nuevo
git tag admin-app-v0.2.0
git push origin admin-app-v0.2.0
# GitHub Actions firma + publica los APK en /releases
```

Detalles completos en
[`apps/admin_app/docs/release-distribution.md`](apps/admin_app/docs/release-distribution.md).

---

## 🚢 Despliegue en producción

| Pieza | Servicio | Costo |
|---|---|---|
| Frontend | [Vercel](https://vercel.com) | Gratis (proyectos personales) |
| Backend | [Railway](https://railway.app) | $5 USD/mes en crédito gratis |
| Base de datos | [Neon](https://neon.tech) (Postgres serverless) | Gratis hasta 3 GB |
| Imágenes | [Cloudinary](https://cloudinary.com) | Gratis hasta 25 GB |
| APK release | GitHub Releases | Gratis |
| Dominio | Cloudflare / Namecheap | ~$10 USD/año |

Receta completa con env vars, secrets y workflow CI en
[`apps/admin_app/docs/release-distribution.md`](apps/admin_app/docs/release-distribution.md).

### Mini-receta

```bash
# 1. Crear BD en Neon → guardar DATABASE_URL
# 2. Deploy backend en Railway desde apps/api/Dockerfile
#    - Root Directory: apps/api
#    - Env vars: ver sección abajo
# 3. Deploy frontend en Vercel
#    - Root Directory: apps/web
#    - NEXT_PUBLIC_API_URL apunta a Railway
# 4. Web → /admin/bootstrap → crear cuenta ROOT con ADMIN_BOOTSTRAP_SECRET
# 5. CRÍTICO: en Railway, después del primer ROOT, desactivar:
#      ADMIN_BOOTSTRAP_ENABLED=false
#      DB_SYNCHRONIZE=false
```

---

## 🔐 Variables de entorno (referencia)

### Backend (`apps/api/.env`)

| Variable | Obligatorio | Descripción |
|---|:-:|---|
| `NODE_ENV` | ✓ | `development` / `production` |
| `PORT` | ✓ | Puerto HTTP (Railway lo inyecta) |
| `DATABASE_URL` | ✓ | URL completa de Postgres |
| `DB_SYNCHRONIZE` | | `true` la primera vez, después `false` |
| `CLOUDINARY_CLOUD_NAME` | ✓ | Cloudinary |
| `CLOUDINARY_API_KEY` | ✓ | Cloudinary |
| `CLOUDINARY_API_SECRET` | ✓ | Cloudinary |
| `WEB_ORIGIN` | ✓ | Dominio del frontend (sin barra final) |
| `MOBILE_APP_ORIGIN` | si app móvil | `aiencadmin://app` |
| `ADMIN_SESSION_SECRET` | ✓ | ≥32 chars, JWT secret |
| `ADMIN_SESSION_TTL_SECONDS` | ✓ | Duración sesión activa. Recomendado `2592000` (30 días); la sesión se renueva en cada uso y la app pide la contraseña cada 14 días |
| `ADMIN_PENDING_SESSION_TTL_SECONDS` | ✓ | Duración sesión pendiente |
| `ADMIN_TRUSTED_DEVICE_TTL_SECONDS` | ✓ | Duración cookie de dispositivo |
| `ADMIN_ACCESS_REQUEST_TTL_SECONDS` | ✓ | Duración solicitud de acceso |
| `ADMIN_ACCESS_REQUEST_RETRY_COOLDOWN_SECONDS` | ✓ | Cooldown reintento |
| `ADMIN_BOOTSTRAP_ENABLED` | ✓ | `true` solo para crear el primer ROOT |
| `ADMIN_BOOTSTRAP_SECRET` | si bootstrap=on | ≥32 chars |

### Frontend (`apps/web/.env.local`)

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL pública de la API |
| `NEXT_PUBLIC_AIENC_APK_URL` | URL del APK firmado en GitHub Releases |

### App (`apps/admin_app/` — compile-time via `--dart-define`)

| Variable | Descripción |
|---|---|
| `AIENC_API_BASE_URL` | URL de la API |
| `AIENC_MOBILE_ORIGIN` | Debe coincidir con `MOBILE_APP_ORIGIN` del backend |

---

## 🧠 Decisiones de arquitectura

- **Cookies HttpOnly con `SameSite=None; Secure`** entre dominios distintos
  (Vercel ↔ Railway). El frontend tiene un proxy interno
  (`/api-proxy/[...path]`) para que las cookies queden first-party cuando
  el browser bloquea third-party.
- **`tokenVersion` en cada cuenta** se incrementa al cambiar el rol → todos
  los JWT viejos quedan inválidos inmediatamente sin necesidad de un store
  de revocación.
- **Migraciones TypeORM** que se aplican solas al arrancar. La primera
  (`EsquemaBase`) crea el esquema completo y no hace nada si ya existe, así
  que el sistema se puede levantar desde una base vacía. En producción
  `synchronize` está siempre en `false`.
- **Cloudinary como CDN externo** — la API nunca almacena archivos. Eso
  permite que el backend se replique horizontalmente sin estado.
- **Bootstrap idempotente al arrancar**: un `AdminAssignmentsMigratorService`
  con `OnApplicationBootstrap` convierte cuentas legacy (con
  `assignedChurchId` único) al modelo nuevo (many-to-many con
  permisos jsonb). Se ejecuta sin tocar BD si ya está migrada.
- **App Flutter dark-only**: la marca AIENC funciona sobre fondos oscuros
  con acentos de gemas (zafiro/esmeralda/topacio). No hay tema light.
- **Locale forzado `es-CO`** en el `MaterialApp` para que los date-pickers
  y diálogos de Material salgan en español aunque el dispositivo esté en
  inglés.

---

## 📂 Documentación adicional

- [`apps/admin_app/README.md`](apps/admin_app/README.md) — estado de la app
- [`apps/admin_app/docs/release-distribution.md`](apps/admin_app/docs/release-distribution.md) — receta completa de publicación del APK

---

<p align="center">
  <em>Diseñado para que un pastor desde su teléfono pueda subir un informe en menos de un minuto, y para que un atacante con un JWT robado no pueda hacer nada.</em>
</p>
