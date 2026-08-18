export const API =
  import.meta.env.VITE_API_URL || (location.port === '5173' ? 'http://localhost:8080' : '')

export const app = document.querySelector('#app')

export const paths = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  logout: '<path d="M10 5H6v14h4M14 8l4 4-4 4M18 12H9"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  send: '<path d="m4 4 17 8-17 8 4-8-4-8Zm4 8h13"/>',
  pin: '<path d="m9 4 6 6-2 2 3 3-1 1-3-3-2 2-6-6 5-5Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  emoji: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 3 4 3 4-3 4-3M9 9h.01M15 9h.01"/>',
  bulk: '<path d="M4 6.5h11v9H4zM7 4h11a2 2 0 0 1 2 2v8"/><path d="m4 8 5.5 4L15 8M8 19h8"/>',
  status: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2M5 5l2 2M19 5l-2 2"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
}

export const emojis = [
  '😀',
  '😂',
  '🥰',
  '😍',
  '😊',
  '😎',
  '🥳',
  '😢',
  '😭',
  '😡',
  '👍',
  '👏',
  '🙏',
  '💪',
  '❤️',
  '🔥',
  '🎉',
  '✨',
  '✅',
  '👀',
  '🤝',
  '🚀',
  '☕',
  '🌟',
]

export const logo = `<span class="krio-logo" aria-label="KRIO easyplus, Krio Connect"><span class="krio-mark"><i></i><i></i><i></i><i></i></span><span class="krio-wordmark"><b>KRIO</b><small>easyplus</small></span><span class="krio-product">Connect</span></span>`

export const chatSkeleton = `<div class="skeleton-list" aria-label="Sohbetler yükleniyor">${Array.from({ length: 6 }, (_, index) => `<div class="skeleton-chat"><i></i><span><b style="--w:${55 + (index % 3) * 12}%"></b><small style="--w:${72 - (index % 2) * 15}%"></small></span></div>`).join('')}</div>`
