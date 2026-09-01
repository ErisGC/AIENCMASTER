import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "co.aienc.admin"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "co.aienc.admin"
        // minSdk 26 (Android 8.0) — habilita BiometricPrompt moderno
        // y EncryptedSharedPreferences sin polyfills.
        minSdk = 26
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        // Configuración de firma release leída de key.properties.
        // Si el archivo no existe (entorno dev), no se registra y release
        // cae al firmado debug por compatibilidad.
        val keyPropsFile = rootProject.file("key.properties")
        if (keyPropsFile.exists()) {
            create("release") {
                val props = Properties()
                FileInputStream(keyPropsFile).use { props.load(it) }
                storeFile = file(props.getProperty("storeFile"))
                storePassword = props.getProperty("storePassword")
                keyAlias = props.getProperty("keyAlias")
                keyPassword = props.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        getByName("release") {
            val keyPropsFile = rootProject.file("key.properties")
            signingConfig = if (keyPropsFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                // Sin key.properties se firma con la llave de depuración para
                // no estorbar durante el desarrollo, pero se avisa a gritos:
                // un APK así NO se puede distribuir. Quien lo instale encima
                // de la versión buena recibe un error de firma incompatible, y
                // la cadena de actualizaciones se rompe para todos los
                // usuarios; sólo se arregla desinstalando.
                //
                // Con -Pexigir-firma-release=true (lo usa la integración
                // continua) directamente falla en vez de avisar.
                val exigir = project.findProperty("exigir-firma-release") == "true"
                val aviso = "No se encontró android/key.properties: el APK de " +
                    "release se firmará con la llave de DEPURACIÓN y NO sirve " +
                    "para distribuir."
                if (exigir) {
                    throw org.gradle.api.GradleException(aviso)
                }
                project.logger.warn("AVISO: $aviso")
                signingConfigs.getByName("debug")
            }
            // R8 minify + recurso shrinking reducen el APK ~3× respecto al
            // debug (de ~150MB a ~40-50MB). Flutter genera sus propias
            // reglas Proguard en flutter_proguard_rules.pro; añadimos las
            // nuestras en proguard-rules.pro para conservar las clases que
            // los plugins nativos (geolocator, image_picker, etc.) usan
            // vía reflection.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        getByName("debug") {
            // Debug keeps everything for hot-reload and stack traces.
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }

    // Splits por ABI: generamos un APK más pequeño por arquitectura para
    // que cada teléfono baje sólo los nativos que necesita (~12-15MB en vez
    // de ~40MB universal). El usuario puede preferir UN APK universal —
    // dejamos universal=true para que /admin/mobile-required tenga un
    // único enlace compatible con cualquier dispositivo.
    splits {
        abi {
            isEnable = true
            reset()
            include("armeabi-v7a", "arm64-v8a", "x86_64")
            isUniversalApk = true
        }
    }
}

flutter {
    source = "../.."
}
