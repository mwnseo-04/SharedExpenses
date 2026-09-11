export const categories = ['Food', 'Transportation', 'Lodging', 'Entertainment', 'Shopping', 'Other']

export const money = (cents, options = {}) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: options.compact ? 0 : 2,
    maximumFractionDigits: options.compact ? 0 : 2,
  }).format((cents || 0) / 100)

export const shortDate = (value) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${value}T12:00:00`),
  )

export const dateRange = (start, end) => {
  const year = new Date(`${end}T12:00:00`).getFullYear()
  return `${shortDate(start)} – ${shortDate(end)}, ${year}`
}

export const initials = (name) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export const todayIso = () => new Date().toISOString().slice(0, 10)
