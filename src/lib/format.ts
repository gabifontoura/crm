/** App-wide locale settings. Change here to localize dates and money. */
export const APP_LOCALE = "en-US"
export const APP_CURRENCY = "USD"

export function formatTime(d: Date): string {
  return d.toLocaleTimeString(APP_LOCALE, { hour: "2-digit", minute: "2-digit" })
}

export function formatCurrency(value: number): string {
  return value.toLocaleString(APP_LOCALE, { style: "currency", currency: APP_CURRENCY })
}

/** "90" minutes -> "1h 30m". */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m"
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
