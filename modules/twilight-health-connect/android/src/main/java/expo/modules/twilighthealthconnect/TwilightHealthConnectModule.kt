package expo.modules.twilighthealthconnect

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.Serializable
import java.time.Instant
import java.util.UUID
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"
private const val INSTALL_ID_FILE = "twilight-health-connect-install-id"
private const val READ_PAGE_SIZE = 500

// thin bridge to health connect. no sync logic lives here: the js engine owns
// every decision (docs/health-connect.md 4.1).
class TwilightHealthConnectModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw HealthConnectException(HcErrorCode.UNAVAILABLE, "React context is gone")

  private val readPermission = HealthPermission.getReadPermission(SleepSessionRecord::class)
  private val writePermission = HealthPermission.getWritePermission(SleepSessionRecord::class)
  private val historyPermission = HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY

  private lateinit var permissionLauncher: AppContextActivityResultLauncher<PermissionRequest, Set<String>>
  private val permissionMutex = Mutex()
  // touched on the main thread only
  private var pendingPermissionRequest: CancellableContinuation<Unit>? = null
  private val installIdLock = Any()

  private fun sdkStatus(): Int = HealthConnectClient.getSdkStatus(context, PROVIDER_PACKAGE)

  private fun client(): HealthConnectClient {
    if (sdkStatus() != HealthConnectClient.SDK_AVAILABLE) {
      throw HealthConnectException(HcErrorCode.UNAVAILABLE, "Health Connect is not available")
    }
    return HealthConnectClient.getOrCreate(context, PROVIDER_PACKAGE)
  }

  private suspend fun status(): Map<String, Any?> {
    val sdk = sdkStatus()
    val availability = when (sdk) {
      HealthConnectClient.SDK_AVAILABLE -> "available"
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "providerUpdateRequired"
      else -> "unavailable"
    }
    var granted = emptySet<String>()
    var historyFeatureAvailable = false
    if (sdk == HealthConnectClient.SDK_AVAILABLE) {
      val client = HealthConnectClient.getOrCreate(context, PROVIDER_PACKAGE)
      granted = client.permissionController.getGrantedPermissions()
      historyFeatureAvailable = client.features.getFeatureStatus(
        HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY
      ) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
    }
    return mapOf(
      "availability" to availability,
      "read" to (readPermission in granted),
      "write" to (writePermission in granted),
      "history" to (historyPermission in granted),
      "historyFeatureAvailable" to historyFeatureAvailable,
      "packageName" to context.packageName,
      "sdkInt" to Build.VERSION.SDK_INT,
    )
  }

  // a random id in the no-backup dir. android auto backup never restores it,
  // so a mismatch with the database tells the engine the db came from another
  // install (docs/health-connect.md 4.6)
  private fun installId(): String = synchronized(installIdLock) {
    val file = File(context.noBackupFilesDir, INSTALL_ID_FILE)
    val existing = if (file.exists()) file.readText().trim() else ""
    if (existing.isNotEmpty()) return existing
    val created = UUID.randomUUID().toString()
    file.writeText(created)
    created
  }

  private fun startIntent(intent: Intent) {
    val activity = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  private fun canResolve(intent: Intent): Boolean =
    intent.resolveActivity(context.packageManager) != null

  // shows the health connect permission ui and returns when it closes. the
  // caller re-reads the granted set, so the result itself is not needed.
  //
  // android 14+: the hc contract delegates to RequestMultiplePermissions,
  // whose result comes back through onRequestPermissionsResult. the expo
  // activity result registry only forwards onActivityResult, so a launcher
  // call would never return there. expo's permissions service goes through
  // PermissionAwareActivity and does receive that callback.
  // android 13 and lower: the contract starts the apk provider for a result,
  // which the expo launcher handles.
  private suspend fun launchPermissionRequest(permissions: List<String>) = withContext(Dispatchers.Main) {
    suspendCancellableCoroutine { continuation ->
      pendingPermissionRequest = continuation
      continuation.invokeOnCancellation { pendingPermissionRequest = null }
      val done = {
        if (pendingPermissionRequest === continuation) pendingPermissionRequest = null
        if (continuation.isActive) continuation.resume(Unit)
      }
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          val service = appContext.permissions
            ?: throw HealthConnectException(HcErrorCode.UNAVAILABLE, "Permissions service is not available")
          service.askForPermissions({ done() }, *permissions.toTypedArray())
        } else {
          permissionLauncher.launch(PermissionRequest(ArrayList(permissions))) { done() }
        }
      } catch (error: Throwable) {
        pendingPermissionRequest = null
        continuation.resumeWithException(error)
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("TwilightHealthConnect")

    RegisterActivityContracts {
      permissionLauncher = registerForActivityResult(PermissionContract())
    }

    // a result listener dies with the activity. release the waiting request
    // so the mutex is free; it then reports the granted set as it is now.
    OnActivityDestroys {
      pendingPermissionRequest?.let { if (it.isActive) it.resume(Unit) }
      pendingPermissionRequest = null
    }

    AsyncFunction("getStatus") Coroutine { ->
      mapHealthConnectErrors { status() }
    }

    AsyncFunction("getInstallId") {
      mapHealthConnectErrors { installId() }
    }

    AsyncFunction("requestPermissions") Coroutine { options: PermissionOptions ->
      mapHealthConnectErrors {
        permissionMutex.withLock {
          val client = client()
          val permissions = arrayListOf(readPermission, writePermission)
          val historyAvailable = client.features.getFeatureStatus(
            HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY
          ) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
          if (options.history && historyAvailable) permissions.add(historyPermission)
          launchPermissionRequest(permissions)
          // the contract result only lists what this dialog granted; the
          // status re-reads the full granted set (docs/health-connect.md 2.8)
          status()
        }
      }
    }

    AsyncFunction("openPermissionSettings") {
      mapHealthConnectErrors {
        // android 14+: the per-app permission page; older: health connect home.
        // no resolveActivity pre-check: the framework hc controller package is
        // not visible to twilight (<queries> lists only the apk provider), so
        // the check always failed; a failed start falls back instead
        val perApp = Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS")
          .putExtra(Intent.EXTRA_PACKAGE_NAME, context.packageName)
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          perApp
        } else {
          HealthConnectClient.getHealthConnectManageDataIntent(context, PROVIDER_PACKAGE)
        }
        try {
          startIntent(intent)
        } catch (error: RuntimeException) {
          // ActivityNotFoundException, or a SecurityException from a provider
          // that does not export the per-app page
          if (intent === perApp) {
            startIntent(HealthConnectClient.getHealthConnectManageDataIntent(context, PROVIDER_PACKAGE))
          } else {
            throw error
          }
        }
      }
    }

    AsyncFunction("openProviderInstall") {
      mapHealthConnectErrors {
        // hc docs: send the user to the play store listing with the onboarding redirect
        val market = Intent(Intent.ACTION_VIEW).apply {
          setPackage("com.android.vending")
          data = Uri.parse("market://details?id=$PROVIDER_PACKAGE&url=healthconnect%3A%2F%2Fonboarding")
          putExtra("overlay", true)
          putExtra("callerId", context.packageName)
        }
        val web = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$PROVIDER_PACKAGE"))
        try {
          startIntent(if (canResolve(market)) market else web)
        } catch (_: ActivityNotFoundException) {
          startIntent(web)
        }
      }
    }

    AsyncFunction("getChangesToken") Coroutine { ->
      mapHealthConnectErrors {
        client().getChangesToken(ChangesTokenRequest(setOf(SleepSessionRecord::class)))
      }
    }

    AsyncFunction("getChanges") Coroutine { token: String ->
      val client = mapHealthConnectErrors { client() }
      val response = try {
        client.getChanges(token)
      } catch (error: IllegalArgumentException) {
        // a malformed or foreign token (docs/health-connect.md 2.3)
        throw HealthConnectException(HcErrorCode.TOKEN, describe(error), error)
      } catch (error: kotlinx.coroutines.CancellationException) {
        throw error
      } catch (error: Throwable) {
        throw error.toHealthConnectException()
      }
      mapOf(
        "upserts" to response.changes.filterIsInstance<UpsertionChange>()
          .mapNotNull { (it.record as? SleepSessionRecord)?.toMap() },
        "deletedRecordIds" to response.changes.filterIsInstance<DeletionChange>().map { it.recordId },
        "nextToken" to response.nextChangesToken,
        "hasMore" to response.hasMore,
        "tokenExpired" to response.changesTokenExpired,
      )
    }

    AsyncFunction("readSleep") Coroutine { query: SleepReadQuery ->
      mapHealthConnectErrors {
        val origins = when (query.origin) {
          "own" -> setOf(DataOrigin(context.packageName))
          "all" -> emptySet()
          else -> throw HealthConnectException(HcErrorCode.INVALID, "unknown origin: ${query.origin}")
        }
        val end = Instant.ofEpochMilli(query.endMs)
        val range = query.startMs?.let { TimeRangeFilter.between(Instant.ofEpochMilli(it), end) }
          ?: TimeRangeFilter.before(end)
        val response = client().readRecords(
          ReadRecordsRequest(
            recordType = SleepSessionRecord::class,
            timeRangeFilter = range,
            dataOriginFilter = origins,
            ascendingOrder = true,
            pageSize = READ_PAGE_SIZE,
            pageToken = query.pageToken?.takeIf { it.isNotEmpty() },
          )
        )
        mapOf(
          "records" to response.records.map { it.toMap() },
          // some provider versions return "" for the last page (docs/health-connect.md 2.4)
          "nextPageToken" to response.pageToken?.takeIf { it.isNotEmpty() },
        )
      }
    }

    // one insertRecords transaction for every valid write; an invalid write
    // fails alone without a call. results keep the input order.
    AsyncFunction("upsertSleep") Coroutine { writes: List<SleepWrite> ->
      val results = arrayOfNulls<Map<String, Any?>>(writes.size)
      val valid = mutableListOf<Pair<Int, SleepSessionRecord>>()
      writes.forEachIndexed { index, write ->
        val (record, rejection) = write.toRecord()
        if (record != null) {
          valid.add(index to record)
        } else {
          results[index] = failure(HcErrorCode.INVALID, rejection ?: "invalid write")
        }
      }
      if (valid.isNotEmpty()) {
        try {
          val ids = client().insertRecords(valid.map { it.second }).recordIdsList
          valid.forEachIndexed { position, (index, _) ->
            results[index] = ids.getOrNull(position)?.let { mapOf("ok" to true, "recordId" to it) }
              ?: failure(HcErrorCode.REMOTE, "Health Connect returned no record id")
          }
        } catch (error: kotlinx.coroutines.CancellationException) {
          throw error
        } catch (error: Throwable) {
          val mapped = error.toHealthConnectException()
          valid.forEach { (index, _) -> results[index] = failure(mapped.code, mapped.message ?: describe(error)) }
        }
      }
      results.map { requireNotNull(it) }
    }

    AsyncFunction("deleteSleepByClientRecordIds") Coroutine { ids: List<String> ->
      mapHealthConnectErrors {
        ids.firstNotNullOfOrNull { clientRecordIdRejection(it) }?.let {
          throw HealthConnectException(HcErrorCode.INVALID, it)
        }
        if (ids.isNotEmpty()) {
          client().deleteRecords(SleepSessionRecord::class, emptyList(), ids)
        }
      }
    }
  }

  private fun failure(code: String, message: String): Map<String, Any?> =
    mapOf("ok" to false, "code" to code, "message" to message)
}

class PermissionOptions : expo.modules.kotlin.records.Record {
  @expo.modules.kotlin.records.Field val history: Boolean = false
}

internal data class PermissionRequest(val permissions: ArrayList<String>) : Serializable

// adapts the androidx health connect contract to the expo modules activity
// result api, so the result survives the rn activity lifecycle
internal class PermissionContract : AppContextActivityResultContract<PermissionRequest, Set<String>> {
  private val delegate = PermissionController.createRequestPermissionResultContract(PROVIDER_PACKAGE)

  override fun createIntent(context: Context, input: PermissionRequest): Intent =
    delegate.createIntent(context, input.permissions.toSet())

  override fun parseResult(input: PermissionRequest, resultCode: Int, intent: Intent?): Set<String> =
    delegate.parseResult(resultCode, intent)
}
