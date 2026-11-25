package expo.modules.twilighthealthconnect

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ImageView

// privacy policy url, written by app.plugin.js from the plugin option
internal const val PRIVACY_POLICY_META_DATA = "twilight.healthconnect.PRIVACY_POLICY_URL"

// health connect opens this screen from its own task: through
// androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE on android 13 and lower,
// and through the VIEW_PERMISSION_USAGE activity-alias on android 14+
// (docs/health-connect.md 2.8). it is native so back returns to health connect.
class HealthConnectRationaleActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.TwilightHealthConnectRationale)
    super.onCreate(savedInstanceState)
    setContentView(R.layout.twilight_hc_rationale)

    val root = findViewById<View>(R.id.twilight_hc_rationale_root)
    val basePadding = root.paddingTop
    // edge-to-edge is enforced from target sdk 35: keep text clear of the bars
    root.setOnApplyWindowInsetsListener { view, insets ->
      val top: Int
      val bottom: Int
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars())
        top = bars.top
        bottom = bars.bottom
      } else {
        @Suppress("DEPRECATION")
        top = insets.systemWindowInsetTop
        @Suppress("DEPRECATION")
        bottom = insets.systemWindowInsetBottom
      }
      view.setPadding(view.paddingLeft, basePadding + top, view.paddingRight, basePadding + bottom)
      insets
    }

    val privacyUrl = privacyPolicyUrl()
    val privacyButton = findViewById<Button>(R.id.twilight_hc_privacy)
    if (privacyUrl == null) {
      privacyButton.visibility = View.GONE
    } else {
      privacyButton.setOnClickListener {
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(privacyUrl))) }
      }
    }
    findViewById<Button>(R.id.twilight_hc_done).setOnClickListener { finish() }
    runCatching { packageManager.getApplicationIcon(packageName) }.getOrNull()?.let {
      findViewById<ImageView>(R.id.twilight_hc_icon).setImageDrawable(it)
    }
  }

  private fun privacyPolicyUrl(): String? {
    val info = runCatching {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        packageManager.getApplicationInfo(packageName, PackageManager.ApplicationInfoFlags.of(PackageManager.GET_META_DATA.toLong()))
      } else {
        @Suppress("DEPRECATION")
        packageManager.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
      }
    }.getOrNull()
    return info?.metaData?.getString(PRIVACY_POLICY_META_DATA)?.takeIf { it.startsWith("https://") }
  }
}
