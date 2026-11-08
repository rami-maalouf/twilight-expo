package expo.modules.twilightwidgetactions

import android.annotation.SuppressLint
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.text.format.DateFormat
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.graphics.drawable.IconCompat
import java.util.Date
import kotlin.math.ceil

// android twin of the live activity (swift TwilightWidgetLiveActivity +
// LiveActivityManager): one standard-template notification, either
// - "sleep": "Rejuvenating...", an elapsed chronometer that ticks without the
//   app, progress toward the sleep goal, "<Xh Ym> left" / "Goal reached" and
//   a Wake Up action. ongoing and promoted to a live update on android 16.
// - "winddown": a countdown chronometer to bedtime with a Start Sleep action,
//   removed by the system at bedtime.
// the app decides what to show (src/services/live-activity.android.ts); this
// object only renders it, keeps it fresh about once a minute (progress and
// remaining time cannot tick on their own) and restores it after a reboot.
// standard templates instead of expo-widgets custom notifications: android
// promotes only standard templates, and only they get a native chronometer.
object TwilightSessionNotification {
  const val TAG = "TwilightSession"
  const val KIND_SLEEP = "sleep"
  const val KIND_WIND_DOWN = "winddown"
  const val ACTION_STOP = "twilight.session.action.STOP"
  const val ACTION_START = "twilight.session.action.START"
  const val ACTION_DISMISSED = "twilight.session.action.DISMISSED"
  const val EXTRA_KEY = "twilight.session.extra.KEY"

  private const val NOTIFICATION_TAG = "twilight.session"
  private const val NOTIFICATION_ID = 4_130
  private const val SLEEP_CHANNEL = "twilight_sleep"
  private const val WIND_DOWN_CHANNEL = "twilight_bedtime"
  private const val PREFERENCES = "twilight.session.notification"
  private const val KEY_KIND = "kind"
  private const val KEY_KEY = "key"
  private const val KEY_START = "startMs"
  private const val KEY_GOAL = "goalSeconds"
  private const val KEY_BEDTIME = "bedtimeMs"
  private const val KEY_DISMISSED = "dismissedKey"
  private const val TICK_INTERVAL_MS = 60_000L
  private const val REQUEST_OPEN = 4_131
  private const val REQUEST_STOP = 4_132
  private const val REQUEST_START = 4_133
  private const val REQUEST_DISMISSED = 4_134
  private const val REQUEST_TICK = 4_135
  // swift tealColor rgb(0, 212, 255); the wind-down moon is the port's gold
  private const val TEAL = 0xFF00D4FF.toInt()
  private const val GOLD = 0xFFFFD700.toInt()

  data class Spec(
    val kind: String,
    val key: String,
    val startMs: Long = 0L,
    val goalSeconds: Long = 0L,
    val bedtimeMs: Long = 0L
  ) {
    companion object {
      fun from(map: Map<String, Any?>): Spec {
        fun long(name: String) = (map[name] as? Number)?.toLong() ?: 0L
        val kind = map[KEY_KIND] as? String ?: throw IllegalArgumentException("kind is required")
        require(kind == KIND_SLEEP || kind == KIND_WIND_DOWN) { "unknown kind '$kind'" }
        return Spec(
          kind = kind,
          key = map[KEY_KEY] as? String ?: kind,
          startMs = long(KEY_START),
          goalSeconds = long(KEY_GOAL),
          bedtimeMs = long(KEY_BEDTIME)
        )
      }
    }
  }

  // "posted" | "disabled" (notifications or the channel are off) |
  // "dismissed" (the user swiped this wind-down countdown away) | "expired"
  @Synchronized
  fun post(context: Context, spec: Spec, now: Long = System.currentTimeMillis()): String {
    val preferences = preferences(context)
    if (spec.kind == KIND_WIND_DOWN) {
      if (preferences.getString(KEY_DISMISSED, null) == spec.key) return "dismissed"
      if (spec.bedtimeMs <= now) {
        cancel(context, KIND_WIND_DOWN)
        return "expired"
      }
    }
    ensureChannels(context)
    if (!canPost(context, channelFor(spec.kind))) return "disabled"
    notify(context, build(context, spec, now))
    preferences.edit()
      .putString(KEY_KIND, spec.kind)
      .putString(KEY_KEY, spec.key)
      .putLong(KEY_START, spec.startMs)
      .putLong(KEY_GOAL, spec.goalSeconds)
      .putLong(KEY_BEDTIME, spec.bedtimeMs)
      .commit()
    setTicking(context, spec.kind == KIND_SLEEP)
    return "posted"
  }

  // removes the notification when it shows `kind` (any kind when null)
  @Synchronized
  fun cancel(context: Context, kind: String? = null) {
    val stored = storedSpec(context)
    if (kind != null && stored != null && stored.kind != kind) return
    NotificationManagerCompat.from(context).cancel(NOTIFICATION_TAG, NOTIFICATION_ID)
    preferences(context).edit()
      .remove(KEY_KIND).remove(KEY_KEY).remove(KEY_START).remove(KEY_GOAL).remove(KEY_BEDTIME)
      .commit()
    setTicking(context, false)
  }

  // what the shade shows right now, or null (dismissed, timed out, never posted)
  fun active(context: Context): Spec? {
    val stored = storedSpec(context) ?: return null
    return if (isShowing(context)) stored else null
  }

  fun canPost(context: Context, channelId: String? = null): Boolean {
    val manager = NotificationManagerCompat.from(context)
    if (!manager.areNotificationsEnabled()) return false
    if (channelId == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
    val channel = manager.getNotificationChannel(channelId) ?: return true
    return channel.importance != NotificationManager.IMPORTANCE_NONE
  }

  // android 16 live updates: false when the user turned them off for the app
  fun canPostPromoted(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < 36) return false
    val manager = context.getSystemService(NotificationManager::class.java) ?: return false
    return runCatching { manager.canPostPromotedNotifications() }.getOrDefault(false)
  }

  fun markDismissed(context: Context, key: String?) {
    if (key == null) return
    val preferences = preferences(context)
    val editor = preferences.edit().putString(KEY_DISMISSED, key)
    if (preferences.getString(KEY_KEY, null) == key) {
      editor.remove(KEY_KIND).remove(KEY_KEY).remove(KEY_START).remove(KEY_GOAL).remove(KEY_BEDTIME)
    }
    editor.commit()
  }

  // minute refresh while asleep: progress and "left" text cannot tick natively
  internal fun tick(context: Context) {
    val stored = storedSpec(context)
    if (stored == null || stored.kind != KIND_SLEEP || !isShowing(context)) {
      setTicking(context, false)
      return
    }
    if (!canPost(context, SLEEP_CHANNEL)) return
    notify(context, build(context, stored, System.currentTimeMillis()))
  }

  // after a reboot or an app update: alarms are gone and notifications may be
  internal fun restore(context: Context) {
    val stored = storedSpec(context) ?: return
    if (stored.kind == KIND_SLEEP) TwilightWidgetTicker.setTicking(context, true)
    runCatching { post(context, stored) }
      .onFailure { Log.w(TAG, "could not restore the session notification", it) }
  }

  private fun build(context: Context, spec: Spec, now: Long) =
    NotificationCompat.Builder(context, channelFor(spec.kind))
      .setSmallIcon(R.drawable.twilight_notification_moon)
      .setContentIntent(openAppIntent(context))
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setShowWhen(true)
      .setUsesChronometer(true)
      .apply { if (spec.kind == KIND_SLEEP) sleep(context, spec, now) else windDown(context, spec, now) }
      .build()

  private fun NotificationCompat.Builder.sleep(context: Context, spec: Spec, now: Long) {
    val goalMs = maxOf(spec.goalSeconds, 1L) * 1000L
    val elapsedMs = maxOf(0L, now - spec.startMs)
    val remainingMs = maxOf(0L, spec.startMs + goalMs - now)
    val goalMinutes = maxOf(1, ceil(goalMs / 60_000.0).toInt())
    val elapsedMinutes = minOf(goalMinutes, (elapsedMs / 60_000L).toInt())
    setContentTitle(context.getString(R.string.twilight_session_sleep_title))
    setContentText(
      if (remainingMs > 0) context.getString(R.string.twilight_session_sleep_left, formatDuration(remainingMs))
      else context.getString(R.string.twilight_session_sleep_goal_reached)
    )
    setColor(TEAL)
    setWhen(spec.startMs)
    setOngoing(true)
    setCategory(NotificationCompat.CATEGORY_STOPWATCH)
    setRequestPromotedOngoing(true)
    addAction(
      R.drawable.twilight_notification_sun,
      context.getString(R.string.twilight_session_wake_up),
      actionIntent(context, ACTION_STOP, REQUEST_STOP)
    )
    if (Build.VERSION.SDK_INT >= 36) {
      setStyle(
        NotificationCompat.ProgressStyle()
          .setProgressSegments(listOf(NotificationCompat.ProgressStyle.Segment(goalMinutes).setColor(TEAL)))
          .setProgress(elapsedMinutes)
          .setProgressTrackerIcon(
            IconCompat.createWithResource(context, R.drawable.twilight_notification_moon).setTint(TEAL)
          )
      )
    } else {
      setProgress(goalMinutes, elapsedMinutes, false)
    }
  }

  private fun NotificationCompat.Builder.windDown(context: Context, spec: Spec, now: Long) {
    val bedtime = DateFormat.getTimeFormat(context).format(Date(spec.bedtimeMs))
    setContentTitle(context.getString(R.string.twilight_session_wind_down_title))
    setContentText(context.getString(R.string.twilight_session_wind_down_text, bedtime))
    setColor(GOLD)
    setWhen(spec.bedtimeMs)
    setChronometerCountDown(true)
    setOngoing(false)
    setAutoCancel(false)
    setCategory(NotificationCompat.CATEGORY_REMINDER)
    setTimeoutAfter(maxOf(1L, spec.bedtimeMs - now))
    setDeleteIntent(dismissedIntent(context, spec.key))
    addAction(
      R.drawable.twilight_notification_moon,
      context.getString(R.string.twilight_session_start_sleep),
      actionIntent(context, ACTION_START, REQUEST_START)
    )
  }

  // swift ContentState.formattedDuration: "7h 5m"
  internal fun formatDuration(ms: Long): String {
    val totalMinutes = maxOf(0L, ms / 60_000L)
    return "${totalMinutes / 60}h ${totalMinutes % 60}m"
  }

  @SuppressLint("MissingPermission") // canPost() checked areNotificationsEnabled()
  private fun notify(context: Context, notification: android.app.Notification) {
    NotificationManagerCompat.from(context).notify(NOTIFICATION_TAG, NOTIFICATION_ID, notification)
  }

  private fun isShowing(context: Context): Boolean {
    val manager = context.getSystemService(NotificationManager::class.java) ?: return false
    return runCatching {
      manager.activeNotifications.any { it.id == NOTIFICATION_ID && it.tag == NOTIFICATION_TAG }
    }.getOrDefault(false)
  }

  private fun storedSpec(context: Context): Spec? {
    val preferences = preferences(context)
    val kind = preferences.getString(KEY_KIND, null) ?: return null
    return Spec(
      kind = kind,
      key = preferences.getString(KEY_KEY, null) ?: kind,
      startMs = preferences.getLong(KEY_START, 0L),
      goalSeconds = preferences.getLong(KEY_GOAL, 0L),
      bedtimeMs = preferences.getLong(KEY_BEDTIME, 0L)
    )
  }

  private fun channelFor(kind: String) = if (kind == KIND_SLEEP) SLEEP_CHANNEL else WIND_DOWN_CHANNEL

  // default importance with no sound or vibration: low importance would
  // file it under "silent", which pixel hides from the lock screen and the
  // status bar - the places a live activity lives. no heads-up either
  // (that needs high importance). importance is fixed once a channel exists.
  private fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    fun channel(id: String, name: Int, description: Int) =
      NotificationChannel(id, context.getString(name), NotificationManager.IMPORTANCE_DEFAULT).apply {
        this.description = context.getString(description)
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
      }
    manager.createNotificationChannels(
      listOf(
        channel(SLEEP_CHANNEL, R.string.twilight_session_channel_sleep, R.string.twilight_session_channel_sleep_description),
        channel(WIND_DOWN_CHANNEL, R.string.twilight_session_channel_wind_down, R.string.twilight_session_channel_wind_down_description)
      )
    )
  }

  private fun openAppIntent(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    return PendingIntent.getActivity(
      context,
      REQUEST_OPEN,
      launch,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
  }

  private fun actionIntent(context: Context, action: String, requestCode: Int): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      requestCode,
      Intent(context, TwilightSessionActionReceiver::class.java).setAction(action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

  private fun dismissedIntent(context: Context, key: String): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      REQUEST_DISMISSED,
      Intent(context, TwilightSessionActionReceiver::class.java)
        .setAction(ACTION_DISMISSED)
        .putExtra(EXTRA_KEY, key),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

  private fun setTicking(context: Context, enabled: Boolean) {
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val pending = PendingIntent.getBroadcast(
      context,
      REQUEST_TICK,
      Intent(context, TwilightSessionTickReceiver::class.java),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    alarms.cancel(pending)
    if (enabled) {
      // non-waking and inexact, like the widget ticker: current whenever the
      // screen is on, without waking the phone at night
      alarms.setInexactRepeating(
        AlarmManager.ELAPSED_REALTIME,
        SystemClock.elapsedRealtime() + TICK_INTERVAL_MS,
        TICK_INTERVAL_MS,
        pending
      )
    }
  }

  private fun preferences(context: Context) =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
}
