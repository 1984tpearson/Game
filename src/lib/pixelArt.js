// =================================================================
// Shared pixel-art logic, used by both tile mode (fixed 39x33 hex
// canvas) and object mode (variable-size canvas) in the Pixel Editor.
// Nothing here assumes a particular grid size — every function takes
// width/height or operates on an already-sized grid array, so the same
// code drives both editing modes without duplication.
// =================================================================

// ---------------- Grid helpers ----------------

export function makeBlankGrid(width, height) {
  return Array.from({ length: height }, () => Array(width).fill(null));
}

export function cloneGrid(g) {
  return g.map((row) => [...row]);
}

export function setCell(g, x, y, val, width, height) {
  if (x < 0 || y < 0 || x >= width || y >= height) return g;
  if (g[y][x] === val) return g;
  const next = cloneGrid(g);
  next[y][x] = val;
  return next;
}

export function floodFill(g, x, y, target, replacement, width, height) {
  if (target === replacement) return g;
  const next = cloneGrid(g);
  const stack = [[x, y]];
  while (stack.length) {
    const [cx, cy] = stack.pop();
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    if (next[cy][cx] !== target) continue;
    next[cy][cx] = replacement;
    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }
  return next;
}

// ---------------- PNG encode / decode ----------------
// The inverse of each other: paint a grid onto an offscreen canvas and
// export as a data URL, or decode a data URL back into a grid array.

export function gridToDataUrl(grid, width, height, canvasEl) {
  const canvas = canvasEl || document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  // Use putImageData for pixel-perfect alpha support. ctx.fillStyle with
  // an 8-digit hex colour is not reliably supported in all browsers, so
  // we write RGBA bytes directly into an ImageData buffer instead.
  const imgData = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = grid[y][x];
      if (!c) continue;
      const i = (y * width + x) * 4;
      imgData.data[i]     = parseInt(c.slice(1, 3), 16);
      imgData.data[i + 1] = parseInt(c.slice(3, 5), 16);
      imgData.data[i + 2] = parseInt(c.slice(5, 7), 16);
      // 8-digit hex (#rrggbbaa) carries alpha; 6-digit is fully opaque.
      imgData.data[i + 3] = c.length === 9 ? parseInt(c.slice(7, 9), 16) : 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

export function decodeImageToGrid(dataUrl, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      let pixels;
      try {
        pixels = ctx.getImageData(0, 0, width, height).data;
      } catch (e) {
        reject(e);
        return;
      }
      const grid = makeBlankGrid(width, height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const a = pixels[i + 3];
          if (a === 0) {
            grid[y][x] = null;
          } else {
            const r = pixels[i].toString(16).padStart(2, "0");
            const g = pixels[i + 1].toString(16).padStart(2, "0");
            const b = pixels[i + 2].toString(16).padStart(2, "0");
            // Preserve partial alpha (e.g. semi-transparent shadow pixels).
            // Fully opaque pixels stay as 6-digit hex so existing logic is unchanged.
            if (a === 255) {
              grid[y][x] = `#${r}${g}${b}`;
            } else {
              const aa = a.toString(16).padStart(2, "0");
              grid[y][x] = `#${r}${g}${b}${aa}`;
            }
          }
        }
      }
      resolve(grid);
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ---------------- Color math ----------------

export function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Nudges a color's lightness and saturation slightly, with only a small
// hue drift, so a jittered green stays recognizably green rather than
// drifting toward an unrelated hue. `amount` (1-40) scales hue drift
// gently and light/saturation drift more noticeably, for a hand-painted
// texture feel without color-shifting the palette choice.
export function jitterColor(hex, amount = 12) {
  const { h, s, l } = hexToHsl(hex);
  const hueDrift = (amount / 40) * 6;
  const slDrift = (amount / 40) * 14;
  const nh = h + (Math.random() - 0.5) * 2 * hueDrift;
  const ns = s + (Math.random() - 0.5) * 2 * slDrift;
  const nl = l + (Math.random() - 0.5) * 2 * slDrift;
  return hslToHex(nh, ns, nl);
}

// Darkens a hex color by a fixed percentage (multiplicative on
// lightness, default 25%), for the shadow tool. Multiplicative rather
// than subtracting a flat amount keeps the darkening proportional
// regardless of how light/dark the original is.
export function darkenColor(hex, factor = 0.25) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, l * (1 - factor));
}

// ---------------- Brush / line / ellipse cell math ----------------

// Returns the set of {x,y} cells covered by a brush of the given size
// centered at (cx,cy). Size 1 = single pixel, larger sizes grow as a
// small square brush (simplest predictable shape at small pixel-art
// sizes — a true circle brush looks lumpy/inconsistent below ~5px).
export function brushCells(cx, cy, size) {
  const cells = [];
  const half = Math.floor(size / 2);
  for (let dy = -half; dy < size - half; dy++) {
    for (let dx = -half; dx < size - half; dx++) {
      cells.push({ x: cx + dx, y: cy + dy });
    }
  }
  return cells;
}

// Bresenham line algorithm: returns every grid cell on the straight
// line between two points, used by the line tool's preview and commit.
export function lineCells(x0, y0, x1, y1) {
  const cells = [];
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    cells.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}

// Midpoint ellipse algorithm. `yRatio` lets callers squash the vertical
// radius (e.g. tile mode uses ~0.615 so circles read as lying flat on
// the iso-projected hex surface); defaults to 1 (a true circle), which
// is what object mode wants since objects aren't drawn on a foreshortened
// surface. Returns the outline cells (not filled) — a hollow ellipse,
// matching how the pencil/line tools work (build up fills with Fill).
export function ellipseCells(cx, cy, radiusX, yRatio = 1) {
  const radiusY = Math.max(1, Math.round(radiusX * yRatio));
  const cells = new Set();
  const addCell = (x, y) => cells.add(`${x},${y}`);
  let x = 0;
  let y = radiusY;
  let rxSq = radiusX * radiusX;
  let rySq = radiusY * radiusY;
  let d1 = rySq - rxSq * radiusY + 0.25 * rxSq;
  let dx = 2 * rySq * x;
  let dy = 2 * rxSq * y;
  while (dx < dy) {
    addCell(cx + x, cy + y); addCell(cx - x, cy + y);
    addCell(cx + x, cy - y); addCell(cx - x, cy - y);
    if (d1 < 0) {
      x++;
      dx += 2 * rySq;
      d1 += dx + rySq;
    } else {
      x++;
      y--;
      dx += 2 * rySq;
      dy -= 2 * rxSq;
      d1 += dx - dy + rySq;
    }
  }
  let d2 = rySq * (x + 0.5) * (x + 0.5) + rxSq * (y - 1) * (y - 1) - rxSq * rySq;
  while (y >= 0) {
    addCell(cx + x, cy + y); addCell(cx - x, cy + y);
    addCell(cx + x, cy - y); addCell(cx - x, cy - y);
    if (d2 > 0) {
      y--;
      dy -= 2 * rxSq;
      d2 += rxSq - dy;
    } else {
      y--;
      x++;
      dx += 2 * rySq;
      dy -= 2 * rxSq;
      d2 += dx - dy + rxSq;
    }
  }
  return [...cells].map((s) => {
    const [px, py] = s.split(",").map(Number);
    return { x: px, y: py };
  });
}

// ---------------- Shared palette ----------------

export const PALETTE = [
  "#000000", "#0c0a08", "#15120e", "#1c1812",
  "#2a2419", "#332c22", "#3a3225", "#4a4540",
  "#6b6258", "#8a8278", "#9c9078", "#b3a890",
  "#c4b8a0", "#d4c8b0", "#e8dcc4", "#ffffff",

  "#5c4630", "#6e5238", "#7a5c3e", "#8a6a48",
  "#4a3826", "#3a2c1e", "#2c2014", "#1a140c",

  "#8a3324", "#a8462f", "#6b2a1e", "#5a2418",
  "#7a4030", "#9c5a44", "#4a1e14", "#3a1810",

  "#7a5424", "#9c6e30", "#5a3e1a", "#b3823c",
  "#6e4a20", "#8a6230",

  "#c4a747", "#7a6a3a", "#9c8a4a", "#5a4e2a",
  "#b39a52", "#8a7838",

  "#3d4a3a", "#5a6b52", "#4a5c44", "#2c3826",
  "#6e7a5e", "#384430",

  "#3a4a52", "#4a5c64", "#2a363c", "#5c6e74",
  "#3c4e58", "#243038",

  "#4a3a4a", "#5c4858", "#3a2e3a", "#6e5868",
  "#42323e",
];

export const PALETTE_ROW_LABELS = [
  { label: "tones", count: 16 },
  { label: "browns", count: 8 },
  { label: "reds", count: 8 },
  { label: "oranges", count: 6 },
  { label: "yellows", count: 6 },
  { label: "greens", count: 6 },
  { label: "blues", count: 6 },
  { label: "purples", count: 5 },
];
