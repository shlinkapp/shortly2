import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | number | Date | null | undefined): string {
  if (!date) return "—"
  let d = new Date(date)
  if (typeof date === "number" && date < 10000000000) {
    d = new Date(date * 1000)
  }
  if (isNaN(d.getTime())) return "Invalid Date"

  return new Intl.DateTimeFormat(undefined, {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d).replace(/\//g, "-")
}
