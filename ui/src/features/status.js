export const statusLabels = {
  queued: 'Planlandı',
  running: 'Gönderiliyor',
  sent: 'Yayınlandı',
  failed: 'Başarısız',
}

export const hasPendingStatuses = (posts) =>
  posts.some((item) => ['queued', 'running'].includes(item.status))

export const getMinimumSchedule = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
