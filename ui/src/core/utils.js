import { paths } from './config.js'

export const escapeHTML = (value) =>
  String(value).replace(
    /[&<>'"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c],
  )

export const time = (date) => {
  const value = new Date(date)
  return Number.isNaN(value.getTime())
    ? ''
    : new Intl.DateTimeFormat('tr', { hour: '2-digit', minute: '2-digit' }).format(value)
}

export const senderColor = (name) =>
  [...name].reduce((value, character) => value + character.codePointAt(0), 0) % 8

export const profileInitials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('tr') || '?'

export const icon = (name) =>
  `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`

export const formatBytes = (value) =>
  value < 1024
    ? `${value} B`
    : value < 1048576
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / 1048576).toFixed(1)} MB`

export function safeURL(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? escapeHTML(url.href) : '#'
  } catch {
    return '#'
  }
}
