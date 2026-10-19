import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Aspire91's own release key — never shared with another app or client.
// android/key.properties is gitignored; aspire91-release.jks lives in this
// folder and is gitignored too. Back both up somewhere safe outside the
// repo: losing them after the first Play upload means Google's painful
// key-reset process.
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.aspire91.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // AGP 9 defaults this to false; the two flavors below set resValue("string",
    // "app_name", ...), which needs it explicitly on.
    buildFeatures {
        resValues = true
    }

    defaultConfig {
        applicationId = "com.aspire91.app"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // One codebase, two apps. The flavor decides which role the app serves —
    // see lib/src/flavor.dart, which maps it to the roles that may sign in.
    //
    // They are separate application ids and separate store listings on
    // purpose: an account holds one role, permanently, so a parent and a coach
    // are never the same install. MOBILE-PLAN.md §1 has the argument.
    flavorDimensions += "audience"

    productFlavors {
        create("seeker") {
            dimension = "audience"
            // The base id. Parents' app, and the one the brand name belongs to.
            resValue("string", "app_name", "Aspire91")
        }
        create("provider") {
            dimension = "audience"
            applicationIdSuffix = ".coach"
            resValue("string", "app_name", "Aspire91 for Coaches")
        }
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            // Falls back to the debug key only when key.properties is missing
            // (e.g. a fresh checkout before the keystore is copied in), so
            // `flutter run --release` still works without it.
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

// Push notifications — see mobile/README.md §11. google-services.json does
// not exist yet for either flavor (no Firebase project has been created),
// and applying this plugin with neither file present fails the entire
// build, for both flavors, immediately — so it is applied only once at
// least one of the two per-flavor files has actually been added, at
// android/app/src/seeker/google-services.json and
// android/app/src/provider/google-services.json. Until then this is a
// no-op and nothing here changes how the app builds today.
if (file("src/seeker/google-services.json").exists() ||
    file("src/provider/google-services.json").exists()
) {
    apply(plugin = "com.google.gms.google-services")
}

flutter {
    source = "../.."
}
