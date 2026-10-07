package com.easylog.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.*
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    companion object {
        var instance: MainActivity? = null
    }

    private lateinit var webView: WebView

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val fineLocationGranted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] ?: false
        val cameraGranted = permissions[Manifest.permission.CAMERA] ?: false
        val btConnectGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions[Manifest.permission.BLUETOOTH_CONNECT] ?: false
        } else true

        if (fineLocationGranted && cameraGranted && btConnectGranted) {
            Toast.makeText(this, "EasyLog permissions active for Camera, Bluetooth, and GPS", Toast.LENGTH_SHORT).show()
        }
    }

    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val data = result.data
        val uris = when {
            data?.clipData != null -> {
                val count = data.clipData!!.itemCount
                Array(count) { i -> data.clipData!!.getItemAt(i).uri }
            }
            data?.data != null -> arrayOf(data.data!!)
            else -> null
        }
        fileChooserCallback?.onReceiveValue(uris)
        fileChooserCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.setGeolocationEnabled(true)
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT

            webChromeClient = object : WebChromeClient() {
                override fun onGeolocationPermissionsShowPrompt(
                    origin: String?,
                    callback: GeolocationPermissions.Callback?
                ) {
                    callback?.invoke(origin, true, false)
                }

                override fun onPermissionRequest(request: PermissionRequest?) {
                    // Automatically grant camera and audio permissions requested by web app
                    runOnUiThread {
                        request?.grant(request.resources)
                    }
                }

                override fun onShowFileChooser(
                    webView: WebView?,
                    filePathCallback: ValueCallback<Array<Uri>>?,
                    fileChooserParams: FileChooserParams?
                ): Boolean {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = filePathCallback

                    val intent = fileChooserParams?.createIntent() ?: android.content.Intent(android.content.Intent.ACTION_GET_CONTENT).apply {
                        type = "image/*"
                    }
                    try {
                        fileChooserLauncher.launch(intent)
                    } catch (e: Exception) {
                        fileChooserCallback = null
                        return false
                    }
                    return true
                }
            }

            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    injectNativeBridge()
                }
            }

            // Expose Native Android API to JavaScript
            addJavascriptInterface(AndroidWebInterface(this@MainActivity), "AndroidBridge")
        }

        setContentView(webView)
        requestRequiredPermissions()

        // Point to the deployed web app or local assets
        // webView.loadUrl("file:///android_asset/dist/index.html")
        webView.loadUrl("https://easylog.app/")
    }

    private fun requestRequiredPermissions() {
        val needed = mutableListOf<String>()

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.CAMERA)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.ACCESS_COARSE_LOCATION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_CONNECT)
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        if (needed.isNotEmpty()) {
            permissionLauncher.launch(needed.toTypedArray())
        }
    }

    fun notifyJsBluetoothConnected(deviceName: String, deviceAddress: String = "") {
        val safeName = deviceName.replace("'", "\\'")
        val safeAddress = deviceAddress.replace("'", "\\'")
        webView.evaluateJavascript(
            """
            (function() {
                if (window.EasyLogNative && typeof window.EasyLogNative.onBluetoothConnected === 'function') {
                    window.EasyLogNative.onBluetoothConnected('$safeName', null, '$safeAddress');
                } else {
                    window.dispatchEvent(new CustomEvent('android_bluetooth_connected', { detail: { device: '$safeName', macAddress: '$safeAddress' } }));
                }
            })();
            """.trimIndent(),
            null
        )
    }

    fun notifyJsBluetoothDisconnected() {
        webView.evaluateJavascript(
            """
            (function() {
                if (window.EasyLogNative && typeof window.EasyLogNative.onBluetoothDisconnected === 'function') {
                    window.EasyLogNative.onBluetoothDisconnected();
                } else {
                    window.dispatchEvent(new CustomEvent('android_bluetooth_disconnected'));
                }
            })();
            """.trimIndent(),
            null
        )
    }

    private fun injectNativeBridge() {
        webView.evaluateJavascript(
            """
            window.isAndroidNativeApp = true;
            """.trimIndent(),
            null
        )
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) instance = null
    }

    /**
     * Native Bridge methods callable from React/TypeScript: window.AndroidBridge.syncPreferences(...)
     */
    class AndroidWebInterface(private val context: Context) {

        @JavascriptInterface
        fun syncPreferences(carName: String, vehicleRego: String, passengerMode: Boolean) {
            val prefs = context.getSharedPreferences(CarBluetoothReceiver.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putString(CarBluetoothReceiver.KEY_PAIRED_CAR_NAME, carName)
                .putString(CarBluetoothReceiver.KEY_VEHICLE_REGO, vehicleRego)
                .putBoolean(CarBluetoothReceiver.KEY_PASSENGER_MODE, passengerMode)
                .apply()
        }

        @JavascriptInterface
        fun isNative(): Boolean = true
    }
}
