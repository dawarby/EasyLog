package com.easylog.app

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * CarBluetoothReceiver
 *
 * Listens for system-level Bluetooth connection & disconnection events directly from Android OS.
 * Completely independent of Tasker or any third-party app.
 *
 * Triggered automatically when the phone pairs with the car's hands-free/A2DP audio system.
 */
class CarBluetoothReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "EasyLog_BT_Receiver"
        const val PREFS_NAME = "easylog_native_prefs"
        const val KEY_PAIRED_CAR_NAME = "configured_car_bluetooth_name"
        const val KEY_VEHICLE_REGO = "configured_vehicle_rego"
        const val KEY_PASSENGER_MODE = "is_passenger_mode_active"
    }

    @SuppressLint("MissingPermission")
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
        }

        val deviceName = try {
            device?.name ?: device?.address ?: "Unknown Car Device"
        } catch (e: SecurityException) {
            "Bluetooth Device (Permission restricted)"
        }

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val configuredCarName = prefs.getString(KEY_PAIRED_CAR_NAME, "")?.trim()
        val isPassengerMode = prefs.getBoolean(KEY_PASSENGER_MODE, false)

        Log.d(TAG, "Bluetooth Action: $action on device: $deviceName")

        // Check Passenger Mode Protection
        if (isPassengerMode) {
            Log.i(TAG, "Passenger mode active. Skipping automatic trip tracking.")
            return
        }

        // If a specific car name is configured, ensure this device matches (or ignore case/partial match)
        if (!configuredCarName.isNullOrEmpty()) {
            val matches = deviceName.contains(configuredCarName, ignoreCase = true)
            if (!matches) {
                Log.d(TAG, "Connected device '$deviceName' does not match configured car '$configuredCarName'. Skipping.")
                return
            }
        }

        when (action) {
            BluetoothDevice.ACTION_ACL_CONNECTED -> {
                Log.i(TAG, "🚗 Car Bluetooth Connected! Starting GPS Drive Service...")
                
                // Start the GPS Foreground Tracking Service
                val serviceIntent = Intent(context, EasyLogTrackingService::class.java).apply {
                    this.action = EasyLogTrackingService.ACTION_START_TRACKING
                    putExtra(EasyLogTrackingService.EXTRA_DEVICE_NAME, deviceName)
                    putExtra(EasyLogTrackingService.EXTRA_VEHICLE_REGO, prefs.getString(KEY_VEHICLE_REGO, "MY-CAR"))
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }

                // If MainActivity is active in foreground/background, dispatch JS event directly
                MainActivity.instance?.runOnUiThread {
                    MainActivity.instance?.notifyJsBluetoothConnected(deviceName)
                }
            }

            BluetoothDevice.ACTION_ACL_DISCONNECTED -> {
                Log.i(TAG, "🛑 Car Bluetooth Disconnected! Ending drive...")

                // Stop the GPS Foreground Tracking Service
                val serviceIntent = Intent(context, EasyLogTrackingService::class.java).apply {
                    this.action = EasyLogTrackingService.ACTION_STOP_TRACKING
                }
                context.startService(serviceIntent)

                // If MainActivity is running, trigger JS end trip
                MainActivity.instance?.runOnUiThread {
                    MainActivity.instance?.notifyJsBluetoothDisconnected()
                }
            }
        }
    }
}
