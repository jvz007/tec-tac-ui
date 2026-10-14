// 0.12.106: the one date and time formatter for Core's own pages. It uses the person's Tactical date format
// (context.tactical_ui.date_format, Core 1.17.35) when one is set, and today's toLocaleString() when it is empty.
// context.dateTimeFormat is not read or changed here: modules keep the server default (CQ108 as filed).
import { state } from './state.js'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// Longest tokens first inside each letter group. Anything else passes through unchanged. [text] is escaped text.
const TOKEN = /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|SSS|A|a|ZZ|Z/g

function pad(value, size = 2) { return String(value).padStart(size, '0') }
function hour12(date) { return date.getHours() % 12 || 12 }

function ordinal(day) {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`
  const last = day % 10
  if (last === 1) return `${day}st`
  if (last === 2) return `${day}nd`
  if (last === 3) return `${day}rd`
  return `${day}th`
}

function offset(date, colon) {
  const minutes = -date.getTimezoneOffset()
  const sign = minutes >= 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  return `${sign}${pad(Math.floor(abs / 60))}${colon ? ':' : ''}${pad(abs % 60)}`
}

function tokenValue(token, date) {
  switch (token) {
    case 'YYYY': return pad(date.getFullYear(), 4)
    case 'YY': return pad(date.getFullYear() % 100)
    case 'MMMM': return MONTHS[date.getMonth()]
    case 'MMM': return MONTHS[date.getMonth()].slice(0, 3)
    case 'MM': return pad(date.getMonth() + 1)
    case 'M': return String(date.getMonth() + 1)
    case 'DD': return pad(date.getDate())
    case 'D': return String(date.getDate())
    case 'Do': return ordinal(date.getDate())
    case 'dddd': return DAYS[date.getDay()]
    case 'ddd': return DAYS[date.getDay()].slice(0, 3)
    case 'HH': return pad(date.getHours())
    case 'H': return String(date.getHours())
    case 'hh': return pad(hour12(date))
    case 'h': return String(hour12(date))
    case 'mm': return pad(date.getMinutes())
    case 'm': return String(date.getMinutes())
    case 'ss': return pad(date.getSeconds())
    case 's': return String(date.getSeconds())
    case 'SSS': return pad(date.getMilliseconds(), 3)
    case 'A': return date.getHours() < 12 ? 'AM' : 'PM'
    case 'a': return date.getHours() < 12 ? 'am' : 'pm'
    case 'Z': return offset(date, false)
    case 'ZZ': return offset(date, true)
    default: return token
  }
}

// Formats a date with a Quasar-style pattern. An invalid date shows the raw value.
export function formatWithPattern(value, pattern) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value ?? '')
  return String(pattern ?? '').replace(TOKEN, (token, escaped) => (escaped !== undefined ? escaped : tokenValue(token, date)))
}

// 0.12.107: the letters in a pattern, outside [escaped text], that formatWithPattern does not recognise. The formatter writes
// them as they are, and Tactical may read them as date parts. Each letter appears once, in order. Formatting is unchanged.
const RECOGNISED_TOKEN = /YYYY|YY|MMMM|MMM|MM|M|Do|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|SSS|A|a|ZZ|Z/g
export function unknownDateFormatLetters(pattern) {
  const outside = String(pattern ?? '').replace(/\[[^\]]*\]/g, '').replace(RECOGNISED_TOKEN, '')
  return [...new Set(outside.match(/[A-Za-z]/g) || [])]
}

function personalFormat() {
  try {
    const value = state.context?.tactical_ui?.date_format
    return typeof value === 'string' && value.trim() ? value : ''
  } catch {
    return ''
  }
}

// The date and time shown on Core's pages: the person's format when set, otherwise the browser's default text.
export function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value ?? '')
  const format = personalFormat()
  return format ? formatWithPattern(date, format) : date.toLocaleString()
}
