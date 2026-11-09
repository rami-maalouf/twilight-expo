package expo.modules.twilightwidgetactions

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Handler
import android.os.Looper
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

  override fun onStartListening() {
    listening = this
    render()
  }

  override fun onStopListening() {
    if (listening === this) listening = null
  }

  override fun onDestroy() {
    if (listening === this) listening = null
    super.onDestroy()
  }

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

  companion object {
    private const val TAG = "TwilightSleepTile"

    // the instance systemui is listening to, if any (main thread only)
    private var listening: TwilightSleepTileService? = null

    // swift: ControlCenter.shared.reloadControls(ofKind: "SleepModeControlWidget").
    // requestListeningState (ACTIVE_TILE in the manifest) binds the tile to
    // redraw, but systemui ignores it while the tile is still listening, as
    // it stays after a tap; so a listening tile is also redrawn in place, or
    // a session the tap started would keep showing the old state
    fun refresh(context: Context) {
      val appContext = context.applicationContext
      Handler(Looper.getMainLooper()).post {
        listening?.render()
        runCatching { requestListeningState(appContext, ComponentName(appContext, TwilightSleepTileService::class.java)) }
          .onFailure { Log.w(TAG, "could not refresh the quick settings tile", it) }
      }
    }
  }
}
