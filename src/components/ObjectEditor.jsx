import React, { useState, useRef, useCallback } from 'react';
import { saveObject, listObjects, updateObject, deleteObject } from '../lib/objects.js';
import {
  makeBlankGrid, cloneGrid, setCell, floodFill,
  gridToDataUrl, decodeImageToGrid,
  jitterColor, darkenColor, blendColor, replaceHue,
  brushCells, lineCells, ellipseCells,
  cropGrid, expandGrid, scaleGrid,
} from '../lib/pixelArt.js';
import {
  Overlay, ExportPreview, LibraryItem, PixelSidebar, C, S,
} from './TileEditor.jsx';

// Object mode uses a true-circle ellipse (no foreshortening) since
// objects aren't drawn on an iso-projected surface — yRatio = 1.
const ELLIPSE_Y_RATIO = 1;

// Default canvas size for new objects. User can change this before drawing.
const DEFAULT_W = 39;
const DEFAULT_H = 60;

// Zoom chosen so a 39×60 object fits reasonably alongside the sidebar.
const ZOOM = 10;

// =================================================================
// Footprint picker — a small hex-grid SVG the user clicks to mark
// which hexes relative to the anchor (0,0) this object occupies.
// =================================================================

const STEP_X = 20;
const STEP_Y = 14;
const HEX_R = 9;

function hexOutlinePoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts.map(p => p.join(',')).join(' ');
}

function hexKey(q, r) { return `${q},${r}`; }

const FOOTPRINT_HEXES = [
  { q: 0, r: -1 }, { q: 1, r: -1 },
  { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 },
  { q: -1, r: 1 }, { q: 0, r: 1 },
];

function FootprintPicker({ footprint, onChange }) {
  const fpSet = new Set(footprint.map(([q, r]) => hexKey(q, r)));

  function toggle(q, r) {
    const key = hexKey(q, r);
    if (q === 0 && r === 0) return; // anchor always included
    const next = fpSet.has(key)
      ? footprint.filter(([fq, fr]) => !(fq === q && fr === r))
      : [...footprint, [q, r]];
    onChange(next);
  }

  const W = 120, H = 100, cx0 = 60, cy0 = 50;

  return (
    <div>
      <div style={{ fontSize: 9, color: C.textDim, marginBottom: 4 }}>
        footprint — click hexes to mark which tiles this object occupies (anchor shown in brass)
      </div>
      <svg width={W} height={H} style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        {FOOTPRINT_HEXES.map(({ q, r }) => {
          const sx = cx0 + STEP_X * (q + r / 2);
          const sy = cy0 + STEP_Y * r;
          const isAnchor = q === 0 && r === 0;
          const active = fpSet.has(hexKey(q, r));
          return (
            <polygon
              key={hexKey(q, r)}
              points={hexOutlinePoints(sx, sy, HEX_R)}
              fill={isAnchor ? C.brass : active ? C.rust : C.bg}
              stroke={C.border}
              strokeWidth="1"
              style={{ cursor: isAnchor ? 'default' : 'pointer' }}
              onClick={() => toggle(q, r)}
            />
          );
        })}
      </svg>
    </div>
  );
}

// =================================================================
// ObjectEditor component
// =================================================================

export default function ObjectEditor() {
  const [objW, setObjW] = useState(DEFAULT_W);
  const [objH, setObjH] = useState(DEFAULT_H);
  // Committed dimensions — what the current grid is sized to.
  // Changing dimensions without committing warns before resizing.
  const [gridW, setGridW] = useState(DEFAULT_W);
  const [gridH, setGridH] = useState(DEFAULT_H);
  const [grid, setGrid] = useState(() => makeBlankGrid(DEFAULT_W, DEFAULT_H));

  const [color, setColor] = useState('#8a8278');
  const [tool, setTool] = useState('pencil');
  const [brushSize, setBrushSize] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [jitterEnabled, setJitterEnabled] = useState(false);
  const [jitterAmount, setJitterAmount] = useState(12);
  const [opacity, setOpacity] = useState(100);
  const [zoom, setZoom] = useState(ZOOM);
  const [preserveTransparency, setPreserveTransparency] = useState(false);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

  const [exportImg, setExportImg] = useState(null);
  const [exportPanelOpen, setExportPanelOpen] = useState(false);

  // Canvas transform UI state
  const [expandTop, setExpandTop] = useState(0);
  const [expandRight, setExpandRight] = useState(0);
  const [expandBottom, setExpandBottom] = useState(0);
  const [expandLeft, setExpandLeft] = useState(0);
  const [scaleTargetW, setScaleTargetW] = useState(DEFAULT_W);
  const [scaleTargetH, setScaleTargetH] = useState(DEFAULT_H);

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const [objName, setObjName] = useState('');
  const [footprint, setFootprint] = useState([[0, 0]]);
  const [defaultKind, setDefaultKind] = useState('object');
  const [defaultTrigger, setDefaultTrigger] = useState('');
  const [defaultBlocksMovement, setDefaultBlocksMovement] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [loadedObjId, setLoadedObjId] = useState(null);

  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);
  const [objLibrary, setObjLibrary] = useState([]);
  const [objLibraryLoading, setObjLibraryLoading] = useState(false);
  const [objLibraryError, setObjLibraryError] = useState(null);
  const [loadingObj, setLoadingObj] = useState(false);

  const isDrawing = useRef(false);
  const shadowedThisStroke = useRef(new Set());
  const strokeBase = useRef(null);
  const shapeStart = useRef(null);
  const [shapePreview, setShapePreview] = useState(null);
  const canvasRef = useRef(null);
  const exportCanvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [importError, setImportError] = useState(null);

  const pushHistory = useCallback((g) => {
    setHistory((h) => [...h.slice(-19), g]);
    setFuture([]);
  }, []);

  function applyDimensions() {
    if (objW === gridW && objH === gridH) return;
    const next = makeBlankGrid(objW, objH);
    for (let y = 0; y < Math.min(gridH, objH); y++)
      for (let x = 0; x < Math.min(gridW, objW); x++)
        next[y][x] = grid[y][x];
    pushHistory(grid);
    setGrid(next);
    setGridW(objW);
    setGridH(objH);
  }

  function applyCrop() {
    const { grid: next, width: newW, height: newH } = cropGrid(grid, gridW, gridH);
    pushHistory(grid);
    setGrid(next);
    setGridW(newW); setGridH(newH);
    setObjW(newW); setObjH(newH);
  }

  function applyExpand() {
    const t = Math.max(0, expandTop), r = Math.max(0, expandRight),
          b = Math.max(0, expandBottom), l = Math.max(0, expandLeft);
    if (!t && !r && !b && !l) return;
    const { grid: next, width: newW, height: newH } = expandGrid(grid, gridW, gridH, t, r, b, l);
    pushHistory(grid);
    setGrid(next);
    setGridW(newW); setGridH(newH);
    setObjW(newW); setObjH(newH);
    setExpandTop(0); setExpandRight(0); setExpandBottom(0); setExpandLeft(0);
  }

  function applyScale() {
    if (scaleTargetW < 1 || scaleTargetH < 1) return;
    const { grid: next, width: newW, height: newH } = scaleGrid(grid, gridW, gridH, scaleTargetW, scaleTargetH);
    pushHistory(grid);
    setGrid(next);
    setGridW(newW); setGridH(newH);
    setObjW(newW); setObjH(newH);
  }

  async function deleteFromLibrary() {
    if (!loadedObjId) return;
    setSaveStatus('saving'); setSaveError(null);
    try {
      await deleteObject(loadedObjId);
      setDeleteConfirm(false);
      startNew();
    } catch (e) { setSaveStatus('error'); setSaveError(e.message || 'Delete failed.'); }
  }

  function generateExport() {
    const dataUrl = gridToDataUrl(grid, gridW, gridH, exportCanvasRef.current);
    setExportImg(dataUrl);
    setExportPanelOpen(true);
  }

  function paintCells(g, cells) {
    let next = g;
    for (const { x, y } of cells) {
      let paintColor = jitterEnabled ? jitterColor(color, jitterAmount) : color;
      if (preserveTransparency && (next[y]?.[x] ?? null) === null) continue;
      const base = strokeBase.current?.[y]?.[x] ?? null;
      paintColor = blendColor(base, paintColor, opacity);
      next = setCell(next, x, y, paintColor, gridW, gridH);
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
          if (!base) continue;
          next = setCell(next, cell.x, cell.y, replaceHue(base, color, opacity), gridW, gridH);
        }
        return next;
      }
      if (tool === 'eraser') {
        if (preserveTransparency) return g;
        let next = g;
        for (const cell of brushCells(x, y, brushSize))
          next = setCell(next, cell.x, cell.y, null, gridW, gridH);
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
          next = setCell(next, cell.x, cell.y, darkenColor(ex), gridW, gridH);
        }
        return next;
      }
      if (tool === 'fill') {
        if (preserveTransparency && existing === null) return g;
        const baseColor = jitterEnabled ? jitterColor(color, jitterAmount) : color;
        const paint = blendColor(existing, baseColor, opacity);
        return floodFill(g, x, y, existing, paint, gridW, gridH);
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
    strokeBase.current = grid.map(row => [...row]);
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
    setGrid(makeBlankGrid(gridW, gridH));
  }

  async function saveToLibrary(forceNew = false) {
    if (!exportImg) return;
    if (!objName.trim()) { setSaveStatus('error'); setSaveError('Name your object first.'); return; }
    setSaveStatus('saving'); setSaveError(null);
    try {
      const payload = {
        name: objName.trim(),
        imageDataUrl: exportImg,
        widthPx: gridW,
        heightPx: gridH,
        footprint,
        defaultKind,
        defaultTrigger: defaultTrigger || null,
        defaultBlocksMovement,
      };
      if (loadedObjId && !forceNew) {
        await updateObject(loadedObjId, payload);
      } else {
        const created = await saveObject(payload);
        setLoadedObjId(created.id);
      }
      setSaveStatus('saved');
    } catch (e) { setSaveStatus('error'); setSaveError(e.message || 'Save failed.'); }
  }

  async function openLibraryPanel() {
    setLibraryPanelOpen(true); setObjLibraryLoading(true); setObjLibraryError(null);
    try { setObjLibrary(await listObjects()); }
    catch (e) { setObjLibraryError(e.message || 'Failed to load object library.'); }
    finally { setObjLibraryLoading(false); }
  }

  async function loadObjFromLibrary(obj) {
    setLoadingObj(true);
    try {
      const decoded = await decodeImageToGrid(obj.image_data_url, obj.width_px, obj.height_px);
      pushHistory(grid);
      setGrid(decoded);
      setGridW(obj.width_px); setGridH(obj.height_px);
      setObjW(obj.width_px); setObjH(obj.height_px);
      setScaleTargetW(obj.width_px); setScaleTargetH(obj.height_px);
      setLoadedObjId(obj.id);
      setObjName(obj.name);
      setFootprint(obj.footprint || [[0, 0]]);
      setDefaultKind(obj.default_kind || 'object');
      setDefaultTrigger(obj.default_trigger || '');
      setDefaultBlocksMovement(obj.default_blocks_movement || false);
      setLibraryPanelOpen(false);
      setExportImg(null); setSaveStatus(null);
    } catch (e) { setObjLibraryError(e.message || 'Failed to load object.'); }
    finally { setLoadingObj(false); }
  }

  function startNew() {
    pushHistory(grid);
    setGrid(makeBlankGrid(DEFAULT_W, DEFAULT_H));
    setGridW(DEFAULT_W); setGridH(DEFAULT_H);
    setObjW(DEFAULT_W); setObjH(DEFAULT_H);
    setLoadedObjId(null); setObjName('');
    setFootprint([[0, 0]]);
    setDefaultKind('object'); setDefaultTrigger(''); setDefaultBlocksMovement(false);
    setExportImg(null); setSaveStatus(null);
  }

  // Import a PNG from disk (e.g. exported from PixelLab, Aseprite, etc.)
  // Reads the image's natural pixel dimensions and sizes the canvas to
  // match automatically, so no manual resize step is needed.
  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = ''; // reset so the same file can be re-selected
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setImportError('Please select a PNG image file.');
      return;
    }
    setImportError(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      // Read the image's actual pixel dimensions first, before decoding
      // the grid — object mode respects the source art's real size rather
      // than forcing it into a fixed canvas like tile mode does.
      const img = new Image();
      img.onload = async () => {
        const w = Math.min(img.naturalWidth, 200);
        const h = Math.min(img.naturalHeight, 400);
        if (w !== img.naturalWidth || h !== img.naturalHeight) {
          setImportError(`Image was ${img.naturalWidth}×${img.naturalHeight}px — clamped to ${w}×${h} (max 200×400). Consider downscaling in PixelLab first.`);
        }
        try {
          const decoded = await decodeImageToGrid(dataUrl, w, h);
          pushHistory(grid);
          setGrid(decoded);
          setGridW(w); setGridH(h);
          setObjW(w); setObjH(h);
          setScaleTargetW(w); setScaleTargetH(h);
          // Clear any loaded-object tracking — this is new art, not a
          // library object being edited, even if we later save it there.
          setLoadedObjId(null);
          setExportImg(null); setSaveStatus(null);
          // Pre-fill the name from the filename if none set yet
          if (!objName.trim()) {
            const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
            setObjName(baseName);
          }
        } catch (err) {
          setImportError('Failed to decode image. Make sure it\'s a valid PNG with transparent background.');
        }
      };
      img.onerror = () => setImportError('Could not load image file.');
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  const canvasStyle = {
    position: 'relative',
    width: gridW * zoom,
    height: gridH * zoom,
    background: '#2a2a2a',
    backgroundImage: 'linear-gradient(45deg, #3a3a3a 25%, transparent 25%), linear-gradient(-45deg, #3a3a3a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #3a3a3a 75%), linear-gradient(-45deg, transparent 75%, #3a3a3a 75%)',
    backgroundSize: `${zoom * 4}px ${zoom * 4}px`,
    backgroundPosition: `0 0, 0 ${zoom * 2}px, ${zoom * 2}px ${-zoom * 2}px, ${-zoom * 2}px 0px`,
    touchAction: 'none',
    cursor: 'crosshair',
    border: `1px solid ${C.border}`,
  };

  return (
    <div style={S.root}>
      <header style={S.header}>
        <span style={S.headerStamp}>PIXEL EDITOR — OBJECT</span>
        <span style={S.headerSub}>{gridW}×{gridH}px · variable size · true-circle ellipse</span>
      </header>

      <div style={S.body}>
        {/* ---- Canvas ---- */}
        <div style={S.canvasWrap}>
          <div
            ref={canvasRef}
            style={canvasStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {grid.map((row, y) => row.map((col, x) =>
              col ? <div key={`c-${x}-${y}`} style={{ position: 'absolute', left: x*zoom, top: y*zoom,
                width: zoom, height: zoom,
                background: col.length === 9
                  ? `rgba(${parseInt(col.slice(1,3),16)},${parseInt(col.slice(3,5),16)},${parseInt(col.slice(5,7),16)},${(parseInt(col.slice(7,9),16)/255).toFixed(3)})`
                  : col,
                pointerEvents: 'none' }} /> : null
            ))}
            {showGrid && (
              <svg width={gridW*zoom} height={gridH*zoom} style={S.gridSvg}>
                {Array.from({length: gridW+1}).map((_,i) =>
                  <line key={`v${i}`} x1={i*zoom} y1={0} x2={i*zoom} y2={gridH*zoom}
                    stroke="rgba(232,220,196,0.08)" strokeWidth="1" />)}
                {Array.from({length: gridH+1}).map((_,i) =>
                  <line key={`h${i}`} x1={0} y1={i*zoom} x2={gridW*zoom} y2={i*zoom}
                    stroke="rgba(232,220,196,0.08)" strokeWidth="1" />)}
              </svg>
            )}
            {shapePreview?.map(({x, y}, i) =>
              <div key={`p${i}`} style={{ position: 'absolute', left: x*zoom, top: y*zoom,
                width: zoom, height: zoom, background: color, opacity: 0.6, pointerEvents: 'none' }} />
            )}
          </div>
          <div style={S.canvasLabel}>{gridW}×{gridH} · transparent background shown in game</div>
        </div>

        {/* ---- Sidebar ---- */}
        <PixelSidebar
          tool={tool} setTool={setTool}
          brushSize={brushSize} setBrushSize={setBrushSize}
          color={color} setColor={setColor}
          showGrid={showGrid} setShowGrid={setShowGrid}
          showMask={false} setShowMask={() => {}}
          jitterEnabled={jitterEnabled} setJitterEnabled={setJitterEnabled}
          jitterAmount={jitterAmount} setJitterAmount={setJitterAmount}
          opacity={opacity} setOpacity={setOpacity}
          preserveTransparency={preserveTransparency} setPreserveTransparency={setPreserveTransparency}
          onUndo={undo} onRedo={redo} onClear={clearAll}
          zoom={zoom} setZoom={setZoom}
          extraQuickActions={[
            { label: loadedObjId ? `Load obj… (${objName||'…'})` : 'Load obj…', fn: openLibraryPanel },
          ]}
          onExport={generateExport}
          exportReady={!!exportImg && !exportPanelOpen}
          onViewExport={() => setExportPanelOpen(true)}
          loadedName={loadedObjId ? objName : null}
          onStartNew={startNew}
          hideMaskToggle
          extraTopControls={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={S.sectionLabel}>import PNG</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button style={S.exportBtn} onClick={() => fileInputRef.current?.click()}>
                  Import PNG from PixelLab…
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/*"
                  style={{ display: 'none' }}
                  onChange={handleImportFile}
                />
              </div>
              {importError && <div style={{ ...S.hint, color: C.rust }}>{importError}</div>}
              <div style={{ ...S.hint }}>
                saves at original pixel dimensions — canvas auto-resizes to match
              </div>

              <div style={S.sectionLabel}>canvas size</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="number" min="1" max="200" value={objW}
                  onChange={e => setObjW(Math.max(1, Math.min(200, Number(e.target.value))))}
                  style={{ ...S.textInput, width: 60 }} />
                <span style={{ color: C.textDim, fontSize: 10 }}>×</span>
                <input type="number" min="1" max="400" value={objH}
                  onChange={e => setObjH(Math.max(1, Math.min(400, Number(e.target.value))))}
                  style={{ ...S.textInput, width: 60 }} />
                <button style={S.actionBtn} onClick={applyDimensions}>Apply</button>
              </div>
              {(objW !== gridW || objH !== gridH) && (
                <div style={{ ...S.hint, color: C.rust }}>unsaved size change — click Apply to resize canvas</div>
              )}

              <div style={S.sectionLabel}>crop / expand</div>
              <button style={S.actionBtn} onClick={applyCrop}>Auto-trim transparent edges</button>
              <div style={{ fontSize: 9, color: C.textDim }}>add padding (px)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                {[['top', expandTop, setExpandTop], ['right', expandRight, setExpandRight],
                  ['bottom', expandBottom, setExpandBottom], ['left', expandLeft, setExpandLeft]].map(([label, val, setter]) => (
                  <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.textDim }}>
                    {label}
                    <input type="number" min="0" max="200" value={val}
                      onChange={e => setter(Math.max(0, Number(e.target.value)))}
                      style={{ ...S.textInput, width: 44, padding: '4px 6px' }} />
                  </label>
                ))}
              </div>
              <button style={S.actionBtn} onClick={applyExpand}>Apply padding</button>

              <div style={S.sectionLabel}>scale (nearest-neighbour)</div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="number" min="1" max="400" value={scaleTargetW}
                  onChange={e => setScaleTargetW(Math.max(1, Math.min(400, Number(e.target.value))))}
                  style={{ ...S.textInput, width: 60 }} />
                <span style={{ color: C.textDim, fontSize: 10 }}>×</span>
                <input type="number" min="1" max="800" value={scaleTargetH}
                  onChange={e => setScaleTargetH(Math.max(1, Math.min(800, Number(e.target.value))))}
                  style={{ ...S.textInput, width: 60 }} />
                <button style={S.actionBtn} onClick={applyScale}>Scale</button>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[[0.5,'0.5×'],[2,'2×'],[3,'3×']].map(([factor, label]) => (
                  <button key={label} style={{ ...S.actionBtn, flex: 1, textAlign: 'center', fontSize: 10 }}
                    onClick={() => { setScaleTargetW(Math.round(gridW * factor)); setScaleTargetH(Math.round(gridH * factor)); }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          }
        />
      </div>

      {/* ---- Export / save overlay ---- */}
      {exportImg && exportPanelOpen && (
        <Overlay onClose={() => setExportPanelOpen(false)} title="SAVE OBJECT">
          <ExportPreview img={exportImg} w={gridW} h={gridH} />

          <div style={S.sectionLabel}>object name</div>
          <input style={S.textInput} value={objName}
            onChange={e => { setObjName(e.target.value); setSaveStatus(null); }}
            placeholder="object name (e.g. rusted barrel, derelict mast)" />

          <div style={S.sectionLabel}>footprint</div>
          <FootprintPicker footprint={footprint} onChange={setFootprint} />

          <div style={S.sectionLabel}>default entity behavior</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 9, color: C.textDim, marginBottom: 2 }}>kind</div>
              <select value={defaultKind} onChange={e => setDefaultKind(e.target.value)}
                style={S.textInput}>
                <option value="object">object</option>
                <option value="npc">npc</option>
                <option value="info">info / sign</option>
                <option value="casework">terminal</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 9, color: C.textDim, marginBottom: 2 }}>trigger on</div>
              <select value={defaultTrigger} onChange={e => setDefaultTrigger(e.target.value)}
                style={S.textInput}>
                <option value="">none (decorative)</option>
                <option value="enter">walk onto</option>
                <option value="use">use (future)</option>
              </select>
            </div>
          </div>
          <label style={S.checkRow}>
            <input type="checkbox" checked={defaultBlocksMovement}
              onChange={e => setDefaultBlocksMovement(e.target.checked)} />
            blocks movement by default
          </label>

          <button style={S.exportBtn} onClick={() => saveToLibrary(false)} disabled={saveStatus==='saving'}>
            {saveStatus==='saving' ? 'Saving…' : loadedObjId ? 'Update object' : 'Save to library'}
          </button>
          {loadedObjId && (
            <button style={S.actionBtn} onClick={() => saveToLibrary(true)} disabled={saveStatus==='saving'}>
              Save as new object instead
            </button>
          )}
          {loadedObjId && (
            <div style={{ marginTop: 6 }}>
              {!deleteConfirm
                ? <button style={{...S.actionBtn, color: C.rust}} onClick={() => setDeleteConfirm(true)}>Delete object from library…</button>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{fontSize:10, color:C.rust}}>Delete «{objName}» permanently?</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={{...S.exportBtn, flex:1}} onClick={deleteFromLibrary} disabled={saveStatus==='saving'}>Yes, delete</button>
                      <button style={{...S.actionBtn, flex:1}} onClick={() => setDeleteConfirm(false)}>Cancel</button>
                    </div>
                  </div>
              }
            </div>
          )}
          {saveStatus==='saved' && <div style={{fontSize:10,color:C.brass}}>Saved — available in the Map Editor.</div>}
          {saveStatus==='error' && <div style={{fontSize:10,color:C.rust}}>{saveError}</div>}
        </Overlay>
      )}

      {/* ---- Object library browser ---- */}
      {libraryPanelOpen && (
        <Overlay onClose={() => setLibraryPanelOpen(false)} title="LOAD OBJECT">
          {objLibraryLoading && <div style={S.hint}>loading…</div>}
          {objLibraryError && <div style={{...S.hint, color:C.rust}}>{objLibraryError}</div>}
          {loadingObj && <div style={S.hint}>decoding…</div>}
          {!objLibraryLoading && !objLibraryError && objLibrary.length === 0 &&
            <div style={S.hint}>no saved objects yet — draw one and save it</div>}
          <div style={S.libraryGrid}>
            {objLibrary.map(obj => (
              <LibraryItem key={obj.id} item={obj} onSelect={() => loadObjFromLibrary(obj)} disabled={loadingObj} />
            ))}
          </div>
        </Overlay>
      )}

      <canvas ref={exportCanvasRef} style={{display:'none'}} />
    </div>
  );
}
