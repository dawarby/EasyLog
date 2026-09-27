# EasyLog Native Android App (Google Play Store)

This directory contains the production-ready Android native source files to package **EasyLog** for the **Google Play Store** with **100% native, hands-free Bluetooth car detection — completely separate from Tasker or any third-party automation tools**.

---

## How It Works in Native Android (Play Store)

Unlike web browsers that cannot run background listeners when the phone is asleep in a pocket, a native Android app published to Google Play has full access to the Android Bluetooth & Location subsystems:

1. **System Broadcast Receiver (`CarBluetoothReceiver.kt`):**
   - Registers for Android OS system broadcasts:
     - `android.bluetooth.BluetoothDevice.ACTION_ACL_CONNECTED`
     - `android.bluetooth.BluetoothDevice.ACTION_ACL_DISCONNECTED`
   - Android OS automatically wakes this receiver when your phone pairs with your car's audio/hands-free Bluetooth.
   - **No Tasker, no Samsung Routines, and no user input required.**

2. **Foreground GPS Service (`EasyLogTrackingService.kt`):**
   - When your car connects, Android starts a lightweight Foreground Service.
   - Shows a notification: *"🚗 EasyLog: Tracking Drive to [Vehicle]..."*
   - Complies with all Google Play Store background location policies.

3. **Two-Way JavaScript Bridge (`MainActivity.kt`):**
   - Communicates directly with the EasyLog UI via `window.EasyLogNative.onBluetoothConnected(carName)` and `window.EasyLogNative.onBluetoothDisconnected()`.
   - Can also dispatch standard DOM events:
     `window.dispatchEvent(new CustomEvent('android_bluetooth_connected', { detail: { device: 'My Car' } }))`

---

## File Overview

| File | Purpose |
|---|---|
| `AndroidManifest.xml` | Play Store permissions (`BLUETOOTH_CONNECT`, `FOREGROUND_SERVICE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`) and component registrations. |
| `CarBluetoothReceiver.kt` | Android BroadcastReceiver listening for Bluetooth connection/disconnection. |
| `EasyLogTrackingService.kt` | Persistent background GPS tracking service with ongoing driving notification. |
| `MainActivity.kt` | Android Activity with hardware-accelerated WebView, Geolocation prompt handler, and JavaScriptInterface bridge. |

---

## Packaging Options for Google Play Store

### Option A: Android Studio Native WebView (Zero Dependencies)
1. Open Android Studio → **New Project** → **Empty Views Activity**.
2. Copy `MainActivity.kt`, `CarBluetoothReceiver.kt`, and `EasyLogTrackingService.kt` into `app/src/main/java/com/easylog/app/`.
3. Copy `AndroidManifest.xml` into `app/src/main/`.
4. Point `webView.loadUrl("https://your-easylog-deployment.app")` or bundle the `dist/` web files into `app/src/main/assets/`.
5. Build Signed App Bundle (.aab) and upload to Google Play Console.

### Option B: Capacitor / Ionic Wrapper
If wrapping via `@capacitor/android`:
- Add a custom Capacitor plugin or BroadcastReceiver in `android/app/src/main/java/.../` using the code in `CarBluetoothReceiver.kt`.
- Dispatch native events to `window.dispatchEvent(new CustomEvent('android_bluetooth_connected'))`.
