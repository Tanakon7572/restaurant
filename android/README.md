# Food Order POS — Sunmi wrapper

A single-activity WebView that loads the POS and gives the page access to the
Sunmi handheld's built-in 58mm print head. Everything the staff see is the web
app; this project exists only so `window.SunmiPrinter.print(json)` reaches the
printer without a print dialog.

Target device: **Sunmi V3 Mix** (Android 13). Nothing here is device-specific
beyond the Sunmi printer SDK, so other V-series handhelds should work.

## Point it at your server

Edit `POS_URL` in `app/build.gradle.kts`:

```kotlin
buildConfigField("String", "POS_URL", "\"https://restaurant-lac-one.vercel.app\"")
```

If you move the server to plain HTTP on the shop LAN, add that one host to
`app/src/main/res/xml/network_security_config.xml`:

```xml
<domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">192.168.1.50</domain>
</domain-config>
```

Name the host explicitly rather than opening cleartext globally — a blanket
allowance lets a hijacked DNS answer downgrade the real server too.

## The web build goes inside the APK

`shouldInterceptRequest` answers `/_next/static/chunks|media|css` out of the
APK instead of the network, so the till opens without waiting on the line.
The page itself still loads from the server, which keeps the origin — and
therefore the session cookie and every API call — exactly as a browser sees
it. Serving the HTML locally too would move the origin to
`appassets.androidplatform.net`, and a `SameSite=Lax` session cookie is not
sent cross-origin; that path costs a rewrite of auth and a CORS policy for no
behaviour the service worker does not already provide.

Before assembling, refresh the bundle:

```bash
npm run build          # in the web project
./android/bundle-web.sh
```

Two things worth knowing:

- The assets live under `assets/web/next/...`, **not** `_next`. Android's
  asset packager silently drops any directory whose name starts with an
  underscore, so an `_next` tree never reaches the APK and nothing warns you.
- Only content-hashed folders are bundled. A hashed name either matches the
  server byte-for-byte or is absent, and an absent file falls through to the
  network — a stale bundle costs speed, never correctness.

Offline behaviour itself comes from `public/sw.js`, which precaches the staff
screens on install. Note it needs a secure context: over plain HTTP on the LAN
the browser refuses to register a service worker at all, so the offline path
can only be exercised against the HTTPS deployment (or localhost).

## Build and install

The Gradle wrapper is checked in, so this needs only a JDK 17 and the Android
SDK. On the machine this was first built on they live at:

```bash
export JAVA_HOME=~/Library/Java/JavaVirtualMachines/jdk-17.0.20+8/Contents/Home
export ANDROID_HOME=~/Library/Android/sdk
```

`local.properties` (gitignored) points Gradle at the SDK — recreate it on a new
machine with `echo "sdk.dir=$ANDROID_HOME" > local.properties`.

```bash
./gradlew assembleRelease    # app/build/outputs/apk/release/app-release.apk
./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/release/app-release.apk
```

Install on the handheld either over `adb`, or by copying the APK to the device
and opening it (allow "install unknown apps" for the file manager first).

Or open this folder in Android Studio and Run.

## Signing

`assembleRelease` signs with `keystore/pos-release.jks`, whose passwords are in
`keystore.properties`. **Both are gitignored — back the `.jks` file up off this
machine.** Lose it and Android will refuse to install an update over an
installed copy; the only way back is uninstall-and-reinstall on every device,
which wipes the app's local storage (including any unsynced offline queue).

Without those two files the project still builds a debug APK; only
`assembleRelease` stops working.

## The Sunmi SDK

`com.sunmi:printerlibrary` is on **Maven Central**; **1.0.24** is the current
release and what this builds against. Verified from the artifact itself:

| what the code calls | actual signature |
|---|---|
| `InnerPrinterManager.getInstance().bindService(ctx, cb)` | ✓ |
| `InnerPrinterManager.getInstance().hasPrinter(service)` | ✓ |
| `InnerPrinterCallback.onConnected(SunmiPrinterService)` | `protected abstract` |
| `printerInit(cb)` | takes an `InnerResultCallback` — **not** no-arg |
| `printBitmap(Bitmap, cb)` / `printQRCode(String, int, int, cb)` | ✓ |
| `enterPrinterBuffer(boolean)` / `exitPrinterBuffer(boolean)` | ✓ |

The callback parameter type is `InnerResultCallback`; every call here passes
`null` because the slip is fire-and-forget. If a future SDK renames these, the
compiler will say so — the logic does not need to change.

## Kiosk mode

Sunmi devices ship with a device manager that can pin one app. Set Food Order
POS as the pinned app so staff cannot reach the launcher mid-service.

## The contract with the web app

The page sends a JSON `PrintJob` (see `src/lib/printJob.ts` in the web repo):

```json
{
  "widthMm": 58,
  "cmds": [
    { "kind": "text", "text": "ครัวคุณแม่", "align": "center", "size": "lg", "bold": true },
    { "kind": "rule" },
    { "kind": "item", "qty": "2×", "name": "ข้าวผัดกุ้ง", "price": "240.00", "indent": false },
    { "kind": "row", "left": "รวมทั้งสิ้น", "right": "240.00", "size": "xl", "bold": true },
    { "kind": "qr", "data": "00020101...", "caption": "สแกนเพื่อชำระเงิน" },
    { "kind": "feed", "lines": 4 }
  ]
}
```

| kind | drawn how |
|---|---|
| `text` | one wrapped, aligned line per size |
| `row` | label left, value right; only the label wraps |
| `item` | qty column, name, price right-aligned; `indent` shifts option rows |
| `rule` | dashed horizontal line |
| `qr` | the printer's own `printQRCode`, so it stays crisp |
| `feed` | `lineWrap`, to clear the head |

Text is rasterised by `SlipRenderer` using Android's font stack — Thai tone
marks and stacked vowels come out right, which they do not when characters are
pushed to the head through a codepage. `SlipRenderer.segments()` batches all
the text between QR and feed commands into a single bitmap, so a receipt is
two or three `printBitmap` calls rather than thirty.

If `window.SunmiPrinter` is missing, the web app falls back to the browser
print dialog on its own (`src/lib/printBridge.ts`). Nothing in the page needs
to know which device it is on — which is also how you test the web changes in
desktop Chrome.

### What the bridge answers

All three methods return promptly and never touch the UI thread; calls are
serialised through one worker, because two slips entering the printer's
transaction buffer at once come out interleaved.

| method | returns |
|---|---|
| `print(job)` | `"ok"`, or the status JSON below when the slip did not print |
| `status()` | that JSON always, without printing |
| `paperWidthMm()` | `58`, `80`, or `0` when unknown |

```json
{ "code": 3, "name": "OUT_OF_PAPER", "label": "กระดาษหมด — ใส่ม้วนใหม่แล้วกดพิมพ์ซ้ำ", "canPrint": false }
```

Success is the bare `"ok"` older web builds already understand, because a
handheld is updated by whoever is holding it and the server by whoever
deploys: the two are never in step. Answering JSON on success would read as a
refusal to a page whose slip had just printed, and raise a print dialog over
the sale.

`canPrint: true` means the paper came out. The state is read before printing
and again after the buffer is committed, because Sunmi's callback confirms
that the command was *accepted*, not that it printed — and those diverge
exactly when the roll runs out mid-slip. Codes come from `updatePrinterState()`
and are named in `PrinterStatus.kt`; `-1` is ours, for a device set to not
print. On any non-printing outcome the device raises a toast naming the cause,
so the fix is visible without leaving the checkout screen.

Older APKs answered the bare strings `ok` / `no-printer` / `error`, and the
first one returned nothing at all. `printBridge.ts` still understands both,
since field devices update on the shop's schedule.

## Per-device printer settings

A second launcher entry, **ตั้งค่าเครื่องพิมพ์**
(`PrinterSettingsActivity`), holds what belongs to the handheld rather than to
the shop: whether it prints at all, and the paper width — automatic, or pinned
to 58/80 for a head that reports the wrong roll after a paper-holder swap.
Both live in `SharedPreferences`, so two handhelds on one till can differ.

The V3 MIX is a single unit — till and 58mm head in one body — so there is no
second printer to route to. The switch is on/off, for a shop running two
handhelds where one only takes orders on the floor.

Automatic is the default and wins over `receiptWidth` in the shop settings,
which stays the fallback for when the head cannot be read.

It has its own icon on purpose: when a receipt does not come out, this is the
screen staff need, and burying it inside the POS means walking back through
the broken screen to reach the fix. It shows the head's model and serial, the
live status, and prints a test slip with Thai tone marks and a totals row.

## Adding a command kind

1. Add it to the `PrintCmd` union in `src/lib/printJob.ts` (web).
2. Handle it in `SlipRenderer.run()` if it is drawn, or in
   `PrinterBridge.print()` if it is a printer command like `qr`/`feed` — and
   in that case also add it to the split list in `SlipRenderer.segments()`.

An unknown kind is skipped silently on this side, so an old APK keeps printing
the rest of a newer slip instead of failing outright.
