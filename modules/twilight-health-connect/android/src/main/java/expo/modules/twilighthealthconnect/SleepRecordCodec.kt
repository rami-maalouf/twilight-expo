package expo.modules.twilighthealthconnect

import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.time.DateTimeException
import java.time.Instant
import java.time.ZoneId

// clientRecordId prefix shared with swift (docs/health-connect.md 2.1)
internal const val CLIENT_RECORD_ID_PREFIX = "twilight.sleep-session."

// demo session ids (src/demo/demo-mode.ts DEMO_SESSION_ID_PREFIX).
// demo nights must never reach health connect (docs/health-connect.md 4.4)
internal const val DEMO_SESSION_ID_PREFIX = "rami-demo-session-"

internal fun clientRecordIdRejection(clientRecordId: String): String? = when {
  !clientRecordId.startsWith(CLIENT_RECORD_ID_PREFIX) ->
    "clientRecordId must start with $CLIENT_RECORD_ID_PREFIX: $clientRecordId"
  clientRecordId.length == CLIENT_RECORD_ID_PREFIX.length ->
    "clientRecordId has no session id: $clientRecordId"
  clientRecordId.removePrefix(CLIENT_RECORD_ID_PREFIX).startsWith(DEMO_SESSION_ID_PREFIX) ->
    "demo sessions are never written to Health Connect: $clientRecordId"
  else -> null
}

class SleepWrite : Record {
  @Field val clientRecordId: String = ""
  @Field val clientRecordVersion: Long = 0
  @Field val startMs: Long = 0
  @Field val endMs: Long = 0
  @Field val startZoneId: String = ""
  @Field val endZoneId: String = ""
  @Field val recordingMethod: String = ""
}

class SleepReadQuery : Record {
  @Field val origin: String = "all"
  @Field val startMs: Long? = null
  @Field val endMs: Long = 0
  @Field val pageToken: String? = null
}

private fun zoneOrNull(id: String): ZoneId? =
  try {
    if (id.isBlank()) null else ZoneId.of(id)
  } catch (_: DateTimeException) {
    null
  }

// returns the record, or the reason the write is invalid
internal fun SleepWrite.toRecord(): Pair<SleepSessionRecord?, String?> {
  clientRecordIdRejection(clientRecordId)?.let { return null to it }
  if (clientRecordVersion <= 0) return null to "clientRecordVersion must be positive"
  if (endMs <= startMs) return null to "end must be after start"
  val startZone = zoneOrNull(startZoneId) ?: return null to "invalid start zone: $startZoneId"
  val endZone = zoneOrNull(endZoneId) ?: return null to "invalid end zone: $endZoneId"
  val device = Device(type = Device.TYPE_PHONE)
  val metadata = when (recordingMethod) {
    "manualEntry" -> Metadata.manualEntry(
      clientRecordId = clientRecordId,
      clientRecordVersion = clientRecordVersion,
      device = device,
    )
    "activelyRecorded" -> Metadata.activelyRecorded(
      device = device,
      clientRecordId = clientRecordId,
      clientRecordVersion = clientRecordVersion,
    )
    else -> return null to "unknown recording method: $recordingMethod"
  }
  val start = Instant.ofEpochMilli(startMs)
  val end = Instant.ofEpochMilli(endMs)
  return try {
    SleepSessionRecord(
      startTime = start,
      startZoneOffset = startZone.rules.getOffset(start),
      endTime = end,
      endZoneOffset = endZone.rules.getOffset(end),
      metadata = metadata,
      stages = listOf(SleepSessionRecord.Stage(start, end, SleepSessionRecord.STAGE_TYPE_SLEEPING)),
    ) to null
  } catch (error: IllegalArgumentException) {
    null to describe(error)
  }
}

private fun recordingMethodName(method: Int): String = when (method) {
  Metadata.RECORDING_METHOD_MANUAL_ENTRY -> "manualEntry"
  Metadata.RECORDING_METHOD_ACTIVELY_RECORDED -> "activelyRecorded"
  Metadata.RECORDING_METHOD_AUTOMATICALLY_RECORDED -> "automaticallyRecorded"
  else -> "unknown"
}

internal fun SleepSessionRecord.toMap(): Map<String, Any?> = mapOf(
  "recordId" to metadata.id,
  "dataOrigin" to metadata.dataOrigin.packageName,
  "clientRecordId" to metadata.clientRecordId,
  "clientRecordVersion" to metadata.clientRecordVersion,
  "startMs" to startTime.toEpochMilli(),
  "endMs" to endTime.toEpochMilli(),
  "startOffsetSec" to startZoneOffset?.totalSeconds,
  "endOffsetSec" to endZoneOffset?.totalSeconds,
  "lastModifiedMs" to metadata.lastModifiedTime.toEpochMilli(),
  "recordingMethod" to recordingMethodName(metadata.recordingMethod),
  "stages" to stages.map {
    mapOf(
      "startMs" to it.startTime.toEpochMilli(),
      "endMs" to it.endTime.toEpochMilli(),
      "type" to it.stage,
    )
  },
)
