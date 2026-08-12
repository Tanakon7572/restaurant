package com.foodorder.pos

import android.content.res.AssetManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import java.io.IOException

/**
 * Serves the app's build assets out of the APK instead of over the network.
 *
 * The page itself still loads from the real server, so the origin is
 * unchanged and the session cookie, the API calls and the QR ordering pages
 * all behave exactly as they do in a browser. Only the bytes of the
 * content-hashed bundles are answered locally, which is what makes the till
 * open instantly and keeps working when the shop's line hiccups.
 *
 * A hashed filename either matches byte-for-byte or does not exist here, so
 * there is no such thing as serving a stale-but-plausible chunk: a miss falls
 * through to the network. A handheld running an older APK than the deployment
 * simply loads more over the wire.
 */
object BundledAssets {

    private const val PREFIX = "/_next/static/"

    // Mirrors the URL path, minus the leading underscore: Android's asset
    // packager drops any directory whose name starts with one, silently, so
    // an assets/web/_next/... tree simply never reaches the APK.
    private const val ASSET_ROOT = "web/next/static/"

    /** Null means "not ours" — the WebView then fetches it normally. */
    fun intercept(assets: AssetManager, request: WebResourceRequest): WebResourceResponse? {
        if (!request.method.equals("GET", ignoreCase = true)) return null

        val path = request.url.path ?: return null
        if (!path.startsWith(PREFIX)) return null

        // Only the folders whose names are content hashes are bundled. The
        // buildId folder changes every build and must come from the server.
        val rest = path.removePrefix(PREFIX)
        if (!rest.startsWith("chunks/") && !rest.startsWith("media/") && !rest.startsWith("css/")) {
            return null
        }
        // Refuse anything trying to climb out of the asset root.
        if (rest.contains("..")) return null

        return try {
            val stream = assets.open("$ASSET_ROOT$rest")
            WebResourceResponse(mimeFor(path), encodingFor(path), stream)
        } catch (_: IOException) {
            null
        }
    }

    private fun mimeFor(path: String): String = when {
        path.endsWith(".js") || path.endsWith(".mjs") -> "application/javascript"
        path.endsWith(".css") -> "text/css"
        path.endsWith(".woff2") -> "font/woff2"
        path.endsWith(".woff") -> "font/woff"
        path.endsWith(".ttf") -> "font/ttf"
        path.endsWith(".svg") -> "image/svg+xml"
        path.endsWith(".png") -> "image/png"
        path.endsWith(".webp") -> "image/webp"
        path.endsWith(".avif") -> "image/avif"
        path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
        path.endsWith(".json") -> "application/json"
        else -> "application/octet-stream"
    }

    // Only text formats declare a charset; handing one to a font or an image
    // makes some WebView builds mangle the bytes.
    private fun encodingFor(path: String): String? = when {
        path.endsWith(".js") || path.endsWith(".mjs") ||
            path.endsWith(".css") || path.endsWith(".svg") ||
            path.endsWith(".json") -> "utf-8"
        else -> null
    }
}
