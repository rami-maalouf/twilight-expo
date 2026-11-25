// props shared by the android home-screen widgets (sleep status, sleep mode,
// sleep overview). the app builds them in src/services/home-widget-snapshot.ts;
// the widget layouts only read them. every value must stay json-serializable:
// expo-widgets stores the snapshot natively and the widget host process
// renders it without the app's js runtime.

// one resolved color set; the layout picks `day` or `night` at render time
export interface HomeWidgetColors {
  // android drawable name of the night-sky / sunset gradient background
  // (plugins/android-widgets also generates a starless `${sky}_plain`)
  sky: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  // moon icon tint on idle surfaces (swift ProfileWidgetEntryView uses teal;
  // sunset uses its accent for contrast)
  moon: string;
  // primary action pill ("Start Sleep") fill and label
  action: string;
  actionText: string;
  // progress track fill
  track: string;
  // circle behind the sleep mode widget icon
  halo: string;
}

export interface HomeWidgetProps {
  sleeping: boolean;
  // epoch ms of the active session start; 0 while awake. the layout derives
  // the elapsed time from it at render time
  sessionStartMs: number;
  // "10:42 PM" wall clock of the active session start; '' while awake
  startedAt: string;
  // targets from settings, "10:00 PM" / "7:00 AM"
  bedtime: string;
  wake: string;
  // goal length, "9h"
  goal: string;
  // newest valid night, "7h 12min"; '' before the first tracked night
  lastNight: string;
  // last night / goal, clamped to 0...1
  lastNightProgress: number;
  // "80% of 9h goal" | "Goal reached" | "Track your first night"
  lastNightCaption: string;
  // 7-night average like the dashboard pill, "7h 30m"; '' without data
  average: string;
  // "5 of 7 nights"
  averageCaption: string;
  // display mode: 'system' follows the launcher's light/dark at render time
  scheme: 'system' | 'light' | 'dark';
  day: HomeWidgetColors;
  night: HomeWidgetColors;
  // set by the publisher on every publish: expo-widgets re-renders only when
  // the stored props change. layouts ignore it
  renderKey?: number;
}

// widget names: must match the "name" fields in app.json's android widgets
// plugin entry (they also become the generated provider class names)
export const SLEEP_STATUS_WIDGET = 'TwilightSleepStatus';
export const SLEEP_MODE_WIDGET = 'TwilightSleepMode';
export const SLEEP_OVERVIEW_WIDGET = 'TwilightSleepOverview';
