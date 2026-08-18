package com.foodorder.pos

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.util.Base64
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Draws a slip's commands onto a bitmap the printer can take whole.
 *
 * Thai is drawn by Android's own text stack rather than sent as characters to
 * the print head: sara-am, tone marks and the two-level vowels stack correctly
 * here, and no printer codepage has to be guessed at. The cost is a raster
 * instead of text, which on a 58mm slip is under a second.
 */
object SlipRenderer {

    // 58mm of usable paper is 384 dots at the head's 203dpi; 80mm is 576.
    fun dotsFor(widthMm: Int): Int = if (widthMm >= 80) 576 else 384

    private const val PAD = 8f
    private const val LINE_GAP = 2f
    private const val QTY_COL = 44f
    private const val INDENT = 16f

    /**
     * Decoded logos, kept between passes and between slips.
     *
     * `run()` walks the commands twice — once to measure, once to draw — and
     * decoding the same PNG each time would double the work on every slip for
     * an image that changes about once a year.
     */
    private val logoCache = object : LinkedHashMap<String, Bitmap?>(4, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Bitmap?>) = size > 3
    }

    private fun decodeImage(b64: String): Bitmap? = synchronized(logoCache) {
        logoCache.getOrPut(b64) {
            runCatching {
                val bytes = Base64.decode(b64, Base64.DEFAULT)
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            }.onFailure { Log.w("SlipRenderer", "logo decode failed", it) }.getOrNull()
        }
    }

    private fun sizePx(size: String?): Float = when (size) {
        "sm" -> 20f
        "lg" -> 32f
        "xl" -> 40f
        else -> 24f
    }

    private fun paintFor(size: String?, bold: Boolean): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.BLACK
        textSize = sizePx(size)
        typeface = Typeface.create(Typeface.SANS_SERIF, if (bold) Typeface.BOLD else Typeface.NORMAL)
    }

    /**
     * Wrap `text` to `maxWidth` on whole words where it can, mid-word where it
     * cannot. Thai has no spaces, so the mid-word branch is the common one and
     * must not be treated as an edge case.
     */
    private fun wrap(text: String, paint: Paint, maxWidth: Float): List<String> {
        if (text.isEmpty()) return listOf("")
        if (maxWidth <= 0f) return listOf(text)
        if (paint.measureText(text) <= maxWidth) return listOf(text)

        val out = mutableListOf<String>()
        var start = 0
        while (start < text.length) {
            val fitted = paint.breakText(text, start, text.length, true, maxWidth, null)
            val hardEnd = (start + fitted.coerceAtLeast(1)).coerceAtMost(text.length)
            // Prefer the last space inside the run, if there is one worth using.
            val space = text.lastIndexOf(' ', hardEnd - 1)
            val end = if (space > start && hardEnd < text.length) space + 1 else hardEnd
            out.add(text.substring(start, end).trimEnd())
            start = end
        }
        return out
    }

    /**
     * Two passes over the same command list: measure to get the bitmap height,
     * then draw. `canvas = null` means measure only.
     */
    private fun run(cmds: JSONArray, dots: Int, canvas: Canvas?): Int {
        val content = dots - PAD * 2
        var y = PAD

        for (i in 0 until cmds.length()) {
            val c = cmds.optJSONObject(i) ?: continue
            when (c.optString("kind")) {
                "text" -> {
                    val p = paintFor(c.optString("size", "md"), c.optBoolean("bold"))
                    val align = c.optString("align", "left")
                    for (line in wrap(c.optString("text"), p, content)) {
                        y += -p.fontMetrics.top
                        canvas?.drawText(line, when (align) {
                            "center" -> PAD + (content - p.measureText(line)) / 2
                            "right" -> PAD + content - p.measureText(line)
                            else -> PAD
                        }, y, p)
                        y += p.fontMetrics.bottom + LINE_GAP
                    }
                }
                "row" -> {
                    val p = paintFor(c.optString("size", "md"), c.optBoolean("bold"))
                    val right = c.optString("right")
                    val rightW = p.measureText(right)
                    // The right cell never wraps — a total split over two lines
                    // is worse than a label clipped by a few dots.
                    val leftLines = wrap(c.optString("left"), p, content - rightW - 12f)
                    for ((n, line) in leftLines.withIndex()) {
                        y += -p.fontMetrics.top
                        canvas?.drawText(line, PAD, y, p)
                        if (n == 0) canvas?.drawText(right, PAD + content - rightW, y, p)
                        y += p.fontMetrics.bottom + LINE_GAP
                    }
                }
                "item" -> {
                    val p = paintFor("md", false)
                    val qty = c.optString("qty")
                    val price = c.optString("price")
                    val priceW = if (price.isEmpty()) 0f else p.measureText(price) + 8f
                    val indent = if (c.optBoolean("indent")) INDENT else 0f
                    val nameX = PAD + QTY_COL + indent
                    val nameW = content - QTY_COL - indent - priceW
                    for ((n, line) in wrap(c.optString("name"), p, nameW).withIndex()) {
                        y += -p.fontMetrics.top
                        if (n == 0) {
                            if (qty.isNotEmpty()) canvas?.drawText(qty, PAD, y, p)
                            if (price.isNotEmpty()) {
                                canvas?.drawText(price, PAD + content - p.measureText(price), y, p)
                            }
                        }
                        canvas?.drawText(line, nameX, y, p)
                        y += p.fontMetrics.bottom + LINE_GAP
                    }
                }
                "rule" -> {
                    y += 6f
                    if (canvas != null) {
                        val p = Paint().apply {
                            color = Color.BLACK
                            strokeWidth = 2f
                            pathEffect = DashPathEffect(floatArrayOf(6f, 5f), 0f)
                        }
                        canvas.drawLine(PAD, y, PAD + content, y, p)
                    }
                    y += 8f
                }
                "image" -> {
                    val bmp = decodeImage(c.optString("data"))
                    if (bmp != null && bmp.width > 0) {
                        // Never enlarged: the web side already sized it in
                        // printer dots, and scaling a one-bit image up turns
                        // clean edges into staircases.
                        val w = minOf(bmp.width, content.toInt())
                        val h = bmp.height * w / bmp.width
                        y += 4f
                        val left = PAD + (content - w) / 2f
                        canvas?.drawBitmap(
                            bmp,
                            Rect(0, 0, bmp.width, bmp.height),
                            RectF(left, y, left + w, y + h),
                            null,
                        )
                        y += h + 6f
                    }
                }
                // 'qr' and 'feed' are the printer's own commands, not drawn here.
            }
        }
        return (y + PAD).toInt()
    }

    /** Null when the command list draws nothing — an all-QR job, for instance. */
    fun render(cmds: JSONArray, widthMm: Int): Bitmap? {
        val dots = dotsFor(widthMm)
        val height = run(cmds, dots, null)
        if (height <= (PAD * 2).toInt()) return null
        val bmp = Bitmap.createBitmap(dots, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.WHITE)
        run(cmds, dots, canvas)
        return bmp
    }

    /** A single centred line — used for the caption under a printed QR. */
    fun captionBitmap(text: String, widthMm: Int): Bitmap? = render(
        JSONArray().put(
            JSONObject()
                .put("kind", "text")
                .put("text", text)
                .put("align", "center"),
        ),
        widthMm,
    )

    /**
     * Split a job at each QR and feed so the text between them prints as one
     * bitmap apiece, rather than one bitmap per line.
     */
    fun segments(cmds: JSONArray): List<Pair<String, Any>> {
        val out = mutableListOf<Pair<String, Any>>()
        var batch = JSONArray()
        for (i in 0 until cmds.length()) {
            val c = cmds.optJSONObject(i) ?: continue
            when (val kind = c.optString("kind")) {
                "qr", "feed" -> {
                    if (batch.length() > 0) {
                        out.add("draw" to batch)
                        batch = JSONArray()
                    }
                    out.add(kind to c)
                }
                else -> batch.put(c)
            }
        }
        if (batch.length() > 0) out.add("draw" to batch)
        return out
    }
}
