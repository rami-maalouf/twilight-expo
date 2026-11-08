package expo.modules.twilightwidgetactions

import android.content.Context
import android.content.Intent
import android.util.Log

// home-screen widget buttons -> app. glance buttons can only broadcast to the
// widget provider, so the generated providers (plugins/android-widgets) hand
// interactions here first. "sleep:start" / "sleep:stop" are stored as a
// pending action and the app is opened; the app consumes the action on
// launch and on every foreground (swift: SharedData.setPendingExternalAction
// in ToggleSleepModeIntent, consumed by TwilightApp.handlePendingExternalAction).
// the action never rides on the activity intent: android relaunches a task
// with its original intent after process death, which would replay it.
object TwilightWidgetActions {
  private const val INTERACTION_ACTION = "expo.modules.widgets.ACTION_WIDGET_INTERACTION"
  private const val TARGET_EXTRA = "expo.modules.widgets.extra.TARGET"
  private const val PREFERENCES = "twilight.widget.actions"
  private const val KEY_ACTION = "action"
  private const val KEY_AT = "at"
  private const val KEY_ORIGIN = "origin"
  private const val TAG = "TwilightWidgets"
  // widget presses open the app and must run right away; session
  // notification presses run in the background and keep their press time
  const val ORIGIN_WIDGET = "widget"
  const val ORIGIN_NOTIFICATION = "notification"

  // true when the interaction was handled here (expo-widgets must not see it)
  @JvmStatic
  fun handle(context: Context, intent: Intent): Boolean {
    if (intent.action != INTERACTION_ACTION) return false
    val action = when (intent.getStringExtra(TARGET_EXTRA)) {
      "open" -> null
      "sleep:start" -> "start"
      "sleep:stop" -> "stop"
      else -> return false
    }
    val appContext = context.applicationContext
    if (action != null) record(appContext, action)
    open(appContext)
    return true
  }

  @Synchronized
  fun consume(context: Context): Map<String, Any>? {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val action = preferences.getString(KEY_ACTION, null) ?: return null
    val at = preferences.getLong(KEY_AT, 0L)
    val origin = preferences.getString(KEY_ORIGIN, null) ?: ORIGIN_WIDGET
    preferences.edit().clear().commit()
    return mapOf(KEY_ACTION to action, KEY_AT to at.toDouble(), KEY_ORIGIN to origin)
  }

  // one slot, like swift's SharedData.pendingExternalAction: a newer press
  // replaces an older one that was never consumed
  @Synchronized
  fun record(context: Context, action: String, origin: String = ORIGIN_WIDGET) {
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_ACTION, action)
      .putLong(KEY_AT, System.currentTimeMillis())
      .putString(KEY_ORIGIN, origin)
      .commit()
  }

  private fun open(context: Context) {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    runCatching { context.startActivity(launch) }
      .onFailure { Log.w(TAG, "could not open the app from a widget", it) }
  }
}
