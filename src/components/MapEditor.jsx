import React, { useState, useRef, useCallback } from 'react';

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

function hexOutlinePoints(cx, cy, radius) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return pts;
}

function pointsToStr(pts) {
  return pts.map((p) => `${p[0]},${p[1]}`).join(" ");
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

  const floorSet = new Set(floor.map(([q, r]) => hexKey(q, r)));
  const selectedEntity = entities.find((e) => e.id === selectedEntityId) || null;

  function cellFromEvent(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    return screenToHex(sx, sy);
  }

  function handleCanvasClick(e) {
    const { q, r } = cellFromEvent(e);
    const key = hexKey(q, r);

    if (tool === "floor") {
      setFloor((prev) => {
        const exists = prev.some(([pq, pr]) => hexKey(pq, pr) === key);
        if (exists) return prev;
        return [...prev, [q, r]];
      });
    } else if (tool === "erase") {
      setFloor((prev) => prev.filter(([pq, pr]) => hexKey(pq, pr) !== key));
      setEntities((prev) => prev.filter((ent) => hexKey(ent.q, ent.r) !== key));
      if (spawn && hexKey(spawn.q, spawn.r) === key) setSpawn(null);
    } else if (tool === "entity") {
      if (!floorSet.has(key)) return;
      const existing = entities.find((ent) => hexKey(ent.q, ent.r) === key);
      if (existing) {
        setSelectedEntityId(existing.id);
      } else {
        const newEntity = makeEmptyEntity(q, r);
        setEntities((prev) => [...prev, newEntity]);
        setSelectedEntityId(newEntity.id);
      }
    } else if (tool === "spawn") {
      if (!floorSet.has(key)) return;
      setSpawn({ q, r });
    }
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
    const floorStr = floor.map(([q, r]) => `[${q},${r}]`).join(",");
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

  return (
    <div style={styles.root}>
      <style>{fontImports}</style>
      <header style={styles.header}>
        <span style={styles.headerStamp}>MAP EDITOR</span>
        <span style={styles.headerSub}>click to place floor tiles, then entities on top</span>
      </header>

      <div style={styles.body}>
        <div style={styles.canvasWrap}>
          <svg
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ background: "#0c0a08", border: `1px solid ${COLORS.border}`, cursor: "crosshair" }}
            onClick={handleCanvasClick}
          >
            {floor.map(([q, r]) => {
              const { sx, sy } = hexToScreen(q, r);
              return (
                <polygon
                  key={hexKey(q, r)}
                  points={pointsToStr(hexOutlinePoints(sx, sy, TILE_IMG_W / 2 - 1))}
                  fill="#1c1812"
                  stroke="#3a3225"
                  strokeWidth="1"
                />
              );
            })}

            {entities.map((e) => {
              const { sx, sy } = hexToScreen(e.q, e.r);
              const isSelected = e.id === selectedEntityId;
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

          <div style={styles.canvasLabel}>
            click empty space to add floor (floor tool) · click floor to place/select entity (entity tool)
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
            <button style={{ ...styles.toolBtn, ...(tool === "entity" ? styles.toolBtnActive : {}) }} onClick={() => setTool("entity")}>
              Entity
            </button>
            <button style={{ ...styles.toolBtn, ...(tool === "spawn" ? styles.toolBtnActive : {}) }} onClick={() => setTool("spawn")}>
              Spawn
            </button>
            <button style={{ ...styles.toolBtn, ...(tool === "erase" ? styles.toolBtnActive : {}) }} onClick={() => setTool("erase")}>
              Erase
            </button>
          </div>

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
            paste this into your SCENES object in the game file (replacing or adding a scene)
          </div>
          <textarea readOnly value={exportStr} style={styles.exportTextarea} onClick={(e) => e.target.select()} />
          <button style={styles.exportBtn} onClick={copyExport}>Copy to clipboard</button>
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
