import React, { useState, useRef, useCallback, useEffect } from 'react';
import { saveTile, listTiles, updateTile, deleteTile } from '../lib/tiles.js';
import {
  makeBlankGrid, cloneGrid, setCell, floodFill,
  gridToDataUrl, decodeImageToGrid,
  jitterColor, darkenColor, blendColor, replaceHue,
  brushCells, lineCells, ellipseCells,
  PALETTE, PALETTE_ROW_LABELS,
} from '../lib/pixelArt.js';

// =================================================================
// Tile-specific geometry constants (hex shape, headroom/skirt).
// Object mode uses different dimensions — see ObjectEditor.jsx.
// =================================================================

const GRID_W = 39;
const HEADROOM_H = 3;
const TOP_FACE_H = 24;
const SKIRT_H = 6;
const GRID_H = HEADROOM_H + TOP_FACE_H + SKIRT_H; // 33
const ZOOM = 16;

// Foreshortening ratio for the ellipse tool in tile mode: circles drawn
// on the implied iso surface should read as lying flat, not standing up.
const ELLIPSE_Y_RATIO = TOP_FACE_H / GRID_W; // ~0.615

// Pointy-top hex mask — which cells are inside the tile's visible shape.
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
  const hexVerts = [
    [cx, cy - halfH],
    [cx + halfW, cy - halfH / 2],
    [cx + halfW, cy + halfH / 2],
    [cx, cy + halfH],
    [cx - halfW, cy + halfH / 2],
    [cx - halfW, cy - halfH / 2],
  ];
  const mask = [];
  for (let y = 0; y < GRID_H; y++) {
    const row = [];
    for (let x = 0; x < GRID_W; x++) {
      if (y < HEADROOM_H) row.push(1);
      else if (y >= HEADROOM_H + TOP_FACE_H) {
        const sp = (y - (HEADROOM_H + TOP_FACE_H)) / SKIRT_H;
        const inset = halfW * 0.25 * sp;
        row.push(Math.abs(x + 0.5 - cx) <= halfW - inset ? 1 : 0);
      } else {
        row.push(pointInPolygon(x + 0.5, y + 0.5, hexVerts) ? 1 : 0);
      }
    }
    mask.push(row);
  }
  return mask;
}

const HEX_MASK = buildHexMask();

export default function TileEditor() {
  const [grid, setGrid] = useState(() => makeBlankGrid(GRID_W, GRID_H));
  const [color, setColor] = useState('#8a8278');
  const [tool, setTool] = useState('pencil');
  const [brushSize, setBrushSize] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [showMask, setShowMask] = useState(true);
  const [jitterEnabled, setJitterEnabled] = useState(false);
  const [jitterAmount, setJitterAmount] = useState(12);
  const [opacity, setOpacity] = useState(100);
  const [zoom, setZoom] = useState(ZOOM); // 4,6,8,10,12 — default 8 (ZOOM constant)
  const [preserveTransparency, setPreserveTransparency] = useState(false);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [exportStr, setExportStr] = useState('');
  const [exportImg, setExportImg] = useState(null);
  const [tileName, setTileName] = useState('');
  const [tileDefaultYOffset, setTileDefaultYOffset] = useState(0); // -6 | 0 | 6
  const [tileWalkable, setTileWalkable] = useState(true);
  const [saveStatus, setSaveStatus] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [loadedTileId, setLoadedTileId] = useState(null);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [tileLibrary, setTileLibrary] = useState([]);
  const [tileLibraryLoading, setTileLibraryLoading] = useState(false);
  const [tileLibraryError, setTileLibraryError] = useState(null);
  const [loadingTile, setLoadingTile] = useState(false);

  const isDrawing = useRef(false);
  const shadowedThisStroke = useRef(new Set());
  const strokeBase = useRef(null);
  const shapeStart = useRef(null);
  const [shapePreview, setShapePreview] = useState(null);
  const canvasRef = useRef(null);
  const exportCanvasRef = useRef(null);

  const pushHistory = useCallback((g) => {
    setHistory((h) => [...h.slice(-19), g]);
    setFuture([]);  // any new action clears redo stack
  }, []);

  function paintCells(g, cells) {
    let next = g;
    for (const { x, y } of cells) {
      let paintColor = jitterEnabled ? jitterColor(color, jitterAmount) : color;
      if (preserveTransparency && (next[y]?.[x] ?? null) === null) continue;
      // Blend against the stroke-start snapshot so repeated pixels within
      // a single stroke don't compound — matches shadow tool behaviour.
      const base = strokeBase.current?.[y]?.[x] ?? null;
      paintColor = blendColor(base, paintColor, opacity);
      next = setCell(next, x, y, paintColor, GRID_W, GRID_H);
    }
    return next;
  }

  function applyTool(x, y, isStart) {
    setGrid((g) => {
      if (isStart) pushHistory(g);
      const existing = g[y]?.[x] ?? null;
      if (tool === 'pencil') return paintCells(g, brushCells(x, y, brushSize));
      if (tool === 'hue-replace') {
        let next = g;
        for (const cell of brushCells(x, y, brushSize)) {
          const base = strokeBase.current?.[cell.y]?.[cell.x] ?? null;
          if (!base) continue; // don't paint on transparent
          next = setCell(next, cell.x, cell.y, replaceHue(base, color, opacity), GRID_W, GRID_H);
        }
        return next;
      }
      if (tool === 'eraser') {
        if (preserveTransparency) return g;
        let next = g;
        for (const cell of brushCells(x, y, brushSize))
          next = setCell(next, cell.x, cell.y, null, GRID_W, GRID_H);
        return next;
      }
      if (tool === 'shadow') {
        let next = g;
        for (const cell of brushCells(x, y, brushSize)) {
          const key = `${cell.x},${cell.y}`;
          if (shadowedThisStroke.current.has(key)) continue;
          const ex = next[cell.y]?.[cell.x] ?? null;
          if (ex === null) continue;
          shadowedThisStroke.current.add(key);
          next = setCell(next, cell.x, cell.y, darkenColor(ex), GRID_W, GRID_H);
        }
        return next;
      }
      if (tool === 'fill') {
        if (preserveTransparency && existing === null) return g;
        const baseColor = jitterEnabled ? jitterColor(color, jitterAmount) : color;
        const paint = blendColor(existing, baseColor, opacity);
        return floodFill(g, x, y, existing, paint, GRID_W, GRID_H);
      }
      if (tool === 'picker') {
        if (existing) setColor(existing);
        return g;
      }
      return g;
    });
  }

  function cellFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.floor((e.clientX - rect.left) / zoom),
      y: Math.floor((e.clientY - rect.top) / zoom),
    };
  }

  function handlePointerDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const { x, y } = cellFromEvent(e);
    if (tool === 'line' || tool === 'ellipse') {
      shapeStart.current = { x, y };
      setShapePreview([{ x, y }]);
      return;
    }
    isDrawing.current = true;
    strokeBase.current = grid.map(row => [...row]); // snapshot for blend baseline
    shadowedThisStroke.current = new Set();
    applyTool(x, y, true);
  }

  function handlePointerMove(e) {
    const { x, y } = cellFromEvent(e);
    if ((tool === 'line' || tool === 'ellipse') && shapeStart.current) {
      e.preventDefault();
      if (tool === 'line') {
        setShapePreview(lineCells(shapeStart.current.x, shapeStart.current.y, x, y));
      } else {
        const rx = Math.max(1, Math.round(
          Math.hypot(x - shapeStart.current.x, (y - shapeStart.current.y) / ELLIPSE_Y_RATIO)
        ));
        setShapePreview(ellipseCells(shapeStart.current.x, shapeStart.current.y, rx, ELLIPSE_Y_RATIO));
      }
      return;
    }
    if (!isDrawing.current) return;
    e.preventDefault();
    applyTool(x, y, false);
  }

  function handlePointerUp(e) {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if ((tool === 'line' || tool === 'ellipse') && shapeStart.current) {
      if (shapePreview?.length) setGrid((g) => { pushHistory(g); return paintCells(g, shapePreview); });
      shapeStart.current = null;
      setShapePreview(null);
      return;
    }
    isDrawing.current = false;
  }

  function undo() {
    setHistory((h) => {
      if (!h.length) return h;
      setFuture((f) => [grid, ...f.slice(0, 19)]);
      setGrid(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }

  function redo() {
    setFuture((f) => {
      if (!f.length) return f;
      setHistory((h) => [...h.slice(-19), grid]);
      setGrid(f[0]);
      return f.slice(1);
    });
  }

  function clearAll() {
    pushHistory(grid);
    setGrid(makeBlankGrid(GRID_W, GRID_H));
  }

  function fillMaskOutline() {
    pushHistory(grid);
    setGrid((g) => {
      const next = cloneGrid(g);
      for (let y = HEADROOM_H; y < GRID_H; y++)
        for (let x = 0; x < GRID_W; x++)
          if (HEX_MASK[y][x] && !next[y][x]) next[y][x] = '#3a3225';
      return next;
    });
  }

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  function generateExport() {
    const dataUrl = gridToDataUrl(grid, GRID_W, GRID_H, exportCanvasRef.current);
    setExportImg(dataUrl);
    setExportStr(`const HEX_TILE_IMG = "data:image/png;base64,${dataUrl.split(',')[1]}";`);
    setExportPanelOpen(true);
  }

  async function saveToLibrary(forceNew = false) {
    if (!exportImg) return;
    if (!tileName.trim()) { setSaveStatus('error'); setSaveError('Name your tile first.'); return; }
    setSaveStatus('saving'); setSaveError(null);
    try {
      if (loadedTileId && !forceNew) {
        await updateTile(loadedTileId, { name: tileName.trim(), imageDataUrl: exportImg, defaultYOffset: tileDefaultYOffset, walkable: tileWalkable });
      } else {
        const created = await saveTile({ name: tileName.trim(), imageDataUrl: exportImg, defaultYOffset: tileDefaultYOffset, walkable: tileWalkable });
        setLoadedTileId(created.id);
      }
      setSaveStatus('saved');
    } catch (e) { setSaveStatus('error'); setSaveError(e.message || 'Save failed.'); }
  }

  async function deleteFromLibrary() {
    if (!loadedTileId) return;
    setSaveStatus('saving'); setSaveError(null);
    try {
      await deleteTile(loadedTileId);
      setDeleteConfirm(false);
      startNew();
    } catch (e) { setSaveStatus('error'); setSaveError(e.message || 'Delete failed.'); }
  }

  async function openLibraryPanel() {
    setLibraryPanelOpen(true); setTileLibraryLoading(true); setTileLibraryError(null);
    try { setTileLibrary(await listTiles()); }
    catch (e) { setTileLibraryError(e.message || 'Failed to load tile library.'); }
    finally { setTileLibraryLoading(false); }
  }

  async function loadTileFromLibrary(tile) {
    setLoadingTile(true);
    try {
      const decoded = await decodeImageToGrid(tile.image_data_url, GRID_W, GRID_H);
      pushHistory(grid);
      setGrid(decoded);
      setLoadedTileId(tile.id);
      setTileName(tile.name);
      setTileDefaultYOffset(tile.default_y_offset ?? 0);
      setTileWalkable(tile.walkable ?? true);
      setLibraryPanelOpen(false);
      setExportImg(null); setExportStr(''); setSaveStatus(null);
    } catch (e) { setTileLibraryError(e.message || 'Failed to load tile.'); }
    finally { setLoadingTile(false); }
  }

  function startNew() {
    pushHistory(grid);
    setGrid(makeBlankGrid(GRID_W, GRID_H));
    setLoadedTileId(null); setTileName(''); setTileDefaultYOffset(0); setTileWalkable(true);
    setExportImg(null); setExportStr(''); setSaveStatus(null);
  }

  return (
    <div style={S.root}>
      <style>{fontImports}</style>
      <header style={S.header}>
        <span style={S.headerStamp}>PIXEL EDITOR — TILE</span>
        <span style={S.headerSub}>39×33 · pointy-top hex · 3px headroom / 24px face / 6px skirt</span>
      </header>

      <div style={S.body}>
        {/* ---- Canvas ---- */}
        <div style={S.canvasWrap}>
          <div
            ref={canvasRef}
            style={{ position: 'relative', width: GRID_W * zoom, height: GRID_H * zoom,
                     background: '#2a2a2a',
                     backgroundImage: 'linear-gradient(45deg, #3a3a3a 25%, transparent 25%), linear-gradient(-45deg, #3a3a3a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #3a3a3a 75%), linear-gradient(-45deg, transparent 75%, #3a3a3a 75%)',
                     backgroundSize: `${zoom * 4}px ${zoom * 4}px`,
                     backgroundPosition: `0 0, 0 ${zoom * 2}px, ${zoom * 2}px ${-zoom * 2}px, ${-zoom * 2}px 0px`,
                     touchAction: 'none', cursor: 'crosshair',
                     border: `1px solid ${C.border}` }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {showMask && grid.map((row, y) => row.map((_, x) =>
              HEX_MASK[y][x] ? null : (
                <div key={`m-${x}-${y}`} style={{ ...S.cell, width: zoom, height: zoom, left: x*zoom, top: y*zoom,
                  background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
              )
            ))}
            {grid.map((row, y) => row.map((col, x) =>
              col ? <div key={`c-${x}-${y}`} style={{ ...S.cell, width: zoom, height: zoom, left: x*zoom, top: y*zoom,
                background: col.length === 9
                  ? `rgba(${parseInt(col.slice(1,3),16)},${parseInt(col.slice(3,5),16)},${parseInt(col.slice(5,7),16)},${(parseInt(col.slice(7,9),16)/255).toFixed(3)})`
                  : col,
                pointerEvents: 'none' }} /> : null
            ))}
            <div style={{ ...S.guideLine, top: HEADROOM_H*zoom, background: C.brass, opacity: 0.45 }} />
            <div style={{ ...S.guideLine, top: (HEADROOM_H+TOP_FACE_H)*zoom, background: C.rust, opacity: 0.6 }} />
            {showGrid && (
              <svg width={GRID_W*zoom} height={GRID_H*zoom} style={S.gridSvg}>
                {Array.from({length: GRID_W+1}).map((_,i) =>
                  <line key={`v${i}`} x1={i*zoom} y1={0} x2={i*zoom} y2={GRID_H*zoom}
                    stroke="rgba(232,220,196,0.08)" strokeWidth="1" />)}
                {Array.from({length: GRID_H+1}).map((_,i) =>
                  <line key={`h${i}`} x1={0} y1={i*zoom} x2={GRID_W*zoom} y2={i*zoom}
                    stroke="rgba(232,220,196,0.08)" strokeWidth="1" />)}
              </svg>
            )}
            {shapePreview?.map(({x, y}, i) =>
              <div key={`p${i}`} style={{ ...S.cell, width: zoom, height: zoom, left: x*zoom, top: y*zoom,
                background: color, opacity: 0.6, pointerEvents: 'none' }} />
            )}
          </div>
          <div style={S.canvasLabel}>
            <span style={{color: C.brass}}>top face</span> between the lines ·{' '}
            <span style={{color: C.rust}}>skirt</span> below · headroom above
          </div>
        </div>

        {/* ---- Sidebar ---- */}
        <PixelSidebar
          tool={tool} setTool={setTool}
          brushSize={brushSize} setBrushSize={setBrushSize}
          color={color} setColor={setColor}
          showGrid={showGrid} setShowGrid={setShowGrid}
          showMask={showMask} setShowMask={setShowMask}
          jitterEnabled={jitterEnabled} setJitterEnabled={setJitterEnabled}
          jitterAmount={jitterAmount} setJitterAmount={setJitterAmount}
          opacity={opacity} setOpacity={setOpacity}
          preserveTransparency={preserveTransparency} setPreserveTransparency={setPreserveTransparency}
          onUndo={undo} onRedo={redo} onClear={clearAll}
          zoom={zoom} setZoom={setZoom}
          extraQuickActions={[
            { label: 'Fill outline', fn: fillMaskOutline },
            { label: loadedTileId ? `Load tile… (${tileName || 'untitled'})` : 'Load tile…', fn: openLibraryPanel },
          ]}
          onExport={generateExport}
          exportReady={!!exportImg && !exportPanelOpen}
          onViewExport={() => setExportPanelOpen(true)}
          loadedName={loadedTileId ? tileName : null}
          onStartNew={startNew}
        />
      </div>

      {/* ---- Export overlay ---- */}
      {exportImg && exportPanelOpen && (
        <Overlay onClose={() => setExportPanelOpen(false)} title="EXPORT TILE">
          <ExportPreview img={exportImg} w={GRID_W} h={GRID_H} />
          <div style={S.exportLabel}>paste into game file, replacing HEX_TILE_IMG</div>
          <textarea readOnly value={exportStr} style={S.exportTextarea} onClick={e => e.target.select()} />
          <button style={S.exportBtn} onClick={() => navigator.clipboard?.writeText(exportStr)}>
            Copy to clipboard
          </button>
          <div style={{...S.exportLabel, marginTop: 14}}>
            or save to library for use in the Map Editor
          </div>
          <input style={S.textInput} value={tileName}
            onChange={e => { setTileName(e.target.value); setSaveStatus(null); }}
            placeholder="tile name (e.g. mossy stone)" />
          <div style={S.sectionLabel}>default height when placed in map editor</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[[-6, '▲ raise +6'], [0, '— default'], [6, '▼ lower +6']].map(([val, label]) => (
              <button
                key={val}
                style={{ ...S.toolBtn, flex: 1, ...(tileDefaultYOffset === val ? S.toolBtnActive : {}) }}
                onClick={() => setTileDefaultYOffset(val)}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={S.sectionLabel}>walkability</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[[true, '✓ walkable'], [false, '✗ not walkable']].map(([val, label]) => (
              <button
                key={String(val)}
                style={{ ...S.toolBtn, flex: 1, ...(tileWalkable === val ? S.toolBtnActive : {}), ...(!val && tileWalkable === false ? { borderColor: C.rust, color: C.rust } : {}) }}
                onClick={() => setTileWalkable(val)}
              >
                {label}
              </button>
            ))}
          </div>
          <button style={S.exportBtn} onClick={() => saveToLibrary(false)} disabled={saveStatus==='saving'}>
            {saveStatus==='saving' ? 'Saving…' : loadedTileId ? 'Update tile' : 'Save to library'}
          </button>
          {loadedTileId && (
            <button style={S.actionBtn} onClick={() => saveToLibrary(true)} disabled={saveStatus==='saving'}>
              Save as new tile instead
            </button>
          )}
          {loadedTileId && (
            <div style={{ marginTop: 6 }}>
              {!deleteConfirm
                ? <button style={{...S.actionBtn, color: C.rust}} onClick={() => setDeleteConfirm(true)}>Delete tile from library…</button>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{fontSize:10, color:C.rust}}>Delete «{tileName}» permanently?</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={{...S.exportBtn, flex:1}} onClick={deleteFromLibrary} disabled={saveStatus==='saving'}>Yes, delete</button>
                      <button style={{...S.actionBtn, flex:1}} onClick={() => setDeleteConfirm(false)}>Cancel</button>
                    </div>
                  </div>
              }
            </div>
          )}
          {saveStatus==='saved' && <div style={{fontSize:10,color:C.brass}}>Saved.</div>}
          {saveStatus==='error' && <div style={{fontSize:10,color:C.rust}}>{saveError}</div>}
        </Overlay>
      )}

      {/* ---- Library browser ---- */}
      {libraryPanelOpen && (
        <Overlay onClose={() => setLibraryPanelOpen(false)} title="LOAD TILE">
          {tileLibraryLoading && <div style={S.hint}>loading…</div>}
          {tileLibraryError && <div style={{...S.hint, color:C.rust}}>{tileLibraryError}</div>}
          {loadingTile && <div style={S.hint}>decoding…</div>}
          {!tileLibraryLoading && !tileLibraryError && tileLibrary.length === 0 &&
            <div style={S.hint}>no saved tiles yet</div>}
          <div style={S.libraryGrid}>
            {tileLibrary.map(t => (
              <LibraryItem key={t.id} item={t} onSelect={() => loadTileFromLibrary(t)} disabled={loadingTile} />
            ))}
          </div>
        </Overlay>
      )}

      <canvas ref={exportCanvasRef} style={{display:'none'}} />
    </div>
  );
}

// =================================================================
// Shared sub-components used by both TileEditor and ObjectEditor
// =================================================================

export function Overlay({ onClose, title, children }) {
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.overlayPanel} onClick={e => e.stopPropagation()}>
        <div style={S.overlayHeader}>
          <span>{title}</span>
          <button style={S.closeBtn} onClick={onClose}>×</button>
        </div>
        <div style={S.overlayScroll}>{children}</div>
      </div>
    </div>
  );
}

export function ExportPreview({ img, w, h }) {
  return (
    <div style={S.exportPreviewRow}>
      <div>
        <div style={S.exportLabel}>actual size</div>
        <img src={img} alt="preview" style={{width:w, height:h, imageRendering:'pixelated', border:`1px solid ${C.border}`}} />
      </div>
      <div>
        <div style={S.exportLabel}>6× preview</div>
        <img src={img} alt="zoomed" style={{width:w*6, height:h*6, imageRendering:'pixelated',
          border:`1px solid ${C.border}`,
          background:'#2a2a2a',
          backgroundImage:'linear-gradient(45deg,#3a3a3a 25%,transparent 25%),linear-gradient(-45deg,#3a3a3a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#3a3a3a 75%),linear-gradient(-45deg,transparent 75%,#3a3a3a 75%)',
          backgroundSize:'12px 12px',
          backgroundPosition:'0 0,0 6px,6px -6px,-6px 0'}} />
      </div>
    </div>
  );
}

export function LibraryItem({ item, onSelect, disabled }) {
  return (
    <button style={S.libraryTileBtn} onClick={onSelect} disabled={disabled}>
      <img src={item.image_data_url} alt={item.name} style={S.libraryTileImg} />
      <div style={S.libraryTileName}>{item.name}</div>
    </button>
  );
}

// Sidebar shared between tile and object modes — all the tool/color/behavior
// controls that are identical regardless of canvas shape or saved-item type.
export function PixelSidebar({
  tool, setTool,
  brushSize, setBrushSize,
  color, setColor,
  showGrid, setShowGrid,
  showMask, setShowMask,
  jitterEnabled, setJitterEnabled,
  jitterAmount, setJitterAmount,
  opacity = 100, setOpacity,
  preserveTransparency, setPreserveTransparency,
  onUndo, onRedo, onClear,
  extraQuickActions = [],
  onExport,
  exportReady,
  onViewExport,
  loadedName,
  onStartNew,
  extraTopControls,
  hideMaskToggle,
  zoom, setZoom,  // optional — pixel editors pass these; map editor doesn't
}) {
  return (
    <div style={S.sidebar}>
      <div style={S.quickActionsRow}>
        <button style={S.quickActionBtn} onClick={onUndo}>↶ Undo</button>
        <button style={S.quickActionBtn} onClick={onRedo}>↷ Redo</button>
        <button style={S.quickActionBtn} onClick={onClear}>Clear all</button>
        {extraQuickActions.map(({ label, fn }) => (
          <button key={label} style={S.quickActionBtn} onClick={fn}>{label}</button>
        ))}
      </div>
      {loadedName !== null && (
        <div style={S.editingRow}>
          <span style={S.hint}>editing: {loadedName || '(unnamed)'}</span>
          <button style={S.linkBtn} onClick={onStartNew}>start new</button>
        </div>
      )}
      {extraTopControls}

      <div style={S.sidebarColumns}>
        <div style={S.sidebarCol}>
          <div style={S.sectionLabel}>tool</div>
          <div style={S.toolGrid2}>
            {[['pencil','Pencil'],['eraser','Eraser'],['line','Line'],
              ['ellipse','Ellipse'],['fill','Fill'],['picker','Picker']].map(([t,label]) => (
              <button key={t} style={{...S.toolBtn, ...(tool===t ? S.toolBtnActive : {})}}
                onClick={() => setTool(t)}>{label}</button>
            ))}
            <button style={{...S.toolBtn, ...(tool==='shadow' ? S.toolBtnActive : {})}}
              onClick={() => setTool('shadow')}>Shadow</button>
            <button style={{...S.toolBtn, ...(tool==='hue-replace' ? S.toolBtnActive : {})}}
              onClick={() => setTool('hue-replace')}>Hue Rep.</button>
          </div>

          {['pencil','eraser','shadow','hue-replace'].includes(tool) && (
            <>
              <div style={S.sectionLabel}>brush size</div>
              <div style={S.brushSizeRow}>
                {[1,2,3,4,6].map(size => (
                  <button key={size} style={{...S.brushSizeBtn, ...(brushSize===size ? S.toolBtnActive : {})}}
                    onClick={() => setBrushSize(size)}>{size}</button>
                ))}
              </div>
            </>
          )}

          {['pencil','hue-replace'].includes(tool) && setOpacity && (
            <>
              <div style={S.sectionLabel}>opacity</div>
              <div style={S.jitterRow}>
                <input type="range" min="1" max="100" value={opacity}
                  onChange={e => setOpacity(Number(e.target.value))} style={S.jitterSlider} />
                <span style={S.jitterValue}>{opacity}%</span>
              </div>
            </>
          )}

          {setZoom && (
            <>
              <div style={S.sectionLabel}>zoom</div>
              <div style={S.brushSizeRow}>
                {[4, 6, 8, 10, 12].map(z => (
                  <button key={z} style={{...S.brushSizeBtn, ...(zoom===z ? S.toolBtnActive : {})}}
                    onClick={() => setZoom(z)}>{z}×</button>
                ))}
              </div>
            </>
          )}

          <div style={S.sectionLabel}>view</div>
          <label style={S.checkRow}>
            <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} />
            grid lines
          </label>
          {!hideMaskToggle && (
            <label style={S.checkRow}>
              <input type="checkbox" checked={showMask} onChange={e => setShowMask(e.target.checked)} />
              dim outside hex
            </label>
          )}

          <div style={S.sectionLabel}>paint behavior</div>
          <label style={S.checkRow}>
            <input type="checkbox" checked={preserveTransparency} onChange={e => setPreserveTransparency(e.target.checked)} />
            preserve transparency
          </label>
          <label style={S.checkRow}>
            <input type="checkbox" checked={jitterEnabled} onChange={e => setJitterEnabled(e.target.checked)} />
            randomize color
          </label>
          {jitterEnabled && (
            <div style={S.jitterRow}>
              <input type="range" min="1" max="40" value={jitterAmount}
                onChange={e => setJitterAmount(Number(e.target.value))} style={S.jitterSlider} />
              <span style={S.jitterValue}>{jitterAmount}</span>
            </div>
          )}

          <div style={S.sectionLabel}>export</div>
          <button style={S.exportBtn} onClick={onExport}>Generate export</button>
          {exportReady && (
            <button style={S.actionBtn} onClick={onViewExport}>View last export</button>
          )}
        </div>

        <div style={S.sidebarCol}>
          <div style={S.sectionLabel}>color</div>
          {(() => {
            let offset = 0;
            return PALETTE_ROW_LABELS.map(({ label, count }) => {
              const slice = PALETTE.slice(offset, offset + count);
              offset += count;
              return (
                <div key={label} style={{ marginBottom: 6 }}>
                  <div style={S.swatchRowLabel}>{label}</div>
                  <div style={S.swatchGrid}>
                    {slice.map((c, i) => (
                      <button key={`${label}-${i}`} onClick={() => setColor(c)} title={c}
                        style={{...S.swatch, background:c,
                          outline: color===c ? `2px solid ${C.brass}` : '1px solid #000'}} />
                    ))}
                  </div>
                </div>
              );
            });
          })()}
          <input type="color" value={color} onChange={e => setColor(e.target.value)} style={S.colorPicker} />
        </div>
      </div>
    </div>
  );
}

// =================================================================
// STYLES (shared between TileEditor and ObjectEditor via named export)
// =================================================================

const fontImports = `
@import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Space+Mono:wght@400;700&display=swap');
`;

export const C = {
  bg: '#0c0a08', panel: '#15120e', text: '#e8dcc4',
  textDim: '#9c9078', rust: '#8a3324', brass: '#c4a747', border: '#332c22',
};

export const S = {
  root: { background: C.bg, color: C.text, minHeight: 'auto',
    fontFamily: "'Space Mono', monospace", border: `1px solid ${C.border}` },
  header: { padding: '12px 18px', borderBottom: `1px solid ${C.border}`,
    display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  headerStamp: { fontFamily: "'Courier Prime', monospace", fontWeight: 700,
    letterSpacing: '0.08em', fontSize: 13, color: C.brass },
  headerSub: { fontSize: 10, color: C.textDim, fontStyle: 'italic' },
  body: { display: 'flex', flexWrap: 'nowrap', gap: 16, padding: 14, alignItems: 'flex-start' },
  canvasWrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  canvasLabel: { fontSize: 10, color: C.textDim },
  cell: { position: 'absolute', width: ZOOM, height: ZOOM },
  guideLine: { position: 'absolute', left: 0, width: '100%', height: 1, pointerEvents: 'none' },
  gridSvg: { position: 'absolute', left: 0, top: 0, pointerEvents: 'none' },
  sidebar: { display: 'flex', flexDirection: 'column', gap: 8, minWidth: 460, maxWidth: 460 },
  quickActionsRow: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 },
  quickActionBtn: { background: C.panel, border: `1px solid ${C.brass}`, color: C.brass,
    padding: '9px 4px', fontFamily: "'Space Mono', monospace", fontSize: 11, cursor: 'pointer' },
  editingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10 },
  linkBtn: { background: 'transparent', border: 'none', color: C.brass,
    fontSize: 10, textDecoration: 'underline', cursor: 'pointer', padding: 0 },
  sidebarColumns: { display: 'flex', gap: 18 },
  sidebarCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  toolGrid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  toolBtn: { flex: 1, background: C.panel, border: `1px solid ${C.border}`,
    color: C.textDim, padding: 8, fontFamily: "'Space Mono', monospace", fontSize: 11, cursor: 'pointer' },
  toolBtnActive: { color: C.brass, borderColor: C.brass },
  brushSizeRow: { display: 'flex', gap: 4 },
  brushSizeBtn: { flex: 1, background: C.panel, border: `1px solid ${C.border}`,
    color: C.textDim, padding: 6, fontFamily: "'Space Mono', monospace", fontSize: 11, cursor: 'pointer' },
  sectionLabel: { fontSize: 10, color: C.textDim, textTransform: 'uppercase',
    letterSpacing: '0.08em', marginTop: 10, marginBottom: 2 },
  swatchRowLabel: { fontSize: 9, color: C.textDim, opacity: 0.7, marginBottom: 2 },
  swatchGrid: { display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3 },
  swatch: { width: '100%', aspectRatio: '1', border: 'none', cursor: 'pointer', borderRadius: 2 },
  colorPicker: { marginTop: 6, width: 60, height: 32, background: 'transparent',
    border: `1px solid ${C.border}`, cursor: 'pointer', flexShrink: 0 },
  checkRow: { fontSize: 11, color: C.textDim, display: 'flex', alignItems: 'center', gap: 6 },
  jitterRow: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, marginLeft: 20 },
  jitterSlider: { flex: 1 },
  jitterValue: { fontSize: 10, color: C.brass, minWidth: 20, textAlign: 'right' },
  actionBtn: { background: C.panel, border: `1px solid ${C.border}`, color: C.text,
    padding: 8, fontFamily: "'Space Mono', monospace", fontSize: 11, cursor: 'pointer', textAlign: 'left' },
  exportBtn: { background: C.rust, border: 'none', color: C.text,
    padding: 10, fontFamily: "'Space Mono', monospace", fontSize: 11, cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  overlayPanel: { background: C.bg, border: `1px solid ${C.brass}`,
    width: '90%', maxWidth: 600, maxHeight: '85vh', display: 'flex', flexDirection: 'column' },
  overlayHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
    fontSize: 12, fontWeight: 700, color: C.brass, letterSpacing: '0.08em' },
  closeBtn: { background: 'transparent', border: 'none', color: C.text, fontSize: 18, cursor: 'pointer', lineHeight: 1 },
  overlayScroll: { padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
  exportPreviewRow: { display: 'flex', gap: 20, alignItems: 'flex-end' },
  exportLabel: { fontSize: 10, color: C.textDim, marginBottom: 4 },
  exportTextarea: { width: '100%', height: 80, background: C.panel, border: `1px solid ${C.border}`,
    color: C.brass, fontFamily: "'Space Mono', monospace", fontSize: 10, padding: 8, resize: 'vertical' },
  textInput: { background: C.panel, border: `1px solid ${C.border}`, color: C.text,
    padding: 8, fontFamily: "'Space Mono', monospace", fontSize: 12, width: '100%' },
  hint: { fontSize: 9, color: C.textDim, fontStyle: 'italic', marginTop: 2 },
  libraryGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  libraryTileBtn: { background: C.panel, border: `1px solid ${C.border}`, cursor: 'pointer',
    padding: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  libraryTileImg: { width: 48, height: 40, objectFit: 'contain', imageRendering: 'pixelated' },
  libraryTileName: { fontSize: 9, color: C.textDim, textAlign: 'center',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' },
};
