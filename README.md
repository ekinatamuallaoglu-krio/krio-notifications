# Krio Connect

Krio Connect, WhatsApp hesaplarını masaüstü veya web arayüzü üzerinden yönetmek,
mesajları görüntülemek, toplu mesaj göndermek ve WhatsApp status içeriklerini
planlamak için kullanılan Go backend, Vite arayüz ve Electron masaüstü
uygulamasından oluşur.

> **WhatsApp uyarısı:** WhatsApp bağlantısı resmî olmayan `whatsmeow` istemcisiyle
> sağlanır. Kullanım WhatsApp hizmet şartlarına tabidir. Hesabınızın
> kısıtlanması veya kapatılması riski vardır. Kritik hesabınızla kullanmadan
> önce bu riski değerlendirin.

## Özellikler

- Birden fazla WhatsApp profili
- QR kod ile WhatsApp cihaz bağlantısı
- Sohbet ve mesaj geçmişi
- Metin, medya, konum, reaction ve poll mesajlarının görüntülenmesi
- Profil başına takma ad, bildirim sesi ve gönderim zamanlama ayarları
- Kullanıcı ve rol yönetimi
- Profil ve şablon erişim yetkileri
- Excel/CSV verisinden toplu mesaj gönderimi
- Toplu gönderim raporları
- Metin, görsel ve video status planlama
- Yerel ağ üzerinden `IP:port` erişimi
- Windows ve macOS'ta açılışta başlatma
- Linux'ta XDG autostart ile açılışta başlatma

## Gereksinimler

### Hazır paket kullanımı

- Windows 10 veya üzeri
- macOS 12 veya üzeri
- Linux x64 masaüstü ortamı
- WhatsApp hesabı
- Aynı ağdan erişim için yerel ağ bağlantısı

### Kaynaktan geliştirme

- Go 1.25+
- Node.js 20+
- npm
- Electron paketleme için hedef işletim sisteminin paketleme araçları

## Hızlı Başlangıç

### Kaynaktan web uygulamasını çalıştırma

Backend ve Vite geliştirme sunucusunu iki ayrı terminalde başlatın:

```bash
cd backend
go run .
```

```bash
cd ui
npm install
npm run dev
```

Arayüz `http://localhost:5173`, API ise `http://localhost:8080` adresinde
çalışır.

### Hazır web binary üretme

```bash
make build
./dist/krio-chat
```

Arayüz binary içine gömülür. Çalışan uygulama varsayılan olarak
`http://127.0.0.1:8080` adresinde yayınlanır.

### Electron geliştirme

```bash
make build
cd electron
npm install
npm run dev
```

Sadece geliştirme sunucusu çalışıyorsa:

```bash
cd electron
npm run dev
```

Bu komut `http://localhost:5173` adresindeki Vite uygulamasını açar.

## Yayın Paketi Üretme

```bash
make desktop
```

Paketler `electron/dist/` altında oluşur:

- macOS: DMG
- Windows: NSIS installer
- Linux: AppImage

Electron paketi Go backend'i otomatik başlatır ve uygulama kapanırken durdurur.
Backend'i ayrıca çalıştırmanız gerekmez.

Başka bir port kullanmak için:

```bash
PORT=18080 ./dist/krio-chat
```

Veritabanı yolunu değiştirmek için:

```bash
KRIO_DATABASE=/var/lib/krio/krio.db ./dist/krio-chat
```

Electron tarafında backend portu `PORT` ortam değişkeniyle değiştirilebilir.
Geliştirme arayüzünü kullanmak için `APP_URL` verilebilir:

```bash
APP_URL=http://localhost:5173 PORT=18080 npm run dev --prefix electron
```

## İlk Kurulum

1. Krio Connect'i başlatın.
2. İlk ekranda lisans anahtarını girin.
3. Yönetici kullanıcı adı ve parolası oluşturun.
4. Kurulumu tamamlayın.
5. Ekrandaki QR kodunun görünmesini bekleyin.
6. Telefonda **WhatsApp → Ayarlar → Bağlı Cihazlar → Cihaz bağla** yolunu açın.
7. QR kodunu tarayın.

İlk bağlantı sonrasında oturum bilgileri veritabanında saklanır. Uygulama tekrar
açıldığında QR kodunu yeniden okutmanız gerekmez.

## Günlük Kullanım

### WhatsApp profilleri

Sol menüden profiller arasında geçiş yapabilirsiniz. Ayarlar ekranından:

- Profil takma adını değiştirebilirsiniz.
- Bildirim sesini ve ses seviyesini ayarlayabilirsiniz.
- Toplu gönderim yazma ve mesaj arası bekleme sürelerini belirleyebilirsiniz.
- Kişileri veya mesaj geçmişini eşitleyebilirsiniz.
- Profil bağlantısını kaldırabilirsiniz.

### Kullanıcı yönetimi

Yönetici hesabıyla **Ayarlar** ekranından kullanıcı oluşturabilirsiniz.
Kullanıcılara `admin` veya `user` rolü verilebilir. `user` rolündeki kullanıcılar
yalnızca izin verilen WhatsApp profillerine ve mesaj şablonlarına erişebilir.

### Toplu mesaj

1. **Toplu mesaj** ekranını açın.
2. Bir profil ve mesaj şablonu seçin.
3. Excel veya CSV dosyasını yükleyin.
4. Alıcı sütununu ve şablon değişkenlerini eşleştirin.
5. Önizlemeyi kontrol edip gönderimi başlatın.
6. Sonuçları **Raporlar** bölümünden inceleyin.

Mesaj şablonlarında `{{ad}}` gibi değişkenler kullanılabilir. Gönderim öncesi
alıcı listesini ve mesaj önizlemesini mutlaka kontrol edin.

### WhatsApp status

1. **Status** ekranını açın.
2. Profil ve içerik türünü seçin.
3. Metin, görsel veya video ekleyin.
4. **Şimdi yayınla** veya **Planla** seçeneğini kullanın.
5. Planlanmış içerikleri aynı ekrandan takip veya iptal edin.

## Yerel Ağda Yayınlama

Bu özellik yalnızca yönetici hesabı tarafından açılabilir.

1. **Ayarlar → Ağda yayınla** seçeneğini açın.
2. Backend loopback yerine tüm ağ arayüzlerinde dinlemeye başlar.
3. Sunucu cihazın yerel IP adresini bulun:

   Linux/macOS:

   ```bash
   hostname -I
   ```

   Windows:

   ```powershell
   ipconfig
   ```

4. Diğer cihazdan `http://SUNUCU_IP:18080` adresini açın.
5. Krio Connect kullanıcı bilgilerinizle giriş yapın.

Seçenek kapatıldığında backend tekrar yalnızca `127.0.0.1` üzerinden erişilir.
Ayar veritabanında saklanır ve sonraki açılışta korunur.

### Güvenlik duvarı

Portu yalnızca güvenilir yerel ağ için açın. Linux UFW örneği:

```bash
sudo ufw allow from 192.168.1.0/24 to any port 18080 proto tcp
```

Windows Defender Firewall veya macOS güvenlik duvarında da yalnızca yerel ağ
erişimine izin verin. Uygulamayı internete doğrudan açmayın; uzaktan erişim
gerekiyorsa VPN veya kimlik doğrulamalı güvenli bir reverse proxy kullanın.

## Açılışta Arkaplanda Başlatma

### Windows ve macOS

**Ağda yayınla** açıldığında Electron uygulaması login item olarak kaydedilir.
Kullanıcı oturum açtığında uygulama `--background` parametresiyle penceresiz
başlar. Seçenek kapatıldığında kayıt kaldırılır.

macOS'ta açılış kaydının güvenilir çalışması için uygulamanın imzalanmış ve
notarize edilmiş bir paket olması gerekir. Geliştirme modunda macOS güvenlik
ayarları bu davranışı engelleyebilir.

### Linux

Electron'ın `setLoginItemSettings` API'si Linux'ta desteklenmez. AppImage'ı
kurduktan sonra XDG autostart kaydını elle oluşturun:

```bash
mkdir -p "$HOME/Applications"
cp electron/dist/Krio\ Connect-*.AppImage "$HOME/Applications/krio-connect.AppImage"
chmod +x "$HOME/Applications/krio-connect.AppImage"
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/krio-connect.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Krio Connect
Comment=Krio Connect arkaplan servisi
Exec=$HOME/Applications/krio-connect.AppImage --background
Terminal=false
Hidden=false
X-GNOME-Autostart-enabled=true
EOF
```

`Exec` yolunu AppImage'ın gerçek konumuna göre değiştirin. Autostart kaydını
kaldırmak için:

```bash
rm -f "$HOME/.config/autostart/krio-connect.desktop"
```

Bu kayıt yalnızca **Ağda yayınla** özelliği açıkken kullanılmalıdır. Özellik
kapatıldığında kayıt kaldırılmazsa uygulama arkaplanda başlayabilir; ancak
backend dış ağ erişimini kapatıp loopback'e döner.

## Veri ve Yedekleme

Varsayılan veritabanı proje/çalışma dizinindeki `krio.db` dosyasıdır. İçerik:

- WhatsApp oturum bilgileri
- Kullanıcılar ve oturumlar
- Profil ayarları
- Sohbet ve mesaj geçmişi
- Toplu mesaj şablonları ve raporları
- Planlanmış status kayıtları

Yedek almadan önce uygulamayı durdurun:

```bash
cp krio.db krio.db.backup
```

Özel konum kullanıyorsanız aynı `KRIO_DATABASE` değişkenini yedekleme ve
çalıştırma sırasında kullanın. Veritabanı dosyasını paylaşmayın; WhatsApp
oturum bilgileri ve kullanıcı verileri içerir.

## Sorun Giderme

### QR kod görünmüyor

- Backend'in çalıştığını kontrol edin.
- Uygulamayı kapatıp yeniden başlatın.
- Eski WhatsApp bağlı cihaz oturumunu kaldırıp tekrar deneyin.
- Ağ bağlantısını ve sistem saatini kontrol edin.

### Ağdaki başka cihaz bağlanamıyor

- **Ağda yayınla** seçeneğinin açık olduğunu kontrol edin.
- Doğru IP ve portu kullandığınızdan emin olun.
- Sunucu ve istemci cihazın aynı ağda olduğunu kontrol edin.
- Güvenlik duvarında port iznini kontrol edin.
- `127.0.0.1` adresinin uzak cihazdan kullanılmadığını doğrulayın.

### Uygulama açılışta görünmüyor

- Windows/macOS'ta uygulamanın paketlenmiş ve macOS'un imzalanmış sürümünü
  kullanın.
- Linux'ta `~/.config/autostart/krio-connect.desktop` dosyasını kontrol edin.
- Linux `Exec` yolunun mevcut ve çalıştırılabilir olduğunu kontrol edin.

### Port zaten kullanılıyor

Başka bir uygulama portu kullanıyorsa farklı bir port seçin:

```bash
PORT=18081 ./dist/krio-chat
```

Electron paketinde portu değiştirirken uygulamayı yeniden başlatın ve uzak
cihazlarda yeni portu kullanın.

## Geliştirici Kontrolleri

Backend test, vet ve build:

```bash
cd backend
go test ./...
go vet ./...
go build ./...
```

Arayüz build:

```bash
cd ui
npm install
npm run build
```

Tam uygulama build'i:

```bash
make build
```

## Lisans ve Sorumluluk

Bu proje WhatsApp tarafından sağlanmaz veya onaylanmaz. WhatsApp hesabınızın
güvenliği, hizmet şartlarına uyum ve yerel mevzuata uygun kullanım tamamen
kullanıcının sorumluluğundadır.
