package expo.modules.twilightwidgetactions

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TwilightWidgetActionsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TwilightWidgetActions")

    // { action: 'start' | 'stop', at: epoch ms } once, then null
    Function("consumePendingAction") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      TwilightWidgetActions.consume(context)
    }

    // minute re-renders while a session runs (TwilightWidgetTicker)
    Function("setTicking") { enabled: Boolean ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      TwilightWidgetTicker.setTicking(context.applicationContext, enabled)
    }
  }
}
