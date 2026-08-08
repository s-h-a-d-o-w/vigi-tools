export const EVENT_TYPES = [
  "Timing",
  "MotionDetection",
  "TamperDetection",
  "CrossLineDetection",
  "InvasionDetection",
  "AreaEntryDetection",
  "AreaLeaveDetection",
  "PeopleDetection",
  "VehicleDetection",
  "DropAndTakeDetection",
  "LoiterDetection",
  "SceneChangeDetection",
  "AudioAnomalyDetection",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export type MediaEntry = {
  fileId: string;
  /** Seconds since the epoch. */
  startTime: number;
  /** Seconds since the epoch. */
  endTime: number;
  size: number;
  eventType: string;
  mediaType: string;
};
