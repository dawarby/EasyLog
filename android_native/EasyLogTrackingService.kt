package com.easylog.app

import android.annotation.SuppressLint
import android.app.*
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * EasyLogTrackingService
 *
 * Runs as an Android Foreground Service with location access while driving.
 * Keeps GPS tracking alive in the background while the phone is locked or in pocket.
 */
class EasyLogTrackingService : Service(), LocationListener {

    companion object {
        const val ACTION_START_TRACKING = "com.easylog.app.START_TRACKING"
        const val ACTION_STOP_TRACKING = "com.easylog.app.STOP_TRACKING"
        const val EXTRA_DEVICE_NAME = "device_name"
        const val EXTRA_VEHICLE_REGO = "vehicle_rego"

        private const val CHANNEL_ID = "easylog_driving_channel"
        private const val NOTIFICATION_ID = 4040
        private const val TAG = "EasyLog_GPS_Service"
    }

    private var locationManager: LocationManager? = null
    private var isTracking = false
    private var totalDistanceKm = 0.0
    private var lastLocation: Location? = null
    private var vehicleRego = "MY-CAR"

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: return START_NOT_STICKY

        when (action) {
            ACTION_START_TRACKING -> {
                vehicleRego = intent.getStringExtra(EXTRA_VEHICLE_REGO) ?: "MY-CAR"
                val device = intent.getStringExtra(EXTRA_DEVICE_NAME) ?: "Car"
                startForegroundTracking(device)
            }
            ACTION_STOP_TRACKING -> {
                stopForegroundTracking()
            }
        }

        return START_STICKY
    }

    private fun startForegroundTracking(deviceName: String) {
        if (isTracking) return
        isTracking = true
        totalDistanceKm = 0.0
        lastLocation = null

        val notification = buildTrackingNotification("Tracking drive with $deviceName ($vehicleRego)")
        startForeground(NOTIFICATION_ID, notification)

        startLocationUpdates()
        Log.i(TAG, "Foreground GPS tracking initiated.")
    }

    @SuppressLint("MissingPermission")
    private fun startLocationUpdates() {
        try {
            locationManager?.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                2000L, // 2 seconds
                5.0f,  // 5 meters
                this
            )
        } catch (e: SecurityException) {
            Log.e(TAG, "Location permission missing", e)
        }
    }

    override fun onLocationChanged(location: Location) {
        if (lastLocation != null) {
            val deltaMeters = lastLocation!!.distanceTo(location)
            if (deltaMeters >= 8.0) { // filter GPS drift
                totalDistanceKm += (deltaMeters / 1000.0)
                updateTrackingNotification()
            }
        }
        lastLocation = location
    }

    private fun stopForegroundTracking() {
        if (!isTracking) return
        isTracking = false

        try {
            locationManager?.removeUpdates(this)
        } catch (e: Exception) {
            Log.w(TAG, "Error removing location updates", e)
        }

        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()

        // Post Trip Finished Notification for user to verify Work vs Personal
        postTripFinishedNotification()
        Log.i(TAG, "Drive tracking stopped. Logged: $totalDistanceKm km.")
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Vehicle Drive Tracking",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows active GPS recording status while connected to your vehicle Bluetooth."
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm?.createNotificationChannel(channel)
        }
    }

    private fun buildTrackingNotification(subtitle: String): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🚗 EasyLog Drive Active")
            .setContentText(subtitle)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateTrackingNotification() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        val distFormatted = String.format("%.1f", totalDistanceKm)
        val notification = buildTrackingNotification("Vehicle: $vehicleRego • ${distFormatted} km tracked")
        nm?.notify(NOTIFICATION_ID, notification)
    }

    private fun postTripFinishedNotification() {
        val distFormatted = String.format("%.1f", totalDistanceKm)
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("action", "verify_trips")
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            1,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val finishedNotification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🚗 Trip Finished: ${distFormatted} km Logged")
            .setContentText("Tap to verify trip purpose (Work vs Personal) for ATO compliance.")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()

        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        nm?.notify(NOTIFICATION_ID + 1, finishedNotification)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    @Deprecated("Deprecated in Java")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {}
}
