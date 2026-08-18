import * as XLSX from 'xlsx'
import { API, app, chatSkeleton, emojis, logo } from './core/config.js'
import { request } from './core/api.js'
import { notify } from './core/notify.js'
import { playSound } from './core/sound.js'
import {
  escapeHTML,
  formatBytes,
  icon,
  profileInitials,
  safeURL,
  senderColor,
  time,
} from './core/utils.js'
import { downloadTemplate, exportReports, getVariables, renderPreview } from './features/bulk.js'
import { getMinimumSchedule, hasPendingStatuses, statusLabels } from './features/status.js'
import { messageContent, messageTicks } from './views/chat.js'
import {
  renderAppLoading as renderAuthLoading,
  renderAppLogin as renderAuthLogin,
  renderSetup as renderAuthSetup,
  renderWhatsAppLogin,
} from './views/auth.js'

let whatsAppAuth = { state: 'starting' }
let appSession = { loading: true },
  appUsers = []
let chats = []
let chatsLoaded = false
let profiles = []
let selected = null
let messages = []
let messageState = 'idle'
let messageError = ''
let draft = ''
let sending = false
let loggingOut = false
let selectionRequest = 0
let searchQuery = ''
let sidebarScroll = 0
let emojiOpen = false
let typingChat = null
let typingTimer
let settingsOpen = false
let bulkOpen = false
let statusOpen = false
let statusPosts = [],
  statusSubmitting = false,
  statusRefreshTimer
let statusDraft = { profileId: '', kind: 'text', text: '', mode: 'now', scheduledLocal: '' }
let bulkTemplates = [],
  bulkRecipients = [],
  bulkProfile = '',
  bulkTemplate = 0,
  editingTemplate = 0,
  bulkMode = 'excel',
  bulkRows = [],
  bulkFileError = ''
let bulkReports = [],
  bulkReport = null
let bulkRefreshTimer
let bulkSection = 'send'
let replyTo = null
let actionMessage = null
let forwarding = null
let forwardQuery = ''
let audioContext
let remoteTyping = null
let remoteTypingTimer
let profileSwitching = false
let eventSource
const syncingProfiles = new Set()

function playMessageSound(profile = profiles.find((item) => item.active)) {
  playSound(audioContext, profile)
}

document.addEventListener(
  'pointerdown',
  () => {
    audioContext ||= new AudioContext()
    if (audioContext.state === 'suspended') audioContext.resume()
  },
  { once: true },
)

function setTyping(typing, chatID = selected) {
  clearTimeout(typingTimer)
  if (!chatID || (typing && typingChat === chatID)) {
    if (typing) typingTimer = setTimeout(() => setTyping(false, chatID), 2000)
    return
  }
  if (typing) typingChat = chatID
  else if (typingChat === chatID) typingChat = null
  request(`/api/chats/${encodeURIComponent(chatID)}/typing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ typing }),
  }).catch(() => {})
  if (typing) typingTimer = setTimeout(() => setTyping(false, chatID), 2000)
}

function render(scrollToBottom = false) {
  if (profileSwitching) return
  if (appSession.loading) return renderAppLoading()
  if (appSession.setupRequired) return renderSetup()
  if (!appSession.authenticated) return renderAppLogin()
  if (whatsAppAuth.state !== 'connected') return renderLogin()
  const oldBox = document.querySelector('.messages')
  const oldScroll = oldBox && {
    top: oldBox.scrollTop,
    nearBottom: oldBox.scrollHeight - oldBox.scrollTop - oldBox.clientHeight < 80,
  }
  const oldInput = document.querySelector('.composer textarea')
  const inputFocus =
    oldInput === document.activeElement ? [oldInput.selectionStart, oldInput.selectionEnd] : null
  const searchFocus = document.querySelector('.search input') === document.activeElement
  sidebarScroll = document.querySelector('.chat-list')?.scrollTop ?? sidebarScroll
  const active = chats.find((chat) => chat.id === selected)
  const showConversation = settingsOpen || bulkOpen || statusOpen || active
  app.innerHTML = `${appSession.license?.expired ? `<div class="license-warning" role="alert">Lisans süresi${appSession.license.expirationDate ? ` ${escapeHTML(appSession.license.expirationDate)} tarihinde` : ''} doldu. Uygulamayı kullanmaya devam edebilirsiniz; lisansınızı yenilemeniz gerekiyor.</div>` : ''}<section class="shell">
    <nav class="profile-rail ${showConversation ? 'mobile-hidden' : ''}" aria-label="WhatsApp profilleri">
      <div class="profile-list">${profiles.map((profile) => `<button class="profile-button ${profile.active ? 'active' : ''}" data-profile="${escapeHTML(profile.id)}" aria-label="${escapeHTML(profile.name)}${profile.unread ? `, ${profile.unread} okunmamış mesaj` : ''}" aria-current="${profile.active ? 'true' : 'false'}"><span>${escapeHTML(profileInitials(profile.name))}<img src="${API}/api/profiles/${encodeURIComponent(profile.id)}/avatar" alt="" onerror="this.remove()"></span>${profile.unread ? `<b class="profile-unread">${profile.unread > 99 ? '99+' : profile.unread}</b>` : ''}<i role="tooltip">${escapeHTML(profile.name)}</i></button>`).join('')}</div>
      ${appSession.user.role === 'admin' ? '<button class="rail-add add-profile" title="Yeni profil ekle" aria-label="Yeni WhatsApp profili ekle">+</button>' : ''}
      <button class="rail-bulk ${bulkOpen ? 'active' : ''}" title="Toplu mesaj" aria-label="Toplu mesaj">${icon('bulk')}</button>
      <button class="rail-status ${statusOpen ? 'active' : ''}" title="Status planla" aria-label="Status planla">${icon('status')}</button>
      ${appSession.user.role === 'admin' ? `<button class="rail-settings ${settingsOpen ? 'active' : ''}" title="Ayarlar" aria-label="Ayarlar">${icon('settings')}</button>` : ''}
      <button class="rail-session-logout" title="Oturumu kapat" aria-label="${escapeHTML(appSession.user.username)} oturumunu kapat">${icon('logout')}</button>
    </nav>
    <aside class="sidebar ${showConversation ? 'mobile-hidden' : ''}">
      <header class="brand">${logo}</header>
      <label class="search">${icon('search')}<input type="search" value="${escapeHTML(searchQuery)}" placeholder="Sohbetlerde ara" aria-label="Sohbetlerde ara" ${chatsLoaded ? '' : 'disabled'}></label>
      <div class="chat-list">${
        chats.length
          ? chats
              .map(
                (chat, index) => `
        <button class="chat ${chat.id === selected ? 'active' : ''} ${chat.unread ? 'unread' : ''}" data-chat="${escapeHTML(chat.id)}">
          <span class="avatar color-${index % 3}">${escapeHTML(chat.avatar)}</span>
          <span class="chat-copy"><span><strong>${escapeHTML(chat.name)}</strong><time>${escapeHTML(chat.lastTime)}</time></span><small>${escapeHTML(chat.lastText)}</small></span>${chat.unread ? `<span class="unread-count" aria-label="${chat.unread} okunmamış mesaj">${chat.unread > 99 ? '99+' : chat.unread}</span>` : chat.pinned ? `<span class="pin" title="Sabitlenmiş sohbet" aria-label="Sabitlenmiş sohbet">${icon('pin')}</span>` : ''}
        </button>`,
              )
              .join('')
          : chatsLoaded
            ? `<p class="empty-list">Henüz sohbet bulunamadı.<br><small>Yeni mesajlar geldikçe burada görünecek.</small></p>`
            : chatSkeleton
      }</div>
    </aside>
    <section class="conversation ${showConversation ? '' : 'mobile-hidden'}">
      ${settingsOpen ? settings() : bulkOpen ? bulkPage() : active ? conversation(active) : chatsLoaded ? `<div class="welcome">${logo}<span class="eyebrow">WHATSAPP BAĞLI</span><h1>İletişim, daha sade.</h1><p>${chats.length ? 'Mesajlarını görüntülemek için soldan bir sohbet seç.' : 'Yeni sohbetler eşitlendikçe burada görünecek.'}</p><small>Geçmiş, WhatsApp’ın bu cihaza aktardığı mesajlarla sınırlıdır.</small></div>` : `<div class="sync-screen" role="status"><span class="sync-logo"><img src="/icon.svg" alt="KRIO"></span><h2>Sohbetler yükleniyor</h2><p>Kişiler ve yakın mesaj geçmişi eşitleniyor…</p><span class="sync-progress"><i></i></span></div>`}
    </section>
  </section>`
  if (statusOpen) document.querySelector('.conversation').innerHTML = statusPage()
  bind(scrollToBottom, oldScroll)
  if (searchFocus) document.querySelector('.search input')?.focus()
  if (inputFocus) {
    const input = document.querySelector('.composer textarea')
    input?.focus()
    input?.setSelectionRange(...inputFocus)
  }
}

let renderScheduled = false
let renderWithScroll = false
function scheduleRender(scrollToBottom = false) {
  renderWithScroll = renderWithScroll || scrollToBottom
  if (renderScheduled) return
  renderScheduled = true
  setTimeout(() => {
    renderScheduled = false
    render(renderWithScroll)
    renderWithScroll = false
  }, 150)
}

function legacySettings() {
  return `<div class="settings-page"><header><span><small>UYGULAMA AYARLARI</small><h1>Profiller</h1></span><button class="close-settings" aria-label="Ayarları kapat">×</button></header><p>Takma ad ve bildirim sesi ayarları her profile özeldir.</p><div class="settings-list">${profiles.map((profile) => `<form class="profile-setting" data-setting-profile="${escapeHTML(profile.id)}"><span class="settings-avatar">${escapeHTML(profileInitials(profile.name))}<img src="${API}/api/profiles/${encodeURIComponent(profile.id)}/avatar" alt="" onerror="this.remove()"></span><div class="profile-fields"><label><b>${escapeHTML(profile.whatsAppName || profile.name)}</b><small>${escapeHTML(profile.id.split('@')[0])}${profile.active ? ' · Aktif profil' : ''}</small><input name="nickname" maxlength="40" value="${escapeHTML(profile.nickname || '')}" placeholder="Takma ad ekle" aria-label="${escapeHTML(profile.name)} için takma ad"></label><div class="sound-fields"><label><small>Bildirim sesi</small><select name="sound"><option value="chime" ${profile.sound === 'chime' ? 'selected' : ''}>Chime</option><option value="soft" ${profile.sound === 'soft' ? 'selected' : ''}>Soft</option><option value="pop" ${profile.sound === 'pop' ? 'selected' : ''}>Pop</option><option value="bell" ${profile.sound === 'bell' ? 'selected' : ''}>Bell</option><option value="silent" ${profile.sound === 'silent' ? 'selected' : ''}>Sessiz</option></select></label><label><small>Ses seviyesi <output>${profile.volume}%</output></small><input name="volume" type="range" min="0" max="100" value="${profile.volume}"></label><button class="preview-sound" type="button">Dinle</button></div></div><div class="sync-buttons"><button type="button" data-sync-contacts="${escapeHTML(profile.id)}">Kişileri eşitle</button><button type="button" data-sync-messages="${escapeHTML(profile.id)}">Mesajları eşitle</button></div><button class="save-name" type="submit">Kaydet</button><button class="remove-profile" type="button" data-remove-profile="${escapeHTML(profile.id)}">Çıkış yap</button></form>`).join('')}</div></div>`
}

function settings() {
  const active = profiles.filter((profile) => profile.active).length
  return `<div class="settings-page profile-management"><header><span><small>ÇALIŞMA ALANI</small><h1>WhatsApp profilleri</h1><p>Bağlı hesapları, bildirimleri ve geçmiş eşitlemeyi tek yerden yönetin.</p></span><button class="close-settings" aria-label="Ayarları kapat">×</button></header><div class="profile-overview"><span><b>${profiles.length}</b><small>Bağlı profil</small></span><span><b>${active}</b><small>Aktif oturum</small></span><span><b>${profiles.reduce((total, profile) => total + (profile.unread || 0), 0)}</b><small>Okunmamış</small></span></div><div class="settings-list">${profiles.map((profile) => `<form class="profile-setting profile-card" data-setting-profile="${escapeHTML(profile.id)}"><div class="profile-card-head"><span class="settings-avatar">${escapeHTML(profileInitials(profile.name))}<img src="${API}/api/profiles/${encodeURIComponent(profile.id)}/avatar" alt="" onerror="this.remove()"></span><span><b>${escapeHTML(profile.whatsAppName || profile.name)}</b><small>+${escapeHTML(profile.id.split('@')[0])}</small></span><i class="${profile.active ? 'active' : ''}">${profile.active ? 'Aktif profil' : 'Bağlı'}</i></div><div class="profile-fields"><div class="profile-name-field"><label><small>Görünen profil adı</small><input name="nickname" maxlength="40" value="${escapeHTML(profile.nickname || '')}" placeholder="Takma ad ekle"></label></div><div class="sound-fields"><label><small>Bildirim sesi</small><select name="sound"><option value="chime" ${profile.sound === 'chime' ? 'selected' : ''}>Chime</option><option value="soft" ${profile.sound === 'soft' ? 'selected' : ''}>Soft</option><option value="pop" ${profile.sound === 'pop' ? 'selected' : ''}>Pop</option><option value="bell" ${profile.sound === 'bell' ? 'selected' : ''}>Bell</option><option value="silent" ${profile.sound === 'silent' ? 'selected' : ''}>Sessiz</option></select></label><label><small>Ses seviyesi <output>${profile.volume}%</output></small><input name="volume" type="range" min="0" max="100" value="${profile.volume}"></label><button class="preview-sound" type="button">Sesi dene</button></div></div><footer><button class="history-sync" type="button" data-sync-history="${escapeHTML(profile.id)}"><b>↻ Geçmişi eşitle</b><small>Kişileri ve eksik mesajları getir</small></button><span><button class="remove-profile" type="button" data-remove-profile="${escapeHTML(profile.id)}">Profili kaldır</button><button class="save-name" type="submit">Değişiklikleri kaydet</button></span></footer></form>`).join('')}</div></div>`
}

function userForm(user = null) {
  const selectedProfiles = new Set(user?.profileIds || []),
    selectedTemplates = new Set(user?.templateIds || [])
  return `<form class="app-user-form" data-user-id="${user?.id || ''}"><div><label>Kullanıcı adı<input name="username" value="${escapeHTML(user?.username || '')}" minlength="3" maxlength="50" required></label><label>Parola<input name="password" type="password" minlength="8" maxlength="128" ${user ? 'placeholder="Değiştirmek için doldurun"' : 'required'}></label><label>Rol<select name="role"><option value="user" ${user?.role === 'user' ? 'selected' : ''}>Kullanıcı</option><option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Yönetici</option></select></label></div><fieldset><legend>WhatsApp profilleri</legend>${profiles.map((profile) => `<label><input type="checkbox" name="profileIds" value="${escapeHTML(profile.id)}" ${selectedProfiles.has(profile.id) ? 'checked' : ''}>${escapeHTML(profile.name)}</label>`).join('') || '<small>Henüz profil yok.</small>'}</fieldset><fieldset><legend>Mesaj şablonları</legend>${bulkTemplates.map((template) => `<label><input type="checkbox" name="templateIds" value="${template.id}" ${selectedTemplates.has(template.id) ? 'checked' : ''}>${escapeHTML(template.name)}</label>`).join('') || '<small>Henüz şablon yok.</small>'}</fieldset><button>${user ? 'Kullanıcıyı güncelle' : 'Kullanıcı oluştur'}</button></form>`
}

function enhanceNetworkSetting() {
  if (!settingsOpen || appSession.user.role !== 'admin') return
  const page = document.querySelector('.settings-page')
  if (!page || page.querySelector('.network-setting')) return
  const section = document.createElement('section')
  section.className = 'network-setting'
  section.innerHTML = `<div><small>AĞ ERİŞİMİ</small><h2>Ağda yayınla</h2><p>Açıldığında yerel ağdaki cihazlar IP:${appSession.network?.port || 18080} üzerinden erişebilir ve uygulama açılışta arkaplanda başlar.</p></div><label class="switch"><input type="checkbox" ${appSession.network?.enabled ? 'checked' : ''}><span></span></label>`
  page.querySelector('.profile-overview')?.before(section)
  section.querySelector('input').onchange = async (event) => {
    const enabled = event.target.checked
    event.target.disabled = true
    try {
      appSession.network = await request('/api/settings/network', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      if (window.krioDesktop) await window.krioDesktop.setAutoStart(enabled)
      render()
    } catch (error) {
      event.target.checked = !enabled
      notify(error.message)
      event.target.disabled = false
    }
  }
}

function enhanceUserManagement() {
  if (!settingsOpen || appSession.user.role !== 'admin') return
  const section = document.createElement('section')
  section.className = 'user-management'
  section.innerHTML = `<header><small>KULLANICI YÖNETİMİ</small><h2>Hesaplar ve erişimler</h2><p>Kullanıcıların erişebileceği WhatsApp profillerini ve şablonları belirleyin.</p></header><details open><summary>Yeni kullanıcı oluştur</summary>${userForm()}</details>${appUsers.map((user) => `<details><summary>${escapeHTML(user.username)} <small>${user.role === 'admin' ? 'Yönetici' : 'Kullanıcı'}</small></summary>${userForm(user)}<button class="delete-user-btn" data-delete-user="${user.id}" ${user.id === appSession.user.id ? 'disabled title="Kendi hesabınızı silemezsiniz"' : ''}>Kullanıcıyı sil</button></details>`).join('')}`
  document.querySelector('.settings-page')?.append(section)
  section.querySelectorAll('.app-user-form').forEach((form) => (form.onsubmit = saveAppUser))
  section.querySelectorAll('[data-delete-user]').forEach((button) => {
    button.addEventListener('click', () => deleteUser(Number(button.dataset.deleteUser)))
  })
}

function enhanceDangerZone() {
  if (!settingsOpen || appSession.user.role !== 'admin') return
  const page = document.querySelector('.settings-page')
  if (!page || page.querySelector('.danger-zone')) return
  const section = document.createElement('section')
  section.className = 'danger-zone'
  section.innerHTML = `<header><small>TEHLİKELİ BÖLGE</small><h2>Uygulamayı sıfırla</h2><p>Tüm kullanıcılar, profiller, mesajlar, şablonlar ve ayarlar kalıcı olarak silinir. Bu işlem geri alınamaz.</p></header><button class="reset-app-btn">Uygulamayı sıfırla</button>`
  page.append(section)
  section.querySelector('.reset-app-btn').addEventListener('click', resetApp)
}

function bulkPage() {
  const selected = bulkTemplates.find((item) => item.id === Number(bulkTemplate)),
    variables = selected
      ? [
          ...new Set(
            [...selected.body.matchAll(/\{\{\s*([\p{L}_][\p{L}\p{N}_]{0,39})\s*\}\}/gu)].map(
              (match) => match[1],
            ),
          ),
        ]
      : []
  return `<div class="bulk-page"><header><span><small>TOPLU MESAJLAR</small><h1>Kişisel mesajlar, tek akışta.</h1><p>Bir şablon seç, alanları doldur ve alıcılarını belirle.</p></span><button class="close-bulk" aria-label="Toplu mesajları kapat">×</button></header><div class="bulk-layout"><aside class="bulk-library"><div class="section-title"><span><small>ŞABLON KÜTÜPHANESİ</small><h2>Mesaj şablonları</h2></span><b>${bulkTemplates.length}</b></div><div class="template-list">${bulkTemplates.length ? bulkTemplates.map((item) => `<span class="${item.id === Number(bulkTemplate) ? 'selected' : ''}"><i>✦</i><span><b>${escapeHTML(item.name)}</b><small>${escapeHTML(item.body)}</small></span><button data-delete-template="${item.id}" aria-label="${escapeHTML(item.name)} şablonunu sil">×</button></span>`).join('') : '<p class="bulk-empty">Henüz şablon yok.<br><small>İlk şablonunu aşağıdan oluştur.</small></p>'}</div><form class="template-form"><div class="section-title"><span><small>YENİ ŞABLON</small><h2>Şablon oluştur</h2></span></div><label>Şablon adı<input name="name" maxlength="80" placeholder="Örn. Sipariş hazır" required></label><label>Mesaj içeriği<textarea name="body" maxlength="4000" placeholder="Merhaba {{ad}}, siparişiniz hazır." required></textarea></label><small class="variable-hint"><b>{{değişken}}</b> yazarak kişiselleştirilebilir alan ekleyebilirsin.</small><button>Şablonu kaydet</button></form></aside><form class="bulk-send"><div class="section-title"><span><small>YENİ GÖNDERİM</small><h2>Mesajını hazırla</h2></span></div><div class="bulk-step"><b>1</b><span><strong>Gönderimi ayarla</strong><small>Hesabı ve mesaj şablonunu seç.</small></span></div><div class="bulk-fields"><label>Gönderen hesap<select name="profile" required><option value="">Hesap seçin</option>${profiles.map((profile) => `<option value="${escapeHTML(profile.id)}" ${bulkProfile === profile.id ? 'selected' : ''}>${escapeHTML(profile.name)}</option>`).join('')}</select></label><label>Mesaj şablonu<select name="template" required><option value="">Şablon seçin</option>${bulkTemplates.map((item) => `<option value="${item.id}" ${Number(bulkTemplate) === item.id ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</select></label></div>${variables.length ? `<div class="bulk-step"><b>2</b><span><strong>Mesajı kişiselleştir</strong><small>Şablondaki değişkenlerin değerlerini gir.</small></span></div><div class="bulk-variables">${variables.map((variable) => `<label>${escapeHTML(variable)}<input name="var-${escapeHTML(variable)}" placeholder="${escapeHTML(variable)} değerini gir" required></label>`).join('')}</div>` : ''}<div class="bulk-step"><b>${variables.length ? 3 : 2}</b><span><strong>Alıcıları seç</strong><small>Arama yaparak birden fazla sohbet seçebilirsin.</small></span></div><label class="recipient-search-wrap">${icon('search')}<input class="recipient-search" type="search" placeholder="Kişi veya telefon numarası ara"></label><div class="recipient-combobox">${bulkRecipients.length ? bulkRecipients.map((item, index) => `<label data-recipient-name="${escapeHTML(`${item.name} ${item.id}`.toLocaleLowerCase('tr'))}"><input type="checkbox" name="recipient" value="${escapeHTML(item.id)}"><span class="avatar color-${index % 3}">${escapeHTML(item.avatar || profileInitials(item.name))}</span><span><b>${escapeHTML(item.name)}</b><small>${escapeHTML(item.id.split('@')[0])}</small></span><i>✓</i></label>`).join('') : '<p class="bulk-empty">Alıcıları görmek için bir hesap seç.</p>'}</div><button class="bulk-submit"><span>Seçilenlere gönder</span><b>→</b></button><small class="bulk-note">Mesajlar güvenli biçimde sırayla gönderilir. Tek seferde en fazla 50 alıcı seçebilirsin.</small></form></div></div>`
}

function statusPage() {
  const labels = statusLabels,
    minimum = getMinimumSchedule()
  return `<div class="status-page"><header><span><small>WHATSAPP STATUS</small><h1>Paylaşımını planla.</h1><p>Metin, görsel veya videonu seçtiğin profilden şimdi yayınla ya da ileri bir zamana planla.</p></span><button class="close-status" aria-label="Status planlamayı kapat">×</button></header><div class="status-layout"><form class="status-form"><div class="section-title"><span><small>YENİ STATUS</small><h2>İçerik oluştur</h2></span></div><div class="status-fields"><label>WhatsApp profili<select name="profileId" required><option value="">Profil seçin</option>${profiles.map((profile) => `<option value="${escapeHTML(profile.id)}">${escapeHTML(profile.name)}</option>`).join('')}</select></label><label>İçerik türü<select name="kind"><option value="text">Metin</option><option value="image">Görsel</option><option value="video">Video</option></select></label><label class="status-copy">Metin / açıklama<textarea name="text" maxlength="2000" rows="5" placeholder="Status içeriğinizi yazın" required></textarea></label><label class="status-media" hidden>Medya dosyası<input name="media" type="file"><small>JPG, PNG veya video · en fazla 16 MB</small></label><label>Yayın zamanı<select name="mode"><option value="now">Şimdi yayınla</option><option value="scheduled">Planla</option></select></label><label class="status-schedule" hidden>Tarih ve saat<input name="scheduledLocal" type="datetime-local" min="${minimum}"></label></div><button class="status-submit" ${statusSubmitting ? 'disabled' : ''}>${statusSubmitting ? 'Kaydediliyor…' : 'Status oluştur'}</button></form><section class="status-history"><div class="section-title"><span><small>PLANLAMA GEÇMİŞİ</small><h2>Paylaşımlar</h2></span><b>${statusPosts.length}</b></div><div class="status-list">${
    statusPosts.length
      ? statusPosts
          .map((item) => {
            const profile = profiles.find((profile) => profile.id === item.profileId)
            return `<article class="status-card"><i class="status-kind">${item.kind === 'image' ? '▧' : item.kind === 'video' ? '▶' : 'Aa'}</i><span><b>${escapeHTML(item.text || item.fileName || 'Medya statusu')}</b><small>${escapeHTML(profile?.name || item.profileId)} · ${new Date(item.scheduledAt).toLocaleString('tr-TR')}</small>${item.error ? `<em>${escapeHTML(item.error)}</em>` : ''}</span><strong class="status-${item.status}">${labels[item.status] || escapeHTML(item.status)}</strong>${item.status === 'queued' ? `<button data-delete-status="${item.id}" aria-label="Planlanmış statusu iptal et">×</button>` : ''}</article>`
          })
          .join('')
      : '<p class="status-empty">Henüz planlanmış veya yayınlanmış status yok.</p>'
  }</div></section></div></div>`
}

function enhanceBulkForm() {
  const form = document.querySelector('.bulk-send'),
    fields = form?.querySelector('.bulk-fields')
  if (!form || !fields) return
  const page = document.querySelector('.bulk-page'),
    layout = page.querySelector('.bulk-layout'),
    header = page.querySelector(':scope>header')
  page.classList.add(`bulk-section-${bulkSection}`)
  const titles = {
    send: ['TOPLU MESAJLAR', 'Yeni gönderim hazırla.'],
    templates: ['ŞABLON YÖNETİMİ', 'Mesaj şablonlarını yönet.'],
    reports: ['GÖNDERİM RAPORLARI', 'Geçmiş işlemleri ve sonuçlarını incele.'],
  }
  header.querySelector('small').textContent = titles[bulkSection][0]
  header.querySelector('h1').textContent = titles[bulkSection][1]
  const navigation = document.createElement('nav')
  navigation.className = 'bulk-navigation'
  navigation.setAttribute('aria-label', 'Toplu mesaj bölümleri')
  if (appSession.user.role !== 'admin' && bulkSection === 'templates') bulkSection = 'send'
  const sections =
    appSession.user.role === 'admin'
      ? [
          ['send', 'Toplu mesaj gönder'],
          ['templates', 'Şablon yönetimi'],
          ['reports', 'Gönderim raporları'],
        ]
      : [
          ['send', 'Toplu mesaj gönder'],
          ['reports', 'Gönderim raporları'],
        ]
  navigation.innerHTML = `${sections.map(([id, label]) => `<button class="${bulkSection === id ? 'active' : ''}" data-bulk-section="${id}">${label}</button>`).join('')}`
  header.after(navigation)
  if (appSession.user.role !== 'admin') {
    document.querySelector('.template-form')?.remove()
    document.querySelectorAll('[data-delete-template]').forEach((button) => button.remove())
  }
  navigation.querySelectorAll('[data-bulk-section]').forEach(
    (button) =>
      (button.onclick = () => {
        bulkSection = button.dataset.bulkSection
        bulkReport = null
        render()
      }),
  )
  const variables = form.querySelector('.bulk-variables'),
    search = form.querySelector('.recipient-search-wrap'),
    recipients = form.querySelector('.recipient-combobox')
  const manualParts = [
    variables?.previousElementSibling,
    variables,
    search?.previousElementSibling,
    search,
    recipients,
  ].filter(Boolean)
  manualParts.forEach((item) => item.classList.add('manual-only'))
  manualParts.forEach((item) =>
    item.querySelectorAll('input').forEach((input) => {
      input.disabled = bulkMode !== 'manual'
    }),
  )
  if (variables?.previousElementSibling?.querySelector('b'))
    variables.previousElementSibling.querySelector('b').textContent = '3'
  if (search?.previousElementSibling?.querySelector('b'))
    search.previousElementSibling.querySelector('b').textContent = variables ? '4' : '3'
  const mode = document.createElement('div')
  mode.className = 'bulk-mode-section'
  mode.innerHTML = `<div class="bulk-step"><b>2</b><span><strong>Gönderim yöntemini seç</strong><small>Excel dosyası veya kişi listesinden manuel seçim kullan.</small></span></div><div class="bulk-mode" role="radiogroup" aria-label="Gönderim yöntemi"><label><input type="radio" name="mode" value="excel" ${bulkMode === 'excel' ? 'checked' : ''}><span><b>Excel ile gönderim</b><small>Dosyayı yükle, önizle ve gönder.</small></span></label><label><input type="radio" name="mode" value="manual" ${bulkMode === 'manual' ? 'checked' : ''}><span><b>Manuel gönderim</b><small>Kişileri ekrandan seç.</small></span></label></div><div class="excel-panel"><div class="excel-actions"><button type="button" class="download-excel">${icon('bulk')} Excel şablonunu indir</button><label class="excel-upload"><b>Excel dosyasını yükle</b><small>.xlsx · en fazla 1 MB ve 50 satır</small><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label></div>${bulkFileError ? `<p class="excel-error" role="alert">${escapeHTML(bulkFileError)}</p>` : ''}${excelPreview()}</div>`
  fields.after(mode)
  form.classList.toggle('manual-mode', bulkMode === 'manual')
  form.querySelectorAll('[name="mode"]').forEach(
    (input) =>
      (input.onchange = () => {
        bulkMode = input.value
        bulkFileError = ''
        render()
      }),
  )
  form.querySelector('.download-excel').onclick = downloadBulkExcel
  form.querySelector('.excel-upload input').onchange = (event) =>
    readBulkExcel(event.target.files[0])
  const history = document.createElement('section')
  history.className = 'bulk-history'
  history.innerHTML = `<div class="section-title"><span><small>GÖNDERİM GEÇMİŞİ</small><h2>Gönderim raporları</h2></span><button type="button" class="export-all-reports" ${bulkReports.length ? '' : 'disabled'}>Tümünü Excel’e aktar</button></div>${bulkReports.length ? `<div class="bulk-report-list">${bulkReports.map((report) => `<button type="button" data-report="${report.id}"><span><b>${escapeHTML(report.templateName)}</b><small>${new Date(report.startedAt).toLocaleString('tr-TR')} · ${escapeHTML(report.mode === 'manual' ? 'Manuel' : 'Excel')}</small></span><span><b>${report.success}/${report.total}</b><small class="report-${report.status}">${report.status === 'queued' ? 'Kuyrukta' : report.status === 'running' ? 'Sürüyor' : report.failed ? `${report.failed} başarısız` : 'Tamamlandı'}</small></span></button>`).join('')}</div>` : '<p class="bulk-empty">Henüz gönderim raporu yok.</p>'}`
  layout.append(history)
  history
    .querySelectorAll('[data-report]')
    .forEach((button) => (button.onclick = () => openBulkReport(button.dataset.report)))
  history.querySelector('.export-all-reports').onclick = exportAllBulkReports
  if (bulkReport)
    document.querySelector('.bulk-page').insertAdjacentHTML('beforeend', bulkReportDialog())
  document.querySelector('.close-report')?.addEventListener('click', () => {
    bulkReport = null
    render()
  })
  document
    .querySelector('.export-report')
    ?.addEventListener('click', () =>
      exportReports([bulkReport], `krio-gonderim-raporu-${bulkReport.id}.xlsx`),
    )
}

function bulkReportDialog() {
  return `<div class="bulk-report-dialog" role="dialog" aria-modal="true" aria-label="Gönderim raporu"><div><header><span><small>GÖNDERİM RAPORU #${bulkReport.id}</small><h2>${escapeHTML(bulkReport.templateName)}</h2></span><button class="close-report" aria-label="Raporu kapat">×</button></header><div class="report-summary"><span><b>${bulkReport.total}</b><small>Toplam</small></span><span><b>${bulkReport.success}</b><small>Başarılı</small></span><span><b>${bulkReport.failed}</b><small>Başarısız</small></span><button class="export-report">Excel’e aktar</button></div><div class="report-table"><table><thead><tr><th>#</th><th>Alıcı</th><th>Mesaj</th><th>Değişkenler</th><th>Durum</th><th>Zaman</th></tr></thead><tbody>${bulkReport.items
    .map(
      (item) =>
        `<tr><td>${item.row}</td><td>${escapeHTML(item.recipient.split('@')[0])}</td><td>${escapeHTML(item.message)}</td><td>${escapeHTML(
          Object.entries(item.values || {})
            .map(([key, value]) => `${key}: ${value}`)
            .join(' · '),
        )}</td><td class="report-${item.status}">${item.status === 'success' ? 'Başarılı' : escapeHTML(item.error || 'Başarısız')}</td><td>${new Date(item.sentAt).toLocaleString('tr-TR')}</td></tr>`,
    )
    .join('')}</tbody></table></div></div></div>`
}

async function openBulkReport(id) {
  bulkReport = await request(`/api/bulk/reports/${id}`)
  render()
}
function scheduleBulkRefresh() {
  clearTimeout(bulkRefreshTimer)
  if (!bulkOpen || !bulkReports.some((report) => ['queued', 'running'].includes(report.status)))
    return
  bulkRefreshTimer = setTimeout(async () => {
    try {
      bulkReports = await request('/api/bulk/reports')
      if (bulkReport) bulkReport = await request(`/api/bulk/reports/${bulkReport.id}`)
      render()
    } catch {
    } finally {
      scheduleBulkRefresh()
    }
  }, 1000)
}
async function exportAllBulkReports() {
  exportReports(
    await Promise.all(bulkReports.map((report) => request(`/api/bulk/reports/${report.id}`))),
    'krio-tum-gonderim-raporlari.xlsx',
  )
}
function legacyExportBulkReports(reports, filename) {
  const rows = reports.flatMap((report) =>
    report.items.map((item) => ({
      'İşlem No': report.id,
      Şablon: report.templateName,
      Profil: report.profileId,
      Yöntem: report.mode,
      Başlangıç: new Date(report.startedAt).toLocaleString('tr-TR'),
      Satır: item.row,
      Alıcı: item.recipient.split('@')[0],
      Mesaj: item.message,
      Değişkenler: Object.entries(item.values || {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | '),
      Durum: item.status === 'success' ? 'Başarılı' : 'Başarısız',
      Hata: item.error || '',
      'Gönderim zamanı': new Date(item.sentAt).toLocaleString('tr-TR'),
    })),
  )
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Gönderim Raporları')
  XLSX.writeFile(workbook, filename)
}

function bulkVariables() {
  return getVariables(bulkTemplates, bulkTemplate)
}

function downloadBulkExcel() {
  downloadTemplate(bulkTemplates, bulkTemplate, notify)
}

async function readBulkExcel(file) {
  bulkRows = []
  bulkFileError = ''
  try {
    if (!bulkTemplate) throw new Error('Önce mesaj şablonu seçin.')
    if (!file || file.size > 1024 * 1024 || !file.name.toLocaleLowerCase('tr').endsWith('.xlsx'))
      throw new Error('1 MB’den küçük bir .xlsx dosyası seçin.')
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', sheetRows: 52 }),
      sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!sheet) throw new Error('Excel dosyasında çalışma sayfası bulunamadı.')
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }),
      expected = ['recipient', ...bulkVariables()]
    const headers = (data.shift() || []).map((value) => String(value).trim())
    if (
      headers.length !== expected.length ||
      expected.some((name, index) => headers[index] !== name)
    )
      throw new Error(`Başlıklar şu sırada olmalı: ${expected.join(', ')}`)
    if (!data.length || data.length > 50)
      throw new Error('Excel dosyasında 1-50 veri satırı olmalı.')
    bulkRows = data.map((cells, index) => {
      if (
        cells.length > expected.length ||
        expected.some((_, column) => !String(cells[column] ?? '').trim())
      )
        throw new Error(`${index + 2}. satırda eksik veya fazla alan var.`)
      const raw =
          typeof cells[0] === 'number'
            ? cells[0].toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 0 })
            : String(cells[0]).trim(),
        scientific = Number(raw.replace(',', '.')),
        normalized =
          /e[+-]?\d+$/i.test(raw) && Number.isFinite(scientific)
            ? scientific.toLocaleString('fullwide', {
                useGrouping: false,
                maximumFractionDigits: 0,
              })
            : raw,
        digits = normalized.replace(/\D/g, ''),
        recipient = normalized.includes('@')
          ? normalized
          : digits.length >= 7 && digits.length <= 15
            ? `${digits}@s.whatsapp.net`
            : ''
      if (!recipient) throw new Error(`${index + 2}. satırdaki alıcı geçersiz.`)
      return {
        recipient,
        values: Object.fromEntries(
          expected.slice(1).map((name, column) => [name, String(cells[column + 1]).trim()]),
        ),
      }
    })
  } catch (error) {
    bulkFileError = error.message
  }
  render()
}

function excelPreview() {
  return renderPreview(bulkRows, bulkTemplates, bulkTemplate, escapeHTML)
}

function renderLogin() {
  renderWhatsAppLogin({ app, auth: whatsAppAuth, session: appSession, onLogout: logoutApp })
}

function renderAppLoading() {
  renderAuthLoading(app)
}
function renderSetup() {
  renderAuthSetup(app, submitSetup)
}
function renderAppLogin() {
  renderAuthLogin(app, submitLogin)
}

function conversation(chat) {
  const body =
    messageState === 'loading'
      ? `<div class="message-state"><span class="spinner"></span><p>Mesajlar yükleniyor…</p></div>`
      : messageState === 'error'
        ? `<div class="message-state"><b>Mesajlar alınamadı</b><p>${escapeHTML(messageError)}</p><button class="retry">Tekrar dene</button></div>`
        : messages.length
          ? `<div class="day">MESAJLAR</div>${messages
              .map((message) => {
                const sender = message.senderName || (message.outgoing ? 'Siz' : chat.name)
                return `<div class="message-wrap ${message.outgoing ? 'outgoing' : ''}"><div class="bubble ${message.outgoing ? 'outgoing' : ''}" data-message="${escapeHTML(message.id)}"><button class="message-menu" data-actions="${escapeHTML(message.id)}" aria-label="Mesaj işlemleri">•••</button>${message.forwarded ? '<small class="forwarded">↪ İletildi</small>' : ''}${message.replyText ? `<span class="quoted">${escapeHTML(message.replyText)}</span>` : ''}<b class="sender color-${senderColor(sender)}">${escapeHTML(sender)}</b>${messageContent(message)}<time>${time(message.createdAt)}${message.outgoing ? messageTicks(message.status) : ''}</time>${message.reaction ? `<button class="reaction current" data-react="${escapeHTML(message.id)}" data-emoji="">${escapeHTML(message.reaction)} <small>1</small></button>` : ''}</div>${actionMessage === message.id ? `<div class="message-actions"><button data-reply="${escapeHTML(message.id)}">Yanıtla</button>${message.type === 'text' || !message.type ? `<button data-forward="${escapeHTML(message.id)}">İlet</button>` : ''}<span>${['👍', '❤️', '😂', '😮', '😢', '🙏'].map((emoji) => `<button class="reaction" data-react="${escapeHTML(message.id)}" data-emoji="${emoji}">${emoji}</button>`).join('')}</span></div>` : ''}</div>`
              })
              .join('')}`
          : `<div class="message-state empty-chat"><b>Henüz mesaj yok</b><p>İlk mesajı yazarak konuşmayı başlat.</p></div>`
  const typing = remoteTyping?.chatId === chat.id
  return `<header class="person"><button class="back" aria-label="Sohbetlere dön" title="Sohbetlere dön">${icon('back')}</button><span class="avatar">${escapeHTML(chat.avatar || '?')}</span><span><strong>${escapeHTML(chat.name)}</strong><small class="${typing ? 'typing-status' : ''}"><i class="presence ${typing || chat.online ? 'online' : ''}"></i>${typing ? `${escapeHTML(remoteTyping.name ? `${remoteTyping.name} ` : '')}yazıyor<span class="typing-dots"><i></i><i></i><i></i></span>` : chat.online ? 'Çevrimiçi' : 'WhatsApp'}</small></span></header>
    <div class="messages ${replyTo ? 'replying' : ''}" aria-live="polite">${body}</div><button class="scroll-bottom" type="button" aria-label="En son mesaja git">↓</button>
    ${forwarding ? `<div class="forward-dialog" role="dialog" aria-label="Mesajı ilet"><header><b>Mesajı ilet</b><button class="cancel-forward">×</button></header>${chats.map((item) => `<button data-forward-chat="${escapeHTML(item.id)}"><span class="avatar">${escapeHTML(item.avatar)}</span><b>${escapeHTML(item.name)}</b></button>`).join('')}</div>` : ''}<form class="composer">${replyTo ? `<div class="reply-preview"><span><b>${escapeHTML(replyTo.senderName)}</b><small>${escapeHTML(replyTo.text)}</small></span><button type="button" class="cancel-reply">×</button></div>` : ''}<div class="emoji-wrap"><button class="emoji-toggle" type="button" aria-label="Emoji ekle" title="Emoji ekle" aria-expanded="${emojiOpen}" ${messageState !== 'ready' || sending ? 'disabled' : ''}>${icon('emoji')}</button>${emojiOpen ? `<div class="emoji-picker" role="dialog" aria-label="Emoji seç">${emojis.map((emoji) => `<button type="button" data-emoji="${emoji}" aria-label="${emoji}">${emoji}</button>`).join('')}</div>` : ''}</div><div class="compose-field"><textarea name="text" rows="1" autocomplete="off" maxlength="2000" placeholder="Bir mesaj yazın" aria-label="Mesaj" ${messageState !== 'ready' || sending ? 'disabled' : ''}>${escapeHTML(draft)}</textarea>${messageError && messageState === 'ready' ? `<small class="send-error" role="alert">${escapeHTML(messageError)}</small>` : ''}</div><button class="send" aria-label="Gönder" title="Gönder" ${messageState !== 'ready' || sending || !draft.trim() ? 'disabled' : ''}>${sending ? '<span class="mini-spinner"></span>' : icon('send')}</button></form>`
}

function bind(scrollToBottom, oldScroll) {
  document.onclick = (event) => {
    const outsideActions = actionMessage && !event.target.closest('.bubble, .message-actions')
    if ((emojiOpen && !event.target.closest('.emoji-wrap')) || outsideActions) {
      emojiOpen = false
      actionMessage = null
      render()
    }
  }
  document.onkeydown = (event) => {
    if (event.key === 'Escape' && emojiOpen) {
      emojiOpen = false
      render()
      document.querySelector('.composer textarea')?.focus()
    }
  }
  document
    .querySelectorAll('[data-chat]')
    .forEach((button) => (button.onclick = () => selectChat(button.dataset.chat)))
  const search = document.querySelector('.search input')
  const filterChats = () =>
    document.querySelectorAll('.chat').forEach((button) => {
      const chat = chats.find((item) => item.id === button.dataset.chat)
      const haystack = `${chat.name} ${chat.lastText} ${chat.id.split('@')[0]}`.toLocaleLowerCase(
        'tr',
      )
      button.hidden = !haystack.includes(searchQuery.trim().toLocaleLowerCase('tr'))
    })
  search.oninput = () => {
    searchQuery = search.value
    filterChats()
  }
  filterChats()
  const list = document.querySelector('.chat-list')
  if (list) {
    list.scrollTop = sidebarScroll
    list.onscroll = () => {
      sidebarScroll = list.scrollTop
    }
  }
  document.querySelector('.add-profile')?.addEventListener('click', addProfile)
  document.querySelector('.rail-settings')?.addEventListener('click', openSettings)
  document.querySelector('.rail-session-logout')?.addEventListener('click', logoutApp)
  document.querySelector('.rail-bulk')?.addEventListener('click', openBulk)
  document.querySelector('.rail-status')?.addEventListener('click', openStatus)
  bindStatusPage()
  document.querySelector('.close-bulk')?.addEventListener('click', () => {
    bulkOpen = false
    render()
  })
  document.querySelector('.template-form')?.addEventListener('submit', saveTemplate)
  const templateForm = document.querySelector('.template-form'),
    editedTemplate = bulkTemplates.find((item) => item.id === editingTemplate)
  if (templateForm && editedTemplate) {
    templateForm.elements.name.value = editedTemplate.name
    templateForm.elements.body.value = editedTemplate.body
    templateForm.querySelector('.section-title small').textContent = 'ŞABLONU DÜZENLE'
    templateForm.querySelector('.section-title h2').textContent = 'Şablonu düzenle'
    templateForm.querySelector('button').textContent = 'Değişiklikleri kaydet'
  }
  document.querySelector('.bulk-send')?.addEventListener('submit', sendBulk)
  enhanceBulkForm()
  document
    .querySelector('.bulk-send select[name="profile"]')
    ?.addEventListener('change', (event) => loadBulkRecipients(event.target.value))
  document
    .querySelector('.bulk-send select[name="template"]')
    ?.addEventListener('change', (event) => {
      bulkTemplate = Number(event.target.value)
      bulkRows = []
      bulkFileError = ''
      render()
    })
  document
    .querySelector('.recipient-search')
    ?.addEventListener('input', (event) =>
      document
        .querySelectorAll('[data-recipient-name]')
        .forEach(
          (item) =>
            (item.hidden = !item.dataset.recipientName.includes(
              event.target.value.toLocaleLowerCase('tr'),
            )),
        ),
    )
  document
    .querySelectorAll('[data-delete-template]')
    .forEach((button) => (button.onclick = () => removeTemplate(button.dataset.deleteTemplate)))
  if (appSession.user.role === 'admin')
    document.querySelectorAll('.template-list>span').forEach(
      (item) =>
        (item.onclick = (event) => {
          if (event.target.closest('[data-delete-template]')) return
          editingTemplate = Number(
            item.querySelector('[data-delete-template]').dataset.deleteTemplate,
          )
          render()
        }),
    )
  document.querySelector('.close-settings')?.addEventListener('click', () => {
    settingsOpen = false
    render()
  })
  enhanceNetworkSetting()
  document.querySelectorAll('[data-profile]').forEach((button) =>
    button.addEventListener('click', () => {
      settingsOpen = false
      bulkOpen = false
      statusOpen = false
      switchProfile(button.dataset.profile)
    }),
  )
  document
    .querySelectorAll('[data-setting-profile]')
    .forEach((form) => form.addEventListener('submit', saveNickname))
  enhanceUserManagement()
  enhanceDangerZone()
  document.querySelectorAll('[data-setting-profile]').forEach((form) => {
    const profile = profiles.find((item) => item.id === form.dataset.settingProfile),
      timing = document.createElement('div')
    timing.className = 'bulk-timing-settings'
    timing.innerHTML = `<b>Toplu gönderim zamanlaması</b><small>Yazıyor süresi mesajdaki her karakter için, bekleme ise mesajlar arasında uygulanır.</small><div><label>Karakter başına min. (ms)<input name="typingMin" type="number" min="10" max="2000" value="${profile.typingMin || 100}" required></label><label>Karakter başına maks. (ms)<input name="typingMax" type="number" min="10" max="2000" value="${profile.typingMax || 200}" required></label><label>Mesaj arası min. (sn)<input name="delayMin" type="number" min="0" max="60" step=".1" value="${(profile.delayMin || 1000) / 1000}" required></label><label>Mesaj arası maks. (sn)<input name="delayMax" type="number" min="0" max="60" step=".1" value="${(profile.delayMax || 5000) / 1000}" required></label></div>`
    form.querySelector('.profile-fields').append(timing)
    const workHours = document.createElement('div')
    workHours.className = 'work-hours-settings'
    const days = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
    const workDays = (profile.workDays || '1,2,3,4,5').split(',').map(Number)
    workHours.innerHTML = `<b>Mesai Saatleri</b><small>Bu profil için mesai saatleri tanımlayın. Mesai dışı zamanlarda toplu gönderimler bir sonraki mesai saatine ertelenir.</small><label class="switch-label"><small>Çalışma saatleri aktif</small><label class="switch"><input type="checkbox" name="workEnabled" ${profile.workEnabled ? 'checked' : ''}><span></span></label></label><div class="work-hours-grid"><div class="work-days">${days.map((day, i) => `<label><input type="checkbox" name="workDays" value="${i + 1}" ${workDays.includes(i + 1) ? 'checked' : ''}>${day}</label>`).join('')}</div><div class="work-time"><label>Başlangıç<input type="time" name="workStart" value="${profile.workStart || '09:00'}"></label><label>Bitiş<input type="time" name="workEnd" value="${profile.workEnd || '18:00'}"></label></div></div>`
    form.querySelector('.profile-fields').append(workHours)
    form.elements.volume.oninput = () => {
      form.querySelector('output').textContent = `${form.elements.volume.value}%`
    }
    form.querySelector('.preview-sound').onclick = () =>
      playMessageSound({
        sound: form.elements.sound.value,
        volume: Number(form.elements.volume.value),
      })
  })
  document
    .querySelectorAll('[data-remove-profile]')
    .forEach((button) =>
      button.addEventListener('click', () => logoutProfile(button.dataset.removeProfile)),
    )
  document.querySelectorAll('[data-sync-history]').forEach((button) => {
    if (syncingProfiles.has(button.dataset.syncHistory)) {
      button.disabled = true
      button.classList.add('syncing')
      button.innerHTML =
        '<span><b>Senkronize ediliyor</b><small>WhatsApp’ınızı açık tutun</small></span><i><b></b></i>'
    } else button.onclick = () => syncProfile(button.dataset.syncHistory)
  })
  document.querySelector('.back')?.addEventListener('click', () => {
    setTyping(false)
    selected = null
    messages = []
    draft = ''
    emojiOpen = false
    messageState = 'idle'
    selectionRequest++
    render()
  })
  document.querySelector('.retry')?.addEventListener('click', () => selectChat(selected))
  document.querySelector('.composer')?.addEventListener('submit', sendMessage)
  document.querySelectorAll('[data-actions]').forEach(
    (button) =>
      (button.onclick = () => {
        actionMessage = actionMessage === button.dataset.actions ? null : button.dataset.actions
        render()
      }),
  )
  document.querySelectorAll('[data-reply]').forEach(
    (button) =>
      (button.onclick = () => {
        replyTo = messages.find((message) => message.id === button.dataset.reply)
        actionMessage = null
        render()
        document.querySelector('.composer textarea')?.focus()
      }),
  )
  document.querySelector('.cancel-reply')?.addEventListener('click', () => {
    replyTo = null
    render()
  })
  document.querySelectorAll('[data-forward]').forEach(
    (button) =>
      (button.onclick = () => {
        forwarding = button.dataset.forward
        forwardQuery = ''
        actionMessage = null
        render()
      }),
  )
  document.querySelector('.cancel-forward')?.addEventListener('click', () => {
    forwarding = null
    forwardQuery = ''
    render()
  })
  const forwardDialog = document.querySelector('.forward-dialog')
  if (forwardDialog) {
    const search = document.createElement('input')
    search.className = 'forward-search'
    search.type = 'search'
    search.placeholder = 'Kişi veya sohbet ara'
    search.value = forwardQuery
    search.setAttribute('aria-label', 'İletilecek kişi veya sohbeti ara')
    forwardDialog.querySelector('header').after(search)
    search.oninput = () => {
      forwardQuery = search.value
      const query = forwardQuery.trim().toLocaleLowerCase('tr')
      forwardDialog.querySelectorAll('[data-forward-chat]').forEach((button) => {
        const chat = chats.find((item) => item.id === button.dataset.forwardChat)
        button.hidden = !`${chat.name} ${chat.id.split('@')[0]}`
          .toLocaleLowerCase('tr')
          .includes(query)
      })
    }
    search.focus()
  }
  document
    .querySelectorAll('[data-forward-chat]')
    .forEach((button) => (button.onclick = () => forwardMessage(button.dataset.forwardChat)))
  document
    .querySelectorAll('[data-react]')
    .forEach(
      (button) => (button.onclick = () => reactMessage(button.dataset.react, button.dataset.emoji)),
    )
  const input = document.querySelector('.composer textarea')
  if (input) {
    const resize = () => {
      input.style.height = 'auto'
      input.style.height = `${Math.min(input.scrollHeight, 120)}px`
    }
    input.oninput = () => {
      draft = input.value
      document.querySelector('.send').disabled = !draft.trim()
      draft.trim() ? setTyping(true) : setTyping(false)
      resize()
    }
    input.onkeydown = (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        event.currentTarget.form.requestSubmit()
      }
    }
    resize()
    document.querySelector('.emoji-toggle')?.addEventListener('click', () => {
      draft = input.value
      emojiOpen = !emojiOpen
      render()
      document.querySelector('.composer textarea')?.focus()
    })
    document.querySelectorAll('.emoji-picker [data-emoji]').forEach((button) =>
      button.addEventListener('click', () => {
        const start = input.selectionStart ?? draft.length,
          end = input.selectionEnd ?? start
        draft =
          `${input.value.slice(0, start)}${button.dataset.emoji}${input.value.slice(end)}`.slice(
            0,
            2000,
          )
        emojiOpen = false
        render()
        const next = document.querySelector('.composer textarea')
        next?.focus()
        next?.setSelectionRange(
          start + button.dataset.emoji.length,
          start + button.dataset.emoji.length,
        )
        next?.dispatchEvent(new Event('input'))
      }),
    )
  }
  const box = document.querySelector('.messages')
  const scrollButton = document.querySelector('.scroll-bottom')
  if (box) {
    const updateScrollButton = () => {
      scrollButton.hidden = box.scrollHeight - box.scrollTop - box.clientHeight < 80
    }
    box.scrollTop =
      oldScroll && !oldScroll.nearBottom
        ? oldScroll.top
        : scrollToBottom || oldScroll?.nearBottom
          ? box.scrollHeight
          : oldScroll?.top || 0
    box.onscroll = updateScrollButton
    scrollButton.onclick = () => box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' })
    updateScrollButton()
  }
}

async function selectChat(id) {
  bulkOpen = false
  settingsOpen = false
  statusOpen = false
  bulkReport = null
  if (selected !== id) setTyping(false)
  const requestID = ++selectionRequest
  selected = id
  messages = []
  draft = ''
  messageError = ''
  messageState = 'loading'
  render()
  request(`/api/chats/${encodeURIComponent(id)}/presence`, { method: 'POST' }).catch(() => {})
  try {
    const result = await request(`/api/chats/${encodeURIComponent(id)}/messages`)
    if (requestID !== selectionRequest) return
    messages = Array.isArray(result) ? result : []
    messageState = 'ready'
    render(true)
    const chat = chats.find((item) => item.id === id)
    if (chat?.unread) {
      chat.unread = 0
      render(true)
      request(`/api/chats/${encodeURIComponent(id)}/read`, { method: 'POST' }).catch((error) =>
        notify(error.message, 'error'),
      )
    }
  } catch (error) {
    if (requestID !== selectionRequest) return
    messageState = 'error'
    messageError = error.message
    render()
  }
}

async function sendMessage(event) {
  event.preventDefault()
  const input = event.currentTarget.elements.text
  const text = input.value.trim()
  if (!text || sending || messageState !== 'ready') return
  const chatID = selected
  const sentReply = replyTo
  setTyping(false, chatID)
  draft = ''
  replyTo = null
  messageError = ''
  render()
  document.querySelector('.composer textarea')?.focus()
  try {
    const message = await request(`/api/chats/${encodeURIComponent(chatID)}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, replyToId: sentReply?.id || '' }),
    })
    if (selected !== chatID) return
    if (!messages.some((item) => item.id === message.id)) messages.push(message)
    render(true)
    document.querySelector('.composer textarea')?.focus()
  } catch (error) {
    if (selected !== chatID) return
    draft = text
    replyTo = sentReply
    messageError = error.message
    render()
    document.querySelector('.composer textarea')?.focus()
  }
}

async function reactMessage(messageID, emoji) {
  try {
    await request(
      `/api/chats/${encodeURIComponent(selected)}/messages/${encodeURIComponent(messageID)}/reaction`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      },
    )
    const message = messages.find((item) => item.id === messageID)
    if (message) message.reaction = emoji
    actionMessage = null
    render()
  } catch (error) {
    notify(error.message, 'error')
  }
}

async function forwardMessage(destination) {
  const sourceChat = selected,
    messageID = forwarding
  try {
    await request(
      `/api/chats/${encodeURIComponent(sourceChat)}/messages/${encodeURIComponent(messageID)}/forward`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination }),
      },
    )
    forwarding = null
    forwardQuery = ''
    render()
    notify('Mesaj iletildi', 'success')
  } catch (error) {
    notify(error.message, 'error')
  }
}

async function logoutProfile(id) {
  const profile = profiles.find((item) => item.id === id)
  if (
    !profile ||
    !confirm(
      `${profile.name} profilinden çıkış yapılsın mı? Bu profile ait yerel mesajlar silinir.`,
    )
  )
    return
  loggingOut = true
  render()
  try {
    await request(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' })
    selected = null
    chats = []
    chatsLoaded = false
    messages = []
    draft = ''
    loggingOut = false
    whatsAppAuth = await request('/api/auth')
    await loadProfiles()
    if (whatsAppAuth.state === 'connected') await loadChats()
    else render()
  } catch (error) {
    loggingOut = false
    render()
    notify(`Çıkış yapılamadı: ${error.message}`, 'error')
  }
}

async function saveNickname(event) {
  event.preventDefault()
  const form = event.currentTarget
  try {
    await request(`/api/profiles/${encodeURIComponent(form.dataset.settingProfile)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname: form.elements.nickname.value,
        sound: form.elements.sound.value,
        volume: Number(form.elements.volume.value),
        typingMin: Number(form.elements.typingMin.value),
        typingMax: Number(form.elements.typingMax.value),
        delayMin: Number(form.elements.delayMin.value) * 1000,
        delayMax: Number(form.elements.delayMax.value) * 1000,
        workEnabled: form.elements.workEnabled.checked,
        workDays: Array.from(form.querySelectorAll('input[name="workDays"]:checked')).map((cb) => cb.value).join(','),
        workStart: form.elements.workStart.value,
        workEnd: form.elements.workEnd.value,
      }),
    })
    await loadProfiles()
    notify('Takma ad kaydedildi', 'success')
  } catch (error) {
    notify(`Takma ad kaydedilemedi: ${error.message}`, 'error')
  }
}

async function syncProfile(id) {
  if (syncingProfiles.has(id)) return
  syncingProfiles.add(id)
  render()
  try {
    await request(`/api/profiles/${encodeURIComponent(id)}/sync-history`, { method: 'POST' })
    setTimeout(() => {
      if (syncingProfiles.delete(id)) render()
    }, 11 * 60 * 1000)
  } catch (error) {
    finishSyncProfile(id, error.message)
  }
}

function finishSyncProfile(profileId, error) {
  if (!syncingProfiles.has(profileId)) return
  syncingProfiles.delete(profileId)
  render()
  notify(
    error ? `Geçmiş eşitlenemedi: ${error}` : 'Kişiler ve eksik mesaj geçmişi eşitlendi',
    error ? 'error' : 'success',
  )
}

function bindStatusPage() {
  const form = document.querySelector('.status-form')
  document.querySelector('.close-status')?.addEventListener('click', () => {
    statusOpen = false
    clearTimeout(statusRefreshTimer)
    render()
  })
  document.querySelectorAll('[data-delete-status]').forEach(
    (button) =>
      (button.onclick = async () => {
        try {
          await request(`/api/status-posts/${button.dataset.deleteStatus}`, { method: 'DELETE' })
          statusPosts = await request('/api/status-posts')
          render()
        } catch (error) {
          notify(error.message, 'error')
        }
      }),
  )
  if (!form) return
  form.elements.profileId.value =
    statusDraft.profileId || profiles.find((profile) => profile.active)?.id || ''
  form.elements.kind.value = statusDraft.kind
  form.elements.text.value = statusDraft.text
  form.elements.mode.value = statusDraft.mode
  form.elements.scheduledLocal.value = statusDraft.scheduledLocal
  const saveDraft = () => {
    statusDraft = {
      profileId: form.elements.profileId.value,
      kind: form.elements.kind.value,
      text: form.elements.text.value,
      mode: form.elements.mode.value,
      scheduledLocal: form.elements.scheduledLocal.value,
    }
  }
  const updateKind = () => {
    const media = form.querySelector('.status-media'),
      file = form.elements.media,
      text = form.elements.text,
      kind = form.elements.kind.value
    media.hidden = kind === 'text'
    file.required = kind !== 'text'
    file.accept = kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : ''
    text.required = kind === 'text'
  }
  const updateMode = () => {
    const scheduled = form.querySelector('.status-schedule')
    scheduled.hidden = form.elements.mode.value === 'now'
    form.elements.scheduledLocal.required = !scheduled.hidden
  }
  form.elements.profileId.onchange = saveDraft
  form.elements.text.oninput = saveDraft
  form.elements.scheduledLocal.oninput = saveDraft
  form.elements.kind.onchange = () => {
    saveDraft()
    updateKind()
  }
  form.elements.mode.onchange = () => {
    saveDraft()
    updateMode()
  }
  updateKind()
  updateMode()
  form.onsubmit = submitStatus
}

async function submitStatus(event) {
  event.preventDefault()
  if (statusSubmitting) return
  const form = event.currentTarget,
    body = new FormData(form)
  if (form.elements.mode.value === 'scheduled')
    body.set('scheduledAt', new Date(form.elements.scheduledLocal.value).toISOString())
  else body.delete('scheduledAt')
  body.delete('mode')
  body.delete('scheduledLocal')
  statusSubmitting = true
  render()
  try {
    await request('/api/status-posts', { method: 'POST', body })
    statusPosts = await request('/api/status-posts')
    notify(
      statusDraft.mode === 'scheduled' ? 'Status planlandı' : 'Status yayın kuyruğuna alındı',
      'success',
    )
    statusDraft = {
      profileId: statusDraft.profileId,
      kind: 'text',
      text: '',
      mode: 'now',
      scheduledLocal: '',
    }
  } catch (error) {
    notify(`Status oluşturulamadı: ${error.message}`, 'error')
  } finally {
    statusSubmitting = false
    render()
    scheduleStatusRefresh()
  }
}

async function openStatus() {
  settingsOpen = false
  bulkOpen = false
  statusOpen = true
  selected = null
  try {
    statusPosts = await request('/api/status-posts')
  } catch (error) {
    notify(error.message, 'error')
  }
  render()
  scheduleStatusRefresh()
}

function scheduleStatusRefresh() {
  clearTimeout(statusRefreshTimer)
  if (!statusOpen || !hasPendingStatuses(statusPosts)) return
  statusRefreshTimer = setTimeout(async () => {
    try {
      const hasFile = document.querySelector('.status-form [name="media"]')?.files.length
      statusPosts = await request('/api/status-posts')
      if (!hasFile) render()
    } catch {
    } finally {
      scheduleStatusRefresh()
    }
  }, 3000)
}

async function openBulk() {
  settingsOpen = false
  statusOpen = false
  bulkOpen = true
  selected = null
  ;[bulkTemplates, bulkReports] = await Promise.all([
    request('/api/bulk/templates'),
    request('/api/bulk/reports'),
  ])
  bulkProfile ||= profiles.find((item) => item.active)?.id || ''
  if (bulkProfile)
    bulkRecipients = await request(`/api/bulk/recipients/${encodeURIComponent(bulkProfile)}`)
  render()
  scheduleBulkRefresh()
}
async function loadBulkRecipients(id) {
  bulkProfile = id
  bulkRecipients = id ? await request(`/api/bulk/recipients/${encodeURIComponent(id)}`) : []
  render()
}
async function saveTemplate(event) {
  event.preventDefault()
  const form = event.currentTarget
  await request('/api/bulk/templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: editingTemplate,
      name: form.elements.name.value,
      body: form.elements.body.value,
    }),
  })
  bulkTemplates = await request('/api/bulk/templates')
  render()
  notify(editingTemplate ? 'Şablon güncellendi' : 'Şablon kaydedildi', 'success')
}
async function removeTemplate(id) {
  await request(`/api/bulk/templates/${id}`, { method: 'DELETE' })
  bulkTemplates = await request('/api/bulk/templates')
  if (Number(id) === bulkTemplate) bulkTemplate = 0
  if (Number(id) === editingTemplate) editingTemplate = 0
  render()
}
async function sendBulk(event) {
  event.preventDefault()
  const form = event.currentTarget,
    recipients =
      bulkMode === 'manual'
        ? [...form.querySelectorAll('[name="recipient"]:checked')].map((item) => item.value)
        : [],
    values = {}
  form
    .querySelectorAll('[name^="var-"]')
    .forEach((input) => (values[input.name.slice(4)] = input.value))
  if (bulkMode === 'excel' && !bulkRows.length)
    return notify('Önce Excel dosyasını yükleyip önizleyin', 'warning')
  const report = await request('/api/bulk/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId: form.elements.profile.value,
      templateId: Number(form.elements.template.value),
      mode: bulkMode,
      recipients,
      values,
      rows: bulkMode === 'excel' ? bulkRows : [],
    }),
  })
  bulkReports = await request('/api/bulk/reports')
  render()
  scheduleBulkRefresh()
  notify(`#${report.id} numaralı işlem kuyruğa alındı`, 'success')
}

async function resetForProfile() {
  setTyping(false)
  selected = null
  chats = []
  chatsLoaded = false
  messages = []
  draft = ''
  replyTo = null
  actionMessage = null
  forwarding = null
  searchQuery = ''
  sidebarScroll = 0
  emojiOpen = false
  messageState = 'idle'
  selectionRequest++
  render()
}

async function switchProfile(id) {
  if (!id || profiles.find((profile) => profile.id === id)?.active) return
  profileSwitching = true
  setTyping(false)
  selectionRequest++
  try {
    const result = await request(`/api/profiles/${encodeURIComponent(id)}/activate`, {
      method: 'POST',
    })
    profiles = result.profiles
    chats = result.chats
    selected = null
    messages = []
    draft = ''
    replyTo = null
    actionMessage = null
    forwarding = null
    searchQuery = ''
    sidebarScroll = 0
    emojiOpen = false
    messageState = 'idle'
    chatsLoaded = true
  } catch (error) {
    notify(`Profil değiştirilemedi: ${error.message}`, 'error')
  }
  profileSwitching = false
  render()
}

async function addProfile() {
  if (
    !confirm(
      'Yeni bir WhatsApp profili eklemek için QR eşleştirme ekranına geçilsin mi? Mevcut profiller korunur.',
    )
  )
    return
  await resetForProfile()
  try {
    await request('/api/profiles', { method: 'POST' })
  } catch (error) {
    notify(`Profil eklenemedi: ${error.message}`, 'error')
  }
}

function connectEvents() {
  eventSource?.close()
  const events = (eventSource = new EventSource(`${API}/api/events`, { withCredentials: true }))
  events.onmessage = ({ data }) => {
    const event = JSON.parse(data)
    if (event.type === 'auth') {
      whatsAppAuth = event.payload
      if (whatsAppAuth.state === 'connected') loadChats()
      else scheduleRender()
    }
    if (event.type === 'profiles') {
      profiles = event.payload
      if (!statusOpen || !document.querySelector('.status-form [name="media"]')?.files.length)
        scheduleRender()
    }
    if (event.type === 'chats') {
      chats = event.payload
      chatsLoaded = true
      if (!statusOpen || !document.querySelector('.status-form [name="media"]')?.files.length)
        scheduleRender()
    }
    if (event.type === 'message') {
      if (!event.payload.outgoing) playMessageSound()
      if (
        event.payload.chatId === selected &&
        !messages.some((item) => item.id === event.payload.id)
      ) {
        messages.push(event.payload)
        scheduleRender(true)
        request(`/api/chats/${encodeURIComponent(selected)}/read`, { method: 'POST' }).catch(
          () => {},
        )
      }
    }
    if (event.type === 'profileMessage') {
      const profile = profiles.find((item) => item.id === event.payload.profileId)
      if (profile) {
        profile.unread = (profile.unread || 0) + 1
        playMessageSound(profile)
        scheduleRender()
      }
    }
    if (event.type === 'messageUpdate' && event.payload.chatId === selected) {
      const index = messages.findIndex((item) => item.id === event.payload.id)
      if (index >= 0) messages[index] = event.payload
      scheduleRender()
    }
    if (event.type === 'sync') {
      finishSyncProfile(event.payload.profileId, event.payload.error)
    }
    if (event.type === 'typing') {
      if (event.payload.typing) {
        remoteTyping = event.payload
        clearTimeout(remoteTypingTimer)
        remoteTypingTimer = setTimeout(() => {
          remoteTyping = null
          scheduleRender()
        }, 5000)
      } else if (remoteTyping?.chatId === event.payload.chatId) {
        clearTimeout(remoteTypingTimer)
        remoteTyping = null
      }
      if (event.payload.chatId === selected) scheduleRender()
    }
  }
}

async function loadChats() {
  chatsLoaded = false
  render()
  chats = await request('/api/chats')
  chatsLoaded = true
  render()
}
async function loadProfiles() {
  profiles = await request('/api/profiles')
  render()
}

async function submitSetup(event) {
  event.preventDefault()
  const form = event.currentTarget
  try {
    appSession = await request('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: form.elements.licenseKey.value,
        username: form.elements.username.value,
        password: form.elements.password.value,
      }),
    })
    await bootstrapWhatsApp()
  } catch (error) {
    notify(error.message, 'error')
  }
}
async function submitLogin(event) {
  event.preventDefault()
  const form = event.currentTarget
  try {
    appSession = await request('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.elements.username.value,
        password: form.elements.password.value,
      }),
    })
    await bootstrapWhatsApp()
  } catch (error) {
    notify(error.message, 'error')
  }
}
async function logoutApp() {
  try {
    await request('/api/session/logout', { method: 'POST' })
  } finally {
    eventSource?.close()
    appSession = { setupRequired: false, authenticated: false, license: appSession.license }
    profiles = []
    chats = []
    render()
  }
}
async function openSettings() {
  settingsOpen = true
  bulkOpen = false
  statusOpen = false
  selected = null
  try {
    ;[appUsers, bulkTemplates] = await Promise.all([
      request('/api/users'),
      request('/api/bulk/templates'),
    ])
  } catch (error) {
    notify(error.message, 'error')
  }
  render()
}
async function saveAppUser(event) {
  event.preventDefault()
  const form = event.currentTarget,
    id = form.dataset.userId
  const payload = {
    username: form.elements.username.value,
    password: form.elements.password.value,
    role: form.elements.role.value,
    profileIds: [...form.querySelectorAll('[name="profileIds"]:checked')].map((item) => item.value),
    templateIds: [...form.querySelectorAll('[name="templateIds"]:checked')].map((item) =>
      Number(item.value),
    ),
  }
  try {
    await request(id ? `/api/users/${id}` : '/api/users', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    appUsers = await request('/api/users')
    render()
    notify(id ? 'Kullanıcı güncellendi' : 'Kullanıcı oluşturuldu', 'success')
  } catch (error) {
    notify(error.message, 'error')
  }
}

async function deleteUser(id) {
  if (!confirm('Bu kullanıcı silinecek. Emin misiniz?')) return
  try {
    await request(`/api/users/${id}`, { method: 'DELETE' })
    appUsers = await request('/api/users')
    render()
    notify('Kullanıcı silindi', 'success')
  } catch (error) {
    notify(error.message, 'error')
  }
}

async function resetApp() {
  if (
    !confirm(
      'Tüm veriler silinecek: kullanıcılar, profiller, mesajlar, şablonlar ve ayarlar. Bu işlem geri alınamaz. Devam etmek istiyor musunuz?',
    )
  )
    return
  try {
    eventSource?.close()
    appSession = await request('/api/app/reset', { method: 'POST' })
    profiles = []
    chats = []
    messages = []
    appUsers = []
    settingsOpen = false
    render()
    notify('Uygulama sıfırlandı', 'success')
  } catch (error) {
    notify(error.message, 'error')
  }
}
async function bootstrapWhatsApp() {
  whatsAppAuth = await request('/api/auth')
  await loadProfiles()
  if (whatsAppAuth.state === 'connected') await loadChats()
  else render()
  connectEvents()
}
async function bootstrap() {
  try {
    appSession = await request('/api/app/status')
    if (!appSession.authenticated) return render()
    await bootstrapWhatsApp()
  } catch (error) {
    app.innerHTML = `<div class="error"><h1>Bağlantı kurulamadı</h1><p>${escapeHTML(error.message)}</p><button onclick="location.reload()">Tekrar dene</button></div>`
  }
}
bootstrap()
