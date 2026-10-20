# Arapça → Latin (Zotero eklentisi)

Muhammed Eşref AYTAÇ hocam için özel geliştirildi.

Kayıtları seçip sağ tıklayın → **Latin harflerine çevir**. Seçili kayıtlardaki Arapça harfli tüm alanları (başlık, kitap/bölüm adı, yazar, yayınevi, yer, seri…) DİA okunuşuyla Latin harflerine çevirir. Arapça orijinal, kaydın altına "Arapça orijinal" notu olarak eklenir. Özet ve Ekstra alanlarına dokunulmaz.

Yanlış çevrildiyse kayıtları seçip sağ tıklayın → **Latin çeviriyi geri al**. Arapça değerler geri gelir ve "Arapça orijinal" notu çöp kutusuna gider. Çeviriden sonra elle değiştirdiğiniz alanlara dokunulmaz; o zaman not da yerinde kalır. Notu elle düzenlerseniz o kayıt için geri alma bilgisi kaybolur.

Çeviri sürerken köşede her kayıt için dönen bir gösterge çıkar, bitince ✓ ya da ✗ olur. Çeviriyi seçtiğiniz yapay zeka yapar: Google Gemini (ücretsiz kota, varsayılan gemini-3.1-flash-lite; kota/yoğunlukta otomatik olarak sıradaki modele geçer), OpenAI, NVIDIA, OpenRouter, Groq, DeepSeek, Mistral, Ollama (yerel) ya da OpenAI uyumlu başka bir adres. Zotero 7–10 sürümlerinde, Windows/macOS/Linux üzerinde çalışır.

## Kurulum

1. `zotero-latin.xpi` dosyasını indir.
2. Zotero → Araçlar → Eklentiler → dişli simgesi → *Install Plugin From File…* → `.xpi` dosyasını seç.
3. Zotero → Ayarlar → **Arapça → Latin** → sağlayıcıyı seç, API anahtarını gir (Gemini: aistudio.google.com/apikey). Gemini ve NVIDIA dışında model adını da yaz.


## Geliştirme

```
npm test        # birim testleri
npm run build   # zotero-latin.xpi üretir
npm run release -- 0.2.0   # yeni sürümü GitHub'a yükler
```

Eklenti, `updates.json` dosyasına bakarak güncellemeyi kendisi indirir (Zotero günde bir kez kontrol eder; hemen almak için Araçlar → Eklentiler → dişli → *Check for Updates*). `release` komutu testleri çalıştırır, sürümü yükseltir, `.xpi` dosyasını üretir, GitHub release'ini açar ve `updates.json` dosyasını yeni sürüme yönlendirir. Bunun için `gh` ile GitHub'a giriş yapmış olmanız gerekir.
