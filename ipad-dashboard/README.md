# iPad Pano

iPad'i tam ekran bir masaüstü bilgi ekranı yapar:

- büyük **saat** (saniye akar), tarih, gün doğumu ve batımı
- anlık **hava durumu** ve **7 günlük tahmin**
- **kategorili haberler** (Gündem, Son Dakika, Ekonomi, Spor, Dünya, Teknoloji…) tek kaynaktan, TRT Haber'den: yalnızca son 6 saatin haberleri, **habere dokununca özet penceresi**
- haberlerin altında sabit **Maçlar** kartı: Galatasaray, Fenerbahçe, Beşiktaş'ın o haftaki maçları, oynanırken "Oynanıyor", bitince skor
- en altta **dolar, euro, gram altın** ve küçük bir **internet hızı** göstergesi
- ekrandaki **⚙ ayar düğmesiyle** her bölüm ve her haber kategorisi tek tek açılıp kapanır

Sunucu Windows PC'de çalışır, iPad ona ev ağından Safari ile bağlanır. iPad mini 4 (iPadOS 15) için yapıldı, yatay ve dikey çalışır. Bağımlılık yok, `npm install` gerekmez, yalnızca Node.js 18 veya üstü.

## 1. Windows PC'de kurulum

1. [nodejs.org](https://nodejs.org) adresinden **LTS** sürümünü kurun.
2. Bu klasörü PC'ye kopyalayın (örneğin `C:\pano`).
3. `start.bat` dosyasına çift tıklayın. Pencerede iPad'de açılacak adres çıkar:

   ```
   Pano calisiyor. iPad Safari icinde su adreslerden birini ac:
      http://192.168.1.20:3000
   ```

   Aynı pencerede her veri kaynağı için `✓` ya da `✗` görürsünüz (haber kaynakları, hava durumu, piyasa, maçlar, internet hızı). Bir kaynak çalışmıyorsa diğerleri etkilenmez. Pencereyi kapatmayın.
4. **Bir kez**, `kurulum-yonetici.bat` dosyasına sağ tıklayıp **Yönetici olarak çalıştır** deyin. Şunları yapar:
   - Güvenlik duvarında 3000 portunu ev ağına açar (başka port kullanıyorsanız: `kurulum-yonetici.bat 8080`)
   - Windows oturum açınca sunucuyu otomatik başlatan bir görev ekler
   - Bilgisayarın uykuya geçmesini kapatır
5. PC'nin IP'sini sabitleyin (yönlendiricinin arayüzünde **DHCP rezervasyonu**). IP değişirse iPad'deki kısayol açılmaz.

PC yeniden başlayınca otomatik girişin açık olması gerekir (`Win + R` → `netplwiz`). Aksi halde oturum açılana kadar sunucu başlamaz.

## 2. iPad kurulumu

1. Safari'de PC'nin adresini açın (`http://192.168.1.20:3000`).
2. **Paylaş** düğmesi → **Ana Ekrana Ekle**. Ana ekrandaki **Pano** simgesinden açın: Safari çubukları olmadan tam ekran açılır.
3. **Ayarlar → Ekran ve Parlaklık → Otomatik Kilit → Hiçbir Zaman.** (iPadOS 15'te web sayfalarının ekranı açık tutma izni yok, bu ayar şart.)
4. Şarjda bırakın. İsteğe bağlı: **Rehberli Erişim** açıp panoda Ana Ekran düğmesine üç kez basın, ekran yanlışlıkla başka uygulamaya geçmez.

Not: iPad sürekli şarjda kalırsa pil yıllar içinde şişebilir. Prizi akıllı fişle bağlamak ya da arada şarjdan çıkarmak iyi olur.

## 3. Ekranda kullanım

**Habere dokunun:** dönen haberlerden birine dokunursanız başlık, kaynak, saat ve haberin özeti bir pencerede açılır. Altındaki **Haberin tamamı** düğmesi haberin orijinal sayfasını açar. Pencere dokunmadan 2 dakika sonra kendiliğinden kapanır. Özet, TRT Haber'in akışta verdiği kadardır; haberin tam metni ancak kaynak onu da veriyorsa görünür.

**Kategori adlarına dokunun** (haber kartının üstü): istediğiniz kategoriye geçersiniz.

**Sağ alttaki ⚙ düğmesi:**

- **Piyasa şeridi, İnternet hızı, 7 günlük tahmin, Haberler, Maçlar:** her biri açılıp kapanır. Kapatılan bölümün yeri boş kalmaz, kalanlar ekranı doldurur.
- **Haber kategorileri:** her kategori ayrı açılıp kapanır.
- **Gece modu:** açıksa 23:00–07:00 arasında ekran siyaha döner, yalnızca loş bir saat kalır (dokununca 30 saniye tüm pano görünür).
- **Varsayılana dön:** her şeyi ilk haline getirir.

Seçimler o iPad'in kendi hafızasında saklanır, PC'de bir dosya değiştirmeniz gerekmez. Panel 1 dakika dokunulmazsa kendiliğinden kapanır.

## 4. Bölümler hakkında

**Haberler.** Tek kaynak: [TRT Haber](https://www.trthaber.com/sitene_ekle.html). Her kategori (Gündem, Son Dakika, Ekonomi, Spor, Dünya, Teknoloji; Sağlık ve Kültür-Sanat kapalı başlar) TRT Haber'in kendi RSS akışından gelir. Sunucu bu akışları okur, **yalnızca son 6 saatin** haberlerini tutar ve 15 dakikada bir yeniler. Haber yoksa o kategori ekranda görünmez.

Başka bir siteyi denemek isterseniz kategori listesinde adresi değiştirin (aşağıya bakın). Kaynak bir RSS adresi ya da RSS'i olmayan bir haber sayfası olabilir. Sayfa için **`teshis.bat`** dosyasına çift tıklayın: sayfayı sizin PC'nizden açıp neyin okunabildiğini raporlar ve `teshis-raporu.txt` dosyasına yazar. Başka adres denemek için: `teshis.bat https://ornek.com/haberler`

**Maçlar.** Haberlerin altında sabit kart. Pazartesi–pazar haftasının maçları gösterilir (Süper Lig, Türkiye Kupası, Şampiyonlar Ligi, Avrupa Ligi, Konferans Ligi). Maç başlamadan önce gün ve saat, oynanırken skor ve "● Oynanıyor" (dakikasıyla), bitince skor ve "Maç sonu", ertelenirse "Ertelendi" yazar. Kart, canlı maçın (yoksa sıradaki maçın) bulunduğu sayfadan başlar; çok maç varsa sayfalar dönüşümlü gösterilir. **Hafta kendiliğinden yenilenir:** pazartesi 00:00'dan sonra pano yeni haftanın maçlarına geçer. Gelecek haftanın maçlarını da görmek için `config.json` içinde `"matches": { "weeksAhead": 1 }` yazın. Veri ESPN'in herkese açık skor servisinden gelir (gün gün sorgulanır; biten günler uzun, maç günü kısa süre saklanır, maç sırasında dakikada bir yenilenir). Resmî bir hizmet olmadığından biçimi değişebilir; o zaman kart "Maç verisi alınamadı" der ve `start.bat` penceresinde `✗ Maçlar` yazar. Tarayıcıdan `http://PC-ADRESİ:3000/api/matches` açarsanız hangi ligin çalıştığını görürsünüz.

**Piyasa.** Dolar ve euro serbest piyasa fiyatı, gram altın ons altın ve dolardan hesaplanır (kuyumcu fiyatından biraz farklı olabilir). Yüzde, önceki kapanışa göre değişimdir. Kaynak olarak önce Yahoo Finance, o çalışmazsa Truncgil kullanılır; hangisinin çalıştığı `start.bat` penceresinde yazar.

**İnternet hızı.** Gecikme 30 saniyede bir, indirme hızı 60 dakikada bir ölçülür (yaklaşık 8 MB indirir, ayda yaklaşık 6 GB). Rozete dokunursanız hemen ölçer. Bu, **PC'nin** internet hattının ölçümüdür, iPad de aynı modemi kullandığı için aynı hattır. Tek bağlantıyla ölçüldüğünden gerçek hızınızın biraz altında çıkabilir. Kota sorununuz varsa `config.json` içinde `"net": { "speedMinutes": 0 }` yazın (hız testi kapanır, yalnızca gecikme ölçülür).

## 5. Ayarlar dosyası

Tüm varsayılanlar `config.default.json` içindedir, onu değiştirmeyin (güncellemede üzerine yazılır). Kendi ayarlarınız için aynı klasörde **`config.json`** oluşturun ve yalnızca değiştirmek istediğiniz alanları yazın. Örnek:

```json
{
  "city": "Ankara",
  "night": { "enabled": true },
  "market": { "items": ["USD", "EUR"] }
}
```

Değişiklikten sonra `start.bat` penceresini kapatıp yeniden açın.

| Alan | Anlamı |
| --- | --- |
| `port` | Sunucu portu (varsayılan 3000) |
| `city` | Hava durumu şehri. `"auto"` (varsayılan) IP adresinden bulur, `"Ankara"` gibi bir ad yazarsanız onu kullanır |
| `latitude`, `longitude` | Şehir adı yerine koordinat vermek için (ikisi de sayı olmalı) |
| `weatherRefreshMinutes`, `newsRefreshMinutes` | Yenileme sıklığı, dakika (ikisi de varsayılan 15) |
| `newsMaxAgeHours` | Haberlerin en fazla kaç saat eski olabileceği (varsayılan 6, `0` = sınırsız) |
| `pageSeconds` | Haber ve maç sayfasının değişme süresi |
| `newsPerSource`, `itemsPerCategory` | Kaynak başına ve kategori başına haber sayısı |
| `show` | Yeni bir iPad'in ilk açılışta hangi bölümleri göstereceği (`market`, `net`, `forecast`, `news`, `matches`) |
| `night` | Gece modu (varsayılan kapalı): `enabled`, `from`, `to` (saat) |
| `market` | `items` (`USD`, `EUR`, `GOLD`), `refreshMinutes`, `providers`, kapatmak için `"enabled": false` |
| `net` | `pingSeconds`, `speedMinutes`, `speedBytes`, kapatmak için `"enabled": false` |
| `matches` | `teams` (takip edilen takımlar), `weeksAhead`, `leagues`, `liveRefreshMinutes`, `idleRefreshMinutes`, kapatmak için `"enabled": false` |
| `newsBundles` | Haber kategorileri ve kaynakları (aşağıya bakın) |

**Kategori eklemek ya da değiştirmek:** `newsBundles` bir liste, kendi listeniz varsayılanın yerine geçer. Her kategori bir ad ve kaynak adresleri alır; `"enabled": false` kategoriyi varsayılan olarak kapalı başlatır (ayar panelinden açılır). Kaynak adresi bir **haber sayfası** ya da bir **RSS adresi** olabilir, sunucu hangisi olduğunu kendisi anlar. Bir kategoriye birden çok kaynak eklerseniz haberler birleştirilir:

```json
{
  "newsBundles": [
    { "name": "Gündem", "feeds": [
      { "name": "TRT Haber", "url": "https://www.trthaber.com/gundem_articles.rss" }
    ] },
    { "name": "Spor", "feeds": [
      { "name": "TRT Haber", "url": "https://www.trthaber.com/spor_articles.rss" },
      { "name": "Anadolu Ajansı", "url": "https://www.aa.com.tr/tr/rss/default?cat=spor" }
    ] }
  ]
}
```

## 6. Güncelleme

`guncelle.bat` dosyasına çift tıklayın: son sürümü GitHub'dan indirip bu klasörün üzerine yazar. `config.json` dosyanıza dokunmaz. Sonra `start.bat` penceresini kapatıp yeniden açın, iPad'de de panoyu kapatıp yeniden açın.

## Sorun giderme

- **iPad açılmıyor:** İkisi aynı Wi-Fi'de mi? Adresi `http://` ile ve IP'nin tamamını yazdınız mı? PC'de `http://localhost:3000` açılıyor mu? Açılıyorsa güvenlik duvarı kuralı eksiktir (`kurulum-yonetici.bat`) ya da Windows ağı "Genel" olarak işaretlidir: **Ayarlar → Ağ ve İnternet → Wi-Fi → ağınız → Özel ağ**.
- **Alt şeritte "PC'ye ulaşılamıyor":** iPad sunucuya bağlanamıyor. PC açık mı, `start.bat` penceresi duruyor mu?
- **Hava durumu "alınamadı":** PC internete çıkabiliyor mu? `city` adı doğru mu? Pencerede hata yazar.
- **Bir haber kategorisi `✗` ya da boş:** Pencerede hatanın nedeni ve adresi yazar. Son 6 saatte haber yoksa kategori gizlenir. RSS olmayan bir sayfa eklediyseniz `teshis.bat` çalıştırın.
- **Maçlar kartı "alınamadı" diyor ya da boş:** Pencerede `✗ Maçlar` / `ℹ Maçlar` satırlarına bakın. `ℹ` kaynak çalışıyor ama bu hafta takımlarınızın maçı yok demektir.
- **Piyasa şeridi görünmüyor:** Pencerede `✗ Piyasa` satırına bakın: iki kaynak da cevap vermiyor demektir.
- **`config.json hatalı`:** Virgül, tırnak ya da süslü parantez hatası. Dosyayı JSON olarak kontrol edin.
- **Port kullanımda:** `config.json`'da `port` değerini değiştirin ve `kurulum-yonetici.bat <port>` çalıştırın.
- **Otomatik başlatmayı kaldırmak:** `schtasks /delete /tn "iPad Pano" /f`

## Konum

`auto` konumu PC'nin internet adresinden (IP) bulur, GPS kullanmaz (Safari konum iznini yalnızca HTTPS sayfalara verir). Doğruluğu şehir düzeyindedir, bazı internet sağlayıcıları adresi başka bir şehre kaydeder. Pencerede yanlış şehir çıkarsa `config.json` içinde `"city": "Ankara"` gibi kendi şehrinizi yazın. Konum bulunurken PC'nin IP adresi `ipwho.is`, `geojs.io` veya `ipapi.co` servislerine gider.

## Güvenlik

Sunucuyu yönlendiricide dışarıya açmayın (port yönlendirme yapmayın). Yalnızca ev ağı içindir, giriş şifresi yoktur: aynı Wi-Fi'ye bağlı herkes adresi bilirse panoyu görebilir.

## Nasıl çalışır

`server.js` hava durumu, haber, piyasa, maç ve internet verilerini kendisi çeker, önbelleğe alır (`/api/weather`, `/api/news`, `/api/market`, `/api/matches`, `/api/net`) ve `public/` klasörünü sunar. Siteleri sunucu çektiği için iPad'in eski Safari'sinin sertifika ve CORS sorunlarıyla uğraşması gerekmez. Bir kaynak başarısız olursa 1 dakika sonra tekrar denenir; o arada son başarılı veri gösterilir ve haber kartındaki nokta sarı olur. iPad uygulamaya geri dönünce sayfa kendini yeniler, her gün 04:00'te de yenilenir.

Hava durumu verisi: [Open-Meteo](https://open-meteo.com) (CC BY 4.0). Maç verisi: ESPN. Haberler: TRT Haber RSS akışları.
