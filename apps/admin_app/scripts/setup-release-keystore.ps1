# Genera el keystore release para firmar el APK de AIENC Admin.
#
# Es interactivo: pregunta contrasenas y datos del certificado, y al
# terminar deja dos archivos LOCALES (nunca commiteados al repo):
#
#   apps/admin_app/android/aienc-admin-release.jks  -- keystore en si
#   apps/admin_app/android/key.properties           -- config para Gradle
#
# Si pierdes el keystore, no puedes actualizar la app instalada en los
# telefonos de los administradores. Trata el archivo .jks con el cuidado
# de una llave privada SSH: guardalo cifrado en al menos dos lugares.
#
# Uso (desde la raiz del repo o cualquier subdirectorio):
#
#   powershell -ExecutionPolicy Bypass -File apps/admin_app/scripts/setup-release-keystore.ps1
#
# Nota: el script solo usa caracteres ASCII para evitar problemas de
# codificacion en Windows PowerShell. Los acentos los esquivamos.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Resolve-Keytool {
  # Buscamos primero en ubicaciones tipicas de Windows. Test-Path es mas
  # confiable que intentar ejecutar el binario (que puede fallar por mil
  # razones distintas a "no existe").
  $candidates = @(
    'C:\Program Files\Java\jdk-21\bin\keytool.exe',
    'C:\Program Files\Java\jdk-17\bin\keytool.exe',
    'C:\Program Files\Java\jdk-11\bin\keytool.exe',
    'C:\Program Files\Eclipse Adoptium\jdk-21.0.4.7-hotspot\bin\keytool.exe',
    'C:\Program Files\Eclipse Adoptium\jdk-17.0.13.11-hotspot\bin\keytool.exe'
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) {
      return $c
    }
  }
  # Si no esta en ubicaciones tipicas, intentamos via PATH.
  $cmd = Get-Command keytool -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }
  # Tambien probamos buscar cualquier JDK instalado bajo "Program Files\Java".
  $jdkRoot = 'C:\Program Files\Java'
  if (Test-Path $jdkRoot) {
    $found = Get-ChildItem -Path $jdkRoot -Recurse -Filter 'keytool.exe' -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($found) {
      return $found.FullName
    }
  }
  throw "No se encontro 'keytool'. Instala un JDK 17 o superior y vuelve a intentar."
}

$keytool = Resolve-Keytool
Write-Host "-> keytool detectado: $keytool" -ForegroundColor DarkGray

# Resolvemos rutas relativas a la ubicacion del script.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$androidDir = Resolve-Path (Join-Path $scriptDir '..\android')
$keystorePath = Join-Path $androidDir 'aienc-admin-release.jks'
$propsPath = Join-Path $androidDir 'key.properties'

if (Test-Path $keystorePath) {
  throw "Ya existe un keystore en $keystorePath. Si quieres regenerarlo, " +
        "muevelo a un backup primero. NO lo sobreescribas si ya publicaste " +
        "una version con el."
}

Write-Host ""
Write-Host "Vamos a generar el keystore de AIENC Admin." -ForegroundColor Cyan
Write-Host "Si pierdes las contrasenas, no podras actualizar la app." -ForegroundColor Yellow
Write-Host ""

# Pide una contrasena con confirmacion.
function Read-PasswordWithConfirm([string]$prompt) {
  while ($true) {
    $a = Read-Host -Prompt $prompt -AsSecureString
    $b = Read-Host -Prompt "  Confirmar $prompt" -AsSecureString
    $aPlain = [System.Net.NetworkCredential]::new('', $a).Password
    $bPlain = [System.Net.NetworkCredential]::new('', $b).Password
    if ($aPlain.Length -lt 8) {
      Write-Host "  [!] Minimo 8 caracteres. Reintenta." -ForegroundColor Yellow
      continue
    }
    if ($aPlain -ne $bPlain) {
      Write-Host "  [!] Las contrasenas no coinciden. Reintenta." -ForegroundColor Yellow
      continue
    }
    return $aPlain
  }
}

$storePass = Read-PasswordWithConfirm 'Contrasena del keystore'
$keyPass = Read-PasswordWithConfirm 'Contrasena de la key (puede ser la misma)'

Write-Host ""
Write-Host "Datos del certificado (quedan visibles en cada APK firmado)." -ForegroundColor Cyan
$cnDefault = 'AIENC Admin'
$cn = Read-Host "  Nombre comun (CN) [$cnDefault]"
if ([string]::IsNullOrWhiteSpace($cn)) { $cn = $cnDefault }
$orgDefault = 'Iglesia Asociacion de Iglesias Evangelicas del Norte de Colombia'
$org = Read-Host "  Organizacion (O) [$orgDefault]"
if ([string]::IsNullOrWhiteSpace($org)) { $org = $orgDefault }
$ouDefault = 'Tecnologia'
$ou = Read-Host "  Unidad organizacional (OU) [$ouDefault]"
if ([string]::IsNullOrWhiteSpace($ou)) { $ou = $ouDefault }
$cityDefault = 'Barranquilla'
$city = Read-Host "  Ciudad (L) [$cityDefault]"
if ([string]::IsNullOrWhiteSpace($city)) { $city = $cityDefault }
$stateDefault = 'Atlantico'
$state = Read-Host "  Departamento (ST) [$stateDefault]"
if ([string]::IsNullOrWhiteSpace($state)) { $state = $stateDefault }
$countryDefault = 'CO'
$country = Read-Host "  Pais (C, 2 letras) [$countryDefault]"
if ([string]::IsNullOrWhiteSpace($country)) { $country = $countryDefault }

$dname = "CN=$cn, OU=$ou, O=$org, L=$city, ST=$state, C=$country"
$alias = 'aienc-admin'

Write-Host ""
Write-Host "Generando keystore (valido por 27 anos)..." -ForegroundColor DarkGray

& $keytool -genkeypair -v `
  -keystore $keystorePath `
  -alias $alias `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass $storePass -keypass $keyPass `
  -dname $dname

if ($LASTEXITCODE -ne 0) {
  throw "keytool fallo al generar el keystore."
}

# Escribimos key.properties que build.gradle.kts ya sabe leer.
# IMPORTANTE: usar forward slash '/'. En archivos .properties de Java el
# backslash '\' es caracter de escape (`\a` se interpreta como 'a' sin el
# separador). Si usaramos '..\aienc-admin-release.jks', Gradle lo leeria
# como '..aienc-admin-release.jks' y no encontraria el keystore.
$relStorePath = '../aienc-admin-release.jks'
$content = @"
# Generado por scripts/setup-release-keystore.ps1
# NO commitear este archivo. Ya esta en .gitignore.
storePassword=$storePass
keyPassword=$keyPass
keyAlias=$alias
storeFile=$relStorePath
"@
Set-Content -Path $propsPath -Value $content -Encoding utf8

Write-Host ""
Write-Host "[OK] Keystore creado en: $keystorePath" -ForegroundColor Green
Write-Host "[OK] Properties creado en: $propsPath" -ForegroundColor Green
Write-Host ""
Write-Host "Siguientes pasos:" -ForegroundColor Cyan
Write-Host "  1) Guarda ambos archivos en un lugar seguro (no solo este disco)." -ForegroundColor White
Write-Host "  2) Para construir el APK firmado:" -ForegroundColor White
Write-Host "       cd apps/admin_app" -ForegroundColor DarkGray
Write-Host "       flutter build apk --release --dart-define=AIENC_API_BASE_URL=https://tu-backend.railway.app --dart-define=AIENC_MOBILE_ORIGIN=aiencadmin://app" -ForegroundColor DarkGray
Write-Host "  3) Sube el APK como asset de un GitHub Release." -ForegroundColor White
Write-Host "  4) Configura NEXT_PUBLIC_AIENC_APK_URL en Vercel apuntando a ese asset." -ForegroundColor White
