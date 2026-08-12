pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // Sunmi publishes the printer SDK outside Maven Central.
        maven("https://jitpack.io")
    }
}
rootProject.name = "FoodOrderPOS"
include(":app")
