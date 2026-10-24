/**
 * app.js — Client Controller for Standalone Instagram Downloader
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('igForm');
  const urlInput = document.getElementById('igUrlInput');
  const pasteBtn = document.getElementById('igPasteBtn');
  const clearBtn = document.getElementById('igClearBtn');
  const submitBtn = document.getElementById('igSubmitBtn');
  const btnSpinner = document.getElementById('igBtnSpinner');

  const loadingSection = document.getElementById('igLoadingSection');
  const errorAlert = document.getElementById('igErrorAlert');
  const errorMessage = document.getElementById('igErrorMessage');
  const resultSection = document.getElementById('igResultSection');

  // Result Elements
  const authorName = document.getElementById('igAuthorName');
  const postType = document.getElementById('igPostType');
  const providerTag = document.getElementById('igProviderTag');
  const singleShowcase = document.getElementById('igSingleShowcase');
  const mediaPreviewWrapper = document.getElementById('igMediaPreviewWrapper');
  const captionBox = document.getElementById('igCaptionBox');
  const captionText = document.getElementById('igCaptionText');
  const mainDownloadBtn = document.getElementById('igMainDownloadBtn');
  const mainDownloadText = document.getElementById('igMainDownloadText');
  const audioDownloadBtn = document.getElementById('igAudioDownloadBtn');
  const copyLinkBtn = document.getElementById('igCopyLinkBtn');

  // Carousel Elements
  const carouselShowcase = document.getElementById('igCarouselShowcase');
  const carouselCount = document.getElementById('igCarouselCount');
  const galleryGrid = document.getElementById('igGalleryGrid');

  const toast = document.getElementById('igToast');

  let currentMediaUrl = '';

  // Input & Clipboard
  urlInput.addEventListener('input', () => {
    clearBtn.style.display = urlInput.value.trim() ? 'block' : 'none';
  });

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    clearBtn.style.display = 'none';
    urlInput.focus();
  });

  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        clearBtn.style.display = 'block';
        showToast('Tautan berhasil ditempel dari clipboard');
      }
    } catch (err) {
      showToast('Izin akses clipboard ditolak browser.');
    }
  });

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  }

  // Form Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawUrl = urlInput.value.trim();

    if (!rawUrl) return;

    if (!rawUrl.includes('instagram.com') && !rawUrl.includes('instagr.am')) {
      showError('Harap masukkan tautan resmi Instagram (contoh: https://www.instagram.com/reel/...)');
      return;
    }

    setLoading(true);
    hideError();
    resultSection.style.display = 'none';

    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: rawUrl })
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal memproses tautan Instagram.');
      }

      renderResult(json.data);

    } catch (err) {
      showError(err.message || 'Koneksi ke server gagal. Pastikan jaringan stabil.');
    } finally {
      setLoading(false);
    }
  });

  function renderResult(data) {
    const { caption, author, media, shortcode, provider } = data;

    if (!media || media.length === 0) {
      showError('Tidak ada konten media yang dapat diunduh dari link ini.');
      return;
    }

    authorName.textContent = author ? `@${author}` : 'Instagram Creator';
    providerTag.textContent = provider ? provider.replace('-', ' ') : 'DIRECT CDN';

    if (caption && caption.trim()) {
      captionText.textContent = caption;
      captionBox.style.display = 'block';
    } else {
      captionBox.style.display = 'none';
    }

    const isCarousel = media.length > 1;

    if (isCarousel) {
      postType.textContent = `Carousel Multi-Slide (${media.length} Item)`;
      singleShowcase.style.display = 'none';
      carouselShowcase.style.display = 'block';
      carouselCount.textContent = media.length;

      galleryGrid.innerHTML = '';
      media.forEach((item, index) => {
        const itemNumber = index + 1;
        const isVideo = item.type === 'video' || (item.url && item.url.includes('.mp4'));
        const fileExt = isVideo ? 'mp4' : 'jpg';
        const filename = `instagram_${shortcode || 'carousel'}_item${itemNumber}.${fileExt}`;
        const downloadProxyUrl = `/api/download?url=${encodeURIComponent(item.url)}&filename=${encodeURIComponent(filename)}&type=${item.type}`;

        const card = document.createElement('div');
        card.className = 'ig-gallery-item';
        card.innerHTML = `
          <div class="ig-gallery-thumb-wrap">
            <img src="${item.thumbnail || item.url}" alt="Item ${itemNumber}" loading="lazy" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\' fill=\\'%23444\\'><rect width=\\'100\\' height=\\'100\\'/></svg>'">
            <span class="ig-item-type-badge">${isVideo ? '🎥 Video' : '📸 Foto'}</span>
          </div>
          <div class="ig-gallery-item-footer">
            <div class="ig-item-info">
              <span>Slide #${itemNumber}</span>
              <span>${item.quality || 'HD'}</span>
            </div>
            <a href="${downloadProxyUrl}" class="btn-gallery-dl" download>
              Unduh ${isVideo ? 'Video' : 'Foto'}
            </a>
          </div>
        `;
        galleryGrid.appendChild(card);
      });

    } else {
      carouselShowcase.style.display = 'none';
      singleShowcase.style.display = 'grid';

      const singleItem = media[0];
      const isVideo = singleItem.type === 'video' || (singleItem.url && singleItem.url.includes('.mp4'));
      postType.textContent = isVideo ? 'Reels / Video Post' : 'Foto Post';

      currentMediaUrl = singleItem.url;

      mediaPreviewWrapper.innerHTML = '';
      if (isVideo) {
        const videoEl = document.createElement('video');
        videoEl.controls = true;
        videoEl.playsInline = true;
        videoEl.poster = singleItem.thumbnail || '';
        videoEl.src = singleItem.url;
        mediaPreviewWrapper.appendChild(videoEl);
      } else {
        const imgEl = document.createElement('img');
        imgEl.src = singleItem.url;
        imgEl.alt = 'Instagram Photo Preview';
        mediaPreviewWrapper.appendChild(imgEl);
      }

      const fileExt = isVideo ? 'mp4' : 'jpg';
      const filename = `instagram_${shortcode || 'media'}.${fileExt}`;
      const downloadProxyUrl = `/api/download?url=${encodeURIComponent(singleItem.url)}&filename=${encodeURIComponent(filename)}&type=${singleItem.type}`;

      mainDownloadBtn.href = downloadProxyUrl;
      mainDownloadText.textContent = isVideo ? 'Unduh Video HD (MP4)' : 'Unduh Foto HD (JPG)';

      if (isVideo) {
        const audioName = `instagram_${shortcode || 'audio'}.mp3`;
        audioDownloadBtn.href = `/api/audio?url=${encodeURIComponent(singleItem.url)}&filename=${encodeURIComponent(audioName)}`;
        audioDownloadBtn.style.display = 'inline-flex';
      } else {
        audioDownloadBtn.style.display = 'none';
      }
    }

    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  copyLinkBtn.addEventListener('click', () => {
    if (!currentMediaUrl) return;
    navigator.clipboard.writeText(currentMediaUrl).then(() => {
      showToast('Tautan CDN berhasil disalin');
    }).catch(() => {
      showToast('Gagal menyalin tautan');
    });
  });

  function setLoading(isLoading) {
    if (isLoading) {
      submitBtn.disabled = true;
      btnSpinner.style.display = 'inline-block';
      loadingSection.style.display = 'block';
    } else {
      submitBtn.disabled = false;
      btnSpinner.style.display = 'none';
      loadingSection.style.display = 'none';
    }
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorAlert.style.display = 'flex';
    errorAlert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideError() {
    errorAlert.style.display = 'none';
  }
});
