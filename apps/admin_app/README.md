# AIENC Admin (Flutter Android)

App nativa Android del panel administrativo AIENC. Sirve como cliente
obligatorio en teléfonos — el panel web bloquea acceso en móviles y
redirige a `/admin/mobile-required`, que ofrece la descarga del APK y
un deep link `aiencadmin://invite?token=…` para abrir esta app con la
invitación ya cargada.

## Estado

- Bootstrap del proyecto, package `co.aienc.admin`, minSdk 26
- Tema gemas (zafiro / esmeralda / topacio / amatista) sincronizado
  con la web
- API client (dio + cookie jar persistente, Origin header
  `aiencadmin://app`) — el backend acepta este origin vía
  `MOBILE_APP_ORIGIN` env var
- Auth: aceptar invitación (token preview → set password), login
  por usuario+contraseña, lock screen con PIN local de 6 dígitos
- Pantallas con datos reales:
  - Dashboard con KPIs + bar chart (ofrendas vs egresos) + line chart
    (asistencia mensual) usando `fl_chart`
  - Anuncios: globales y por iglesia (tabs)
  - Iglesias: listado con avatar, ciudad, estado
  - Informes: listado con filtros por tipo, alta de informe con todos
    los tipos (ofrendas, asistencia, gasto + categoría, evento,
    solicitud, otro)
  - Iglesias: edición completa (datos, ubicación en el mapa, imágenes,
    activar o desactivar), representantes, anuncios locales y estudios
    en audio
  - Seguridad: protección de la app, tutorial y canal de soporte para
    todos; para el administrador principal, además, invitaciones,
    cuentas, permisos, historial por cuenta y auditoría global
- Deep link `aiencadmin://invite?token=…` y `aiencadmin://open`
  configurado en `AndroidManifest.xml` con manejo en runtime vía
  `app_links`
- Biometría (huella) implementada con `local_auth`. Requiere que
  `MainActivity` extienda `FlutterFragmentActivity`: el diálogo de
  Android necesita un `FragmentActivity`
- PIN local con SHA-256 salado e iterado 20 000 veces, y cookie jar
  cifrado en reposo con AES-256-GCM usando una llave derivada del PIN.
  Quedan PIN heredados con el hash antiguo (FNV-1a sin sal), que se
  migran solo al desbloquear

## Stack

- Flutter 3.41.3 / Dart 3.11
- `dio` + `dio_cookie_manager` + `cookie_jar` (persistente en disco)
- `go_router` 14
- `fl_chart` 0.69
- `app_links` 6.3 (deep links)
- `shared_preferences` 2.3 (PIN + último usuario)
- `intl` 0.20 (formato es-CO)

## Build

```bash
cd apps/admin_app
flutter pub get
flutter build apk --debug
```

Salida en `build/app/outputs/flutter-apk/app-debug.apk` (~150 MB en
debug; release queda en ~35 MB tras minify).

### Configuración por entorno

Variables inyectadas en compile-time vía `--dart-define`:

```bash
flutter build apk --release \
  --dart-define=AIENC_API_BASE_URL=https://api.aienc.co \
  --dart-define=AIENC_MOBILE_ORIGIN=aiencadmin://app
```

Defaults (debug en emulador Android):

- `AIENC_API_BASE_URL=http://10.0.2.2:3001` — apunta al host del
  emulador
- `AIENC_MOBILE_ORIGIN=aiencadmin://app` — debe coincidir con la env
  `MOBILE_APP_ORIGIN` configurada en el backend NestJS

## Firma release y distribución

Toda la receta paso a paso (generar keystore, configurar Vercel y Railway,
publicar releases manuales o vía GitHub Actions) está en
[`docs/release-distribution.md`](docs/release-distribution.md).

Resumen:

```bash
# Una sola vez por vida del proyecto
pwsh apps/admin_app/scripts/setup-release-keystore.ps1   # Windows
bash apps/admin_app/scripts/setup-release-keystore.sh    # macOS/Linux

# Para publicar (CI):
git tag admin-app-v0.2.0
git push origin admin-app-v0.2.0
# El workflow .github/workflows/admin-app-release.yml firma y publica.

# O para publicar manualmente:
cd apps/admin_app
flutter build apk --release \
  --dart-define=AIENC_API_BASE_URL=https://api.aienc.co \
  --dart-define=AIENC_MOBILE_ORIGIN=aiencadmin://app
# y sube build/app/outputs/flutter-apk/app-release.apk a GitHub Releases.
```

## Backend (configuración necesaria)

El `AdminOriginGuard` rechaza mutaciones cuyo header `Origin` no
coincide con `WEB_ORIGIN` o `MOBILE_APP_ORIGIN`. En Railway añadir:

```
MOBILE_APP_ORIGIN=aiencadmin://app
```

Sin esa variable, todas las mutaciones POST/PATCH/DELETE desde la app
fallarán con 403 "Invalid request origin".

## Workaround del SDK con espacios en la ruta

Algunos paquetes recientes (`objective_c`, `path_provider_foundation`
2.5+, `win32` 6.x) registran *native asset build hooks* que ejecutan
`dart compile kernel` pasando la ruta del Flutter SDK sin citar. Si
esa ruta contiene espacios (caso del equipo de desarrollo:
`C:\Users\Ruben Gutierrez\Downloads\flutter_windows...`), la build
rompe con `"C:\Users\Ruben" no se reconoce…`.

Mitigación actual en `pubspec.yaml`:

```yaml
dependency_overrides:
  path_provider_foundation: 2.4.4
  win32: 5.15.0
```

Fix definitivo: mover el SDK Flutter a una ruta sin espacios (ej.
`C:\flutter\`) y soltar los overrides.

## Cache Gradle corrupto (issue de red)

Si al construir aparece `Could not parse POM … Content is not allowed
in prolog`, significa que algún POM cacheado quedó relleno de espacios
(visto en este equipo bajo Java 21 + Gradle 8.14, probablemente por
antivirus / proxy reescribiendo descargas). Workaround configurado en
`android/gradle.properties`:

```properties
org.gradle.parallel=false
org.gradle.daemon=false
org.gradle.workers.max=1
```

Si vuelve a aparecer, purgar el subárbol corrupto y reintentar:

```bash
rm -rf ~/.gradle/caches/modules-2/files-2.1/org.jetbrains.kotlin/kotlin-stdlib/1.9.24
flutter build apk --debug
```
