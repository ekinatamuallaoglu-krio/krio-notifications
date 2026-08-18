import { API } from '../core/config.js'
import { escapeHTML, formatBytes, icon, safeURL } from '../core/utils.js'

function richText(value, mentions = {}) {
  const source = String(value)
  const token = /https?:\/\/[^\s<]+|@[0-9]{5,}/g
  let output = ''
  let cursor = 0
  for (const match of source.matchAll(token)) {
    const start = match.index
    const value = match[0]
    output += escapeHTML(source.slice(cursor, start))
    if (value.startsWith('http')) {
      const punctuation = value.match(/[.,!?;:)\]]+$/)?.[0] || ''
      const url = punctuation ? value.slice(0, -punctuation.length) : value
      output += `<a class="message-link" href="${safeURL(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(url)}</a>${escapeHTML(punctuation)}`
    } else {
      const name = mentions[value.slice(1)]
      output += name
        ? `<span class="message-mention">@${escapeHTML(name)}</span>`
        : escapeHTML(value)
    }
    cursor = start + value.length
  }
  return output + escapeHTML(source.slice(cursor))
}

export function messageContent(message) {
  const text = message.text
    ? `<span class="message-text">${richText(message.text, message.metadata?.mentions)}</span>`
    : ''
  const media = `${API}/api/chats/${encodeURIComponent(message.chatId)}/messages/${encodeURIComponent(message.id)}/media`
  const meta = message.metadata || {}
  if (message.type === 'image' || message.type === 'sticker')
    return `<img class="message-media ${message.type}" src="${media}" alt="${escapeHTML(message.type === 'sticker' ? 'Etiket' : message.text || 'Fotoğraf')}" loading="lazy">${text}`
  if (message.type === 'video')
    return `<video class="message-media" src="${media}" controls preload="metadata"></video>${text}`
  if (message.type === 'audio')
    return `<div class="media-label">${meta.voice ? '🎙️ Sesli mesaj' : '🎵 Ses'}</div><audio src="${media}" controls preload="metadata"></audio>`
  if (message.type === 'document')
    return `<a class="document-card" href="${media}" target="_blank" rel="noopener">📎 <span><b>${escapeHTML(message.fileName || 'Belge')}</b><small>${escapeHTML(message.mime || '')}${message.size ? ` · ${formatBytes(message.size)}` : ''}</small></span></a>${text}`
  if (message.type === 'location') {
    const map = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(message.latitude)}&mlon=${encodeURIComponent(message.longitude)}#map=16/${encodeURIComponent(message.latitude)}/${encodeURIComponent(message.longitude)}`
    return `<a class="type-card" href="${map}" target="_blank" rel="noopener"><strong>📍 ${escapeHTML(meta.name || (meta.live ? 'Canlı konum' : 'Konum'))}</strong><small>${escapeHTML(meta.address || `${message.latitude}, ${message.longitude}`)}</small></a>${text}`
  }
  if (message.type === 'contact')
    return `<div class="type-card"><strong>👤 Kişi</strong>${(meta.contacts || []).map((contact) => `<span>${escapeHTML(contact.name || 'Kişi')}</span>`).join('')}</div>`
  if (message.type === 'poll') {
    const votes = Object.values(meta.votes || {}).flat()
    return `<div class="type-card poll-card"><strong>📊 ${escapeHTML(message.text || 'Anket')}</strong>${(meta.options || []).map((option) => `<span>○ ${escapeHTML(option)} <small>${votes.filter((vote) => vote === option).length}</small></span>`).join('')}<small>${meta.selectable > 1 ? `${meta.selectable} seçenek seçilebilir` : 'Bir seçenek seçilebilir'}</small></div>`
  }
  if (message.type === 'event')
    return `<div class="type-card"><strong>📅 ${escapeHTML(message.text || 'Etkinlik')}</strong>${meta.description ? `<span>${escapeHTML(meta.description)}</span>` : ''}${meta.start ? `<small>${new Date(meta.start * (meta.start < 1e12 ? 1000 : 1)).toLocaleString('tr-TR')}</small>` : ''}${meta.joinLink ? `<a href="${safeURL(meta.joinLink)}" target="_blank" rel="noopener">Katıl</a>` : ''}</div>`
  if (message.type === 'invite')
    return `<div class="type-card"><strong>👥 ${escapeHTML(meta.name || 'Grup daveti')}</strong>${text}</div>`
  if (message.type === 'unsupported' && message.text) return text
  if (['call', 'order', 'product', 'response', 'unsupported'].includes(message.type))
    return `<div class="type-card"><strong>${message.type === 'call' ? '📞' : message.type === 'order' ? '🛍️' : 'ℹ️'} ${escapeHTML(message.text || meta.type || 'Mesaj')}</strong>${meta.description ? `<small>${escapeHTML(meta.description)}</small>` : ''}</div>`
  return text
}

export function messageTicks(status) {
  return `<span class="ticks ${status === 'read' ? 'read' : ''}" aria-label="${status === 'read' ? 'Okundu' : status === 'delivered' ? 'Teslim edildi' : 'Gönderildi'}">${icon('check')}${status === 'delivered' || status === 'read' ? icon('check') : ''}</span>`
}
