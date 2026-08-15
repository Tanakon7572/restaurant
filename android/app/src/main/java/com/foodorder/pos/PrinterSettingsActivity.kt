package com.foodorder.pos

import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.widget.Button
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

/**
 * The one screen that is not the POS: what this device does with slips.
 *
 * It answers three questions a shop actually asks when a receipt does not
 * come out — is the printer there, what paper does it think is loaded, and
 * does it work right now — and it answers the last one with real paper rather
 * than a green tick.
 */
class PrinterSettingsActivity : AppCompatActivity() {

    private lateinit var printer: PrinterBridge
    private lateinit var prefs: PrinterPrefs
    private lateinit var statusLine: TextView
    private lateinit var deviceLine: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = PrinterPrefs(this)
        printer = PrinterBridge(this)
        // Binding finishes on its own schedule; without this the screen shows
        // whatever was true two seconds after it opened, forever.
        printer.onReady = { runOnUiThread { refresh() } }
        printer.connect()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(32))
            setBackgroundColor(BG)
        }

        root.addView(heading("ตั้งค่าเครื่องพิมพ์"))

        root.addView(label("เครื่องพิมพ์"))
        deviceLine = body("กำลังตรวจสอบ…")
        root.addView(deviceLine)
        statusLine = body("")
        root.addView(statusLine)

        root.addView(label("การพิมพ์สลิป"))
        root.addView(
            choices(
                listOf(
                    "พิมพ์จากหัวพิมพ์ในตัว" to PrinterPrefs.Destination.BUILT_IN,
                    "ไม่พิมพ์ (ใช้เครื่องนี้รับออเดอร์อย่างเดียว)" to PrinterPrefs.Destination.OFF,
                ),
                prefs.destination,
            ) { prefs.destination = it }
        )

        root.addView(label("ขนาดกระดาษ"))
        root.addView(
            choices(
                listOf(
                    "อัตโนมัติ (ถามเครื่องพิมพ์)" to PrinterPrefs.Paper.AUTO,
                    "58 มม." to PrinterPrefs.Paper.MM58,
                    "80 มม." to PrinterPrefs.Paper.MM80,
                ),
                prefs.paper,
            ) { prefs.paper = it; refresh() }
        )

        root.addView(
            button("พิมพ์ใบทดสอบ") {
                Thread {
                    // "ok" on success, a status object otherwise. See PrinterBridge.print.
                    val result = printer.print(testJob().toString())
                    val ok = result == "ok"
                    val label =
                        if (ok) "พิมพ์ใบทดสอบแล้ว ตรวจดูที่กระดาษ"
                        else runCatching { JSONObject(result).optString("label") }
                            .getOrDefault("พิมพ์ไม่สำเร็จ")
                    runOnUiThread {
                        statusLine.text = label
                        statusLine.setTextColor(if (ok) OK else BAD)
                    }
                }.start()
            }
        )
        root.addView(button("ตรวจสอบสถานะอีกครั้ง") { refresh() })
        root.addView(button("กลับไปหน้าขาย") { finish() })

        setContentView(ScrollView(this).apply {
            setBackgroundColor(BG)
            addView(root, MATCH_PARENT, WRAP_CONTENT)
        })
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    override fun onDestroy() {
        printer.disconnect()
        super.onDestroy()
    }

    /** Everything here talks to the printer service, so none of it on the UI thread. */
    private fun refresh() {
        deviceLine.text = "กำลังตรวจสอบ…"
        statusLine.text = ""
        Thread {
            val (model, serial) = printer.describe()
            val detectedMm = printer.detectedPaperMm()
            val state = JSONObject(printer.status())

            val issue = printer.lastIssue
            val device = when {
                model.isNotBlank() && serial.isNotBlank() -> "$model · S/N $serial"
                model.isNotBlank() -> model
                // Naming the obstacle beats repeating that there isn't one:
                // a service that never bound and a head that will not answer
                // need different things done about them.
                issue.isNotBlank() -> "ยังใช้เครื่องพิมพ์ไม่ได้\n$issue"
                else -> "เชื่อมต่อแล้ว แต่เครื่องพิมพ์ไม่ตอบรุ่นและหมายเลข"
            }
            val paper = when {
                prefs.paper != PrinterPrefs.Paper.AUTO ->
                    "ใช้ ${prefs.paper.mm} มม. (ตั้งค่าไว้เอง)" +
                        if (detectedMm > 0 && detectedMm != prefs.paper.mm)
                            " — เครื่องรายงาน $detectedMm มม." else ""
                detectedMm > 0 -> "กระดาษ $detectedMm มม. (ตรวจพบเอง)"
                else -> "อ่านขนาดกระดาษไม่ได้ จะใช้ค่าจากตั้งค่าร้าน"
            }
            val status = state.optString("label")
            runOnUiThread {
                deviceLine.text = "$device\n$paper"
                statusLine.text = status
                statusLine.setTextColor(if (state.optBoolean("canPrint")) OK else BAD)
            }
        }.start()
    }

    /** A slip that proves the head, the Thai glyphs and the paper width all work. */
    private fun testJob(): JSONObject {
        val cmds = org.json.JSONArray()
        fun text(t: String, align: String, size: String, bold: Boolean = false) {
            cmds.put(
                JSONObject()
                    .put("kind", "text").put("text", t)
                    .put("align", align).put("size", size).put("bold", bold)
            )
        }
        text("ใบทดสอบเครื่องพิมพ์", "center", "lg", true)
        cmds.put(JSONObject().put("kind", "rule"))
        text("ทดสอบสระและวรรณยุกต์: ก่ำ ปั๊ม ญี่ปุ่น เกี๊ยว", "left", "md")
        cmds.put(
            JSONObject().put("kind", "row").put("left", "รวม").put("right", "1,234.50")
        )
        cmds.put(JSONObject().put("kind", "rule"))
        text("ถ้าอ่านบรรทัดนี้ครบ แปลว่าพร้อมใช้งาน", "center", "sm")
        cmds.put(JSONObject().put("kind", "feed").put("lines", 3))
        val mm = prefs.paper.mm.takeIf { it > 0 } ?: 58
        return JSONObject().put("widthMm", mm).put("cmds", cmds)
    }

    // — small view builders, so this screen needs no layout XML —

    private fun dp(v: Int) = TypedValue.applyDimension(
        TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), resources.displayMetrics
    ).toInt()

    private fun heading(t: String) = TextView(this).apply {
        text = t
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
        setTypeface(null, Typeface.BOLD)
        setTextColor(INK)
        setPadding(0, 0, 0, dp(8))
    }

    private fun label(t: String) = TextView(this).apply {
        text = t
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setTextColor(MUTED)
        setPadding(0, dp(24), 0, dp(6))
    }

    private fun body(t: String) = TextView(this).apply {
        text = t
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        setTextColor(INK)
        setLineSpacing(dp(4).toFloat(), 1f)
    }

    private fun <T : Enum<T>> choices(
        options: List<Pair<String, T>>,
        selected: T,
        onPick: (T) -> Unit,
    ): View = RadioGroup(this).apply {
        orientation = RadioGroup.VERTICAL
        options.forEachIndexed { index, (text, value) ->
            addView(RadioButton(this@PrinterSettingsActivity).apply {
                id = index + 1
                this.text = text
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
                setTextColor(INK)
                setPadding(dp(8), dp(10), 0, dp(10))
                if (value == selected) isChecked = true
            })
        }
        setOnCheckedChangeListener { _, id -> onPick(options[id - 1].second) }
    }

    private fun button(text: String, onClick: () -> Unit) = Button(this).apply {
        this.text = text
        isAllCaps = false
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
        setTextColor(Color.WHITE)
        setBackgroundColor(BRAND)
        gravity = Gravity.CENTER
        layoutParams = LinearLayout.LayoutParams(MATCH_PARENT, dp(52)).apply {
            topMargin = dp(12)
        }
        setOnClickListener { onClick() }
    }

    private companion object {
        // The POS's own tokens, so the two screens read as one app.
        val BG = Color.parseColor("#FAF7F2")
        val INK = Color.parseColor("#1A1714")
        val MUTED = Color.parseColor("#6B6259")
        val BRAND = Color.parseColor("#C13F0C")
        val OK = Color.parseColor("#297A52")
        val BAD = Color.parseColor("#C62828")
    }
}
