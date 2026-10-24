# Instagram Media & Audio Downloader (Standalone)

Aplikasi downloader mandiri untuk Instagram (Reels, Foto Feed, Video, Carousel multi-slide, serta ekstraksi audio MP3).
Dibangun murni dengan Node.js Express, Axios, Cheerio, dan FFmpeg.

## Fitur Utama
- **Semua Format Instagram**: Reels (MP4), Video (MP4), Foto (JPG), Carousel (Multi-slide).
- **Ekstraksi Audio MP3**: Konversi audio latar Reels langsung ke MP3 192kbps via FFmpeg di server.
- **Proxy Stream Otomatis**: Menghindari pemblokiran CORS pada CDN Instagram dan langsung memunculkan dialog download file pada peramban.
- **Multi-Tier Scraper**: Menggunakan decoder SnapSave tanpa login, session GraphQL bila dipasang, dan fallback pool scraper.
- **Tanpa Ketergantungan YouTube**: Project ini 100% mandiri dan terpisah dari tool downloader lainnya.

---

## Cara Instalasi & Menjalankan

### 1. Instal Dependensi
```bash
npm install
```

### 2. Jalankan Server
```bash
npm start
```
Atau mode pengembangan (auto-reload):
```bash
npm run dev
```

### 3. Buka Web UI
Akses di peramban:
```
http://localhost:3000
```

---

## Endpoint API REST

### 1. Ambil Metadata & Link Media
- **URL**: `/api/info` (atau `/api/instagram/info`)
- **Method**: `POST` atau `GET`
- **Body / Query**: `{"url": "https://www.instagram.com/reel/..."}`
- **Response**:
```json
{
  "success": true,
  "data": {
    "provider": "snapsave",
    "caption": "Deskripsi postingan...",
    "author": "username",
    "shortcode": "C8ZqV1tN6yK",
    "media": [
      {
        "type": "video",
        "quality": "HD",
        "url": "https://...",
        "thumbnail": "https://..."
      }
    ]
  }
}
```

### 2. Stream Unduhan Media (Bypass CORS)
- **URL**: `/api/download?url=<cdn_url>&filename=<nama_file>&type=video|image`
- **Method**: `GET`
- **Header**: Otomatis mengirim `Content-Disposition: attachment` untuk memicu dialog unduh.

### 3. Ekstraksi Audio / MP3
- **URL**: `/api/audio?url=<video_url>&filename=<nama_audio>`
- **Method**: `GET`
- **Header**: `Content-Type: audio/mpeg`

### 4. Health Check
- **URL**: `/api/health`
- **Method**: `GET`

---

## Konfigurasi Opsional (Akun / Cookie)
Jika ingin mengunduh postingan dari akun privat yang Anda ikuti atau bypass limit IP, tambahkan file `.env` atau `ig_cookies.txt`:
```env
INSTAGRAM_COOKIE="sessionid=xxxx; ds_user_id=xxxx; csrftoken=xxxx;"
```
