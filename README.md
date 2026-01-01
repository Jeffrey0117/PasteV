# PasteV

Image text translation and recreation tool - OCR images, translate text, and recreate with customizable templates.

## Quick Start

```bash
# Install all dependencies (root, client, server)
npm run install:all

# Start development (frontend + backend together)
npm run dev
```

**URLs:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Project Structure

```
PasteV/
├── client/          # React frontend (Vite + TypeScript)
├── server/          # Express backend (TypeScript)
├── docs/            # Documentation
└── package.json     # Root scripts for concurrent dev
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend and backend concurrently |
| `npm run dev:client` | Start only frontend |
| `npm run dev:server` | Start only backend |
| `npm run install:all` | Install dependencies for all packages |

## Features

- **Image Upload**: Drag & drop or click to upload images
- **OCR**: Extract text from images using Tesseract
- **Translation**: Translate extracted text (EN -> 繁體中文)
- **Template System**:
  - Field templates with customizable position, font, color
  - Template static texts (apply to all images)
  - Per-image static texts (only current image)
- **Canvas Settings**: Width, height, background color/image with opacity
- **Export**: Single image or batch ZIP export

## Development Notes

### Backend Not Running?

If you see "Failed to fetch" error, the backend is not running. Always use:
```bash
npm run dev  # from root directory
```

This starts both servers. Don't run `cd client && npm run dev` alone.

### Port Conflicts

If ports are in use, Vite will auto-select next available port.
Check terminal output for actual URLs.

## Testing

```bash
# Run 5-agent concurrent stress test
npm run test:concurrent
```

This test simulates 5 users hitting the API simultaneously to verify:
- Health check endpoint
- Translation API (parallel requests)
- OCR API (parallel requests)

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, html2canvas, JSZip
- **Backend**: Express, TypeScript, Tesseract.js, OpenAI API
