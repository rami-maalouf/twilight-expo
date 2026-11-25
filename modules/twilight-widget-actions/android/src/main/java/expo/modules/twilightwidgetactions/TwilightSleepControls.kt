package expo.modules.twilightwidgetactions

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log

// the sleep controls outside the app: the quick settings tile
// (TwilightSleepTileService, swift SleepModeControlWidget) and the launcher
// shortcuts (swift TwilightShortcuts). neither changes a session itself:
// like swift's openAppWhenRun intents, a press stores a pending start/stop
// (TwilightWidgetActions) and opens the app, which runs it through the
// dashboard toggle. js mirrors the session here on every change
// (src/services/sleep-controls.ts), so the tile and the shortcuts can show
// it with the app not running.
object TwilightSleepControls {
  private const val PREFERENCES = "twilight.sleep.controls"
  private const val KEY_SLEEPING_SINCE = "sleepingSince"
  private const val TAG = "TwilightSleepControls"
  private const val SHORTCUT_START = "sleep-start"
  private const val SHORTCUT_STOP = "sleep-stop"
  // the shortcut intents carry the sleep links (twilight://sleep/start|stop)
  // but target the trampoline below, never MainActivity: android can swallow
  // a link identical to the task's base intent and replays the base intent
  // after process death
  private const val START_URL = "twilight://sleep/start"
  private const val STOP_URL = "twilight://sleep/stop"

  fun isSleeping(context: Context): Boolean =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).contains(KEY_SLEEPING_SINCE)

  @Synchronized
  fun publish(context: Context, sleepingSinceMs: Long?) {
    val editor = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
    if (sleepingSinceMs == null) editor.remove(KEY_SLEEPING_SINCE) else editor.putLong(KEY_SLEEPING_SINCE, sleepingSinceMs)
    editor.commit()
    TwilightSleepTileService.refresh(context)
    updateShortcuts(context, sleepingSinceMs != null)
  }

  // only the shortcut that applies is offered (start while awake, wake up
  // while asleep); a pinned copy of the other one keeps working and explains
  private fun updateShortcuts(context: Context, sleeping: Boolean) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) return
    val manager = context.getSystemService(ShortcutManager::class.java) ?: return
    val shortcut = if (sleeping) shortcut(context, SHORTCUT_STOP) else shortcut(context, SHORTCUT_START)
    // rate limited while the app is in the background (setDynamicShortcuts
    // returns false then); the app republishes on every foreground
    runCatching { manager.setDynamicShortcuts(listOf(shortcut)) }
      .onSuccess { updated -> if (!updated) Log.w(TAG, "launcher shortcut update rate limited") }
      .onFailure { Log.w(TAG, "could not update the launcher shortcuts", it) }
  }

  private fun shortcut(context: Context, id: String): ShortcutInfo {
    val start = id == SHORTCUT_START
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(if (start) START_URL else STOP_URL))
      .setClass(context, TwilightSleepShortcutActivity::class.java)
    return ShortcutInfo.Builder(context, id)
      .setShortLabel(context.getString(if (start) R.string.twilight_shortcut_start_short else R.string.twilight_shortcut_wake))
      .setLongLabel(context.getString(if (start) R.string.twilight_shortcut_start_long else R.string.twilight_shortcut_wake))
      .setIcon(Icon.createWithResource(context, if (start) R.drawable.twilight_shortcut_start else R.drawable.twilight_shortcut_wake))
      .setIntent(intent)
      .build()
  }

  fun runShortcut(context: Context, intent: Intent?) {
    val action = when (intent?.data?.toString()) {
      START_URL -> "start"
      STOP_URL -> "stop"
      else -> null
    }
    if (action != null) {
      TwilightWidgetActions.record(context.applicationContext, action)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N_MR1) {
        runCatching {
          context.getSystemService(ShortcutManager::class.java)
            ?.reportShortcutUsed(if (action == "start") SHORTCUT_START else SHORTCUT_STOP)
        }
      }
    }
    TwilightWidgetActions.open(context)
  }
}

// a launcher shortcut press: records the action, opens the app, never shows
class TwilightSleepShortcutActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // a restored trampoline must not replay an old press
    if (savedInstanceState == null) TwilightSleepControls.runShortcut(this, intent)
    finish()
  }
}
