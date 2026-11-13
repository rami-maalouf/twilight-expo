import { DELETE_ACTION_WIDTH, fullSwipeDistance, isFullSwipe } from '../log-swipe';

describe('log row full swipe', () => {
  test('needs 60% of the row on a phone-sized row', () => {
    expect(fullSwipeDistance(380)).toBe(228);
    expect(isFullSwipe(-227, 380)).toBe(false);
    expect(isFullSwipe(-228, 380)).toBe(true);
  });

  test('never triggers within the revealed delete button', () => {
    expect(fullSwipeDistance(100)).toBe(DELETE_ACTION_WIDTH * 2);
    expect(isFullSwipe(-DELETE_ACTION_WIDTH, 100)).toBe(false);
  });

  test('a right drag or a closed row is not a full swipe', () => {
    expect(isFullSwipe(0, 380)).toBe(false);
    expect(isFullSwipe(300, 380)).toBe(false);
  });
});
