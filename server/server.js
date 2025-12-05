const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors());

function normalizeFormat(format) {
  if (!format) return null;
  format = String(format).toLowerCase();
  // Accept mime types or short names
  if (format.includes('/')) {
    if (format.includes('jpeg') || format.includes('jpg')) return 'jpeg';
    if (format.includes('png')) return 'png';
    if (format.includes('webp')) return 'webp';
    if (format.includes('avif')) return 'avif';
    if (format.includes('tiff') || format.includes('tif')) return 'tiff';
    if (format.includes('heif') || format.includes('heic')) return 'heif';
  }
  // short names
  if (['jpg','jpeg'].includes(format)) return 'jpeg';
  if (['png'].includes(format)) return 'png';
  if (['webp'].includes(format)) return 'webp';
  if (['avif'].includes(format)) return 'avif';
  if (['tiff','tif'].includes(format)) return 'tiff';
  if (['heif','heic'].includes(format)) return 'heif';
  return null;
}

app.get('/health', (req, res) => res.send({ ok: true }));

app.post('/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded');
    const { buffer, originalname } = req.file;
    const { format, quality, maxWidth } = req.body;
    const q = quality ? Math.max(1, Math.min(100, Math.round(Number(quality) * 100))) : 80;
    const mw = maxWidth ? Number(maxWidth) : null;
    const normalized = normalizeFormat(format);

    if (!normalized) {
      return res.status(501).send('Requested output format is not supported by the server. Supported: jpeg,png,webp,avif,tiff,heif');
    }

    let img = sharp(buffer, { failOnError: false });
    if (mw) img = img.resize({ width: mw, withoutEnlargement: true });

    // Choose format and options
    let outBuffer;
    switch (normalized) {
      case 'jpeg':
        outBuffer = await img.jpeg({ quality: q }).toBuffer();
        res.type('image/jpeg');
        break;
      case 'png':
        outBuffer = await img.png().toBuffer();
        res.type('image/png');
        break;
      case 'webp':
        outBuffer = await img.webp({ quality: q }).toBuffer();
        res.type('image/webp');
        break;
      case 'avif':
        outBuffer = await img.avif({ quality: q }).toBuffer();
        res.type('image/avif');
        break;
      case 'tiff':
        outBuffer = await img.tiff({ quality: q }).toBuffer();
        res.type('image/tiff');
        break;
      case 'heif':
        // sharp supports heif if libvips has heif support
        outBuffer = await img.toFormat('heif', { quality: q }).toBuffer();
        res.type('image/heif');
        break;
      default:
        return res.status(501).send('Format handling not implemented');
    }

    res.setHeader('Content-Disposition', `attachment; filename="converted_${originalname.replace(/\.[^.]+$/, '')}.${normalized}"`);
    res.send(outBuffer);
  } catch (err) {
    console.error('Conversion error', err);
    res.status(500).send('Conversion failed: ' + (err.message || String(err)));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PixUp convert server listening on http://localhost:${PORT}`));
