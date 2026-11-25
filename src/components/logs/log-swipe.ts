// swift .swipeActions allow a full swipe by default: dragging a row far
// enough to the left and letting go deletes it without tapping Delete
export const DELETE_ACTION_WIDTH = 88;
const FULL_SWIPE_FRACTION = 0.6;

// how far left (dp, positive) a drag must reach to delete on release
export function fullSwipeDistance(rowWidth: number): number {
  'worklet';
  return Math.max(DELETE_ACTION_WIDTH * 2, rowWidth * FULL_SWIPE_FRACTION);
}

export function isFullSwipe(translationX: number, rowWidth: number): boolean {
  'worklet';
  return -translationX >= fullSwipeDistance(rowWidth);
}
