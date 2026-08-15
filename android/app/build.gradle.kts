import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing, if the keystore is present. Both the .jks and the
// properties file are gitignored — a checkout without them still builds a
// debug APK, it just cannot produce a signed release.
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "com.foodorder.pos"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.foodorder.pos"
        minSdk = 24
        targetSdk = 34
        versionCode = 5
        versionName = "1.4"

        // The POS server the wrapper loads. Change this, not the Kotlin.
        buildConfigField("String", "POS_URL", "\"https://restaurant-lac-one.vercel.app\"")
    }

    buildFeatures { buildConfig = true }

    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
        }
        debug {
            // A side-by-side install that points at the dev machine instead of
            // the live shop, so the handheld can be tested against work in
            // progress without anyone's real bills being involved. Distinct
            // applicationId so it sits next to the real app, not over it.
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "POS (dev)")
            buildConfigField("String", "POS_URL", "\"http://192.168.1.105:3000\"")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    // Sunmi built-in printer. On Maven Central; 1.0.24 is the current release.
    implementation("com.sunmi:printerlibrary:1.0.24")
}
