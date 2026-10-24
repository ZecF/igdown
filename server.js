/**
 * server.js — Standalone Instagram Downloader Backend
 * 
 * Express + Axios + FFmpeg
 * Supports:
 *   - Video / Reels (MP4)
 *   - Single Photo & Multi-slide Carousel (JPG / MP4)
 *   - Direct CORS-bypass stream proxy (Content-Disposition: attachment)
 *   - On-the-fly MP3 192kbps extraction via FFmpeg
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const cp = require('child_process');
const axios = require('axios');
const ffmpegPath = require('ffmpeg-static');
const instagramScraper = require('./instagramScraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Fetch Instagram Media Info
 * Route: POST or GET /api/info (also /api/instagram/info)
 */
app.all(['/api/info', '/api/instagram/info'], async (req, res) => {
  const url = req.method === 'POST' ? (req.body?.url || req.body?.link) : req.query.url;
  if (!url) {
    return res.status(400).json({ 
      success: false, 
      error: 'Parameter "url" Instagram wajib diisi.' 
    });
  }

  try {
    const data = await instagramScraper.getMedia(url);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    console.error('Instagram info error:', err.message);
    res.status(500).json({
      success: false,
      error: err.message || 'Gagal memproses link Instagram'
    });
  }
});

/**
 * Direct file download streaming proxy (prevents CORS & forces download dialog)
 * Route: GET /api/download (also /api/instagram/download)
 */
app.get(['/api/download', '/api/instagram/download'], async (req, res) => {
  const { url, filename, type } = req.query;
  if (!url) {
    return res.status(400).send('Parameter URL media tidak ditemukan.');
  }

  try {
    const isVideo = type === 'video' || url.includes('.mp4');
    const safeFilename = filename || (isVideo ? 'instagram_video.mp4' : 'instagram_photo.jpg');
    const contentType = isVideo ? 'video/mp4' : 'image/jpeg';

    res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
    res.header('Content-Type', contentType);

    const streamRes = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/'
      },
      timeout: 25000
    });

    if (streamRes.headers['content-length']) {
      res.header('Content-Length', streamRes.headers['content-length']);
    }

    streamRes.data.pipe(res);

    req.on('close', () => {
      try { streamRes.data.destroy(); } catch (e) {}
    });

  } catch (err) {
    console.error('Download stream error:', err.message);
    if (!res.headersSent) {
      res.status(500).send('Gagal mengunduh file media: ' + err.message);
    }
  }
});

/**
 * On-the-fly Audio / MP3 extraction from Instagram Video via FFmpeg
 * Route: GET /api/audio (also /api/instagram/audio)
 */
app.get(['/api/audio', '/api/instagram/audio'], async (req, res) => {
  const { url, filename } = req.query;
  if (!url) {
    return res.status(400).send('Parameter URL media tidak ditemukan.');
  }

  try {
    const rawName = (filename || 'instagram_audio').replace(/\.[^/.]+$/, "");
    const safeFilename = `${rawName}.mp3`;

    res.header('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFilename)}"`);
    res.header('Content-Type', 'audio/mpeg');

    const streamRes = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Referer': 'https://www.instagram.com/'
      },
      timeout: 25000
    });

    const ffmpegProcess = cp.spawn(ffmpegPath, [
      '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', '192k',
      '-f', 'mp3',
      'pipe:1'
    ], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    ffmpegProcess.stdin.on('error', () => {});
    ffmpegProcess.stdout.on('error', () => {});
    ffmpegProcess.on('error', () => {});

    streamRes.data.pipe(ffmpegProcess.stdin);
    ffmpegProcess.stdout.pipe(res);

    req.on('close', () => {
      try { streamRes.data.destroy(); } catch (e) {}
      try { ffmpegProcess.kill(); } catch (e) {}
    });

  } catch (err) {
    console.error('Audio conversion error:', err.message);
    if (!res.headersSent) {
      res.status(500).send('Gagal konversi audio: ' + err.message);
    }
  }
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'Instagram Downloader Standalone API',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Guard against socket disconnects during streaming
process.on('uncaughtException', (err) => {
  if (['EOF', 'EPIPE', 'ERR_STREAM_DESTROYED', 'ECONNRESET'].includes(err.code)) {
    return;
  }
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`📸 Instagram Downloader Server running on port ${PORT}`);
  console.log(`🌐 Web UI: http://localhost:${PORT}`);
  console.log(`📡 API Endpoints:`);
  console.log(`   - POST/GET /api/info?url=<ig_url>`);
  console.log(`   - GET      /api/download?url=<cdn_url>&filename=<name>`);
  console.log(`   - GET      /api/audio?url=<video_url>&filename=<name>`);
  console.log(`   - GET      /api/health`);
  console.log(`====================================================`);
});
