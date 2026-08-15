package com.foodorder.pos

import android.content.Context
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast
import com.sunmi.peripheral.printer.InnerPrinterCallback
import com.sunmi.peripheral.printer.InnerPrinterManager
import com.sunmi.peripheral.printer.InnerResultCallback
import com.sunmi.peripheral.printer.SunmiPrinterService
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * What `window.SunmiPrinter` on the page actually reaches.
 *
 * Three things the page can ask for:
 *   status()       — why the head cannot print, in words a cashier can act on
 *   paperWidthMm() — what is actually loaded, rather than what settings claim
 *   print(job)     — print, and say whether the paper really came out
 *
 * Every call runs on one worker thread. The head is a single piece of
 * hardware; two slips sent at once interleave inside its transaction buffer
 * and come out shuffled, which is the sort of failure that only appears
 * during a rush.
 */
class PrinterBridge(private val context: Context) {

    @Volatile
    private var service: SunmiPrinterService? = null

    private val worker = Executors.newSingleThreadExecutor()
    private val prefs = PrinterPrefs(context)

    /**
     * Why there is no usable service, in words, for the settings screen.
     *
     * Without this a device that cannot print looks identical to one that has
     * not finished binding yet, and the only way to tell them apart is a USB
     * cable and logcat — which is not available to the shop.
     */
    @Volatile
    var lastIssue: String = "ยังไม่ได้เชื่อมต่อเครื่องพิมพ์"
        private set

    /** Called once the service is usable, so a screen can stop saying "checking". */
    @Volatile
    var onReady: (() -> Unit)? = null

    private val callback = object : InnerPrinterCallback() {
        override fun onConnected(s: SunmiPrinterService) {
            service = s
            // Asked for the record only. Gating on it was wrong: some devices
            // answer false with a working head, and the slip was then refused
            // for the rest of the session with no way to see why.
            runCatching { InnerPrinterManager.getInstance().hasPrinter(s) }
                .onSuccess { if (!it) Log.w(TAG, "bound, but hasPrinter() says no head") }
                .onFailure { Log.w(TAG, "hasPrinter() failed", it) }

            runCatching { s.printerInit(null) }
                .onFailure { Log.e(TAG, "printerInit failed", it) }
            lastIssue = ""
            onReady?.invoke()
        }

        override fun onDisconnected() {
            service = null
            lastIssue = "เครื่องพิมพ์ถูกตัดการเชื่อมต่อ"
        }
    }

    fun connect() {
        runCatching { InnerPrinterManager.getInstance().bindService(context, callback) }
            .onSuccess { bound ->
                // bindService answers false when the printer service is not
                // installed at all — an emulator, or a non-Sunmi tablet.
                if (bound == false) lastIssue = "อุปกรณ์นี้ไม่มีบริการเครื่องพิมพ์ของ Sunmi ติดตั้งอยู่"
            }
            .onFailure {
                Log.e(TAG, "printer bind failed", it)
                lastIssue = "เชื่อมต่อบริการเครื่องพิมพ์ไม่ได้: ${it.javaClass.simpleName}"
            }
    }

    fun disconnect() {
        runCatching { InnerPrinterManager.getInstance().unBindService(context, callback) }
        service = null
        worker.shutdown()
    }

    /**
     * Binding is asynchronous and the first sale of a shift can land before it
     * finishes. Waiting briefly beats dropping the slip. This runs on the
     * worker, never on the thread the page is waiting on for something else.
     */
    private fun awaitService(): SunmiPrinterService? {
        var s = service
        var waited = 0
        while (s == null && waited < BIND_WAIT_MS) {
            Thread.sleep(BIND_STEP_MS.toLong())
            waited += BIND_STEP_MS
            s = service
        }
        return s
    }

    private fun <T> onWorker(timeoutMs: Long, absent: T, body: (SunmiPrinterService) -> T): T {
        val task = worker.submit<T> {
            val s = awaitService() ?: return@submit absent
            runCatching { body(s) }.getOrElse {
                Log.e(TAG, "printer call failed", it)
                absent
            }
        }
        return runCatching { task.get(timeoutMs, TimeUnit.MILLISECONDS) }.getOrElse {
            Log.e(TAG, "printer call did not finish in time", it)
            task.cancel(true)
            absent
        }
    }

    private fun report(s: PrinterStatus) = JSONObject()
        .put("code", s.code)
        .put("name", s.name)
        .put("label", s.label)
        .put("canPrint", s.canPrint)
        .toString()

    /** `{code, name, label, canPrint}` — cheap enough to call before every print. */
    @JavascriptInterface
    fun status(): String = report(
        onWorker(STATUS_TIMEOUT_MS, PrinterStatus.NO_PRINTER) {
            PrinterStatus.of(it.updatePrinterState())
        }
    )

    /** What the head says is loaded: 58 or 80, or 0 when it cannot be read. */
    private fun detected(s: SunmiPrinterService): Int = runCatching {
        // The service answers 0 for 80mm and 1 for 58mm.
        if (s.printerPaper == 1) 58 else 80
    }.getOrDefault(0)

    /**
     * The device setting wins when the shop pinned one: it exists precisely
     * for a head that reports the wrong roll, which happens after a
     * paper-holder swap. Otherwise ask the head, then fall back to whatever
     * the slip was built for.
     *
     * Takes the service rather than fetching it — this is called from inside
     * the worker, and hopping back onto a single-threaded executor from its
     * own thread deadlocks.
     */
    private fun paperFor(s: SunmiPrinterService, fallback: Int): Int {
        val pinned = prefs.paper
        if (pinned != PrinterPrefs.Paper.AUTO) return pinned.mm
        return detected(s).takeIf { it > 0 } ?: fallback
    }

    /** What the head reports, ignoring the pinned setting. For the settings screen. */
    fun detectedPaperMm(): Int = onWorker(STATUS_TIMEOUT_MS, 0) { detected(it) }

    /**
     * 58 or 80 as this device will actually print; 0 when nothing is known,
     * which the page reads as "keep whatever the shop configured".
     */
    @JavascriptInterface
    fun paperWidthMm(): Int = onWorker(STATUS_TIMEOUT_MS, 0) { paperFor(it, 0) }

    /** Model and serial of the head, for the settings screen. */
    fun describe(): Pair<String, String> = onWorker(STATUS_TIMEOUT_MS, "" to "") {
        (it.printerModal ?: "") to (it.printerSerialNo ?: "")
    }

    /**
     * Print, and report what happened, in the same shape as `status()`.
     *
     * The head is asked first: a slip sent to an open lid or an empty roll is
     * swallowed silently, and the cashier finds out when the customer asks for
     * their receipt.
     */
    @JavascriptInterface
    fun print(job: String): String {
        if (prefs.destination == PrinterPrefs.Destination.OFF) {
            return report(PrinterStatus.DISABLED)
        }
        val outcome = onWorker(PRINT_TIMEOUT_MS, PrinterStatus.NO_PRINTER) { s ->
            val before = PrinterStatus.of(s.updatePrinterState())
            if (!before.canPrint) return@onWorker before

            val parsed = JSONObject(job)
            val widthMm = paperFor(s, parsed.optInt("widthMm", 58))
            val cmds = parsed.optJSONArray("cmds") ?: JSONArray()

            try {
                // One buffered transaction: the head is fed once at the end
                // rather than stuttering between segments.
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
                commit(s)
            } catch (e: Exception) {
                Log.e(TAG, "print failed", e)
                // Leave no half-open buffer for the next slip to inherit.
                runCatching { s.exitPrinterBuffer(false) }
                PrinterStatus.of(s.updatePrinterState()).takeIf { !it.canPrint }
                    ?: PrinterStatus.UNKNOWN
            }
        }
        // The page is inside a WebView with no room for a banner over the
        // checkout screen, so the device says it: not "พิมพ์ไม่สำเร็จ" but
        // which of the eleven reasons it was, since each has a different fix.
        if (!outcome.canPrint) toast(outcome.label)

        // Success stays the bare "ok" the older web build understands. A
        // handheld is updated by whoever is holding it and the server by
        // whoever deploys, so the two versions are never in step; answering
        // JSON here would read as a refusal to a page that had already had its
        // slip printed, and it would raise a print dialog over the sale.
        // Failures answer JSON, which that same older page treats exactly as
        // it always did.
        return if (outcome.canPrint) "ok" else report(outcome)
    }

    private fun toast(msg: String) {
        android.os.Handler(context.mainLooper).post {
            Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
        }
    }

    /**
     * Commits the buffer and waits for the hardware to answer.
     *
     * Sunmi's own documentation is explicit that the plain callback means the
     * command was accepted, not that the paper came out. Those differ exactly
     * when it matters: when the roll runs out mid-slip. So the state is read
     * again afterwards, because the reason for a failure is more useful to the
     * person holding the device than the failure itself.
     */
    private fun commit(s: SunmiPrinterService): PrinterStatus {
        val done = CountDownLatch(1)
        // The callback fires on a binder thread, not this one.
        val failed = AtomicBoolean(false)
        s.exitPrinterBufferWithCallback(true, object : InnerResultCallback() {
            override fun onRunResult(isSuccess: Boolean) {
                if (!isSuccess) {
                    failed.set(true)
                    done.countDown()
                }
            }

            override fun onReturnString(result: String?) = Unit

            override fun onRaiseException(code: Int, msg: String?) {
                Log.e(TAG, "printer exception $code: $msg")
                failed.set(true)
                done.countDown()
            }

            override fun onPrintResult(code: Int, msg: String?) {
                if (code != 0) failed.set(true)
                done.countDown()
            }
        })
        val answered = done.await(PRINT_RESULT_WAIT_MS, TimeUnit.MILLISECONDS)

        val after = PrinterStatus.of(s.updatePrinterState())
        return when {
            !after.canPrint -> after
            failed.get() || !answered -> PrinterStatus.UNKNOWN
            else -> PrinterStatus.NORMAL
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
        // Long enough to cover a cold start, short enough that a genuinely
        // absent printer does not hold up the screen.
        // A cold start on a busy handheld can take several seconds to bind.
        // Two was tuned against a warm app and reported "no printer" on the
        // first screen after install.
        const val BIND_WAIT_MS = 6000
        const val BIND_STEP_MS = 100
        const val STATUS_TIMEOUT_MS = 8000L
        const val PRINT_TIMEOUT_MS = 20000L
        // A 58mm receipt is well under this; past it the head is not coming back.
        const val PRINT_RESULT_WAIT_MS = 8000L
    }
}
