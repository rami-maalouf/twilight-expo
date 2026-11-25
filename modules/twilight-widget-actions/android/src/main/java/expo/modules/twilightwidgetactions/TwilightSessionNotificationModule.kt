package expo.modules.twilightwidgetactions

import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TwilightSessionNotificationModule : Module() {
  private val context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("TwilightSessionNotification")

    // { kind: 'sleep', key, startMs, goalSeconds } | { kind: 'winddown', key, bedtimeMs }
    Function("post") { spec: Map<String, Any?> ->
      TwilightSessionNotification.post(context, TwilightSessionNotification.Spec.from(spec))
    }

    Function("cancel") { kind: String? ->
      TwilightSessionNotification.cancel(context, kind)
    }

    // { kind, key } of the notification in the shade, or null
    Function("getActive") {
      TwilightSessionNotification.active(context)?.let { mapOf("kind" to it.kind, "key" to it.key) }
    }

    Function("canPost") {
      TwilightSessionNotification.canPost(context)
    }

    Function("canPostPromoted") {
      TwilightSessionNotification.canPostPromoted(context)
    }

    // the app's notification settings (swift opens UIApplication.openSettingsURLString)
    Function("openNotificationSettings") {
      val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }
  }
}
