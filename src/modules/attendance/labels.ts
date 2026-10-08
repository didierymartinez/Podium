export const ATTENDANCE_STATUSES = ["PRESENT", "LATE", "ABSENT", "EXCUSED"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABELS: Record<AttendanceStatus, { short: string; long: string }> = {
  PRESENT: { short: "P", long: "Presente" },
  LATE: { short: "T", long: "Tarde" },
  ABSENT: { short: "A", long: "Ausente" },
  EXCUSED: { short: "E", long: "Excusa" },
};
