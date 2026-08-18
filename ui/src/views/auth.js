import { logo } from '../core/config.js'
import { escapeHTML } from '../core/utils.js'

export function renderWhatsAppLogin({ app, auth, session, onLogout }) {
  const isQR = auth.state === 'qr' && auth.qr
  const title = isQR
    ? 'WhatsApp’a bağlan'
    : auth.state === 'error'
      ? 'Bağlantı kurulamadı'
      : 'WhatsApp hazırlanıyor'
  app.innerHTML = `${session.license?.expired ? `<div class="license-warning" role="alert">Lisans süresi${session.license.expirationDate ? ` ${escapeHTML(session.license.expirationDate)} tarihinde` : ''} doldu. Lisansınızı yenilemeniz gerekiyor.</div>` : ''}<section class="login-card">${logo}<button class="app-session-logout" type="button">${escapeHTML(session.user.username)} · Oturumu kapat</button><div class="login-grid"><div class="login-copy"><span class="eyebrow">GÜVENLİ CİHAZ EŞLEŞTİRME</span><h1>${title}</h1>${isQR ? `<ol><li>Telefonunda WhatsApp’ı aç.</li><li><b>Ayarlar → Bağlı Cihazlar</b> bölümüne gir.</li><li><b>Cihaz bağla</b> deyip QR kodu tara.</li></ol>` : `<p>${escapeHTML(auth.error || 'Bağlantı durumu bekleniyor…')}</p>`}<small>Bu istemci resmî WhatsApp ürünü değildir.</small></div><div class="qr-box">${isQR ? `<img src="${auth.qr}" alt="WhatsApp bağlantı QR kodu">` : `<span class="spinner"></span>`}</div></div></section>`
  document.querySelector('.app-session-logout').onclick = onLogout
}

export function renderAppLoading(app) {
  app.innerHTML = `<section class="app-auth-card">${logo}<span class="spinner"></span><p>Uygulama hazırlanıyor…</p></section>`
}

export function renderSetup(app, onSubmit) {
  app.innerHTML = `<section class="app-auth-card">${logo}<span class="eyebrow">İLK KURULUM</span><h1>Yönetici hesabını oluştur</h1><p>Lisansınızı doğrulayın ve uygulamayı yönetecek ilk hesabı oluşturun.</p><form class="setup-form"><label>Lisans anahtarı<input name="licenseKey" maxlength="64" autocomplete="off" required></label><label>Yönetici kullanıcı adı<input name="username" minlength="3" maxlength="50" autocomplete="username" required></label><label>Parola<input name="password" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><button>Kurulumu tamamla</button></form></section>`
  document.querySelector('.setup-form').onsubmit = onSubmit
}

export function renderAppLogin(app, onSubmit) {
  app.innerHTML = `<section class="app-auth-card">${logo}<span class="eyebrow">KRIO CONNECT</span><h1>Oturum aç</h1><p>Devam etmek için hesabınızla giriş yapın.</p><form class="app-login-form"><label>Kullanıcı adı<input name="username" autocomplete="username" required autofocus></label><label>Parola<input name="password" type="password" autocomplete="current-password" required></label><button>Giriş yap</button></form></section>`
  document.querySelector('.app-login-form').onsubmit = onSubmit
}
