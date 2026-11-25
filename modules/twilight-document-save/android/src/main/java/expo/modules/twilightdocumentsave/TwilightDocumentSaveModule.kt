package expo.modules.twilightdocumentsave

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.Serializable

internal class DocumentSaveException(code: String, message: String, cause: Throwable? = null) :
  CodedException(code, message, cause)

// "save to device" for exports (docs/health-connect.md 13): the system
// create-document picker (storage access framework) lets the user pick the
// folder, Downloads included, and the file name. the android share sheet has
// no local save target, and a folder-tree picker cannot choose Downloads.
class TwilightDocumentSaveModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw DocumentSaveException("E_SAVE_UNAVAILABLE", "React context is gone")

  private lateinit var createLauncher: AppContextActivityResultLauncher<CreateDocumentRequest, String?>
  private val mutex = Mutex()

  override fun definition() = ModuleDefinition {
    Name("TwilightDocumentSave")

    RegisterActivityContracts {
      createLauncher = registerForActivityResult(CreateDocumentContract())
    }

    // resolves null when the user backs out of the picker. the contents stay
    // in this call (an intent extra has a ~1 mb binder limit).
    AsyncFunction("saveTextDocument") Coroutine { fileName: String, mimeType: String, contents: String ->
      mutex.withLock {
        val uriString = withContext(Dispatchers.Main) {
          try {
            createLauncher.launch(CreateDocumentRequest(fileName, mimeType))
          } catch (error: ActivityNotFoundException) {
            throw DocumentSaveException("E_SAVE_UNAVAILABLE", "No app can create documents on this device", error)
          }
        } ?: return@withLock null
        val uri = Uri.parse(uriString)
        withContext(Dispatchers.IO) {
          try {
            val stream = context.contentResolver.openOutputStream(uri, "wt")
              ?: throw DocumentSaveException("E_SAVE_IO", "The document could not be opened for writing")
            stream.use { it.write(contents.toByteArray(Charsets.UTF_8)) }
          } catch (error: Throwable) {
            // never leave an empty or partial file behind
            runCatching { DocumentsContract.deleteDocument(context.contentResolver, uri) }
            if (error is DocumentSaveException) throw error
            throw DocumentSaveException("E_SAVE_IO", "${error.javaClass.simpleName}: ${error.message}", error)
          }
          mapOf("uri" to uriString, "displayName" to (displayName(uri) ?: fileName))
        }
      }
    }
  }

  private fun displayName(uri: Uri): String? = runCatching {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) cursor.getString(0) else null
    }
  }.getOrNull()
}

internal data class CreateDocumentRequest(val fileName: String, val mimeType: String) : Serializable

internal class CreateDocumentContract : AppContextActivityResultContract<CreateDocumentRequest, String?> {
  override fun createIntent(context: Context, input: CreateDocumentRequest): Intent =
    Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = input.mimeType
      putExtra(Intent.EXTRA_TITLE, input.fileName)
    }

  override fun parseResult(input: CreateDocumentRequest, resultCode: Int, intent: Intent?): String? =
    if (resultCode == Activity.RESULT_OK) intent?.data?.toString() else null
}
