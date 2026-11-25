package expo.modules.twilighthealthconnect

import android.os.Build
import android.os.RemoteException
import expo.modules.kotlin.exception.CodedException
import java.io.IOException

// error codes of the js adapter (src/services/health-connect/adapter.ts).
// the raw exception class and message stay in the message so the engine can
// keep them in lastError details (docs/health-connect.md 4.1).
internal object HcErrorCode {
  const val UNAVAILABLE = "E_HC_UNAVAILABLE"
  const val PERMISSION = "E_HC_PERMISSION"
  const val RATE_LIMIT = "E_HC_RATE_LIMIT"
  const val TOKEN = "E_HC_TOKEN"
  const val INVALID = "E_HC_INVALID"
  const val REMOTE = "E_HC_REMOTE"
  const val IO = "E_HC_IO"
}

internal class HealthConnectException(code: String, message: String, cause: Throwable? = null) :
  CodedException(code, message, cause)

internal fun describe(error: Throwable): String =
  "${error.javaClass.simpleName}: ${error.message ?: "no message"}"

// rate limits: on android 14+ the client converts the platform
// ERROR_RATE_LIMIT_EXCEEDED into an IllegalStateException that wraps the
// platform exception; the apk provider reports quota errors as
// IllegalStateException with "quota" or "rate limit" in the message.
private fun isRateLimit(error: IllegalStateException): Boolean {
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
    val platform = error.cause as? android.health.connect.HealthConnectException
    if (platform?.errorCode == android.health.connect.HealthConnectException.ERROR_RATE_LIMIT_EXCEEDED) {
      return true
    }
  }
  val text = listOfNotNull(error.message, error.cause?.message).joinToString(" ").lowercase()
  return "quota" in text || "rate limit" in text
}

internal fun errorCodeFor(error: Throwable): String = when (error) {
  is HealthConnectException -> error.code
  is SecurityException -> HcErrorCode.PERMISSION
  is RemoteException -> HcErrorCode.REMOTE
  is IOException -> HcErrorCode.IO
  is IllegalArgumentException -> HcErrorCode.INVALID
  // the reference also uses IllegalStateException for "service isn't available"
  is IllegalStateException -> if (isRateLimit(error)) HcErrorCode.RATE_LIMIT else HcErrorCode.UNAVAILABLE
  else -> HcErrorCode.REMOTE
}

internal fun Throwable.toHealthConnectException(): HealthConnectException =
  this as? HealthConnectException ?: HealthConnectException(errorCodeFor(this), describe(this), this)

internal inline fun <T> mapHealthConnectErrors(block: () -> T): T =
  try {
    block()
  } catch (error: kotlinx.coroutines.CancellationException) {
    throw error
  } catch (error: Throwable) {
    throw error.toHealthConnectException()
  }
