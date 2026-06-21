import React, { useState, useRef, useCallback, useEffect } from 'react';
import { saveTile } from '../lib/tiles.js';

// =================================================================
// Matches the game's tile geometry exactly:
// 39x30 art, pointy-top hex, ~24px top face + 6px depth skirt below.
// =================================================================

const GRID_W = 39;
const HEADROOM_H = 3; // extra space above the top face for tall art (grass, etc) to poke into
const TOP_FACE_H = 24;
const SKIRT_H = 6;
const GRID_H = HEADROOM_H + TOP_FACE_H + SKIRT_H; // 33
const ZOOM = 12; // pixels-per-cell on screen

// Pointy-top hex mask: which (x,y) cells count as "inside" the top face
// outline, used both for the drawing guide and to grey out/dim cells
// outside the tile shape. The headroom band above the top face is left
// fully open/undimmed (no mask) since it's free space for tall art like
// grass to extend into.
//
// Built from actual hexagon vertices (point-in-polygon test) rather than
// an approximated inequality — a pointy-top hex has single points at the
// top and bottom, with flat vertical edges on the left/right connecting
// them. An earlier version of this mask used a distance-based formula
// that produced flat top/bottom edges instead (the opposite shape).
function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function buildHexMask() {
  const cx = GRID_W / 2;
  const cy = HEADROOM_H + TOP_FACE_H / 2;
  const halfW = GRID_W / 2;
  const halfH = TOP_FACE_H / 2;

  // Pointy-top hex vertices: a single point at top, a single point at
  // bottom, flat vertical edges on the left and right in between.
  const hexVerts = [
    [cx, cy - halfH], // top point
    [cx + halfW, cy - halfH / 2], // upper-right
    [cx + halfW, cy + halfH / 2], // lower-right
    [cx, cy + halfH], // bottom point
    [cx - halfW, cy + halfH / 2], // lower-left
    [cx - halfW, cy - halfH / 2], // upper-left
  ];

  const mask = [];
  for (let y = 0; y < GRID_H; y++) {
    const row = [];
    for (let x = 0; x < GRID_W; x++) {
      if (y < HEADROOM_H) {
        // headroom band: always "inside" (undimmed), free drawing space
        row.push(1);
      } else if (y >= HEADROOM_H + TOP_FACE_H) {
        // skirt region: roughly trapezoidal, narrower than the full top face
        const skirtProgress = (y - (HEADROOM_H + TOP_FACE_H)) / SKIRT_H;
        const inset = halfW * 0.25 * skirtProgress;
        const dx = Math.abs(x + 0.5 - cx);
        row.push(dx <= halfW - inset ? 1 : 0);
      } else {
        row.push(pointInPolygon(x + 0.5, y + 0.5, hexVerts) ? 1 : 0);
      }
    }
    mask.push(row);
  }
  return mask;
}

const HEX_MASK = buildHexMask();

const PALETTE = [
  // greyscale / brown ramp — structure, shading, base tones
  "#000000", "#0c0a08", "#15120e", "#1c1812",
  "#2a2419", "#332c22", "#3a3225", "#4a4540",
  "#6b6258", "#8a8278", "#9c9078", "#b3a890",
  "#c4b8a0", "#d4c8b0", "#e8dcc4", "#ffffff",

  // browns / tans — leather, wood, rust dust, dirt
  "#5c4630", "#6e5238", "#7a5c3e", "#8a6a48",
  "#4a3826", "#3a2c1e", "#2c2014", "#1a140c",

  // dulled reds / rust — the game's existing accent family, extended
  "#8a3324", "#a8462f", "#6b2a1e", "#5a2418",
  "#7a4030", "#9c5a44", "#4a1e14", "#3a1810",

  // dulled oranges / ochres
  "#7a5424", "#9c6e30", "#5a3e1a", "#b3823c",
  "#6e4a20", "#8a6230",

  // dulled yellows / mustards
  "#c4a747", "#7a6a3a", "#9c8a4a", "#5a4e2a",
  "#b39a52", "#8a7838",

  // dulled greens — verdigris, mould, old copper
  "#3d4a3a", "#5a6b52", "#4a5c44", "#2c3826",
  "#6e7a5e", "#384430",

  // dulled blues / steel — cold metal, shadow tones
  "#3a4a52", "#4a5c64", "#2a363c", "#5c6e74",
  "#3c4e58", "#243038",

  // dulled purples — bruised, oxidized, alien-tech accents
  "#4a3a4a", "#5c4858", "#3a2e3a", "#6e5868",
  "#42323e",
];

const PALETTE_ROW_LABELS = [
  { label: "tones", count: 16 },
  { label: "browns", count: 8 },
  { label: "reds", count: 8 },
  { label: "oranges", count: 6 },
  { label: "yellows", count: 6 },
  { label: "greens", count: 6 },
  { label: "blues", count: 6 },
  { label: "purples", count: 5 },
];

function makeBlankGrid() {
  return Array.from({ length: GRID_H }, () => Array(GRID_W).fill(null));
}

// Converts a hex color to HSL ({h: 0-360, s: 0-100, l: 0-100}).
function hexToHsl(hex) {
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

// Converts HSL back to a hex color string.
function hslToHex(h, s, l) {
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
  const toHex = (v) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Nudges a color's lightness and saturation slightly, with only a small hue
// drift, so a jittered green stays recognizably green rather than drifting
// toward an unrelated hue. `amount` (1-40 from the slider) scales hue drift
// gently and light/saturation drift more noticeably, for a hand-painted
// texture feel without color-shifting the palette choice.
function jitterColor(hex, amount = 12) {
  const { h, s, l } = hexToHsl(hex);
  const hueDrift = (amount / 40) * 6; // small: max ~6 degrees at full slider
  const slDrift = (amount / 40) * 14; // larger: max ~14 points at full slider
  const nh = h + (Math.random() - 0.5) * 2 * hueDrift;
  const ns = s + (Math.random() - 0.5) * 2 * slDrift;
  const nl = l + (Math.random() - 0.5) * 2 * slDrift;
  return hslToHex(nh, ns, nl);
}

// Darkens a hex color by a fixed 25% (multiplicative on lightness), for the
// shadow tool. Multiplicative rather than subtracting a flat amount keeps
// the darkening proportional regardless of how light/dark the original is.
function darkenColor(hex, factor = 0.25) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, l * (1 - factor));
}

export default function HexTileEditor() {
  const [grid, setGrid] = useState(makeBlankGrid);
  const [color, setColor] = useState("#8a8278");
  const [tool, setTool] = useState("pencil"); // pencil | eraser | fill | picker | shadow
  const [showGrid, setShowGrid] = useState(true);
  const [showMask, setShowMask] = useState(true);
  const [jitterEnabled, setJitterEnabled] = useState(false);
  const [jitterAmount, setJitterAmount] = useState(12);
  const [preserveTransparency, setPreserveTransparency] = useState(false);
  const [history, setHistory] = useState([]);
  const [exportStr, setExportStr] = useState("");
  const [exportImg, setExportImg] = useState(null);
  const [tileName, setTileName] = useState("");
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState(null);
  const isDrawing = useRef(false);
  const shadowedThisStroke = useRef(new Set());
  const canvasRef = useRef(null);
  const exportCanvasRef = useRef(null);

  const pushHistory = useCallback((g) => {
    setHistory((h) => [...h.slice(-19), g]);
  }, []);

  function cloneGrid(g) {
    return g.map((row) => [...row]);
  }

  function setCell(g, x, y, val) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return g;
    if (g[y][x] === val) return g;
    const next = cloneGrid(g);
    next[y][x] = val;
    return next;
  }

  function floodFill(g, x, y, target, replacement) {
    if (target === replacement) return g;
    const next = cloneGrid(g);
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_H) continue;
      if (next[cy][cx] !== target) continue;
      next[cy][cx] = replacement;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return next;
  }

  function applyTool(x, y, isStart) {
    setGrid((g) => {
      if (isStart) pushHistory(g);
      const existing = g[y]?.[x] ?? null;

      if (tool === "pencil") {
        if (preserveTransparency && existing === null) return g;
        const paintColor = jitterEnabled ? jitterColor(color, jitterAmount) : color;
        return setCell(g, x, y, paintColor);
      }
      if (tool === "eraser") {
        if (preserveTransparency) return g; // nothing to erase onto transparent without removing it
        return setCell(g, x, y, null);
      }
      if (tool === "shadow") {
        // Darkens whatever's already painted there, but only once per
        // continuous stroke — dragging back and forth over the same
        // pixel within one drag won't keep stacking darkness. Does
        // nothing on empty cells, regardless of preserveTransparency.
        if (existing === null) return g;
        const cellKey = `${x},${y}`;
        if (shadowedThisStroke.current.has(cellKey)) return g;
        shadowedThisStroke.current.add(cellKey);
        return setCell(g, x, y, darkenColor(existing));
      }
      if (tool === "fill") {
        if (preserveTransparency && existing === null) return g;
        const target = existing;
        const paintColor = jitterEnabled ? jitterColor(color, jitterAmount) : color;
        return floodFill(g, x, y, target, paintColor);
      }
      if (tool === "picker") {
        const picked = existing;
        if (picked) setColor(picked);
        return g;
      }
      return g;
    });
  }

  function cellFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / ZOOM);
    const y = Math.floor((e.clientY - rect.top) / ZOOM);
    return { x, y };
  }

  // Pointer Events (not separate mouse/touch handlers) unify mouse, touch,
  // and stylus input in one model and respect touch-action more reliably
  // across browsers — in particular, Safari/iPadOS doesn't always honor
  // touch-action:none for Apple Pencil input routed through legacy touch
  // handlers, which let the page scroll mid-stroke. Pointer events fix this.
  function handlePointerDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    isDrawing.current = true;
    shadowedThisStroke.current = new Set();
    const { x, y } = cellFromEvent(e);
    applyTool(x, y, true);
  }
  function handlePointerMove(e) {
    if (!isDrawing.current) return;
    e.preventDefault();
    const { x, y } = cellFromEvent(e);
    applyTool(x, y, false);
  }
  function handlePointerUp(e) {
    isDrawing.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  function undo() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setGrid(prev);
      return h.slice(0, -1);
    });
  }

  function clearAll() {
    pushHistory(grid);
    setGrid(makeBlankGrid());
  }

  function fillMaskOutline() {
    pushHistory(grid);
    setGrid((g) => {
      const next = cloneGrid(g);
      for (let y = HEADROOM_H; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          if (HEX_MASK[y][x] && !next[y][x]) next[y][x] = "#3a3225";
        }
      }
      return next;
    });
  }

  // ---------------- Export ----------------

  function generateExport() {
    const canvas = exportCanvasRef.current;
    canvas.width = GRID_W;
    canvas.height = GRID_H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, GRID_W, GRID_H);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const c = grid[y][x];
        if (c) {
          ctx.fillStyle = c;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    const dataUrl = canvas.toDataURL("image/png");
    setExportImg(dataUrl);
    const b64 = dataUrl.split(",")[1];
    setExportStr(`const HEX_TILE_IMG = "data:image/png;base64,${b64}";`);
  }

  function copyExport() {
    navigator.clipboard?.writeText(exportStr);
  }

  async function saveToLibrary() {
    if (!exportImg) return; // must Generate export first so we have a data URL
    if (!tileName.trim()) {
      setSaveStatus("error");
      setSaveError("Name your tile before saving.");
      return;
    }
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await saveTile({ name: tileName.trim(), imageDataUrl: exportImg });
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus("error");
      setSaveError(e.message || "Save failed.");
    }
  }

  // ---------------- Render grid ----------------

  return (
    <div style={styles.root}>
      <style>{fontImports}</style>
      <header style={styles.header}>
        <span style={styles.headerStamp}>TILE FABRICATOR</span>
        <span style={styles.headerSub}>39×33 · pointy-top hex · 3px headroom / 24px face / 6px skirt</span>
      </header>

      <div style={styles.body}>
        <div style={styles.canvasWrap}>
          <div
            ref={canvasRef}
            style={{
              position: "relative",
              width: GRID_W * ZOOM,
              height: GRID_H * ZOOM,
              background: "#1a1611",
              touchAction: "none",
              cursor: "crosshair",
              border: `1px solid ${COLORS.border}`,
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {/* Mask dimming overlay for cells outside the hex shape */}
            {showMask &&
              grid.map((row, y) =>
                row.map((_, x) =>
                  HEX_MASK[y][x] ? null : (
                    <div
                      key={`mask-${x}-${y}`}
                      style={{
                        position: "absolute",
                        left: x * ZOOM,
                        top: y * ZOOM,
                        width: ZOOM,
                        height: ZOOM,
                        background: "rgba(0,0,0,0.55)",
                        pointerEvents: "none",
                      }}
                    />
                  )
                )
              )}

            {/* Painted cells */}
            {grid.map((row, y) =>
              row.map((c, x) =>
                c ? (
                  <div
                    key={`c-${x}-${y}`}
                    style={{
                      position: "absolute",
                      left: x * ZOOM,
                      top: y * ZOOM,
                      width: ZOOM,
                      height: ZOOM,
                      background: c,
                      pointerEvents: "none",
                    }}
                  />
                ) : null
              )
            )}

            {/* Headroom boundary line (top face starts here) */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: HEADROOM_H * ZOOM,
                width: GRID_W * ZOOM,
                height: 1,
                background: COLORS.brass,
                opacity: 0.45,
                pointerEvents: "none",
              }}
            />

            {/* Skirt boundary line */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: (HEADROOM_H + TOP_FACE_H) * ZOOM,
                width: GRID_W * ZOOM,
                height: 1,
                background: COLORS.rust,
                opacity: 0.6,
                pointerEvents: "none",
              }}
            />

            {/* Grid lines */}
            {showGrid && (
              <svg
                width={GRID_W * ZOOM}
                height={GRID_H * ZOOM}
                style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
              >
                {Array.from({ length: GRID_W + 1 }).map((_, i) => (
                  <line
                    key={`v-${i}`}
                    x1={i * ZOOM}
                    y1={0}
                    x2={i * ZOOM}
                    y2={GRID_H * ZOOM}
                    stroke="rgba(232,220,196,0.08)"
                    strokeWidth="1"
                  />
                ))}
                {Array.from({ length: GRID_H + 1 }).map((_, i) => (
                  <line
                    key={`h-${i}`}
                    x1={0}
                    y1={i * ZOOM}
                    x2={GRID_W * ZOOM}
                    y2={i * ZOOM}
                    stroke="rgba(232,220,196,0.08)"
                    strokeWidth="1"
                  />
                ))}
              </svg>
            )}
          </div>

          <div style={styles.canvasLabel}>
            <span style={{ color: COLORS.brass }}>top face</span> between the lines ·{" "}
            <span style={{ color: COLORS.rust }}>skirt</span> below · headroom above for tall art
          </div>
        </div>

        <div style={styles.sidebar}>
          <div style={styles.toolRow}>
            <button
              style={{ ...styles.toolBtn, ...(tool === "pencil" ? styles.toolBtnActive : {}) }}
              onClick={() => setTool("pencil")}
            >
              Pencil
            </button>
            <button
              style={{ ...styles.toolBtn, ...(tool === "eraser" ? styles.toolBtnActive : {}) }}
              onClick={() => setTool("eraser")}
            >
              Eraser
            </button>
          </div>
          <div style={styles.toolRow}>
            <button
              style={{ ...styles.toolBtn, ...(tool === "fill" ? styles.toolBtnActive : {}) }}
              onClick={() => setTool("fill")}
            >
              Fill
            </button>
            <button
              style={{ ...styles.toolBtn, ...(tool === "picker" ? styles.toolBtnActive : {}) }}
              onClick={() => setTool("picker")}
            >
              Picker
            </button>
          </div>
          <div style={styles.toolRow}>
            <button
              style={{ ...styles.toolBtn, ...(tool === "shadow" ? styles.toolBtnActive : {}) }}
              onClick={() => setTool("shadow")}
              title="Darkens existing painted pixels by 25%, capped once per stroke — does nothing on empty cells"
            >
              Shadow
            </button>
          </div>

          <div style={styles.sectionLabel}>color</div>
          {(() => {
            let offset = 0;
            return PALETTE_ROW_LABELS.map(({ label, count }) => {
              const slice = PALETTE.slice(offset, offset + count);
              offset += count;
              return (
                <div key={label} style={{ marginBottom: "6px" }}>
                  <div style={styles.swatchRowLabel}>{label}</div>
                  <div style={styles.swatchGrid}>
                    {slice.map((c, i) => (
                      <button
                        key={`${label}-${i}-${c}`}
                        onClick={() => setColor(c)}
                        title={c}
                        style={{
                          ...styles.swatch,
                          background: c,
                          outline: color === c ? `2px solid ${COLORS.brass}` : "1px solid #000",
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            });
          })()}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={styles.colorPicker}
          />

          <div style={styles.sectionLabel}>view</div>
          <label style={styles.checkRow}>
            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
            grid lines
          </label>
          <label style={styles.checkRow}>
            <input type="checkbox" checked={showMask} onChange={(e) => setShowMask(e.target.checked)} />
            dim outside hex
          </label>

          <div style={styles.sectionLabel}>paint behavior</div>
          <label style={styles.checkRow}>
            <input
              type="checkbox"
              checked={preserveTransparency}
              onChange={(e) => setPreserveTransparency(e.target.checked)}
            />
            preserve transparency
          </label>
          <label style={styles.checkRow}>
            <input type="checkbox" checked={jitterEnabled} onChange={(e) => setJitterEnabled(e.target.checked)} />
            randomize color (texture)
          </label>
          {jitterEnabled && (
            <div style={styles.jitterRow}>
              <input
                type="range"
                min="1"
                max="40"
                value={jitterAmount}
                onChange={(e) => setJitterAmount(Number(e.target.value))}
                style={styles.jitterSlider}
              />
              <span style={styles.jitterValue}>{jitterAmount}</span>
            </div>
          )}

          <div style={styles.sectionLabel}>actions</div>
          <button style={styles.actionBtn} onClick={undo}>Undo</button>
          <button style={styles.actionBtn} onClick={fillMaskOutline}>Fill hex outline</button>
          <button style={styles.actionBtn} onClick={clearAll}>Clear all</button>

          <div style={styles.sectionLabel}>export</div>
          <button style={styles.exportBtn} onClick={generateExport}>Generate export</button>
        </div>
      </div>

      {exportImg && (
        <div style={styles.exportPanel}>
          <div style={styles.exportPreviewRow}>
            <div>
              <div style={styles.exportLabel}>preview (actual size)</div>
              <img
                src={exportImg}
                alt="tile export"
                style={{ width: GRID_W, height: GRID_H, imageRendering: "pixelated", border: `1px solid ${COLORS.border}` }}
              />
            </div>
            <div>
              <div style={styles.exportLabel}>preview (6×, on dark)</div>
              <img
                src={exportImg}
                alt="tile export zoomed"
                style={{
                  width: GRID_W * 6,
                  height: GRID_H * 6,
                  imageRendering: "pixelated",
                  border: `1px solid ${COLORS.border}`,
                  background: "#0c0a08",
                }}
              />
            </div>
          </div>
          <div style={styles.exportLabel}>
            copy this and paste it into your game file, replacing the existing HEX_TILE_IMG line
          </div>
          <textarea readOnly value={exportStr} style={styles.exportTextarea} onClick={(e) => e.target.select()} />
          <button style={styles.exportBtn} onClick={copyExport}>Copy to clipboard</button>

          <div style={{ ...styles.exportLabel, marginTop: "14px" }}>
            or save this tile to the shared library, so it shows up in the Map Editor's tile picker
          </div>
          <input
            style={styles.textInput}
            value={tileName}
            onChange={(e) => {
              setTileName(e.target.value);
              setSaveStatus(null);
            }}
            placeholder="tile name (e.g. mossy stone, scorched metal)"
          />
          <button style={styles.exportBtn} onClick={saveToLibrary} disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? "Saving..." : "Save to library"}
          </button>
          {saveStatus === "saved" && (
            <div style={{ fontSize: "10px", color: COLORS.brass }}>Saved — available in the Map Editor now.</div>
          )}
          {saveStatus === "error" && (
            <div style={{ fontSize: "10px", color: COLORS.rust }}>{saveError}</div>
          )}
        </div>
      )}

      <canvas ref={exportCanvasRef} style={{ display: "none" }} />
    </div>
  );
}

// =================================================================
// STYLES
// =================================================================

const fontImports = `
@import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Space+Mono:wght@400;700&display=swap');
`;

const COLORS = {
  bg: "#0c0a08",
  panel: "#15120e",
  text: "#e8dcc4",
  textDim: "#9c9078",
  rust: "#8a3324",
  verdigris: "#3d4a3a",
  brass: "#c4a747",
  border: "#332c22",
};

const styles = {
  root: {
    background: COLORS.bg,
    color: COLORS.text,
    minHeight: "600px",
    fontFamily: "'Space Mono', monospace",
    border: `1px solid ${COLORS.border}`,
    padding: "0",
  },
  header: {
    padding: "12px 18px",
    borderBottom: `1px solid ${COLORS.border}`,
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "6px",
  },
  headerStamp: {
    fontFamily: "'Courier Prime', monospace",
    fontWeight: 700,
    letterSpacing: "0.08em",
    fontSize: "13px",
    color: COLORS.brass,
  },
  headerSub: {
    fontSize: "10px",
    color: COLORS.textDim,
    fontStyle: "italic",
  },
  body: {
    display: "flex",
    flexWrap: "wrap",
    gap: "20px",
    padding: "18px",
  },
  canvasWrap: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  canvasLabel: {
    fontSize: "10px",
    color: COLORS.textDim,
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: "260px",
    maxWidth: "260px",
  },
  toolRow: {
    display: "flex",
    gap: "6px",
  },
  toolBtn: {
    flex: 1,
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.textDim,
    padding: "8px",
    fontFamily: "'Space Mono', monospace",
    fontSize: "11px",
    cursor: "pointer",
  },
  toolBtnActive: {
    color: COLORS.brass,
    borderColor: COLORS.brass,
  },
  sectionLabel: {
    fontSize: "10px",
    color: COLORS.textDim,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginTop: "10px",
    marginBottom: "2px",
  },
  swatchRowLabel: {
    fontSize: "9px",
    color: COLORS.textDim,
    opacity: 0.7,
    marginBottom: "2px",
  },
  swatchGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(8, 1fr)",
    gap: "3px",
  },
  swatch: {
    width: "100%",
    aspectRatio: "1",
    border: "none",
    cursor: "pointer",
    borderRadius: "2px",
  },
  colorPicker: {
    marginTop: "6px",
    width: "100%",
    height: "32px",
    background: "transparent",
    border: `1px solid ${COLORS.border}`,
    cursor: "pointer",
  },
  checkRow: {
    fontSize: "11px",
    color: COLORS.textDim,
    display: "flex",
    alignItems: "center",
    gap: "6px",
  },
  jitterRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "4px",
    marginLeft: "20px",
  },
  jitterSlider: {
    flex: 1,
  },
  jitterValue: {
    fontSize: "10px",
    color: COLORS.brass,
    minWidth: "20px",
    textAlign: "right",
  },
  actionBtn: {
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.text,
    padding: "8px",
    fontFamily: "'Space Mono', monospace",
    fontSize: "11px",
    cursor: "pointer",
    textAlign: "left",
  },
  exportBtn: {
    background: COLORS.rust,
    border: "none",
    color: COLORS.text,
    padding: "10px",
    fontFamily: "'Space Mono', monospace",
    fontSize: "11px",
    cursor: "pointer",
  },
  exportPanel: {
    borderTop: `1px solid ${COLORS.border}`,
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  exportPreviewRow: {
    display: "flex",
    gap: "20px",
    alignItems: "flex-end",
  },
  exportLabel: {
    fontSize: "10px",
    color: COLORS.textDim,
    marginBottom: "4px",
  },
  exportTextarea: {
    width: "100%",
    height: "80px",
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.brass,
    fontFamily: "'Space Mono', monospace",
    fontSize: "10px",
    padding: "8px",
    resize: "vertical",
  },
  textInput: {
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.text,
    padding: "8px",
    fontFamily: "'Space Mono', monospace",
    fontSize: "12px",
    width: "100%",
  },
};
