package com.foodorder.pos

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * The whole app: one full-screen WebView pointed at the POS, plus the printer
 * bridge the page calls as `window.SunmiPrinter.print(json)`.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var printer: PrinterBridge

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        printer = PrinterBridge(this)
        printer.connect()

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            // The POS keeps its offline queue in localStorage.
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            // Staff pinch-zooming the till by accident is worse than no zoom.
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.textZoom = 100

            webViewClient = object : WebViewClient() {
                // The page comes from the server; its bundles come from the
                // APK. See BundledAssets for why that split is safe.
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = BundledAssets.intercept(assets, request)
            }
            webChromeClient = WebChromeClient()
            addJavascriptInterface(printer, "SunmiPrinter")
        }
        setContentView(web)

        if (savedInstanceState == null) web.loadUrl(BuildConfig.POS_URL)
        else web.restoreState(savedInstanceState)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    // Back should walk the POS's own history, not drop staff to the launcher.
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        printer.disconnect()
        super.onDestroy()
    }
}
