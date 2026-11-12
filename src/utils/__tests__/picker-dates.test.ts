import { fromPickerDay, toPickerDayMillis } from '../picker-dates';

describe('picker-dates', () => {
  test('a local day becomes its utc midnight', () => {
    const localNoon = new Date(2026, 10, 11, 12);
    expect(toPickerDayMillis(localNoon)).toBe(Date.UTC(2026, 10, 11));
    const lateEvening = new Date(2026, 10, 11, 23, 30);
    expect(toPickerDayMillis(lateEvening)).toBe(Date.UTC(2026, 10, 11));
  });

  test('the picked utc midnight reads as the same local calendar day', () => {
    const picked = fromPickerDay(new Date(Date.UTC(2026, 10, 11)));
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate(), picked.getHours()]).toEqual([2026, 10, 11, 12]);
  });

  test('round trip keeps the day at year boundaries', () => {
    const day = new Date(2026, 0, 1, 12);
    const back = fromPickerDay(new Date(toPickerDayMillis(day)));
    expect(back.toDateString()).toBe(day.toDateString());
  });
});
