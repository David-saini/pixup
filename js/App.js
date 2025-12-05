(() => {
  // Core DOM references for compressor UI
  const fileInput = document.getElementById('fileInput');
  const formatSelect = document.getElementById('formatSelect');
  const qualityRange = document.getElementById('qualityRange');
  const qualityValue = document.getElementById('qualityValue');
  const maxWidthInput = document.getElementById('maxWidth');
  const compressBtn = document.getElementById('compressBtn');
  const preview = document.getElementById('preview');
  const previewBefore = document.getElementById('previewBefore');
  const downloadLink = document.getElementById('downloadLink');
  const info = document.getElementById('info');
  const statusEl = document.getElementById('status');
  const previewGrid = document.getElementById('previewGrid');
  const overallProgress = document.getElementById('overallProgress');
  const downloadAllBtn = document.getElementById('downloadAllBtn');
  const batchSummary = document.getElementById('batchSummary');
  const clearAllBtn = document.getElementById('clearAllBtn');

  // Compression pipeline state
  const DEFAULT_CONCURRENCY = 3; // number of simultaneous compressions
  let lastBatchResults = null;
  const _createdObjectURLs = [];

  // Utility functions
  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  qualityRange.addEventListener('input', (e) => {
    qualityValue.textContent = Number(e.target.value).toFixed(2);
  });

  fileInput.addEventListener('change', () => {
    if (!fileInput.files || fileInput.files.length === 0) {
      resetCompressorState();
      return;
    }
    // Hide the "No file selected" message once we actually have files
    if (info) info.textContent = '';

    if (fileInput.files.length === 1) {
      previewFile(fileInput.files[0]);
    } else {
      buildPreviewGrid(fileInput.files);
    }
    if (clearAllBtn) clearAllBtn.style.display = 'inline-block';
  });

  compressBtn.addEventListener('click', async () => {
    if (!fileInput.files || fileInput.files.length === 0) {
      alert('Please select one or more image files first.');
      return;
    }

    const files = Array.from(fileInput.files);
    const outMime = formatSelect.value === 'original' ? null : formatSelect.value;
    const quality = Number(qualityRange.value);
    const maxWidth = Number(maxWidthInput.value) || undefined;

    info.textContent = 'Compressing...';
    if (statusEl) statusEl.textContent = 'Compressing...';

    // Disable controls while running and show overall progress UI
    compressBtn.disabled = true;
    compressBtn.classList.add('opacity-50','cursor-not-allowed');
    if (downloadAllBtn) downloadAllBtn.style.display = 'none';
    if (batchSummary) batchSummary.style.display = 'none';
    // Show overall progress UI
    if (overallProgress) {
      overallProgress.classList.remove('hidden');
      overallProgress.value = 0;
    }

    try {
      const concurrency = DEFAULT_CONCURRENCY;
      const results = await compressFilesWithConcurrency(files, outMime, quality, maxWidth, concurrency, ({ index, total, stage, blob, error }) => {
        // update per-file UI
        const el = previewGrid && previewGrid.querySelector(`[data-index='${index}']`);
        if (el) {
          const status = el.querySelector('.file-status');
          const dl = el.querySelector('.file-download');
          const sizeEl = el.querySelector('.file-size');
          if (stage === 'start') status.textContent = 'Compressing...';
          if (stage === 'done') {
            status.textContent = 'Done';
            if (blob) {
              const url = URL.createObjectURL(blob);
              dl.href = url;
              _registerObjectURL(url);
              dl.download = `compressed_${el.dataset.name}${mimeToExtension(blob.type)}`;
              dl.style.display = 'inline-block';
              sizeEl.textContent = formatBytes(blob.size);
            }
          }
          if (stage === 'error') {
            status.textContent = 'Error';
            console.error(error);
          }
        }
        // overall progress
        if (overallProgress) overallProgress.value = Math.round(((index + (stage === 'done' ? 1 : 0)) / total) * 100);
        if (statusEl) statusEl.textContent = `${index + 1}/${total} ${stage}`;
      });

      // After batch complete, show summary in `info`
      const succeeded = results.filter(r => r && r.blob).length;
      info.textContent = `Completed: ${succeeded}/${results.length} compressed`;
      if (statusEl) statusEl.textContent = 'Completed';
      lastBatchResults = results;
      // show ZIP download if more than one result and at least one blob
      if (downloadAllBtn) {
        const any = results.some(r => r && r.blob);
        downloadAllBtn.style.display = any ? 'inline-block' : 'none';
      }
      // show batch summary (total sizes)
      if (batchSummary) {
        const originalTotal = results.reduce((s, r) => s + (r && r.file ? r.file.size : 0), 0);
        const compressedTotal = results.reduce((s, r) => s + (r && r.blob ? r.blob.size : 0), 0);
        const savedPct = originalTotal ? Math.round((1 - compressedTotal / originalTotal) * 100) : 0;
        batchSummary.textContent = `Total: ${formatBytes(originalTotal)} → ${formatBytes(compressedTotal)} • Saved ${savedPct}%`;
        batchSummary.style.display = 'block';
      }
      // show first result in main preview if available
      const first = results.find(r => r && r.blob);
      if (first) showResult(first.blob, first.file);
    } catch (err) {
      info.textContent = 'Error: ' + err.message;
      console.error(err);
    } finally {
      if (overallProgress) setTimeout(() => overallProgress.classList.add('hidden'), 800);
      compressBtn.disabled = false;
      compressBtn.classList.remove('opacity-50','cursor-not-allowed');
    }
  });

  // wire clear-all button
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      const dt = new DataTransfer();
      fileInput.files = dt.files;
      resetCompressorState();
    });
  }

  async function previewFile(file) {
    if (file.type === 'image/svg+xml') {
      const text = await file.text();
      const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text);
      if (previewBefore) previewBefore.src = svgUrl;
      preview.src = svgUrl;
    } else {
      const url = URL.createObjectURL(file);
      if (previewBefore) previewBefore.src = url;
      preview.src = url;
    }
    info.textContent = `Original: ${formatBytes(file.size)} · Type: ${file.type}`;
    downloadLink.style.display = 'none';

    if (preview) {
      preview.classList.remove('opacity-100');
      preview.classList.add('opacity-0', 'translate-y-2');
    }
    if (previewBefore) {
      previewBefore.classList.remove('opacity-100');
      previewBefore.classList.add('opacity-0', 'translate-y-2');
    }
  }

  function buildPreviewGrid(files) {
    if (!previewGrid) return;
    previewGrid.innerHTML = '';
    Array.from(files).forEach((file, idx) => {
      const card = document.createElement('div');
      card.className = 'bg-gray-800/20 p-3 rounded-xl flex items-center gap-3 relative';
      card.dataset.index = idx;
      card.dataset.name = file.name.replace(/\.[^.]+$/, '');

      const img = document.createElement('img');
      img.className = 'w-20 h-20 object-cover rounded-md';

      if (file.type === 'image/svg+xml') {
        file.text().then(t => img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(t)).catch(() => {});
      } else {
        img.src = URL.createObjectURL(file);
      }

      const meta = document.createElement('div');
      meta.className = 'flex-1';

      const name = document.createElement('div');
      name.className = 'text-sm font-medium';
      name.textContent = file.name;
      const size = document.createElement('div');
      size.className = 'text-xs text-gray-400 file-size';
      size.textContent = formatBytes(file.size);
      const status = document.createElement('div');
      status.className = 'text-xs text-gray-300 file-status';
      status.textContent = 'Ready';

      meta.appendChild(name);
      meta.appendChild(size);
      meta.appendChild(status);

      const actions = document.createElement('div');
      actions.className = 'flex flex-col gap-2 items-end';
      const dl = document.createElement('a');
      dl.className = 'file-download text-xs bg-green-500 text-gray-900 px-2 py-1 rounded hidden';
      dl.style.display = 'none';
      dl.textContent = 'Download';

      actions.appendChild(dl);

      // track created download URL placeholders later
      dl.setAttribute('aria-hidden', 'true');

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'text-xs text-gray-400 hover:text-red-400';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => {
        const current = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
        const next = current.filter((_, i) => i !== idx);
        const dt = new DataTransfer();
        next.forEach(f => dt.items.add(f));
        fileInput.files = dt.files;
        if (!next.length) {
          resetCompressorState();
        } else {
          buildPreviewGrid(fileInput.files);
        }
      });

      actions.appendChild(removeBtn);

      card.appendChild(img);
      card.appendChild(meta);
      card.appendChild(actions);
      previewGrid.appendChild(card);
    });
  }

  function resetCompressorState() {
    if (previewGrid) previewGrid.innerHTML = '';
    if (preview) preview.src = '';
    if (previewBefore) previewBefore.src = '';
    if (info) info.textContent = 'No file selected';
    if (statusEl) statusEl.textContent = '';
    if (downloadLink) {
      downloadLink.href = '#';
      downloadLink.style.display = 'none';
    }
    if (downloadAllBtn) downloadAllBtn.style.display = 'none';
    if (batchSummary) {
      batchSummary.textContent = '';
      batchSummary.style.display = 'none';
    }
    if (overallProgress) {
      overallProgress.classList.add('hidden');
      overallProgress.value = 0;
    }
    lastBatchResults = null;
    if (clearAllBtn) clearAllBtn.style.display = 'none';
  }

  function canvasFromImage(img, maxWidth) {
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (maxWidth && w > maxWidth) {
      const ratio = maxWidth / w;
      w = Math.round(w * ratio);
      h = Math.round(h * ratio);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // white background (helps with JPEG)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }

  async function compressFile(file, outMime, quality, maxWidth) {
    // If this format is better handled by the server, use server conversion (only when PIXUP_SERVER_URL is set)
    const serverSupported = new Set(['image/png','image/jpeg','image/webp','image/avif','image/tiff','image/heif']);
    // normalize incoming outMime values like 'png' or 'jpeg' to mime-like forms for comparison
    const normalizeToMime = (v) => {
      if (!v) return null;
      v = String(v).toLowerCase();
      if (v.includes('/')) return v;
      if (['jpg','jpeg'].includes(v)) return 'image/jpeg';
      if (v === 'png') return 'image/png';
      if (v === 'webp') return 'image/webp';
      if (v === 'avif') return 'image/avif';
      if (v === 'tiff' || v === 'tif') return 'image/tiff';
      if (v === 'heif' || v === 'heic') return 'image/heif';
      return v;
    };

    const targetMime = normalizeToMime(outMime);
    const serverUrlConfigured = typeof window !== 'undefined' && !!window.PIXUP_SERVER_URL;
    const needsServer = serverUrlConfigured && targetMime && serverSupported.has(targetMime);
    if (needsServer) {
      // send to server for conversion
      try {
        const blob = await serverConvert(file, targetMime, quality, maxWidth);
        return blob;
      } catch (e) {
        console.warn('Server conversion failed, falling back to client:', e);
        // fall through to client-side conversion attempt
      }
    }

    // SVG special-case: keep text but optionally rasterize
    if (file.type === 'image/svg+xml') {
      const text = await file.text();
      const minified = text.replace(/>\s+</g, '><').trim();
      const svgBlob = new Blob([minified], { type: 'image/svg+xml' });
      if (!outMime || outMime === 'image/svg+xml' || outMime === 'original') return svgBlob;
      // rasterize to chosen mime
      return rasterizeSvgToBlob(minified, outMime, quality, maxWidth);
    }

    const dataUrl = await readFileAsDataURL(file);
    const img = await loadImage(dataUrl);
    const canvas = canvasFromImage(img, maxWidth);
    const rawMime = outMime || file.type || 'image/jpeg';
    const supportedCanvasMimes = new Set(['image/jpeg','image/png','image/webp','image/avif','image/tiff','image/heif','image/svg+xml']);
    let mime = rawMime;
    if (!supportedCanvasMimes.has(rawMime)) {
      if (rawMime === 'image/gif' || rawMime === 'image/bmp' || rawMime === 'image/x-icon' || rawMime === 'image/x-ms-bmp' || rawMime === 'image/jfif' || rawMime === 'image/x-portable-pixmap') {
        mime = 'image/png';
      } else {
        mime = 'image/jpeg';
      }
    }
    const q = mime === 'image/png' ? undefined : quality;
    return canvasToBlobPromisified(canvas, mime, q);
  }

  // POST to server conversion endpoint
  async function serverConvert(file, mime, quality, maxWidth) {
    const url = (window.PIXUP_SERVER_URL || 'http://localhost:3000') + '/convert';
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('format', mime || 'original');
    if (typeof quality === 'number') fd.append('quality', String(quality));
    if (maxWidth) fd.append('maxWidth', String(maxWidth));

    const res = await fetch(url, { method: 'POST', body: fd });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server conversion error: ${res.status} ${text}`);
    }
    return await res.blob();
  }

  async function compressFilesBatch(files, outMime, quality, maxWidth, onProgress) {
    const total = files.length;
    const results = [];
    for (let i = 0; i < total; i++) {
      const file = files[i];

      try {
        onProgress && onProgress({ index: i, total, stage: 'start' });
        const chosenMime = outMime === null ? file.type : outMime;
        const blob = await compressFile(file, chosenMime, quality, maxWidth);
        results.push({ file, blob });
        onProgress && onProgress({ index: i, total, stage: 'done', blob });
      } catch (error) {
        results.push({ file, error });
        onProgress && onProgress({ index: i, total, stage: 'error', error });
      }
    }
    return results;
  }

  async function compressFilesWithConcurrency(files, outMime, quality, maxWidth, concurrency, onProgress) {
    const total = files.length;
    const results = new Array(total);
    let nextIndex = 0;

    async function worker() {
      while (true) {
        const i = nextIndex;
        if (i >= total) break;
        nextIndex++;
        const file = files[i];
        try {
          onProgress && onProgress({ index: i, total, stage: 'start' });
          const chosenMime = outMime === null ? file.type : outMime;
          const blob = await compressFile(file, chosenMime, quality, maxWidth);
          results[i] = { file, blob };
          onProgress && onProgress({ index: i, total, stage: 'done', blob });
        } catch (error) {
          results[i] = { file, error };
          onProgress && onProgress({ index: i, total, stage: 'error', error });
        }
      }
    }

    const workers = [];
    const actual = Math.max(1, Math.min(concurrency || 1, total));
    for (let w = 0; w < actual; w++) workers.push(worker());
    await Promise.all(workers);
    return results;
  }

  function _registerObjectURL(url) {
    _createdObjectURLs.push(url);
    // revoke after 60s to free memory
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch (e) {}
    }, 60000);
  }

  async function createAndDownloadZip(results) {
    if (!window.JSZip) {
      alert('ZIP library not available.');
      return;
    }
    const zip = new JSZip();
    let added = 0;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r && r.blob) {
        const ext = mimeToExtension(r.blob.type) || '.bin';
        const base = r.file.name.replace(/\.[^.]+$/, '');
        // Prefix with 1-based index so duplicate names don't overwrite each other inside the ZIP
        const name = `compressed_${i + 1}_${base}${ext}`;
        zip.file(name, r.blob);
        added++;
      }
    }

    if (added === 0) {
      alert('No compressed files to add to ZIP.');
      return;
    }
    try {
      if (batchSummary) batchSummary.textContent = 'Preparing ZIP...';
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      _registerObjectURL(url);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pixup-compressed-${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (batchSummary) batchSummary.textContent = 'ZIP ready — download started.';
    } catch (e) {
      console.error('ZIP failed', e);
      alert('Failed to create ZIP: ' + e.message);
    }
  }

  // wire download-all button
  if (downloadAllBtn) {
    downloadAllBtn.addEventListener('click', async () => {
      if (!lastBatchResults) {
        alert('No batch results available. Compress files first.');
        return;
      }
      downloadAllBtn.disabled = true;
      await createAndDownloadZip(lastBatchResults);
      downloadAllBtn.disabled = false;
    });
  }

  function rasterizeSvgToBlob(svgText, outMime, quality, maxWidth) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
      img.onload = () => {
        try {
          const canvas = canvasFromImage(img, maxWidth);
          canvasToBlobPromisified(canvas, outMime, outMime === 'image/png' ? undefined : quality).then(resolve).catch(reject);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('SVG rasterization failed'));
      img.src = svgUrl;
    });
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function canvasToBlobPromisified(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      if (!canvas.toBlob) {
        try {
          const data = canvas.toDataURL(mime, quality);
          const arr = data.split(',')[1];
          const binary = atob(arr);
          const len = binary.length;
          const u8 = new Uint8Array(len);
          for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
          resolve(new Blob([u8], { type: mime }));
        } catch (e) {
          reject(e);
        }
        return;
      }
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob returned null'));
      }, mime, quality);
    });
  }

  function showResult(blob, originalFile) {
    const url = URL.createObjectURL(blob);
    if (previewBefore && !previewBefore.src) {
      // ensure before preview shows original if not already set
      previewBefore.src = URL.createObjectURL(originalFile);
    }
    preview.src = url;
    downloadLink.href = url;
    downloadLink.download = `compressed${mimeToExtension(blob.type || originalFile.type)}`;
    downloadLink.style.display = 'inline-block';
    const savedPct = originalFile.size ? Math.round((1 - blob.size / originalFile.size) * 100) : 0;
    info.innerHTML = `Original: ${formatBytes(originalFile.size)} • Compressed: ${formatBytes(blob.size)} • Saved: ${savedPct}% • Type: ${blob.type}`;
    if (statusEl) statusEl.textContent = `Saved ${savedPct}%`;
    // show preview with Tailwind animation classes
    if (preview) setTimeout(()=> { preview.classList.remove('opacity-0','translate-y-2'); preview.classList.add('opacity-100','translate-y-0'); }, 40);
    if (previewBefore) setTimeout(()=> { previewBefore.classList.remove('opacity-0','translate-y-2'); previewBefore.classList.add('opacity-100','translate-y-0'); }, 40);
  }

  function mimeToExtension(mime) {
    if (!mime) return '';
    if (mime.includes('jpeg')) return '.jpg';
    if (mime.includes('png')) return '.png';
    if (mime.includes('webp')) return '.webp';
    if (mime.includes('svg')) return '.svg';
    return '';
  }

  // --- Extra UI helpers moved from inline scripts in index.html ---
  (function initExtras(){
    const safe = fn => { try { fn(); } catch (e) { console.warn('initExtras error', e); } };

    // Mobile menu
    safe(() => {
      const toggle = document.getElementById('navToggle');
      const menu = document.getElementById('mobileMenu');
      if (toggle && menu) {

        // open / close menu on hamburger click with smooth transition
        toggle.addEventListener('click', () => {
          menu.classList.toggle('mobile-menu-open');
          const isOpen = menu.classList.contains('mobile-menu-open');
          document.body.classList.toggle('nav-open', isOpen);
        });

        // close menu when any link inside mobile menu is clicked
        const links = menu.querySelectorAll('a[href^="#"]');
        links.forEach(link => {
          link.addEventListener('click', () => {
            menu.classList.remove('mobile-menu-open');
            document.body.classList.remove('nav-open');
          });
        });
      }
    });

    // Example result card animation (numbers + bars on page load)
    safe(() => {
      const card = document.getElementById('exampleCard');
      if (!card) return;

      const originalSizeEl = document.getElementById('exampleOriginalSize');
      const compressedSizeEl = document.getElementById('exampleCompressedSize');
      const badgeEl = document.getElementById('exampleSavedBadge');
      const originalBar = document.getElementById('exampleOriginalBar');
      const compressedBar = document.getElementById('exampleCompressedBar');
      if (!originalSizeEl || !compressedSizeEl || !badgeEl || !originalBar || !compressedBar) return;

      const parseTarget = (el, attr, fallback) => {
        const v = el.getAttribute(attr);
        const n = v != null ? Number(v) : NaN;
        return Number.isFinite(n) ? n : fallback;
      };

      const originalTarget = parseTarget(originalSizeEl, 'data-target-value', 3.4);
      const compressedTarget = parseTarget(compressedSizeEl, 'data-target-value', 0.9);
      const savedTarget = parseTarget(badgeEl, 'data-target-percent', 73);

      const originalBarTarget = 92; // approx 11/12
      const compressedBarTarget = 33; // approx 1/3

      const duration = 1100;

      const animateValue = (updateFn, from, to, unitSuffix = '', decimals = 1) => {
        const start = performance.now();
        const diff = to - from;
        const step = (now) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          const val = from + diff * eased;
          updateFn(val.toFixed(decimals) + unitSuffix);
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };

      const animatePercent = (updateFn, to) => {
        const start = performance.now();
        const diff = to;
        const step = (now) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          const val = Math.round(diff * eased);
          updateFn(val);
          if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      };

      // Start counters slightly after load to feel smoother
      setTimeout(() => {
        animateValue((text) => { originalSizeEl.textContent = text + ' MB'; }, 0, originalTarget, '', 1);
        animateValue((text) => { compressedSizeEl.textContent = text + ' MB'; }, 0, compressedTarget, '', 1);
        animatePercent((val) => { badgeEl.textContent = `-${val}% size`; }, savedTarget);

        animatePercent((val) => { originalBar.style.width = `${val * originalBarTarget / savedTarget}%`; }, savedTarget);
        animatePercent((val) => { compressedBar.style.width = `${val * compressedBarTarget / savedTarget}%`; }, savedTarget);
      }, 150);
    });

    // Drop area + sample loader
    safe(() => {
      const drop = document.getElementById('dropArea');
      const setFileFromResponse = async (res, filename='sample.jpg') => {
        const blob = await res.blob(); 
        const file = new File([blob], filename, { type: blob.type }); 
        const dt = new DataTransfer(); 
        dt.items.add(file);
        fileInput.files = dt.files; 
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const loadSample = url => fetch(url).then(res => { if (!res.ok) throw new Error('Network'); return setFileFromResponse(res); }).catch(() => alert('Unable to load sample image'));
      ['sample1','sample2','sample3'].forEach((id, i) => { const b = document.getElementById(id); if (b) b.addEventListener('click', () => loadSample(['https://picsum.photos/1200/800','https://picsum.photos/1000/700','https://picsum.photos/900/600'][i])); });
      if (drop) {
        drop.addEventListener('click', () => fileInput && fileInput.click());
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
        drop.addEventListener('dragleave', e => { e.preventDefault(); drop.classList.remove('dragover'); });
        drop.addEventListener('drop', e => {
          e.preventDefault();
          drop.classList.remove('dragover');
          const files = e.dataTransfer && e.dataTransfer.files;
          if (files && files.length) {
            const dt = new DataTransfer();
            Array.from(files).forEach(f => dt.items.add(f));
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        drop.tabIndex = 0; 
        drop.addEventListener('keydown', (e) => { 
          if (e.key === 'Enter' || e.key === ' ') { 
            e.preventDefault(); 
            fileInput && fileInput.click(); 
          } 
        });
      }
    });

    // UI helpers (quality display + button state)
    safe(() => {
      const sync = () => { if (qualityRange && qualityValue) qualityValue.textContent = Number(qualityRange.value).toFixed(2); };
      const setState = dis => { if (!compressBtn) return; compressBtn.disabled = !!dis; compressBtn.setAttribute('aria-disabled', !!dis); compressBtn.classList.toggle('cursor-not-allowed', !!dis); compressBtn.classList.toggle('opacity-50', !!dis); compressBtn.classList.toggle('cursor-pointer', !dis); compressBtn.classList.toggle('opacity-100', !dis); };
      sync(); setState(!(fileInput && fileInput.files && fileInput.files.length > 0)); if (qualityRange) qualityRange.addEventListener('input', sync); if (fileInput) fileInput.addEventListener('change', () => setState(!(fileInput.files && fileInput.files.length > 0)));
    });

    // Custom output format dropdown + tiles: click to select
    safe(() => {
      const select = document.getElementById('formatSelect');
      const tiles = document.querySelectorAll('.format-tile');
      const toggle = document.getElementById('formatDropdownToggle');
      const menu = document.getElementById('formatDropdownMenu');
      const labelEl = document.getElementById('formatDropdownLabel');
      const opts = menu ? menu.querySelectorAll('.format-dropdown-option') : [];
      if (!select || !toggle || !menu || !labelEl) return;

      const syncLabelFromSelect = () => {
        const opt = select.options[select.selectedIndex];
        if (opt && labelEl) labelEl.textContent = opt.textContent || opt.text || opt.value;
      };

      const closeMenu = () => { menu.classList.add('hidden'); };
      const openMenu = () => { menu.classList.remove('hidden'); };

      toggle.addEventListener('click', () => {
        if (menu.classList.contains('hidden')) openMenu(); else closeMenu();
      });

      opts.forEach(btn => {
        btn.addEventListener('click', () => {
          const v = btn.getAttribute('data-value');
          if (!v) return;
          select.value = v;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          closeMenu();
        });
      });

      document.addEventListener('click', (e) => {
        if (!menu || menu.classList.contains('hidden')) return;
        if (toggle.contains(e.target) || menu.contains(e.target)) return;
        closeMenu();
      });

      select.addEventListener('change', () => {
        syncLabelFromSelect();
        // highlight tile matching current value
        const value = select.value;
        tiles.forEach(x => {
          const fmt = x.getAttribute('data-format');
          x.classList.toggle('bg-green-600', fmt === value);
          x.classList.toggle('text-white', fmt === value);
        });
      });

      // initial label
      syncLabelFromSelect();

      // tiles click: update select (and label via change listener)
      if (tiles && tiles.length) {
        tiles.forEach(t => t.addEventListener('click', () => {
          const fmt = t.getAttribute('data-format');
          if (!fmt) return;
          select.value = fmt;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }));
      }
    });

    // Dynamic current year in footer
    safe(() => {
      const yearEls = document.querySelectorAll('[data-current-year]');
      if (!yearEls || !yearEls.length) return;
      const y = new Date().getFullYear();
      yearEls.forEach(el => { el.textContent = y; });
    });

    // FAQ accordion: ensure only one is open at a time, animate open/close, and keep chevrons on the right
    safe(() => {
      const container = document.getElementById('faqs');
      if (!container) return;
      const items = Array.from(container.querySelectorAll('details'));
      if (!items.length) return;

      items.forEach(d => {
        const body = d.querySelector('.faq-body');
        if (body) {
          body.style.overflow = 'hidden';
          body.style.transition = 'max-height 300ms ease, opacity 220ms ease';
          if (d.open) {
            body.style.maxHeight = body.scrollHeight + 'px';
            body.style.opacity = '1';
          } else {
            body.style.maxHeight = '0';
            body.style.opacity = '0';
          }
        }

        d.addEventListener('toggle', () => {
          if (d.open) {
            // close others
            items.forEach(o => {
              if (o !== d && o.open) {
                o.open = false;
                const ob = o.querySelector('.faq-body');
                if (ob) { ob.style.maxHeight = '0'; ob.style.opacity = '0'; }
              }
            });
            // open this one (animate to its scrollHeight)
            if (body) { body.style.maxHeight = body.scrollHeight + 'px'; body.style.opacity = '1'; }
          } else {
            if (body) { body.style.maxHeight = '0'; body.style.opacity = '0'; }
          }
        });
      });
    });
  })();

})();