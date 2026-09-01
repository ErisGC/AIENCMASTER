# Distribución del APK — guía paso a paso

Esta guía es la receta completa para llevar la app de "código en mi máquina"
a "los pastores la descargan desde el botón de la web". Hay tres entornos
involucrados:

| Entorno  | Servicio        | Para qué                                                  |
| -------- | --------------- | --------------------------------------------------------- |
| Backend  | Railway         | API NestJS que la app consume                             |
| Web      | Vercel          | El panel admin que redirige a móviles a `/admin/mobile-required` |
| Distrib. | GitHub Releases | Aloja los APK firmados (gratis, versionado, sin infra)    |

## Resumen del flujo de un nuevo administrador en móvil

```
┌─────────────────────────────────────────────────────────────────────┐
│  Pastor recibe link aiencadmin://invite?token=… por WhatsApp        │
│                                                                     │
│  Si abre en navegador del teléfono:                                 │
│    1. La web detecta móvil y redirige a /admin/mobile-required      │
│    2. Botón "Descargar APK" → NEXT_PUBLIC_AIENC_APK_URL             │
│       (URL del asset en GitHub Releases)                            │
│    3. Instala el APK (warning de "fuente desconocida" 1 vez)        │
│    4. Abre app, pega el token, define contraseña                    │
│                                                                     │
│  Si abre el link directo (aiencadmin://) con la app ya instalada:   │
│    1. Android invoca la app con deep link                           │
│    2. App carga el token automáticamente                            │
│    3. Define contraseña → activado                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Paso 1 — Configurar el backend (Railway)

Añadir env var nueva al servicio API:

```
MOBILE_APP_ORIGIN=aiencadmin://app
```

Sin esto, todas las mutaciones desde la app fallan con `403 "Invalid request origin"` porque el `AdminOriginGuard` rechaza el header `Origin` que envía Flutter.

`WEB_ORIGIN` debe seguir siendo la URL del frontend Vercel (sin cambios).

## Paso 2 — Generar el keystore release (UNA VEZ POR VIDA DEL PROYECTO)

El keystore es la "identidad" de la app: Android obliga a que cualquier
update venga firmado con la misma key. **Pierde la key = no puedes
actualizar nunca más esa app en los teléfonos**; los usuarios tendrían
que desinstalar e instalar una nueva.

### En Windows (PowerShell)

```powershell
pwsh apps/admin_app/scripts/setup-release-keystore.ps1
```

### En macOS / Linux / WSL

```bash
bash apps/admin_app/scripts/setup-release-keystore.sh
```

El script:
- Pregunta contraseñas (mínimo 8 caracteres, las confirma)
- Pregunta datos del certificado (CN, O, OU, ciudad, depto, país) con defaults sensatos
- Genera `apps/admin_app/android/aienc-admin-release.jks` (válido 27 años)
- Genera `apps/admin_app/android/key.properties` que Gradle ya sabe leer
- **NUNCA commitea nada** — ambos archivos están en `.gitignore`

### Backup obligatorio

Apenas se genere, guarda **ambos archivos** en al menos dos lugares
seguros distintos de tu disco:

- Un gestor de secretos (1Password / Bitwarden) — pega el `.jks` como
  attachment cifrado y el contenido de `key.properties` como nota
- Un USB cifrado guardado físicamente
- Opcionalmente: un repositorio privado dedicado a secretos (otro repo
  separado, con cifrado lado servidor de GitHub), o un bucket S3 con
  KMS

## Paso 3 — Build local de prueba

```bash
cd apps/admin_app
flutter build apk --release \
  --dart-define=AIENC_API_BASE_URL=https://TU-BACKEND.railway.app \
  --dart-define=AIENC_MOBILE_ORIGIN=aiencadmin://app
```

Output esperado:

- `build/app/outputs/flutter-apk/app-release.apk` — universal (~40 MB)
- `build/app/outputs/flutter-apk/app-arm64-v8a-release.apk` — sólo ARM64 (~14 MB)
- `build/app/outputs/flutter-apk/app-armeabi-v7a-release.apk` — sólo ARMv7 (~13 MB)
- `build/app/outputs/flutter-apk/app-x86_64-release.apk` — emulador x86_64

Pruébalo en un teléfono real antes de publicar: instala vía `adb install -r` o transfiriendo el APK por cable.

## Paso 4 — Publicar en GitHub Releases (camino manual)

1. En GitHub → tu repo → **Releases** → **Draft a new release**
2. **Tag version**: `admin-app-v0.1.0` (semver + el prefijo `admin-app-`)
3. **Release title**: `AIENC Admin v0.1.0`
4. Sube como asset:
   - `aienc-admin.apk` (renombra el universal — la web va a apuntar a este)
   - Opcional: los APK split por ABI con el nombre original
5. **Publish release** → el asset queda con URL pública del tipo
   ```
   https://github.com/<owner>/<repo>/releases/download/admin-app-v0.1.0/aienc-admin.apk
   ```

## Paso 5 — Publicar en GitHub Releases (camino CI, recomendado)

El workflow `.github/workflows/admin-app-release.yml` se dispara con cada
push de tag `admin-app-v*` y publica los APK firmados automáticamente.

### Configurar los secrets (UNA VEZ)

GitHub → tu repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Nombre                       | Cómo obtenerlo                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `ADMIN_APP_KEYSTORE_B64`     | `base64 -w0 apps/admin_app/android/aienc-admin-release.jks` (Linux/macOS). En Windows: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("apps\admin_app\android\aienc-admin-release.jks"))` |
| `ADMIN_APP_KEY_PROPERTIES`   | Pega el contenido literal de `apps/admin_app/android/key.properties`                        |
| `AIENC_API_BASE_URL`         | `https://TU-BACKEND.railway.app`                                                            |
| `AIENC_MOBILE_ORIGIN`        | `aiencadmin://app`                                                                          |

### Disparar el release

Primero sube la versión en `apps/admin_app/pubspec.yaml` (ej. `version: 0.3.1+19`),
haz commit y push. Después, cualquiera de las dos vías:

```bash
# Por tag
git tag admin-app-v0.3.1
git push origin admin-app-v0.3.1
```

```bash
# Manual (más fiable: el push del tag no siempre dispara el workflow)
gh workflow run admin-app-release.yml --ref main -f version_label=v0.3.1
```

GitHub Actions hace el resto: build, firma, publica. Tarda ~6-8 min.

**Verifica siempre que el release quedó publicado antes de avisar a nadie:**

```bash
curl -sI https://github.com/<owner>/<repo>/releases/latest/download/aienc-admin.apk | grep -i location
```

### Qué comprueba el workflow antes de compilar

Estas comprobaciones detienen el lanzamiento; ninguna es un aviso que se
pueda ignorar:

- **Los cuatro secrets existen.** `--dart-define` con un valor vacío no cae al
  valor por defecto del código: define la variable como cadena vacía. Sin
  `AIENC_API_BASE_URL` se publicaba un APK firmado que no sabía con qué
  servidor hablar.
- **La versión tiene formato `X.Y.Z`.** La app saca el número del nombre del
  release para avisar de actualizaciones. Antes, un lanzamiento manual sin
  etiqueta reutilizaba `admin-app-manual`; ese release pasaba a ser el último y
  el aviso de actualización dejaba de funcionar hasta el siguiente release con
  etiqueta correcta.
- **La versión coincide con el `pubspec.yaml`.** Si no, la app descargaría una
  versión que al instalarse dice tener otro número y volvería a ofrecer la
  misma actualización indefinidamente.
- **El APK no está firmado con la llave de depuración.** Gradle recurre a ella
  en silencio si falta `key.properties`; un APK así rompe la actualización de
  todos los usuarios instalados y sólo se arregla desinstalando. En la
  integración continua se compila con `-Pexigir-firma-release=true`, que hace
  fallar la compilación en vez de avisar.

## Paso 6 — Cablear la URL del APK en Vercel

En Vercel → proyecto web → **Settings → Environment Variables**:

```
NEXT_PUBLIC_AIENC_APK_URL = https://github.com/<owner>/<repo>/releases/latest/download/aienc-admin.apk
```

> **Tip**: usa `/latest/download/` (no la URL con la versión fija). Así,
> cuando publiques una nueva versión, la web automáticamente sirve el
> APK nuevo sin redeploy.

Después: **Redeploy** del frontend para que la env se apliquen.

## Paso 7 — Verificación end-to-end

Desde un teléfono real (no emulador):

1. Abre `https://TU-WEB.vercel.app/admin/login` → debe redirigir a
   `/admin/mobile-required`
2. Botón "Descargar APK" → debe iniciar la descarga del archivo
3. Instala el APK aceptando "fuente desconocida"
4. Abre la app → pantalla Welcome muestra `v0.X.Y (N)` en el footer
5. Generar una invitación desde la web; pegar el token en la app
6. Confirmar que la cuenta se activa y entra al panel

## Bumpeo de versión

Cada release necesita un `versionCode` (número entero monótono creciente)
y un `versionName` (semver legible). Ambos viven en
`apps/admin_app/pubspec.yaml`:

```yaml
version: 0.2.0+2
#         ─┬─ ┬
#          │  └── versionCode (entero, +1 en cada release)
#          └── versionName (semver para humanos)
```

**Reglas para bumpear**:

- Fix sin features nuevas: `0.2.0+2 → 0.2.1+3`
- Feature pequeña: `0.2.0+2 → 0.3.0+3`
- Cambio mayor / breaking: `0.X.Y → 1.0.0`
- El `+N` siempre incrementa, nunca repite — Android rechaza un APK
  con `versionCode` igual o menor al instalado

## Rotación de keystore (rara, pero por si acaso)

Si el keystore se pierde y aún no has publicado:

```bash
rm apps/admin_app/android/aienc-admin-release.jks
rm apps/admin_app/android/key.properties
bash apps/admin_app/scripts/setup-release-keystore.sh
```

Si el keystore se pierde y ya tienes usuarios con la app instalada:
**no hay forma de actualizar la app existente**. Tienes dos opciones:

1. **Cambiar el `applicationId`** (de `co.aienc.admin` a `co.aienc.admin2`),
   firmar con un keystore nuevo, y pedir a todos que desinstalen e
   instalen la "nueva" app. Funcionalmente igual pero pierden los datos
   locales (PIN, cookies). En este caso, la sesión web seguirá
   funcionando porque las cookies viven en el dispositivo, no en la app.
2. **Play Integrity / App Signing by Google Play**: sólo aplica si
   publicas en Play Store, lo que aquí explícitamente no hacemos.

El moraleja: **backup del keystore en tres lugares distintos desde el día 1**.

## Troubleshooting

### "INSTALL_FAILED_UPDATE_INCOMPATIBLE"

El APK que intentas instalar está firmado con un keystore diferente al
APK ya instalado. Soluciones:

- Desinstalar la app existente y reinstalar (pierde datos locales)
- O firmar con el keystore original (recupéralo del backup)

### "App not installed as package conflicts with an existing package"

Mismo problema que arriba — keystore distinto o versionCode menor.

### El botón "Descargar APK" no descarga, abre una página

`NEXT_PUBLIC_AIENC_APK_URL` no apunta directamente al asset. Asegúrate
de que la URL termina en `.apk` y devuelve `Content-Type: application/vnd.android.package-archive`. GitHub Releases lo hace bien si usas el
patrón `/releases/latest/download/<nombre>.apk`.

### La app crashea al abrir en release (debug funciona)

R8 / Proguard eliminó una clase que un plugin usa por reflection. Revisa
`apps/admin_app/android/app/proguard-rules.pro` y añade una regla
`-keep class <FullClassName> { *; }`. Para diagnosticar, ejecuta:

```bash
adb logcat | grep -i 'AndroidRuntime\|aienc'
```

### `flutter build apk --release` falla en Windows con "Unable to read file ...app.dill"

Bug conocido del AOT snapshotter de Flutter en Windows cuando el path
del proyecto o del SDK contiene caracteres no-ASCII (acentos, eñe, etc.).
El error típico se ve como:

```
Error: Unable to read file: C:\...\Proyectos Rub�n\...app.dill
                                                ^^^^ "é" corrompida
```

`flutter build apk --debug` no se ve afectado y sigue funcionando.

**Workarounds**:

1. **Mover el proyecto a un path ASCII puro**: `C:\dev\aienc_2\`.
   Es el fix definitivo.
2. **Usar la build CI**: el workflow `.github/workflows/admin-app-release.yml`
   corre en Linux donde el bug no existe. Para probar el release, push
   un tag y deja que GitHub Actions arme el APK.
3. **Crear un junction**: `mklink /J C:\dev\aienc_2 "C:\Users\Ruben Gutierrez\Proyectos Rubén\AIENC_2"` y trabajar desde el alias.

### `403 Invalid request origin` en cualquier acción que mute datos

`MOBILE_APP_ORIGIN` no está configurado en Railway o tiene un valor
distinto a `aiencadmin://app`. La constante en código está en
`apps/admin_app/lib/core/config/app_config.dart` y se inyecta con
`--dart-define=AIENC_MOBILE_ORIGIN=…` en build.
