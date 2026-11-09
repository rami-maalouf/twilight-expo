package expo.modules.twilightwidgetactions

import android.app.PendingIntent
import android.graphics.drawable.Icon
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import android.util.Log

// quick settings tile "Twilight Sleep Mode", the android twin of swift's
// SleepModeControlWidget: "Start Sleep" + moon / Off while awake, "Wake Up" +
// sun / On (active) while asleep. a tap runs ToggleSleepModeIntent(shouldStart:
// !isOn) with openAppWhenRun: it stores the pending action and opens the
// app (after unlocking, like a control on the lock screen), which applies it.
class TwilightSleepTileService : TileService() {
  override fun onTileAdded() = render()

  override fun onStartListening() = render()

  override fun onClick() {
    val action = if (TwilightSleepControls.isSleeping(this)) "stop" else "start"
    if (isLocked) unlockAndRun { open(action) } else open(action)
  }

  private fun open(action: String) {
    TwilightWidgetActions.record(applicationContext, action)
    val launch = TwilightWidgetActions.launchIntent(this) ?: return
    runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startActivityAndCollapse(
          PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        )
      } else {
        @Suppress("DEPRECATION")
        startActivityAndCollapse(launch)
      }
    }.onFailure { Log.w(TAG, "could not open the app from the tile", it) }
  }

  private fun render() {
    val tile = qsTile ?: return
    val sleeping = TwilightSleepControls.isSleeping(this)
    tile.state = if (sleeping) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
    val label = getString(if (sleeping) R.string.twilight_tile_wake else R.string.twilight_tile_start)
    val status = getString(if (sleeping) R.string.twilight_tile_on else R.string.twilight_tile_off)
    tile.label = label
    tile.icon = Icon.createWithResource(this, if (sleeping) R.drawable.twilight_notification_sun else R.drawable.twilight_notification_moon)
    // swift controlWidgetStatus("On" / "Off") and controlWidgetActionHint("Open Twilight")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) tile.subtitle = status
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) tile.stateDescription = status
    tile.contentDescription = getString(R.string.twilight_tile_description, label)
    tile.updateTile()
  }

  private companion object {
    const val TAG = "TwilightSleepTile"
  }
}
