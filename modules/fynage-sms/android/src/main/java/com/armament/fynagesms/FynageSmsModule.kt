package com.armament.fynagesms

import android.Manifest
import android.content.ContentUris
import android.content.pm.PackageManager
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FynageSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FynageSms")

    AsyncFunction("readInboxPage") { minDate: Double, offset: Int, pageSize: Int ->
      val context = appContext.reactContext ?: throw IllegalStateException("Android context is unavailable.")
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("SMS read permission is not granted.")
      }
      val rows = mutableListOf<Map<String, Any?>>()
      val projection = arrayOf(Telephony.Sms._ID, Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE)
      val selection = "${Telephony.Sms.DATE} >= ? AND (" +
        "${Telephony.Sms.ADDRESS} LIKE '%263143%' OR ${Telephony.Sms.ADDRESS} LIKE '%263164%' OR " +
        "LOWER(${Telephony.Sms.ADDRESS}) LIKE '%ecocash%' OR LOWER(${Telephony.Sms.ADDRESS}) LIKE '%econet%' OR " +
        "LOWER(${Telephony.Sms.BODY}) LIKE '%ecocash%' OR LOWER(${Telephony.Sms.BODY}) LIKE '%econet%' OR LOWER(${Telephony.Sms.BODY}) LIKE '%innbucks%' OR " +
        "LOWER(${Telephony.Sms.ADDRESS}) LIKE '%cbz%' OR LOWER(${Telephony.Sms.ADDRESS}) LIKE '%cabs%' OR LOWER(${Telephony.Sms.ADDRESS}) LIKE '%fbc%' OR " +
        "LOWER(${Telephony.Sms.ADDRESS}) LIKE '%stanbic%' OR LOWER(${Telephony.Sms.ADDRESS}) LIKE '%steward%' OR LOWER(${Telephony.Sms.ADDRESS}) LIKE '%nmb%' OR " +
        "LOWER(${Telephony.Sms.ADDRESS}) LIKE '%posb%' OR LOWER(${Telephony.Sms.ADDRESS}) LIKE '%ecobank%' OR LOWER(${Telephony.Sms.ADDRESS}) LIKE '%bancabc%' OR " +
        "LOWER(${Telephony.Sms.ADDRESS}) LIKE '%zb bank%' OR LOWER(${Telephony.Sms.ADDRESS}) LIKE '%first capital%')"
      val selectionArgs = arrayOf(minDate.toLong().toString())
      val sortOrder = "${Telephony.Sms.DATE} ASC LIMIT ${pageSize.coerceIn(1, 250)} OFFSET ${offset.coerceAtLeast(0)}"
      context.contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI, projection, selection, selectionArgs, sortOrder)?.use { cursor ->
        val idIndex = cursor.getColumnIndexOrThrow(Telephony.Sms._ID)
        val addressIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
        val bodyIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
        val dateIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
        while (cursor.moveToNext()) {
          rows.add(mapOf(
            "id" to cursor.getLong(idIndex).toString(),
            "sender" to cursor.getString(addressIndex),
            "body" to cursor.getString(bodyIndex),
            "date" to cursor.getLong(dateIndex),
          ))
        }
      }
      rows
    }
  }
}
