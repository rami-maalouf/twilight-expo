package expo.modules.twilightwidgetactions

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.util.Log
import org.json.JSONObject

// keeps the widgets' elapsed sleep time fresh while a session runs and the
// app is not (react native timers stop in the background; swift schedules a
// timeline entry per minute instead). a non-waking inexact alarm fires about
// once a minute while the device is awake, so the widget is current whenever
// someone looks at it, without waking the phone at night.
// expo-widgets re-renders only when a widget's stored props change, so each
// tick bumps `renderKey` (the field the app's publisher sets) and asks
// expo-widgets to reload through its own interaction broadcast.
object TwilightWidgetTicker {
  private const val TAG = "TwilightWidgets"
  private const val INTERVAL_MS = 60_000L
  private const val REQUEST_CODE = 4_127
  // expo-widgets 58 storage and interaction contract (WidgetsStorage.kt,
  // WidgetInteractionAction.kt)
  private const val WIDGETS_PREFERENCES = "expo.modules.widgets"
  private const val INTERACTION_ACTION = "expo.modules.widgets.ACTION_WIDGET_INTERACTION"
  private const val SOURCE_EXTRA = "expo.modules.widgets.extra.SOURCE"
  private const val TARGET_EXTRA = "expo.modules.widgets.extra.TARGET"
  const val TICK_TARGET = "__twilight_tick"

  fun setTicking(context: Context, enabled: Boolean) {
    val alarms = context.getSystemService(AlarmManager::class.java) ?: return
    val pending = tickIntent(context)
    alarms.cancel(pending)
    if (enabled) {
      alarms.setInexactRepeating(
        AlarmManager.ELAPSED_REALTIME,
        SystemClock.elapsedRealtime() + INTERVAL_MS,
        INTERVAL_MS,
        pending
      )
    }
  }

  internal fun tick(context: Context) {
    val names = widgetNames(context)
    val preferences = context.getSharedPreferences(WIDGETS_PREFERENCES, Context.MODE_PRIVATE)
    var sleeping = false
    for (name in names) {
      val key = "__expo_widgets_${name}_props"
      val props = preferences.getString(key, null)?.let { runCatching { JSONObject(it) }.getOrNull() } ?: continue
      sleeping = sleeping || props.optBoolean("sleeping", false)
      props.put("renderKey", System.currentTimeMillis().toDouble())
      preferences.edit().putString(key, props.toString()).commit()
      context.sendBroadcast(
        Intent(INTERACTION_ACTION)
          .setComponent(ComponentName(context.packageName, "${context.packageName}.${name}Provider"))
          .putExtra(SOURCE_EXTRA, name)
          .putExtra(TARGET_EXTRA, TICK_TARGET)
      )
    }
    // the session ended without the app (or the widgets were removed): stop
    if (!sleeping) setTicking(context, false)
  }

  private fun widgetNames(context: Context): List<String> {
    val id = context.resources.getIdentifier("expo_widgets_names", "array", context.packageName)
    if (id == 0) return emptyList()
    return runCatching { context.resources.getStringArray(id).toList() }
      .onFailure { Log.w(TAG, "widget names unavailable", it) }
      .getOrDefault(emptyList())
  }

  private fun tickIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      REQUEST_CODE,
      Intent(context, TwilightWidgetTickReceiver::class.java),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
}

class TwilightWidgetTickReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    runCatching { TwilightWidgetTicker.tick(context.applicationContext) }
      .onFailure { Log.w("TwilightWidgets", "widget tick failed", it) }
  }
}
