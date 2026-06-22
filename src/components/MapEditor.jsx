import React, { useState, useRef, useCallback, useEffect } from 'react';
import { listTiles } from '../lib/tiles.js';
import { listObjects } from '../lib/objects.js';
import { listMaps, loadMap, saveMap, updateMap } from '../lib/maps.js';

// =================================================================
// Matches the game engine's hex geometry: pointy-top axial coords,
// same tile art dimensions, so the preview lines up with the real game.
// =================================================================

const TILE_IMG_W = 39;
const TILE_IMG_H = 33;
const TILE_SKIRT = 6;
const TILE_HEADROOM = 3;
const FACE_H = TILE_IMG_H - TILE_SKIRT - TILE_HEADROOM;
const STEP_X = TILE_IMG_W;
const STEP_Y = FACE_H * 0.75;

// Same default tile art the game ships with, used as a fallback if no
// custom tile from the shared library has been picked yet.
const DEFAULT_TILE_IMG = "data:image/png;base64,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";

const CANVAS_W = 640;
const CANVAS_H = 440;
const ORIGIN_X = CANVAS_W / 2;
const ORIGIN_Y = CANVAS_H / 2;

function hexKey(q, r) {
  return `${q},${r}`;
}

function hexToScreen(q, r) {
  const x = STEP_X * (q + r / 2);
  const y = STEP_Y * r;
  return { sx: ORIGIN_X + x, sy: ORIGIN_Y + y };
}

function screenToHex(sx, sy) {
  const x = sx - ORIGIN_X;
  const y = sy - ORIGIN_Y;
  const r = y / STEP_Y;
  const q = x / STEP_X - r / 2;
  return cubeRound(q, r);
}

function cubeRound(q, r) {
  let x = q;
  let z = r;
  let y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);
  if (xDiff > yDiff && xDiff > zDiff) {
    rx = -ry - rz;
  } else if (yDiff > zDiff) {
    ry = -rx - rz;
  } else {
    rz = -rx - ry;
  }
  return { q: rx, r: rz };
}

const ENTITY_KINDS = [
  { value: "casework", label: "Terminal / AI chat", defaultColor: "#8a3324" },
  { value: "info", label: "Info / sign", defaultColor: "#3d4a3a" },
  { value: "npc", label: "NPC (manual)", defaultColor: "#c4a747" },
  { value: "exit", label: "Exit (scene link)", defaultColor: "#e8dcc4" },
  { value: "object", label: "Object (generic)", defaultColor: "#9c6e30" },
];

function makeEmptyEntity(q, r) {
  return {
    q,
    r,
    id: `entity-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    label: "New Entity",
    color: ENTITY_KINDS[0].defaultColor,
    kind: "casework",
    trigger: "enter",
    blocksMovement: false,
    text: "",
    toScene: "",
  };
}

export default function MapEditor() {
  const [floor, setFloor] = useState([]);
  const [entities, setEntities] = useState([]);
  const [tool, setTool] = useState("floor");
  const [selectedEntityId, setSelectedEntityId] = useState(null);
  const [spawn, setSpawn] = useState(null);
  const [sceneName, setSceneName] = useState("New Scene");
  const [sceneId, setSceneId] = useState("scene_1");
  const [exportStr, setExportStr] = useState("");
  const canvasRef = useRef(null);

  // Map save/load state
  const [loadedMapId, setLoadedMapId] = useState(null);
  const [mapSaveStatus, setMapSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [mapSaveError, setMapSaveError] = useState(null);
  const [mapLibrary, setMapLibrary] = useState([]);
  const [mapLibraryLoading, setMapLibraryLoading] = useState(false);
  const [mapLibraryError, setMapLibraryError] = useState(null);
  const [loadPanelOpen, setLoadPanelOpen] = useState(false);

  const floorSet = new Set(floor.map(([q, r]) => hexKey(q, r)));
  const selectedEntity = entities.find((e) => e.id === selectedEntityId) || null;
  const isPainting = useRef(false);
  // Cells already touched during the current drag stroke, so a single
  // continuous drag doesn't toggle a tile on-then-off as the pointer
  // crosses back over it, and so floor placement reads as "paint" not
  // "click each cell precisely."
  const paintedThisStroke = useRef(new Set());

  // Tile library: tiles saved from the Tile Fabricator. `activeTile` is
  // the one currently used to paint floor tiles with, defaulting to the
  // game's built-in art until the library loads or one is picked.
  const [tileLibrary, setTileLibrary] = useState([]);
  const [tileLibraryLoading, setTileLibraryLoading] = useState(true);
  const [tileLibraryError, setTileLibraryError] = useState(null);
  const [activeTileId, setActiveTileId] = useState(null); // null = use DEFAULT_TILE_IMG
  const [tileYOffset, setTileYOffset] = useState(0); // -6 | 0 | +6

  // Object library: objects saved from the Pixel Editor (object mode).
  // activeObjectId = the object from the library that will be placed when
  // the "Object" sub-tool is active; null means manual entity placement.
  const [objLibrary, setObjLibrary] = useState([]);
  const [objLibraryLoading, setObjLibraryLoading] = useState(true);
  const [objLibraryError, setObjLibraryError] = useState(null);
  const [activeObjectId, setActiveObjectId] = useState(null);
  const [objSubTool, setObjSubTool] = useState('manual'); // 'manual' | 'library'

  useEffect(() => {
    let cancelled = false;
    listTiles()
      .then((tiles) => { if (!cancelled) setTileLibrary(tiles); })
      .catch((e) => { if (!cancelled) setTileLibraryError(e.message || 'Failed to load tile library.'); })
      .finally(() => { if (!cancelled) setTileLibraryLoading(false); });
    listObjects()
      .then((objs) => { if (!cancelled) setObjLibrary(objs); })
      .catch((e) => { if (!cancelled) setObjLibraryError(e.message || 'Failed to load object library.'); })
      .finally(() => { if (!cancelled) setObjLibraryLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function cellFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return screenToHex(sx, sy);
  }

  // Applies the current tool at a given hex. `isStrokeStart` resets the
  // per-drag dedupe set; called once on pointer-down and again on every
  // pointer-move while the mouse/touch is held, so floor/erase behave as
  // continuous painting rather than one cell per click.
  function applyAt(q, r, isStrokeStart) {
    const key = hexKey(q, r);

    if (tool === "floor") {
      if (paintedThisStroke.current.has(key)) return;
      paintedThisStroke.current.add(key);
      setFloor((prev) => {
        const idx = prev.findIndex(([pq, pr]) => hexKey(pq, pr) === key);
        if (idx === -1) return [...prev, [q, r, activeTileId, tileYOffset]];
        if (prev[idx][2] === activeTileId && (prev[idx][3] ?? 0) === tileYOffset) return prev;
        const next = [...prev];
        next[idx] = [q, r, activeTileId, tileYOffset];
        return next;
      });
    } else if (tool === "erase") {
      if (paintedThisStroke.current.has(key)) return;
      paintedThisStroke.current.add(key);
      setFloor((prev) => prev.filter(([pq, pr]) => hexKey(pq, pr) !== key));
      setEntities((prev) => prev.filter((ent) => hexKey(ent.q, ent.r) !== key));
      setSpawn((prevSpawn) => (prevSpawn && hexKey(prevSpawn.q, prevSpawn.r) === key ? null : prevSpawn));
    } else if (tool === "entity") {
      // Single-click only — placing identical entities by dragging would
      // be more confusing than useful, so this ignores drag-move events.
      if (!isStrokeStart) return;
      if (!floorSet.has(key)) return;
      const existing = entities.find((ent) => hexKey(ent.q, ent.r) === key);
      if (existing) {
        setSelectedEntityId(existing.id);
      } else if (objSubTool === 'library' && activeObjectId) {
        // Placing a library object: auto-create an entity pre-filled with
        // the object's defaults, footprint, and a reference to the object
        // library ID so the game engine can fetch its art at runtime.
        const obj = objLibrary.find(o => o.id === activeObjectId);
        if (!obj) return;
        const newEntity = {
          q, r,
          id: `entity-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          label: obj.name,
          color: '#9c6e30',
          kind: obj.default_kind || 'object',
          trigger: obj.default_trigger || null,
          blocksMovement: obj.default_blocks_movement || false,
          footprint: obj.footprint || [[0, 0]],
          objectId: obj.id, // game engine resolves this to the actual image at runtime
          text: '',
          toScene: '',
        };
        setEntities((prev) => [...prev, newEntity]);
        setSelectedEntityId(newEntity.id);
      } else {
        const newEntity = makeEmptyEntity(q, r);
        setEntities((prev) => [...prev, newEntity]);
        setSelectedEntityId(newEntity.id);
      }
    } else if (tool === "spawn") {
      if (!isStrokeStart) return;
      if (!floorSet.has(key)) return;
      setSpawn({ q, r });
    }
  }

  function handlePointerDown(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    isPainting.current = true;
    paintedThisStroke.current = new Set();
    const { q, r } = cellFromEvent(e);
    applyAt(q, r, true);
  }

  function handlePointerMove(e) {
    if (!isPainting.current) return;
    e.preventDefault();
    const { q, r } = cellFromEvent(e);
    applyAt(q, r, false);
  }

  function handlePointerUp(e) {
    isPainting.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  function updateSelectedEntity(patch) {
    setEntities((prev) =>
      prev.map((ent) => (ent.id === selectedEntityId ? { ...ent, ...patch } : ent))
    );
  }

  function deleteSelectedEntity() {
    setEntities((prev) => prev.filter((ent) => ent.id !== selectedEntityId));
    setSelectedEntityId(null);
  }

  function clearAll() {
    setFloor([]);
    setEntities([]);
    setSpawn(null);
    setSelectedEntityId(null);
  }

  function generateExport() {
    // Each floor cell is [q, r, tileId]. tileId is null for the default
    // art, or a string referencing a tile in the shared library — the
    // game engine resolves these IDs to images at runtime.
    const floorStr = floor
      .map(([q, r, tileId, yOffset]) => {
        const tid = tileId ? JSON.stringify(tileId) : "null";
        const yo = yOffset ?? 0;
        return yo !== 0
          ? `[${q},${r},${tid},${yo}]`
          : `[${q},${r},${tid}]`;
      })
      .join(",");
    const entitiesStr = entities
      .map((e) => {
        const fields = [
          `q: ${e.q}`,
          `r: ${e.r}`,
          `id: ${JSON.stringify(e.id)}`,
          `label: ${JSON.stringify(e.label)}`,
          `color: ${JSON.stringify(e.color)}`,
          `kind: ${JSON.stringify(e.kind)}`,
          `trigger: ${JSON.stringify(e.trigger)}`,
          `blocksMovement: ${e.blocksMovement}`,
        ];
        if (e.kind === "info" && e.text) fields.push(`text: ${JSON.stringify(e.text)}`);
        if (e.footprint && !(e.footprint.length === 1 && e.footprint[0][0] === 0 && e.footprint[0][1] === 0))
          fields.push(`footprint: ${JSON.stringify(e.footprint)}`);
        if (e.objectId) fields.push(`objectId: ${JSON.stringify(e.objectId)}`);
        if (e.kind === "exit") {
          fields.push(`toScene: ${JSON.stringify(e.toScene || "")}`);
          fields.push(`spawn: { q: 0, r: 0 } /* TODO: set real spawn point in target scene */`);
        }
        return `      { ${fields.join(", ")} }`;
      })
      .join(",\n");

    const spawnStr = spawn ? `{ q: ${spawn.q}, r: ${spawn.r} }` : "{ q: 0, r: 0 } /* TODO: no spawn set */";

    const out = `  ${sceneId}: {
    name: ${JSON.stringify(sceneName)},
    floor: [${floorStr}],
    entities: [
${entitiesStr}
    ],
    spawn: ${spawnStr},
  },`;
    setExportStr(out);
  }

  function copyExport() {
    navigator.clipboard?.writeText(exportStr);
  }

  // ---------------- Map save / load ----------------

  async function saveCurrentMap(forceNew = false) {
    setMapSaveStatus('saving');
    setMapSaveError(null);
    try {
      const payload = {
        name: sceneName,
        sceneId,
        floor,
        entities,
        spawn,
      };
      if (loadedMapId && !forceNew) {
        await updateMap(loadedMapId, payload);
      } else {
        const created = await saveMap(payload);
        setLoadedMapId(created.id);
      }
      setMapSaveStatus('saved');
    } catch (e) {
      setMapSaveStatus('error');
      setMapSaveError(e.message || 'Save failed.');
    }
  }

  async function openLoadPanel() {
    setLoadPanelOpen(true);
    setMapLibraryLoading(true);
    setMapLibraryError(null);
    try {
      setMapLibrary(await listMaps());
    } catch (e) {
      setMapLibraryError(e.message || 'Failed to load maps.');
    } finally {
      setMapLibraryLoading(false);
    }
  }

  async function loadMapFromLibrary(mapRow) {
    try {
      const full = await loadMap(mapRow.id);
      setFloor(full.floor || []);
      setEntities(full.entities || []);
      setSpawn(full.spawn || null);
      setSceneName(full.name);
      setSceneId(full.scene_id);
      setLoadedMapId(full.id);
      setSelectedEntityId(null);
      setExportStr('');
      setMapSaveStatus(null);
      setLoadPanelOpen(false);
    } catch (e) {
      setMapLibraryError(e.message || 'Failed to load map.');
    }
  }

  function newMap() {
    setFloor([]);
    setEntities([]);
    setSpawn(null);
    setSceneName('New Scene');
    setSceneId('scene_1');
    setLoadedMapId(null);
    setSelectedEntityId(null);
    setExportStr('');
    setMapSaveStatus(null);
  }

  return (
    <div style={styles.root}>
      <style>{fontImports}</style>
      <header style={styles.header}>
        <span style={styles.headerStamp}>MAP EDITOR</span>
        <div style={styles.headerActions}>
          {loadedMapId && (
            <span style={styles.headerSavedName}>{sceneName}</span>
          )}
          <button style={styles.headerBtn} onClick={newMap}>New</button>
          <button style={styles.headerBtn} onClick={openLoadPanel}>Load…</button>
          <button
            style={{ ...styles.headerBtn, ...styles.headerBtnPrimary }}
            onClick={() => saveCurrentMap(false)}
            disabled={mapSaveStatus === 'saving'}
          >
            {mapSaveStatus === 'saving' ? 'Saving…' : loadedMapId ? 'Save' : 'Save as new'}
          </button>
          {loadedMapId && (
            <button style={styles.headerBtn} onClick={() => saveCurrentMap(true)}>Save as new</button>
          )}
        </div>
        <span style={styles.headerSub}>drag to paint floor · click to place entities</span>
      </header>
      {mapSaveStatus === 'saved' && (
        <div style={styles.saveConfirm}>saved — {new Date().toLocaleTimeString()}</div>
      )}
      {mapSaveStatus === 'error' && (
        <div style={{ ...styles.saveConfirm, color: COLORS.rust }}>{mapSaveError}</div>
      )}

      <div style={styles.body}>
        <div style={styles.canvasWrap}>
          <div style={{ position: "relative", width: CANVAS_W, height: CANVAS_H, border: `1px solid ${COLORS.border}`, touchAction: "none" }}>
            {/* Tile art layer: plain HTML <img> tags (not SVG <image>),
                since SVG <image> with data URIs doesn't render reliably
                in some browser contexts — matches the approach used in
                the actual game engine. */}
            <div style={{ position: "absolute", top: 0, left: 0, width: CANVAS_W, height: CANVAS_H, pointerEvents: "none" }}>
              {/* Floor tiles — sorted back-to-front */}
              {[...floor]
                .sort((a, b) => a[1] - b[1] || a[0] - b[0])
                .map(([q, r, tileId, yOffset]) => {
                  const { sx, sy } = hexToScreen(q, r);
                  const img =
                    (tileId && tileLibrary.find((t) => t.id === tileId)?.image_data_url) || DEFAULT_TILE_IMG;
                  return (
                    <img
                      key={hexKey(q, r)}
                      src={img}
                      alt=""
                      style={{
                        position: "absolute",
                        left: sx - TILE_IMG_W / 2,
                        top: sy - FACE_H / 2 - TILE_HEADROOM + (yOffset ?? 0),
                        width: TILE_IMG_W,
                        height: TILE_IMG_H,
                        imageRendering: "pixelated",
                      }}
                    />
                  );
                })}

              {/* Object images — sorted back-to-front alongside tiles,
                  anchored so the image bottom sits at the hex face centre.
                  Only entities that have an objectId get an image here;
                  the SVG marker layer below shows a circle only when the
                  entity is selected, so the image is the primary visual. */}
              {[...entities]
                .filter(e => e.objectId)
                .sort((a, b) => a.r - b.r || b.q - a.q)
                .map(e => {
                  const obj = objLibrary.find(o => o.id === e.objectId);
                  if (!obj) return null;
                  const { sx, sy } = hexToScreen(e.q, e.r);
                  // Also apply the floor tile's yOffset at this position so
                  // objects sit correctly on raised or lowered tiles.
                  const floorCell = floor.find(([fq, fr]) => fq === e.q && fr === e.r);
                  const floorYOffset = floorCell ? (floorCell[3] ?? 0) : 0;
                  const dispW = obj.width_px;
                  const dispH = obj.height_px;
                  const isSelected = e.id === selectedEntityId;
                  return (
                    <img
                      key={`obj-${e.id}`}
                      src={obj.image_data_url}
                      alt={e.label}
                      style={{
                        position: "absolute",
                        left: sx - dispW / 2,
                        top: sy - dispH + 6 + floorYOffset,
                        width: dispW,
                        height: dispH,
                        imageRendering: "pixelated",
                        outline: isSelected ? `2px solid ${COLORS.brass}` : "none",
                        opacity: isSelected ? 1 : 0.92,
                      }}
                    />
                  );
                })}
            </div>

            <svg
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ position: "absolute", top: 0, left: 0, background: "transparent", cursor: "crosshair", touchAction: "none" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              {entities.map((e) => {
                const { sx, sy } = hexToScreen(e.q, e.r);
                const isSelected = e.id === selectedEntityId;
                // Entities with object images: only show the marker circle
                // when selected (so you can see/click the selection state).
                // Otherwise the image itself is the visual — no circle on top.
                if (e.objectId && !isSelected) return null;
                return (
                  <g key={e.id}>
                    <circle
                      cx={sx}
                      cy={sy}
                      r="9"
                      fill={e.color}
                      stroke={isSelected ? COLORS.brass : "#000"}
                      strokeWidth={isSelected ? 2 : 1}
                    />
                    <text x={sx} y={sy - 16} fontSize="8.5" fill={COLORS.text} textAnchor="middle" fontFamily="monospace">
                      {e.label}
                    </text>
                  </g>
                );
              })}

              {spawn && (() => {
                const { sx, sy } = hexToScreen(spawn.q, spawn.r);
                return (
                  <polygon
                    key="spawn-marker"
                    points={`${sx},${sy - 10} ${sx - 7},${sy + 5} ${sx + 7},${sy + 5}`}
                    fill={COLORS.brass}
                    opacity="0.9"
                  />
                );
              })()}
            </svg>
          </div>

          <div style={styles.canvasLabel}>
            click/drag empty space to paint floor (floor tool) · click floor to place/select entity (entity tool) · erase also supports drag
          </div>
        </div>

        <div style={styles.sidebar}>
          <div style={styles.sectionLabel}>scene info</div>
          <input
            style={styles.textInput}
            value={sceneId}
            onChange={(e) => setSceneId(e.target.value.replace(/\s+/g, "_"))}
            placeholder="scene id (e.g. cargo_bay)"
          />
          <input
            style={styles.textInput}
            value={sceneName}
            onChange={(e) => setSceneName(e.target.value)}
            placeholder="display name"
          />

          <div style={styles.sectionLabel}>tool</div>
          <div style={styles.toolGrid}>
            <button style={{ ...styles.toolBtn, ...(tool === "floor" ? styles.toolBtnActive : {}) }} onClick={() => setTool("floor")}>
              Floor
            </button>
            <button style={{ ...styles.toolBtn, ...(tool === "entity" ? styles.toolBtnActive : {}) }} onClick={() => { setTool("entity"); setObjSubTool('manual'); setActiveObjectId(null); }}>
              Entity
            </button>
            <button style={{ ...styles.toolBtn, ...(tool === "spawn" ? styles.toolBtnActive : {}) }} onClick={() => setTool("spawn")}>
              Spawn
            </button>
            <button style={{ ...styles.toolBtn, ...(tool === "erase" ? styles.toolBtnActive : {}) }} onClick={() => setTool("erase")}>
              Erase
            </button>
          </div>

          <div style={styles.sectionLabel}>floor tile</div>
          {tileLibraryLoading && <div style={styles.hint}>loading tile library...</div>}
          {tileLibraryError && <div style={{ ...styles.hint, color: COLORS.rust }}>{tileLibraryError}</div>}
          {!tileLibraryLoading && !tileLibraryError && (
            <div style={styles.tilePickerGrid}>
              <button
                key="default"
                onClick={() => {
                    setActiveTileId(null);
                    setTileYOffset(0);
                  }}
                title="default"
                style={{
                  ...styles.tileSwatchBtn,
                  outline: activeTileId === null ? `2px solid ${COLORS.brass}` : `1px solid ${COLORS.border}`,
                }}
              >
                <img src={DEFAULT_TILE_IMG} alt="default" style={styles.tileSwatchImg} />
              </button>
              {tileLibrary.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTileId(t.id);
                    setTileYOffset(t.default_y_offset ?? 0);
                  }}
                  title={t.name}
                  style={{
                    ...styles.tileSwatchBtn,
                    outline: activeTileId === t.id ? `2px solid ${COLORS.brass}` : `1px solid ${COLORS.border}`,
                  }}
                >
                  <img src={t.image_data_url} alt={t.name} style={styles.tileSwatchImg} />
                </button>
              ))}
            </div>
          )}
          {!tileLibraryLoading && !tileLibraryError && tileLibrary.length === 0 && (
            <div style={styles.hint}>no saved tiles yet — make one in the Pixel Editor</div>
          )}

          <div style={styles.sectionLabel}>tile height offset</div>
          <div style={styles.toolGrid}>
            {[[-6, '▲ +6 up'], [0, '— default'], [6, '▼ +6 down']].map(([val, label]) => (
              <button
                key={val}
                style={{
                  ...styles.toolBtn,
                  ...(tileYOffset === val ? styles.toolBtnActive : {}),
                  gridColumn: val === 0 ? 'span 1' : undefined,
                }}
                onClick={() => setTileYOffset(val)}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={styles.sectionLabel}>place object</div>
          <div style={styles.toolGrid}>
            <button style={{ ...styles.toolBtn, ...(objSubTool === 'manual' ? styles.toolBtnActive : {}) }}
              onClick={() => { setObjSubTool('manual'); setActiveObjectId(null); }}>
              Manual
            </button>
            <button style={{ ...styles.toolBtn, ...(objSubTool === 'library' ? styles.toolBtnActive : {}) }}
              onClick={() => { setObjSubTool('library'); setTool('entity'); }}>
              From library
            </button>
          </div>
          {objSubTool === 'library' && (
            <>
              {objLibraryLoading && <div style={styles.hint}>loading objects...</div>}
              {objLibraryError && <div style={{ ...styles.hint, color: COLORS.rust }}>{objLibraryError}</div>}
              {!objLibraryLoading && objLibrary.length === 0 && (
                <div style={styles.hint}>no saved objects yet — make one in the Pixel Editor (Object mode)</div>
              )}
              <div style={styles.tilePickerGrid}>
                {objLibrary.map((obj) => (
                  <button key={obj.id}
                    onClick={() => { setActiveObjectId(obj.id); setTool('entity'); }}
                    title={obj.name}
                    style={{ ...styles.tileSwatchBtn,
                      outline: activeObjectId === obj.id ? `2px solid ${COLORS.brass}` : `1px solid ${COLORS.border}` }}>
                    <img src={obj.image_data_url} alt={obj.name} style={styles.tileSwatchImg} />
                  </button>
                ))}
              </div>
              {activeObjectId
                ? <div style={styles.hint}>
                    ✓ {objLibrary.find(o => o.id === activeObjectId)?.name} selected — make sure Entity tool is active, then click a floor tile
                  </div>
                : <div style={styles.hint}>pick an object above, then click a floor tile to place it</div>
              }
            </>
          )}

          {selectedEntity && (
            <>
              <div style={styles.sectionLabel}>entity: {selectedEntity.label}</div>
              <label style={styles.fieldLabel}>label</label>
              <input
                style={styles.textInput}
                value={selectedEntity.label}
                onChange={(e) => updateSelectedEntity({ label: e.target.value })}
              />

              <label style={styles.fieldLabel}>kind</label>
              <select
                style={styles.textInput}
                value={selectedEntity.kind}
                onChange={(e) => {
                  const k = ENTITY_KINDS.find((k) => k.value === e.target.value);
                  updateSelectedEntity({ kind: e.target.value, color: k?.defaultColor || selectedEntity.color });
                }}
              >
                {ENTITY_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>

              <label style={styles.fieldLabel}>color</label>
              <input
                type="color"
                style={styles.colorInput}
                value={selectedEntity.color}
                onChange={(e) => updateSelectedEntity({ color: e.target.value })}
              />

              <label style={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={selectedEntity.blocksMovement}
                  onChange={(e) => updateSelectedEntity({ blocksMovement: e.target.checked })}
                />
                blocks movement
              </label>

              <label style={styles.fieldLabel}>trigger</label>
              <select
                style={styles.textInput}
                value={selectedEntity.trigger || ""}
                onChange={(e) => updateSelectedEntity({ trigger: e.target.value || null })}
              >
                <option value="enter">on walk-onto (enter)</option>
                <option value="use">on use (future)</option>
                <option value="">none (decorative)</option>
              </select>

              {selectedEntity.kind === "info" && (
                <>
                  <label style={styles.fieldLabel}>info text</label>
                  <textarea
                    style={styles.textArea}
                    value={selectedEntity.text}
                    onChange={(e) => updateSelectedEntity({ text: e.target.value })}
                  />
                </>
              )}

              {selectedEntity.kind === "exit" && (
                <>
                  <label style={styles.fieldLabel}>target scene id</label>
                  <input
                    style={styles.textInput}
                    value={selectedEntity.toScene}
                    onChange={(e) => updateSelectedEntity({ toScene: e.target.value })}
                    placeholder="e.g. ship"
                  />
                  <div style={styles.hint}>
                    you'll need to manually set the spawn point in the exported code
                  </div>
                </>
              )}

              <button style={styles.dangerBtn} onClick={deleteSelectedEntity}>
                Delete entity
              </button>
            </>
          )}

          <div style={styles.sectionLabel}>actions</div>
          <button style={styles.actionBtn} onClick={clearAll}>Clear all</button>

          <div style={styles.sectionLabel}>export</div>
          <button style={styles.exportBtn} onClick={generateExport}>Generate export</button>
        </div>
      </div>

      {exportStr && (
        <div style={styles.exportPanel}>
          <div style={styles.exportLabel}>
            paste this into your SCENES object in the game file (replacing or adding a scene). Floor
            cells with a tile ID (not null) require the game engine to fetch that tile from the shared
            library at runtime — see the engine's tile-resolution code.
          </div>
          <textarea readOnly value={exportStr} style={styles.exportTextarea} onClick={(e) => e.target.select()} />
          <button style={styles.exportBtn} onClick={copyExport}>Copy to clipboard</button>
        </div>
      )}

      {/* Load map panel */}
      {loadPanelOpen && (
        <div style={styles.loadOverlay} onClick={() => setLoadPanelOpen(false)}>
          <div style={styles.loadPanel} onClick={e => e.stopPropagation()}>
            <div style={styles.loadPanelHeader}>
              <span>LOAD MAP</span>
              <button style={styles.loadCloseBtn} onClick={() => setLoadPanelOpen(false)}>×</button>
            </div>
            <div style={styles.loadPanelBody}>
              {mapLibraryLoading && <div style={styles.hint}>loading…</div>}
              {mapLibraryError && <div style={{ ...styles.hint, color: COLORS.rust }}>{mapLibraryError}</div>}
              {!mapLibraryLoading && !mapLibraryError && mapLibrary.length === 0 && (
                <div style={styles.hint}>no saved maps yet</div>
              )}
              {mapLibrary.map(m => (
                <button key={m.id} style={styles.mapListItem} onClick={() => loadMapFromLibrary(m)}>
                  <span style={styles.mapListName}>{m.name}</span>
                  <span style={styles.mapListMeta}>
                    {m.scene_id} · {new Date(m.updated_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  },
  header: {
    padding: "12px 18px",
    borderBottom: `1px solid ${COLORS.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
  },
  headerActions: {
    display: "flex",
    gap: "6px",
    alignItems: "center",
  },
  headerSavedName: {
    fontSize: "11px",
    color: COLORS.textDim,
    fontStyle: "italic",
    marginRight: "4px",
  },
  headerBtn: {
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.text,
    padding: "6px 12px",
    fontFamily: "'Space Mono', monospace",
    fontSize: "11px",
    cursor: "pointer",
  },
  headerBtnPrimary: {
    background: COLORS.rust,
    border: `1px solid ${COLORS.rust}`,
    color: COLORS.text,
  },
  saveConfirm: {
    padding: "4px 18px",
    fontSize: "10px",
    color: COLORS.brass,
    background: COLORS.panel,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  loadOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  loadPanel: {
    background: COLORS.bg,
    border: `1px solid ${COLORS.brass}`,
    width: "420px",
    maxHeight: "70vh",
    display: "flex",
    flexDirection: "column",
  },
  loadPanelHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    borderBottom: `1px solid ${COLORS.border}`,
    fontSize: "12px",
    fontWeight: 700,
    color: COLORS.brass,
    letterSpacing: "0.08em",
  },
  loadCloseBtn: {
    background: "transparent",
    border: "none",
    color: COLORS.text,
    fontSize: "18px",
    cursor: "pointer",
    lineHeight: 1,
  },
  loadPanelBody: {
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    padding: "8px",
    gap: "4px",
  },
  mapListItem: {
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.text,
    padding: "10px 12px",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "8px",
  },
  mapListName: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "12px",
    color: COLORS.text,
  },
  mapListMeta: {
    fontFamily: "'Space Mono', monospace",
    fontSize: "9px",
    color: COLORS.textDim,
    whiteSpace: "nowrap",
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
    maxWidth: CANVAS_W,
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    minWidth: "260px",
    maxWidth: "260px",
  },
  sectionLabel: {
    fontSize: "10px",
    color: COLORS.textDim,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginTop: "10px",
    marginBottom: "2px",
  },
  fieldLabel: {
    fontSize: "9px",
    color: COLORS.textDim,
    marginTop: "6px",
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
  textArea: {
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.text,
    padding: "8px",
    fontFamily: "'Space Mono', monospace",
    fontSize: "12px",
    width: "100%",
    height: "60px",
    resize: "vertical",
  },
  colorInput: {
    width: "60px",
    height: "32px",
    background: "transparent",
    border: `1px solid ${COLORS.border}`,
    cursor: "pointer",
    flexShrink: 0,
  },
  checkRow: {
    fontSize: "11px",
    color: COLORS.textDim,
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginTop: "6px",
  },
  toolGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "6px",
  },
  toolBtn: {
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
  tilePickerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "4px",
  },
  tileSwatchBtn: {
    background: COLORS.panel,
    border: "none",
    cursor: "pointer",
    padding: "3px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "40px",
  },
  tileSwatchImg: {
    width: "36px",
    height: "30px",
    objectFit: "contain",
    imageRendering: "pixelated",
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
  dangerBtn: {
    background: COLORS.rust,
    border: "none",
    color: COLORS.text,
    padding: "8px",
    fontFamily: "'Space Mono', monospace",
    fontSize: "11px",
    cursor: "pointer",
    marginTop: "10px",
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
  hint: {
    fontSize: "9px",
    color: COLORS.textDim,
    fontStyle: "italic",
    marginTop: "4px",
  },
  exportPanel: {
    borderTop: `1px solid ${COLORS.border}`,
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  exportLabel: {
    fontSize: "10px",
    color: COLORS.textDim,
    marginBottom: "4px",
  },
  exportTextarea: {
    width: "100%",
    height: "200px",
    background: COLORS.panel,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.brass,
    fontFamily: "'Space Mono', monospace",
    fontSize: "10px",
    padding: "8px",
    resize: "vertical",
  },
};
