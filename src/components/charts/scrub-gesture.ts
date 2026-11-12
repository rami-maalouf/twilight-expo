// chart scrubbing inside a vertical ScrollView: a horizontal drag of 8 px
// activates the scrub, a vertical move of 8 px fails it so the page scrolls
// (swift charts selection lets vertical scrolls pass the same way). a touch
// still selects the nearest point on begin, so a press-and-hold shows the
// selection without moving. gesture-handler 3 rejects minDistance together
// with failOffsetY, so the activation is defined by the offsets alone. the
// worklets babel plugin cannot workletize a spread config, so charts pass
// both values by name.
export const SCRUB_ACTIVE_OFFSET_X: [number, number] = [-8, 8];
export const SCRUB_FAIL_OFFSET_Y: [number, number] = [-8, 8];
