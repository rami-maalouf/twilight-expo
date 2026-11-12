// the material 3 date picker (compose DatePickerState) works in utc day
// millis: it selects the utc date of the millis it is given and reports the
// picked day as utc midnight. read in local time, utc midnight is still the
// previous evening west of greenwich, so the picked day must be read with
// the utc getters and the initial day passed as utc midnight.

// a local calendar day -> the utc midnight millis the picker selects
export function toPickerDayMillis(localDay: Date): number {
  return Date.UTC(localDay.getFullYear(), localDay.getMonth(), localDay.getDate());
}

// the picker's utc-midnight result -> the same calendar day at local noon
// (noon keeps the day stable across dst shifts)
export function fromPickerDay(pickerDay: Date): Date {
  return new Date(pickerDay.getUTCFullYear(), pickerDay.getUTCMonth(), pickerDay.getUTCDate(), 12);
}
