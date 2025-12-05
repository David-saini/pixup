# PixUp Conversion Server

This small server accepts image uploads and converts them to common formats using `sharp`.

Supported output formats: `jpeg`, `png`, `webp`, `avif`, `tiff`, `heif` (if libvips supports HEIF on your system).

Quick start (PowerShell on Windows):

```powershell
cd server
npm install
npm start
```

The conversion endpoint:

POST /convert
- form-data fields:
  - `file` (file) — the uploaded file
  - `format` (string) — desired output format (`image/png` or `png` or `image/jpeg`, etc.)
  - `quality` (0.0-1.0, optional) — desired quality (mapped to 1-100)
  - `maxWidth` (int, optional) — maximum output width in pixels

Response: converted image as an attachment on success, or a 4xx/5xx error with explanation.

Notes:
- Some proprietary RAW formats or less-common types may still require system tools (ImageMagick, libraw) to be fully supported.
- If you need broader format coverage, we can add ImageMagick integration, but that requires installing the ImageMagick binary on the host system.
