import React, { useState, useRef, useCallback, useEffect } from 'react';

// =================================================================
// Matches the game's tile geometry exactly:
// 39x30 art, pointy-top hex, ~24px top face + 6px depth skirt below.
// =================================================================

const GRID_W = 39;
const GRID_H = 30;
const ZOOM = 12; // pixels-per-cell on screen

const TOP_FACE_H = 24;
const SKIRT_H = GRID_H - TOP_FACE_H; // 6

// Pointy-top hex mask: which (x,y) cells count as "inside" the top face
// outline, used both for the drawing guide and to grey out/dim cells
// outside the tile shape. Derived geometrically from a pointy-top hex
// centered in the top-face region.
function buildHexMask() {
  const cx = GRID_W / 2;
  const cy = TOP_FACE_H / 2;
  const rx = GRID_W / 2 - 0.5;
  const ry = TOP_FACE_H / 2 - 0.5;
  const mask = [];
  for (let y = 0; y < GRID_H; y++) {
    const row = [];
    for (let x = 0; x < GRID_W; x++) {
      if (y >= TOP_FACE_H) {
        // skirt region: roughly trapezoidal, narrower than the full top face
        const skirtProgress = (y - TOP_FACE_H) / SKIRT_H;
        const inset = rx * 0.25 * skirtProgress;
        const dx = Math.abs(x + 0.5 - cx);
        row.push(dx <= rx - inset ? 1 : 0);
      } else {
        // top face: pointy-top hexagon approximation via 6 edges
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const inside =
          Math.abs(dx) <= 1 &&
          Math.abs(dy) <= 1 &&
          Math.abs(dx) + 0.55 * Math.abs(dy) <= 1.05;
        row.push(inside ? 1 : 0);
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

export default function HexTileEditor() {
  const [grid, setGrid] = useState(makeBlankGrid);
  const [color, setColor] = useState("#8a8278");
  const [tool, setTool] = useState("pencil"); // pencil | eraser | fill | picker
  const [showGrid, setShowGrid] = useState(true);
  const [showMask, setShowMask] = useState(true);
  const [history, setHistory] = useState([]);
  const [exportStr, setExportStr] = useState("");
  const [exportImg, setExportImg] = useState(null);
  const isDrawing = useRef(false);
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
      if (tool === "pencil") return setCell(g, x, y, color);
      if (tool === "eraser") return setCell(g, x, y, null);
      if (tool === "fill") {
        const target = g[y]?.[x] ?? null;
        return floodFill(g, x, y, target, color);
      }
      if (tool === "picker") {
        const picked = g[y]?.[x];
        if (picked) setColor(picked);
        return g;
      }
      return g;
    });
  }

  function cellFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = Math.floor((clientX - rect.left) / ZOOM);
    const y = Math.floor((clientY - rect.top) / ZOOM);
    return { x, y };
  }

  function handlePointerDown(e) {
    e.preventDefault();
    isDrawing.current = true;
    const { x, y } = cellFromEvent(e);
    applyTool(x, y, true);
  }
  function handlePointerMove(e) {
    if (!isDrawing.current) return;
    e.preventDefault();
    const { x, y } = cellFromEvent(e);
    applyTool(x, y, false);
  }
  function handlePointerUp() {
    isDrawing.current = false;
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
      for (let y = 0; y < GRID_H; y++) {
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

  // ---------------- Render grid ----------------

  return (
    <div style={styles.root}>
      <style>{fontImports}</style>
      <header style={styles.header}>
        <span style={styles.headerStamp}>TILE FABRICATOR</span>
        <span style={styles.headerSub}>39×30 · pointy-top hex · 24px face / 6px skirt</span>
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
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
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

            {/* Skirt boundary line */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: TOP_FACE_H * ZOOM,
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
            <span style={{ color: COLORS.brass }}>top face</span> above the rust line ·{" "}
            <span style={{ color: COLORS.rust }}>skirt</span> below
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
};
