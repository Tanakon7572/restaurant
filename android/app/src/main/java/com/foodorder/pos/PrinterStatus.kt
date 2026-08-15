package com.foodorder.pos

/**
 * What `updatePrinterState()` answers, named.
 *
 * The head reports why it cannot print, and the difference matters to the
 * person holding it: paper out is a drawer away, an open lid is a click, an
 * overheated head needs a minute. "พิมพ์ไม่สำเร็จ" tells them none of that.
 *
 * Codes are from Sunmi's inner-printer documentation.
 */
enum class PrinterStatus(val code: Int, val label: String, val canPrint: Boolean) {
    /** Not a hardware code: this device was set to not print. */
    DISABLED(-1, "เครื่องนี้ตั้งค่าให้ไม่พิมพ์สลิป", false),
    UNKNOWN(0, "ไม่ทราบสถานะเครื่องพิมพ์", false),
    NORMAL(1, "พร้อมใช้งาน", true),
    COMMS(2, "สื่อสารกับเครื่องพิมพ์ไม่ได้", false),
    OUT_OF_PAPER(3, "กระดาษหมด — ใส่ม้วนใหม่แล้วกดพิมพ์ซ้ำ", false),
    PREPARING(4, "เครื่องพิมพ์กำลังเตรียมพร้อม รอสักครู่", false),
    OVERHEATED(5, "หัวพิมพ์ร้อนเกินไป — พักสักครู่แล้วลองใหม่", false),
    LID_OPEN(6, "ฝาช่องกระดาษเปิดอยู่ — ปิดให้สนิทแล้วกดพิมพ์ซ้ำ", false),
    CUTTER_ERROR(7, "ที่ตัดกระดาษติด — เปิดฝาแล้วเอาเศษกระดาษออก", false),
    CUTTER_OK(8, "ที่ตัดกระดาษกลับมาปกติแล้ว", true),
    NO_BLACK_MARK(9, "หากระดาษไม่เจอ — ตรวจว่าใส่ม้วนถูกด้าน", false),
    NO_PRINTER(505, "ไม่พบเครื่องพิมพ์ในอุปกรณ์นี้", false),
    FIRMWARE(507, "อัปเดตเฟิร์มแวร์เครื่องพิมพ์ไม่สำเร็จ", false),
    ;

    companion object {
        fun of(code: Int): PrinterStatus = entries.firstOrNull { it.code == code } ?: UNKNOWN
    }
}
