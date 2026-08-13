# Krio Notifications

Baileys ile QR kod üzerinden bağlanan çok hesaplı bir WhatsApp web istemcisi. Baileys'in güvenilir biçimde desteklediği metin/yanıt, reaksiyon, düzenleme, silme, iletme, fotoğraf, video/GIF, ses/sesli mesaj, belge, WebP çıkartma, kişi/vCard, konum, anket ve grup daveti özelliklerini sunar. Desteklenmeyen WhatsApp mesaj türleri arayüzde sahte içerik olarak gösterilmez. Yüklemeler bellekte işlenir, saklanmaz ve 25 MB ile sınırlıdır.

Sidebar'daki şablon ekranında mesaj şablonları tarayıcıda oluşturulup düzenlenir. `{{isim}}` biçimindeki değişkenler otomatik form alanlarına dönüşür; seçilen bağlı WhatsApp hesabından girilen numaraya doldurulmuş metin gönderilir.
Her şablon için `telefon` ve değişken sütunlarını içeren Excel örneği indirilebilir. Doldurulan `.xlsx` dosyasındaki en fazla 50 satır, bağlı hesap üzerinden sırayla gönderilir.
Toplu gönderimler SQLite kuyruğunda kalıcıdır. Excel yüklerken girilen minimum ve maksimum süre arasında her mesaj için rastgele bir saniye aralığı seçilir; minimum 10 saniyedir. Normal sohbet gönderiminden sonra kuyruk ayrıca 10 saniye bekler. İlerleme SSE ile canlı gösterilir; kampanya duraklatılabilir, devam ettirilebilir veya iptal edilebilir.

## Çalıştırma

```bash
npm install
cp .env.example .env.local
npm run dev
```

http://localhost:3000 adresini açıp QR kodunu telefonunuzdaki **Bağlı cihazlar** ekranından okutun. Sidebar'daki `+` ile başka WhatsApp hesapları ekleyebilir ve hesap simgelerinden geçiş yapabilirsiniz. İlk hesabın oturum anahtarları `data/baileys-auth`, ek hesapların anahtarları git tarafından yok sayılan `data/baileys-accounts` altında ayrı ayrı tutulur. Uygulama uzun süre çalışan, yazılabilir diske sahip bir Node.js sunucusu gerektirir; sunucusuz/ephemeral ortamlara uygun değildir.

İlk çalıştırmadan önce `.env.local` içinde uygulamanın dış adresi olan `APP_URL` ve `openssl rand -base64 32` ile oluşturulmuş ortak `ENCRYPTION_KEY` tanımlayın. İlk açılışta merkez lisansı doğrulanır ve admin e-posta/parolası giriş ekranından bir kez oluşturulur; admin bilgileri ortam değişkenlerinden okunmaz. Sonraki kullanıcı, profil yetkileri ve SMTP bağlantısı **Ayarlar** ekranından yönetilir. SMTP parolası SQLite içinde AES-256-GCM ile şifreli tutulur ve API yanıtlarında gösterilmez. Geliştirme ortamında SMTP gönderimi başarısızsa sıfırlama bağlantısı ekranda gösterilir; production ortamında token yanıtta gösterilmez.

Merkez lisans anahtarı lisans API'sinde doğrulanır ve ortak `ENCRYPTION_KEY` ile şifreli saklanır. `LICENCE_API_URL` tanımlanmazsa `https://itsme.krio.tr` kullanılır. Kayıtlı lisans her oturum açılışında kontrol edilir: bulunmayan, pasif veya kullanımda olan lisans girişi engeller; süresi dolmuş lisans uyarı gösterir ancak kullanıma izin verir. Yerel ağ kullanıcıları **Kullanıcı Oturumu** sekmesinde merkez uygulamanın adresini (ör. `http://192.168.1.10:3000`) girerek doğrudan merkezin giriş ekranına yönlenir; kullanıcı doğrulaması ve tüm kullanım merkez sunucuda gerçekleşir. Merkez uygulamayı yalnızca güvenilen yerel ağ arayüzünde yayınlayın ve mümkünse HTTPS kullanın.

Arayüz periyodik polling yapmaz. Baileys olayları `/api/whatsapp/events` üzerinden Server-Sent Events ile tarayıcıya iletilir; istemci yalnızca olay geldiğinde güncel veriyi alır. Reverse proxy kullanılıyorsa SSE buffering kapatılmalı ve uzun bağlantı timeout'u tanımlanmalıdır.

Senkronize edilen kişi, sohbet ve son 500 mesaj hesap bazında `data/baileys-stores` altında atomik snapshot olarak saklanır ve yeniden başlatmada yüklenir. Kalıcı store eklenmeden önce bağlanmış ama geçmişi boş olan hesaplarda arayüzdeki **Yeniden eşitle** düğmesiyle bir defa QR eşleştirmesi yapılmalıdır; WhatsApp mevcut bağlı cihaza ilk geçmiş senkronizasyonunu tekrar göndermez.

Graph API özelliğini kullanmak için `.env.local` içindeki `NEXT_PUBLIC_GRAPH_API_VERSION`, `NEXT_PUBLIC_PHONE_NUMBER_ID` ve `NEXT_PUBLIC_ACCESS_TOKEN` değerlerini doldurun. Mevcut endpoint `/api/messages` olarak korunmuştur.

## WhatsApp webhook

Meta App Dashboard'da callback URL olarak `https://alan-adiniz/api/hook` kullanın. `.env.local` içindeki `META_WEBHOOK_VERIFY_TOKEN` değerini paneldeki doğrulama tokenıyla aynı, `META_APP_SECRET` değerini de Meta uygulama sırrınız olarak ayarlayın. Endpoint doğrulama için `GET`, imzalı bildirimler için `POST` kabul eder.

## Kontroller

```bash
npm run lint
npm run build
```
