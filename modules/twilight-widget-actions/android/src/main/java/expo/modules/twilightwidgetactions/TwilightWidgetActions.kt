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
  // widget, quick settings tile and launcher shortcut presses open the app
  // and must run right away (ORIGIN_WIDGET); session
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

  // the oldest pending press, once; call again until null. a notification
  // press and a later widget press are both kept, so the app applies them in
  // press order (a wake up at T, then the "Start Sleep" the tile offered)
  @Synchronized
  fun consume(context: Context): Map<String, Any>? {
    val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    val oldest = listOf(ORIGIN_NOTIFICATION, ORIGIN_WIDGET).mapNotNull { slot ->
      val action = preferences.getString(key(slot, KEY_ACTION), null) ?: return@mapNotNull null
      Pending(slot, action, preferences.getLong(key(slot, KEY_AT), 0L))
    }.minByOrNull { it.at } ?: return null
    // an older build kept every origin in the widget slot with an "origin" key
    val origin = if (oldest.slot == ORIGIN_WIDGET) preferences.getString(KEY_ORIGIN, null) ?: ORIGIN_WIDGET else oldest.slot
    val editor = preferences.edit().remove(key(oldest.slot, KEY_ACTION)).remove(key(oldest.slot, KEY_AT))
    if (oldest.slot == ORIGIN_WIDGET) editor.remove(KEY_ORIGIN)
    editor.commit()
    return mapOf(KEY_ACTION to oldest.action, KEY_AT to oldest.at.toDouble(), KEY_ORIGIN to origin)
  }

  private data class Pending(val slot: String, val action: String, val at: Long)

  // one slot per origin, like swift's SharedData.pendingExternalAction: a
  // newer press replaces an older one of the same origin that was never
  // consumed. a widget, tile or shortcut press never replaces a
  // notification press, which carries the time the session ends or starts
  @Synchronized
  fun record(context: Context, action: String, origin: String = ORIGIN_WIDGET) {
    val editor = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putString(key(origin, KEY_ACTION), action)
      .putLong(key(origin, KEY_AT), System.currentTimeMillis())
    if (origin != ORIGIN_NOTIFICATION) editor.remove(KEY_ORIGIN)
    editor.commit()
  }

  // the widget slot keeps the original keys ("action", "at"), so a press
  // stored by an older build is still found after an update
  private fun key(origin: String, name: String) =
    if (origin == ORIGIN_NOTIFICATION) "$ORIGIN_NOTIFICATION.$name" else name

  // brings the app's task to the front as it was (or starts it)
  fun launchIntent(context: Context): Intent? =
    context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)

  fun open(context: Context) {
    val launch = launchIntent(context) ?: return
    runCatching { context.startActivity(launch) }
      .onFailure { Log.w(TAG, "could not open the app", it) }
  }
}
