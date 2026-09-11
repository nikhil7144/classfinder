plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.aspire91.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
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

    buildTypes {
        release {
            // TODO: a release signing config, before the first Play upload.
            // Debug keys for now, so `flutter run --release` works at all.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
