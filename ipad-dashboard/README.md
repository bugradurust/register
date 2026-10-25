# iPad Pano

iPad'i tam ekran bir pano yapar: büyük saat, anlık hava durumu, **7 günlük tahmin** ve **son dakika haberleri**. Sunucu Windows PC'de çalışır, iPad ona ev ağından Safari ile bağlanır. iPad mini 4 (iPadOS 15) için yapıldı, yatay ve dikey çalışır.

- Hava durumu: [Open-Meteo](https://open-meteo.com) (ücretsiz, anahtar gerekmez, verisi CC BY 4.0)
- Haberler: TRT Haber, NTV, Habertürk, BBC Türkçe, Anadolu Ajansı RSS akışları (`config.json`'dan değiştirilir)
- Bağımlılık yok, `npm install` gerekmez. Yalnızca Node.js 18 veya üstü.

## 1. Windows PC'de kurulum

1. [nodejs.org](https://nodejs.org) adresinden **LTS** sürümünü kurun.
2. Bu klasörü PC'ye kopyalayın (örneğin `C:\pano`).
3. `config.json` dosyasında `city` alanına şehrinizi yazın (varsayılan İstanbul). Koordinatı otomatik bulunur.
4. `start.bat` dosyasına çift tıklayın. Pencerede iPad'de açılacak adres çıkar:

   ```
   Pano calisiyor. iPad Safari icinde su adreslerden birini ac:
      http://192.168.1.20:3000
   ```

   Aynı pencerede her haber kaynağı için `✓` veya `✗` görürsünüz. Bir kaynak çalışmıyorsa diğerleri etkilenmez.
5. **Bir kez**, `kurulum-yonetici.bat` dosyasına sağ tıklayıp **Yönetici olarak çalıştır** deyin. Şunları yapar:
   - Güvenlik duvarında 3000 portunu ev ağına açar (başka port kullanıyorsanız: `kurulum-yonetici.bat 8080`)
   - Windows oturum açınca sunucuyu otomatik başlatan bir görev ekler
   - Bilgisayarın uykuya geçmesini kapatır
6. PC'nin IP'sini sabitleyin (yönlendiricinin arayüzünde **DHCP rezervasyonu** ya da Windows'ta sabit IP). IP değişirse iPad'deki kısayol açılmaz.

PC yeniden başlayınca otomatik girişin açık olması gerekir (`Win + R` → `netplwiz`). Aksi halde oturum açılana kadar sunucu başlamaz.

## 2. iPad mini 4 kurulumu

1. Safari'de PC'nin adresini açın (`http://192.168.1.20:3000`).
2. **Paylaş** düğmesi → **Ana Ekrana Ekle**. Ana ekrandaki **Pano** simgesinden açın: Safari çubukları olmadan tam ekran açılır.
   - Safari sekmesinde açık bırakırsanız sağ altta küçük bir ⛶ düğmesi çıkar, ona basınca tam ekran olur.
3. **Ayarlar → Ekran ve Parlaklık → Otomatik Kilit → Hiçbir Zaman.** (iPadOS 15'te web sayfalarının ekranı açık tutma izni yok, bu ayar şart.)
4. Şarjda bırakın.
5. İsteğe bağlı: **Ayarlar → Erişilebilirlik → Rehberli Erişim** açıp panoda Ana Ekran düğmesine üç kez basın. Ekran yanlışlıkla başka uygulamaya geçmez.

## 3. Yatak başı kullanımı

Gece 23:00 ile 07:00 arasında pano kendiliğinden **gece moduna** geçer: saf siyah zemin üzerinde yalnızca loş kehribar bir saat. Haber ve hava durumu gizlenir, hiçbir şey kayıp yanıp sönmez. Ekrana dokunursanız tüm pano 30 saniye loş olarak görünür.

Odayı gerçekten karartmak için iPad ayarları:

- **Ayarlar → Erişilebilirlik → Ekran ve Metin Boyutu → Otomatik Parlaklık** açık olsun. Mini 4'ün ışık sensörü gece parlaklığı kendiliğinden düşürür.
- **Night Shift**'i açın (Ekran ve Parlaklık) ve parlaklığı elle de düşük tutun.
- **Rahatsız Etmeyin**'i açın, bildirimler ekranı yakmasın.

Gece saatlerini `config.json` içindeki `night` bölümünden değiştirin. Kapatmak için `"enabled": false`.

Not: iPad sürekli şarjda kalırsa pil yıllar içinde şişebilir. Prizi bir zamanlayıcı ya da akıllı fişle bağlamak ya da arada şarjdan çıkarmak iyi olur.

## Ayarlar (`config.json`)

| Alan | Anlamı |
| --- | --- |
| `port` | Sunucu portu (varsayılan 3000) |
| `city` | Hava durumu şehri |
| `latitude`, `longitude` | Şehir adı yerine koordinat vermek için (ikisi de sayı olmalı) |
| `weatherRefreshMinutes`, `newsRefreshMinutes` | Yenileme sıklığı, dakika (varsayılan: hava durumu 15, haberler 15) |
| `newsFeeds` | Haber kaynakları: `name` ve `url` (RSS/Atom) |
| `newsPerSource`, `newsTotal` | Kaynak başına ve toplam haber sayısı |
| `pageSeconds` | Haber sayfası değişme süresi |
| `night` | Gece modu: `enabled`, `from` ve `to` (saat, 0-24) |

Değişiklikten sonra `start.bat` penceresini kapatıp yeniden açın.

## Sorun giderme

- **iPad açılmıyor:** İkisi aynı Wi-Fi'de mi? PC'de `http://localhost:3000` açılıyor mu? Açılıyorsa güvenlik duvarı kuralı eksiktir (`kurulum-yonetici.bat`) ya da Windows ağı "Genel" olarak işaretlidir. **Ayarlar → Ağ ve İnternet → Wi-Fi → ağınız → Özel ağ** yapın.
- **Hava durumu "alınamadı":** PC internete çıkabiliyor mu? `city` adı doğru mu? Pencerede hata mesajı yazar.
- **Bir haber kaynağı `✗`:** Sitesi RSS adresini değiştirmiş olabilir. Tarayıcıda adresi açıp deneyin, çalışmıyorsa `config.json`'dan çıkarın ya da başka bir RSS ekleyin.
- **Port kullanımda:** `config.json`'da `port` değerini değiştirin ve `kurulum-yonetici.bat <port>` çalıştırın.
- **Otomatik başlatmayı kaldırmak:** `schtasks /delete /tn "iPad Pano" /f`

## Güvenlik

Sunucuyu yönlendiricide dışarıya açmayın (port yönlendirme yapmayın). Yalnızca ev ağı içindir, giriş şifresi yoktur.

## Nasıl çalışır

`server.js` hava durumunu ve haberleri kendi çeker, önbelleğe alır (`/api/weather`, `/api/news`) ve `public/` klasörünü sunar. Siteleri sunucu çektiği için iPad'in eski Safari'sinin sertifika ve CORS sorunlarıyla uğraşması gerekmez. Hava durumu ve haberler kendiliğinden 15 dakikada bir yenilenir. Bir yenileme başarısız olursa 1 dakika sonra tekrar denenir. İnternet kesilirse son başarılı veri gösterilir ve haber başlığındaki nokta sarı olur. iPad uygulamaya geri dönünce sayfa kendini yeniler, her gün 04:00'te de yenilenir.
