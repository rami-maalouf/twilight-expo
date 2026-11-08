package expo.modules.twilightwidgetactions

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

// session notification buttons. wake up / start sleep must work with the app
// swiped away and the phone locked (the ios live activity runs its intent in
// the background), so a press never opens the app: it is recorded as a
// pending action with its press time (the session ends or starts at that
// moment, however late js gets to it), the notification reacts right away,
// and a headless js task applies the action through the app's own store. if
// js cannot start, the app applies the action the next time it opens.
class TwilightSessionActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val appContext = context.applicationContext
    when (intent.action) {
      TwilightSessionNotification.ACTION_STOP -> {
        TwilightWidgetActions.record(appContext, "stop", TwilightWidgetActions.ORIGIN_NOTIFICATION)
        TwilightSessionNotification.cancel(appContext, TwilightSessionNotification.KIND_SLEEP)
        TwilightSessionTaskService.start(appContext)
      }
      TwilightSessionNotification.ACTION_START -> {
        TwilightWidgetActions.record(appContext, "start", TwilightWidgetActions.ORIGIN_NOTIFICATION)
        TwilightSessionNotification.cancel(appContext, TwilightSessionNotification.KIND_WIND_DOWN)
        TwilightSessionTaskService.start(appContext)
      }
      TwilightSessionNotification.ACTION_DISMISSED ->
        TwilightSessionNotification.markDismissed(appContext, intent.getStringExtra(TwilightSessionNotification.EXTRA_KEY))
    }
  }
}

class TwilightSessionTickReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    runCatching { TwilightSessionNotification.tick(context.applicationContext) }
      .onFailure { Log.w(TwilightSessionNotification.TAG, "session notification tick failed", it) }
  }
}

// alarms do not survive a reboot, and an update can clear the notification
class TwilightSessionRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    TwilightSessionNotification.restore(context.applicationContext)
  }
}

// runs the "TwilightSessionAction" js task (src/services/session-action-task.ts)
class TwilightSessionTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    HeadlessJsTaskConfig(TASK_NAME, Arguments.createMap(), TIMEOUT_MS, true)

  companion object {
    private const val TASK_NAME = "TwilightSessionAction"
    private const val TIMEOUT_MS = 30_000L

    fun start(context: Context) {
      // a notification action grants a short background-start allowance; if
      // the start is refused anyway, the pending action waits for the app
      runCatching {
        context.startService(Intent(context, TwilightSessionTaskService::class.java))
        acquireWakeLockNow(context)
      }.onFailure { Log.w(TwilightSessionNotification.TAG, "headless session task not started", it) }
    }
  }
}
