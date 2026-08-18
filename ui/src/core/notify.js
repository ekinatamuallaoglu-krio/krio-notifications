export function notify(message, type = 'info') {
  const types = {
    success: ['Başarılı', '✓'],
    warning: ['Dikkat', '!'],
    info: ['Bilgi', 'i'],
    error: ['Hata', '×'],
  }
  const [title, symbol] = types[type] || types.info
  document.querySelector('.notification')?.remove()
  const notification = document.createElement('div')
  notification.className = `notification ${type}`
  notification.role = type === 'error' ? 'alert' : 'status'
  notification.innerHTML = `<span class="notification-icon" aria-hidden="true">${symbol}</span><span class="notification-copy"><b>${title}</b><small></small></span><button aria-label="Bildirimi kapat">×</button><i></i>`
  notification.querySelector('small').textContent = message
  notification.querySelector('button').onclick = () => notification.remove()
  document.body.append(notification)
  setTimeout(() => notification.remove(), 3500)
}
