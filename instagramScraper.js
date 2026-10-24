/**
 * instagramScraper.js — High-Reliability Instagram Media Extraction Engine
 * 
 * Supports:
 *   - Reels, Single Video & Photo Posts, Multi-Slide Carousels
 *   - Direct stream resolution & audio extraction
 *   - Multi-layer provider pipeline:
 *       1. Authenticated Session / GraphQL (via ig_cookies.txt or INSTAGRAM_COOKIE env)
 *       2. SnapSave / SnapInsta packed decoder
 *       3. Public scraping & API fallbacks
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

class InstagramScraper {
  constructor() {
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
  }

  // 1. Session Cookie Loader (Mendukung Format Header & Netscape cookies.txt)
  parseCookieString(raw) {
    if (!raw || typeof raw !== 'string') return '';
    raw = raw.trim();
    // Jika format Netscape (tab-separated atau komentar #)
    if (raw.includes('\t') || raw.startsWith('# Netscape') || raw.startsWith('# HTTP Cookie File')) {
      const lines = raw.split(/\r?\n/);
      const pairs = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split(/\t+/);
        if (parts.length >= 7) {
          const name = parts[5].trim();
          const value = parts[6].trim();
          if (name && value) {
            pairs.push(`${name}=${value}`);
          }
        }
      }
      return pairs.join('; ');
    }
    return raw;
  }

  getInstagramCookie() {
    let raw = '';
    if (process.env.INSTAGRAM_COOKIE && process.env.INSTAGRAM_COOKIE.trim()) {
      raw = process.env.INSTAGRAM_COOKIE.trim();
    } else {
      const cookiePath = path.join(__dirname, 'ig_cookies.txt');
      if (fs.existsSync(cookiePath)) {
        try {
          raw = fs.readFileSync(cookiePath, 'utf8').trim();
        } catch (e) {
          console.warn('⚠️ Gagal membaca ig_cookies.txt:', e.message);
        }
      }
    }
    return this.parseCookieString(raw);
  }

  // 2. Shortcode Extractor
  extractShortcode(url) {
    if (!url || typeof url !== 'string') return null;
    const cleanUrl = url.trim().replace(/\?.*$/, '');
    const match = cleanUrl.match(/(?:instagram\.com\/(?:p|reel|reels|tv|share)\/|instagr\.am\/p\/)([\w-]+)/i);
    return match ? match[1] : null;
  }

  // 3. Shortcode to Instagram Media ID converter
  shortcodeToId(shortcode) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = 0n;
    for (let i = 0; i < shortcode.length; i++) {
      const char = shortcode[i];
      const index = alphabet.indexOf(char);
      if (index === -1) return null;
      id = id * 64n + BigInt(index);
    }
    return id.toString();
  }

  // 4. Dean Edwards / SnapSave Decoder
  decodeSnapApp(args) {
    const [h, u, n, t, e, r] = args;
    const tNum = Number(t);
    const eNum = Number(e);

    function decode(d, e, f) {
      const g = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/".split("");
      const hArr = g.slice(0, e);
      const iArr = g.slice(0, f);
      let j = d.split("").reverse().reduce((a, b, c) => {
        const idx = hArr.indexOf(b);
        if (idx !== -1) return a + idx * Math.pow(e, c);
        return a;
      }, 0);
      let k = "";
      while (j > 0) {
        k = iArr[j % f] + k;
        j = Math.floor(j / f);
      }
      return k || "0";
    }

    let result = "";
    for (let i = 0, len = h.length; i < len;) {
      let s = "";
      while (i < len && h[i] !== n[eNum]) {
        s += h[i];
        i++;
      }
      i++;
      for (let j = 0; j < n.length; j++) {
        s = s.replace(new RegExp(n[j], "g"), j.toString());
      }
      result += String.fromCharCode(Number(decode(s, eNum, 10)) - tNum);
    }

    try {
      const bytes = new Uint8Array(result.split("").map(c => c.charCodeAt(0)));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return result;
    }
  }

  decryptSnapSave(html) {
    if (!html || !html.includes("decodeURIComponent(escape(r))}(")) return null;
    try {
      const part = html.split("decodeURIComponent(escape(r))}(")[1];
      if (!part) return null;
      const argsRaw = part.split("))")[0];
      const args = argsRaw.split(",").map(v => v.replace(/"/g, "").trim());
      const decoded = this.decodeSnapApp(args);
      
      if (decoded && decoded.includes("getElementById(\"download-section\").innerHTML = \"")) {
        return decoded.split("getElementById(\"download-section\").innerHTML = \"")[1]
          .split("\"; document.getElementById(\"inputData\").remove(); ")[0]
          .replace(/\\(\\)?/g, "");
      }
      return decoded;
    } catch (e) {
      return null;
    }
  }

  // ── Provider 1: SnapSave Scraper ──────────────────────────────────────────
  async fetchViaSnapSave(url) {
    const formData = new URLSearchParams();
    formData.append("url", url);

    const res = await axios.post("https://snapsave.app/action.php?lang=en", formData.toString(), {
      headers: {
        "accept": "*/*",
        "content-type": "application/x-www-form-urlencoded",
        "origin": "https://snapsave.app",
        "referer": "https://snapsave.app/",
        "user-agent": this.userAgent
      },
      timeout: 12000
    });

    const decryptedHtml = this.decryptSnapSave(res.data);
    if (!decryptedHtml) return null;

    const $ = cheerio.load(decryptedHtml);
    const media = [];
    const description = $("span.video-des").text().trim() || $("div.video-des").text().trim() || "";
    const preview = $("article.media figure img").attr("src") || "";

    // Table view (resolutions)
    if ($("table.table").length) {
      $("tbody tr").each((_, tr) => {
        const tds = $(tr).find("td");
        const quality = tds.eq(0).text().trim() || "HD";
        let downloadUrl = tds.eq(2).find("a").attr("href") || tds.eq(2).find("button").attr("onclick");
        if (downloadUrl) {
          media.push({
            type: "video",
            quality,
            url: downloadUrl,
            thumbnail: preview
          });
        }
      });
    }

    // Carousel or card items
    if ($("div.download-items").length) {
      $("div.download-items").each((_, el) => {
        const thumb = $(el).find("div.download-items__thumb img").attr("src");
        const btn = $(el).find("div.download-items__btn a");
        const link = btn.attr("href");
        const isPhoto = btn.text().toLowerCase().includes("photo");
        if (link || thumb) {
          media.push({
            type: isPhoto ? "image" : "video",
            quality: isPhoto ? "HD Foto" : "HD Video",
            url: link || thumb,
            thumbnail: thumb || link
          });
        }
      });
    }

    if (media.length === 0) return null;

    return {
      success: true,
      provider: "snapsave",
      caption: description,
      author: "",
      media
    };
  }

  // ── Provider 2: Authenticated Instagram Session / GraphQL API ─────────────
  async fetchViaSession(shortcode) {
    const cookie = this.getInstagramCookie();
    if (!cookie) return null;

    const mediaId = this.shortcodeToId(shortcode);
    const apiUrl = `https://www.instagram.com/api/v1/media/${mediaId}/info/`;

    const res = await axios.get(apiUrl, {
      headers: {
        'User-Agent': this.userAgent,
        'Cookie': cookie,
        'X-IG-App-ID': '936619743392459',
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: 10000
    });

    const data = res.data;
    if (!data || !data.items || data.items.length === 0) return null;

    const item = data.items[0];
    const caption = item.caption ? item.caption.text : "";
    const author = item.user ? item.user.username : "";
    const media = [];

    // Carousel post
    if (item.carousel_media && Array.isArray(item.carousel_media)) {
      item.carousel_media.forEach((sub) => {
        if (sub.video_versions && sub.video_versions.length > 0) {
          media.push({
            type: "video",
            quality: `${sub.video_versions[0].width}x${sub.video_versions[0].height}`,
            url: sub.video_versions[0].url,
            thumbnail: sub.image_versions2?.candidates?.[0]?.url || ""
          });
        } else if (sub.image_versions2?.candidates?.length > 0) {
          media.push({
            type: "image",
            quality: "HD Image",
            url: sub.image_versions2.candidates[0].url,
            thumbnail: sub.image_versions2.candidates[0].url
          });
        }
      });
    } else if (item.video_versions && item.video_versions.length > 0) {
      // Single Reel / Video
      item.video_versions.forEach((v) => {
        media.push({
          type: "video",
          quality: `${v.width}x${v.height}`,
          url: v.url,
          thumbnail: item.image_versions2?.candidates?.[0]?.url || ""
        });
      });
    } else if (item.image_versions2?.candidates?.length > 0) {
      // Single Image
      media.push({
        type: "image",
        quality: "HD Image",
        url: item.image_versions2.candidates[0].url,
        thumbnail: item.image_versions2.candidates[0].url
      });
    }

    return {
      success: true,
      provider: "instagram-session",
      caption,
      author,
      media
    };
  }

  // ── Provider 3: Fallback Public Scraping Proxies ──────────────────────────
  async fetchViaPublicApi(targetUrl) {
    const endpoints = [
      `https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(targetUrl)}`,
      `https://api.ryzendesu.vip/api/downloader/igdl?url=${encodeURIComponent(targetUrl)}`
    ];

    for (const ep of endpoints) {
      try {
        const res = await axios.get(ep, { timeout: 8000 });
        if (res.data && res.data.data) {
          const list = Array.isArray(res.data.data) ? res.data.data : [res.data.data];
          const media = list.map(item => ({
            type: item.url && item.url.includes('.mp4') ? 'video' : 'image',
            quality: 'HD',
            url: item.url || item.download_link,
            thumbnail: item.thumbnail || item.url
          })).filter(m => m.url);

          if (media.length > 0) {
            return {
              success: true,
              provider: "api-pool",
              caption: res.data.title || "",
              author: "",
              media
            };
          }
        }
      } catch (e) {
        // Fallback to next endpoint
      }
    }
    return null;
  }

  // ── Main Orchestrator ─────────────────────────────────────────────────────
  async getMedia(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new Error('Link Instagram tidak boleh kosong.');
    }

    const shortcode = this.extractShortcode(rawUrl);
    if (!shortcode) {
      throw new Error('Format link Instagram tidak valid. Masukkan link post, reel, atau carousel (contoh: https://www.instagram.com/reel/...)');
    }

    const normalizedUrl = `https://www.instagram.com/p/${shortcode}/`;

    // 1. Cek Session Cookie jika terpasang
    try {
      const sessionResult = await this.fetchViaSession(shortcode);
      if (sessionResult && sessionResult.media && sessionResult.media.length > 0) {
        sessionResult.shortcode = shortcode;
        return sessionResult;
      }
    } catch (err) {
      console.warn('⚠️ Session extraction bypass:', err.message);
    }

    // 2. Cek Engine SnapSave
    try {
      const snapResult = await this.fetchViaSnapSave(normalizedUrl);
      if (snapResult && snapResult.media && snapResult.media.length > 0) {
        snapResult.shortcode = shortcode;
        return snapResult;
      }
    } catch (err) {
      console.warn('⚠️ SnapSave extraction bypass:', err.message);
    }

    // 3. Cek Engine Public API Fallback
    try {
      const publicResult = await this.fetchViaPublicApi(normalizedUrl);
      if (publicResult && publicResult.media && publicResult.media.length > 0) {
        publicResult.shortcode = shortcode;
        return publicResult;
      }
    } catch (err) {
      console.warn('⚠️ Public API bypass:', err.message);
    }

    throw new Error('Gagal mengambil media Instagram. Pastikan akun tidak diprivate dan URL postingan masih aktif.');
  }
}

module.exports = new InstagramScraper();
