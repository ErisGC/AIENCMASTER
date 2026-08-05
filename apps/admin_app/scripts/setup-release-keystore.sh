#!/usr/bin/env bash
# Genera el keystore release para firmar el APK de AIENC Admin.
#
# Es interactivo: pregunta contraseñas y datos del certificado, y al
# terminar deja dos archivos LOCALES (nunca commiteados al repo):
#
#   apps/admin_app/android/aienc-admin-release.jks  ← keystore en sí
#   apps/admin_app/android/key.properties           ← configuración para Gradle
#
# Pierde el keystore = pierdes la capacidad de publicar updates de la app
# que reemplacen a la versión instalada. Guárdalo (cifrado) en al menos
# dos lugares: tu disco principal + un manager de secretos (1Password,
# Bitwarden, etc.).
#
# Uso (desde la raíz del repo o cualquier subdirectorio):
#
#   bash apps/admin_app/scripts/setup-release-keystore.sh
#
# Si ya existe un keystore en la ruta target, el script aborta sin tocarlo.

set -euo pipefail

if ! command -v keytool >/dev/null 2>&1; then
  echo "ERROR: 'keytool' no está en el PATH. Instala un JDK 17 o superior." >&2
  exit 1
fi

# Ruta del script para resolver android/
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
android_dir="$(cd "$script_dir/../android" && pwd)"
keystore_path="$android_dir/aienc-admin-release.jks"
props_path="$android_dir/key.properties"

if [ -f "$keystore_path" ]; then
  echo "ERROR: Ya existe un keystore en $keystore_path." >&2
  echo "Si quieres regenerarlo, muévelo a un backup primero. NO lo " \
       "sobreescribas si ya publicaste una versión con él." >&2
  exit 1
fi

echo ""
echo "Vamos a generar el keystore de AIENC Admin."
echo "Pierde estas contraseñas = pierdes la capacidad de actualizar la app."
echo ""

read_password_with_confirm() {
  local prompt="$1"
  local pass1 pass2
  while true; do
    read -s -p "$prompt: " pass1
    echo ""
    read -s -p "  Confirmar $prompt: " pass2
    echo ""
    if [ "${#pass1}" -lt 8 ]; then
      echo "  ⚠ Mínimo 8 caracteres. Reintenta."
      continue
    fi
    if [ "$pass1" != "$pass2" ]; then
      echo "  ⚠ Las contraseñas no coinciden. Reintenta."
      continue
    fi
    printf '%s' "$pass1"
    return
  done
}

store_pass="$(read_password_with_confirm 'Contraseña del keystore')"
key_pass="$(read_password_with_confirm 'Contraseña de la key (puede ser la misma)')"

echo ""
echo "Datos del certificado (visibles en cada APK firmado)."
read -p "  Nombre común (CN) [AIENC Admin]: " cn
cn="${cn:-AIENC Admin}"
read -p "  Organización (O) [Iglesia Asociacion de Iglesias Evangelicas del Norte de Colombia]: " org
org="${org:-Iglesia Asociacion de Iglesias Evangelicas del Norte de Colombia}"
read -p "  Unidad organizacional (OU) [Tecnologia]: " ou
ou="${ou:-Tecnologia}"
read -p "  Ciudad (L) [Barranquilla]: " city
city="${city:-Barranquilla}"
read -p "  Departamento (ST) [Atlantico]: " state
state="${state:-Atlantico}"
read -p "  País (C, 2 letras) [CO]: " country
country="${country:-CO}"

dname="CN=$cn, OU=$ou, O=$org, L=$city, ST=$state, C=$country"
alias='aienc-admin'

echo ""
echo "Generando keystore (válido por 27 años)..."
keytool -genkeypair -v \
  -keystore "$keystore_path" \
  -alias "$alias" \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass "$store_pass" -keypass "$key_pass" \
  -dname "$dname"

cat > "$props_path" <<EOF
# Generado por scripts/setup-release-keystore.sh
# NO commitear este archivo. Ya está en .gitignore.
storePassword=$store_pass
keyPassword=$key_pass
keyAlias=$alias
storeFile=../aienc-admin-release.jks
EOF

echo ""
echo "✔ Keystore creado en: $keystore_path"
echo "✔ Properties creado en: $props_path"
echo ""
echo "Siguientes pasos:"
echo "  1) Guarda ambos archivos en un lugar seguro (no solo en este disco)."
echo "  2) Para construir el APK firmado:"
echo "       cd apps/admin_app"
echo "       flutter build apk --release \\"
echo "         --dart-define=AIENC_API_BASE_URL=https://tu-backend.railway.app \\"
echo "         --dart-define=AIENC_MOBILE_ORIGIN=aiencadmin://app"
echo "  3) Sube el APK como asset de un GitHub Release."
echo "  4) Configura NEXT_PUBLIC_AIENC_APK_URL en Vercel apuntando al asset."
