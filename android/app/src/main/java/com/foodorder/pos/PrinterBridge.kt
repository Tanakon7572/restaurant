package com.foodorder.pos

import android.content.Context
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast
import com.sunmi.peripheral.printer.InnerPrinterCallback
import com.sunmi.peripheral.printer.InnerPrinterManager
import com.sunmi.peripheral.printer.SunmiPrinterService
import org.json.JSONArray
import org.json.JSONObject

/**
 * What `window.SunmiPrinter` on the page actually reaches.
 *
 * The service binding is asynchronous and survives the whole session; a print
 * that arrives before the bind completes is refused loudly rather than
 * silently dropped, because a cashier who thinks a slip printed and finds it
 * did not is the failure that costs the shop money.
 */
class PrinterBridge(private val context: Context) {

    @Volatile
    private var service: SunmiPrinterService? = null

    private val callback = object : InnerPrinterCallback() {
        override fun onConnected(s: SunmiPrinterService) {
            // A device with no head binds the service anyway, so ask before
            // treating it as a printer we can send slips to.
            val present = runCatching {
                InnerPrinterManager.getInstance().hasPrinter(s)
            }.getOrDefault(true)
            if (!present) {
                Log.w(TAG, "service bound but this device reports no printer")
                return
            }
            service = s
            runCatching { s.printerInit(null) }
                .onFailure { Log.e(TAG, "printerInit failed", it) }
        }

        override fun onDisconnected() {
            service = null
        }
    }

    fun connect() {
        runCatching { InnerPrinterManager.getInstance().bindService(context, callback) }
            .onFailure { Log.e(TAG, "printer bind failed", it) }
    }

    fun disconnect() {
        runCatching { InnerPrinterManager.getInstance().unBindService(context, callback) }
        service = null
    }

    /** Called from the page. `job` is a serialised PrintJob from printJob.ts. */
    @JavascriptInterface
    fun print(job: String) {
        val s = service
        if (s == null) {
            toast("เครื่องพิมพ์ยังไม่พร้อม")
            return
        }
        try {
            val parsed = JSONObject(job)
            val widthMm = parsed.optInt("widthMm", 58)
            val cmds = parsed.optJSONArray("cmds") ?: JSONArray()

            // One buffered transaction: the head is fed once at the end rather
            // than stuttering between segments.
            s.enterPrinterBuffer(true)
            for ((kind, payload) in SlipRenderer.segments(cmds)) {
                when (kind) {
                    "draw" -> SlipRenderer.render(payload as JSONArray, widthMm)
                        ?.let { s.printBitmap(it, null) }

                    "qr" -> {
                        val cmd = payload as JSONObject
                        s.setAlignment(ALIGN_CENTER, null)
                        s.printQRCode(cmd.optString("data"), QR_MODULE_SIZE, QR_ERROR_LEVEL, null)
                        s.lineWrap(1, null)
                        val caption = cmd.optString("caption")
                        if (caption.isNotEmpty()) {
                            SlipRenderer.captionBitmap(caption, widthMm)
                                ?.let { s.printBitmap(it, null) }
                        }
                        s.setAlignment(ALIGN_LEFT, null)
                    }

                    "feed" -> s.lineWrap((payload as JSONObject).optInt("lines", 3), null)
                }
            }
            s.exitPrinterBuffer(true)
        } catch (e: Exception) {
            Log.e(TAG, "print failed", e)
            // Leave no half-open buffer behind for the next slip to inherit.
            runCatching { s.exitPrinterBuffer(false) }
            toast("พิมพ์ไม่สำเร็จ")
        }
    }

    private fun toast(msg: String) {
        android.os.Handler(context.mainLooper).post {
            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
        }
    }

    private companion object {
        const val TAG = "PrinterBridge"
        const val ALIGN_LEFT = 0
        const val ALIGN_CENTER = 1
        // 6 dots per QR module fits a PromptPay payload on 58mm paper and
        // still scans from a phone held at arm's length.
        const val QR_MODULE_SIZE = 6
        const val QR_ERROR_LEVEL = 2
    }
}
