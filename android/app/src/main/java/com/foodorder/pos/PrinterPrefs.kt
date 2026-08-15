package com.foodorder.pos

import android.content.Context

/**
 * What this particular device was told to do with slips.
 *
 * Kept on the device rather than in the shop's settings row: two handhelds on
 * the same till can have different paper loaded, and one of them may be the
 * one that runs the floor without printing at all.
 */
class PrinterPrefs(context: Context) {

    private val prefs = context.getSharedPreferences("printer", Context.MODE_PRIVATE)

    /**
     * Whether slips print here.
     *
     * The V3 MIX is one unit: the till and the 58mm head are the same device,
     * so there is no second printer to pick between. The real choice is
     * whether this handheld prints at all — a shop running two of them will
     * often have one that only takes orders on the floor.
     */
    enum class Destination { BUILT_IN, OFF }

    /**
     * Paper width. AUTO asks the head, which is right almost always — the
     * fixed options exist for a head that reports the wrong roll, which does
     * happen after a paper-holder swap.
     */
    enum class Paper(val mm: Int) { AUTO(0), MM58(58), MM80(80) }

    var destination: Destination
        get() = runCatching {
            Destination.valueOf(prefs.getString(KEY_DEST, null) ?: Destination.BUILT_IN.name)
        }.getOrDefault(Destination.BUILT_IN)
        set(value) = prefs.edit().putString(KEY_DEST, value.name).apply()

    var paper: Paper
        get() = runCatching {
            Paper.valueOf(prefs.getString(KEY_PAPER, null) ?: Paper.AUTO.name)
        }.getOrDefault(Paper.AUTO)
        set(value) = prefs.edit().putString(KEY_PAPER, value.name).apply()

    private companion object {
        const val KEY_DEST = "destination"
        const val KEY_PAPER = "paper"
    }
}
