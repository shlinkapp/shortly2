export const SHORT_LINK_EXPIRES_IN_VALUES = ["1h", "1d", "1w", "1m", "3m", "6m", "1y"] as const

export type ShortLinkExpiresIn = (typeof SHORT_LINK_EXPIRES_IN_VALUES)[number]

export const SHORT_LINK_EXPIRES_IN_OPTIONS: Array<{ value: ShortLinkExpiresIn; label: string }> = [
  { value: "1h", label: "1h (1 小时)" },
  { value: "1d", label: "1d (1 天)" },
  { value: "1w", label: "1w (1 周)" },
  { value: "1m", label: "1m (1 个月)" },
  { value: "3m", label: "3m (3 个月)" },
  { value: "6m", label: "6m (6 个月)" },
  { value: "1y", label: "1y (1 年)" },
]

const HOUR_IN_MS = 60 * 60 * 1000
const DAY_IN_MS = 24 * HOUR_IN_MS

function addCalendarMonths(baseDate: Date, months: number): Date {
  const next = new Date(baseDate)
  const originalDay = next.getUTCDate()

  next.setUTCDate(1)
  next.setUTCMonth(next.getUTCMonth() + months)

  const lastDayOfTargetMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate()

  next.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth))
  return next
}

export function resolveShortLinkExpiresAt(expiresIn: ShortLinkExpiresIn, now = new Date()): Date {
  switch (expiresIn) {
    case "1h":
      return new Date(now.getTime() + HOUR_IN_MS)
    case "1d":
      return new Date(now.getTime() + DAY_IN_MS)
    case "1w":
      return new Date(now.getTime() + 7 * DAY_IN_MS)
    case "1m":
      return addCalendarMonths(now, 1)
    case "3m":
      return addCalendarMonths(now, 3)
    case "6m":
      return addCalendarMonths(now, 6)
    case "1y":
      return addCalendarMonths(now, 12)
  }
}
