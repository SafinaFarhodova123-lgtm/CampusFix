const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function timeAgo(isoDate: string, now = Date.now()): string {
  const diff = (new Date(isoDate).getTime() - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'just now'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  return formatDate(isoDate)
}

export const formatDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export const formatDateTime = (isoDate: string) =>
  new Date(isoDate).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export const firstName = (name: string) => name.replace(/^(dr|prof|mr|ms|mrs)\.?\s+/i, '').split(' ')[0]

export const initials = (name: string) =>
  name
    .replace(/^(dr|prof)\.?\s+/i, '')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`
