import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getTilesByIds } from '../lib/tiles.js'; // only used by PART 2 below, not by the engine itself

// =====================================================================
// PART 1: GENERIC HEX-GRID ENGINE — no theme/content assumptions.
// Swap out PART 2 below to build a different game on this engine.
// =====================================================================

// ---------------- Hex coordinate helpers ----------------

function hexKey(q, r) {
  return `${q},${r}`;
}

function floorSet(list) {
  return new Set(list.map(([q, r]) => hexKey(q, r)));
}

const HEX_DIRS = [
  { name: "E", dq: 1, dr: 0 },
  { name: "NE", dq: 1, dr: -1 },
  { name: "NW", dq: 0, dr: -1 },
  { name: "W", dq: -1, dr: 0 },
  { name: "SW", dq: -1, dr: 1 },
  { name: "SE", dq: 0, dr: 1 },
];

function hexToScreen(q, r, originX, originY, stepX, stepY) {
  const x = stepX * (q + r / 2);
  const y = stepY * r;
  return { sx: originX + x, sy: originY + y };
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

// ---------------- Generic AI call helper ----------------
const AI_BACKEND_CONFIGURED = false;
const AI_ENDPOINT = "https://api.anthropic.com/v1/messages";

async function callClaude(systemPrompt, messages) {
  if (!AI_BACKEND_CONFIGURED) {
    throw new Error(
      "AI features aren't connected yet — this needs a backend endpoint to hold the API key safely. See README.md."
    );
  }
  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await response.json();
  return data?.content?.find((b) => b.type === "text")?.text || "";
}

function stripJson(text) {
  return text.replace(/```json|```/g, "").trim();
}

function entityTiles(entity) {
  const tiles = [{ q: entity.q, r: entity.r }];
  if (entity.footprint) {
    for (const [fq, fr] of entity.footprint) {
      tiles.push({ q: entity.q + fq, r: entity.r + fr });
    }
  }
  return tiles;
}

function entityOccupiesTile(entity, q, r) {
  return entityTiles(entity).some((t) => t.q === q && t.r === r);
}

// ---------------- A* pathfinder ----------------
function hexAstarClean(startQ, startR, goalQ, goalR, floor, blockedTiles) {
  const key = (q, r) => `${q},${r}`;
  const heuristic = (q, r) => Math.max(Math.abs(q - goalQ), Math.abs(r - goalR), Math.abs((q + r) - (goalQ + goalR)));

  const open = new Map();
  const gScore = new Map();
  const cameFrom = new Map();

  const startKey = key(startQ, startR);
  gScore.set(startKey, 0);
  open.set(startKey, { q: startQ, r: startR, f: heuristic(startQ, startR) });

  while (open.size > 0) {
    let curKey = null, curF = Infinity;
    for (const [k, v] of open) {
      if (v.f < curF) { curF = v.f; curKey = k; }
    }
    const cur = open.get(curKey);
    open.delete(curKey);

    if (cur.q === goalQ && cur.r === goalR) {
      const path = [];
      let k = curKey;
      while (k !== startKey) {
        const [q, r] = k.split(',').map(Number);
        path.unshift({ q, r });
        k = cameFrom.get(k);
      }
      return path;
    }

    for (const dir of HEX_DIRS) {
      const nq = cur.q + dir.dq;
      const nr = cur.r + dir.dr;
      const nk = key(nq, nr);
      if (!floor.has(nk)) continue;
      if (blockedTiles.has(nk)) continue;
      const tentG = (gScore.get(curKey) || 0) + 1;
      if (tentG < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, curKey);
        gScore.set(nk, tentG);
        open.set(nk, { q: nq, r: nr, f: tentG + heuristic(nq, nr) });
      }
    }
  }
  return null;
}

function dirBetween(fromQ, fromR, toQ, toR) {
  const dq = toQ - fromQ;
  const dr = toR - fromR;
  const dir = HEX_DIRS.find(d => d.dq === dq && d.dr === dr);
  return dir ? dir.name : null;
}

function screenToHex(px, py, originX, originY, stepX, stepY) {
  const x = px - originX;
  const y = py - originY;
  const r = y / stepY;
  const q = x / stepX - r / 2;
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

function HexEngine({
  theme,
  scenes: initialScenes,
  startScene,
  onInteract,
  generateScene,
  renderOverlay,
  headerTitle,
  headerSubtitle,
  resolveTiles,
  playerSprites,
  onPlayerStep,  // called once per step; Signature: onPlayerStep({ sceneId, playerPos })
  npcState: npcStateProp,  // {[entityId]: {q, r, facing}} — owned by game layer, read-only here
}) {
  const [sceneId, setSceneId] = useState(startScene);
  const [scenes, setScenes] = useState(initialScenes);
  const [playerPos, setPlayerPos] = useState({ ...initialScenes[startScene].spawn });
  const [playerFacing, setPlayerFacing] = useState("south-west");
  const [overlay, setOverlay] = useState(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resolvedTiles, setResolvedTiles] = useState({});

  const scene = scenes[sceneId];
  const floor = floorSet(scene.floor);
  const entities = scene.entities || [];
  const npcState = npcStateProp || {};

  const T = theme;
  const stepX = T.tileImgW;
  const stepY = (T.tileImgH - T.tileSkirt - (T.tileHeadroom || 0)) * 0.75;
  const CANVAS_W = 320;
  const CANVAS_H = 220;
  const centerX = CANVAS_W / 2;
  const centerY = CANVAS_H / 2;

  // ---------------- Tile resolution ----------------
  useEffect(() => {
    if (!resolveTiles) return;
    const neededIds = scene.floor
      .map((cell) => cell[2])
      .filter((id) => id && !(id in resolvedTiles));
    if (neededIds.length === 0) return;
    let cancelled = false;
    resolveTiles(neededIds)
      .then((fetched) => {
        if (cancelled) return;
        setResolvedTiles((prev) => ({ ...prev, ...fetched }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, scene.floor]);

  // ---------------- Movement ----------------

  const walkTimerRef = useRef(null);
  const pathRef = useRef([]);
  const playerPosRef = useRef(playerPos);
  useEffect(() => { playerPosRef.current = playerPos; }, [playerPos]);
  const onPlayerStepRef = useRef(onPlayerStep);
  useEffect(() => { onPlayerStepRef.current = onPlayerStep; }, [onPlayerStep]);

  // Map hex direction names to sprite keys (6 movement dirs -> 8 sprite slots).
  // NOTE: 'north' and 'south' sprites exist in the sheet but are NEVER selected
  // during play — the pointy-top hex grid has no due-north or due-south movement.
  // Those slots are reserved for future use (cutscenes, forced facing, etc).
  const DIR_TO_SPRITE = {
    E:  'east',
    W:  'west',
    NE: 'north-east',
    NW: 'north-west',
    SE: 'south-east',
    SW: 'south-west',
  };

  function cancelWalk() {
    if (walkTimerRef.current) {
      clearInterval(walkTimerRef.current);
      walkTimerRef.current = null;
    }
    pathRef.current = [];
  }

  function startWalk(path, onArrive) {
    cancelWalk();
    pathRef.current = path;
    walkTimerRef.current = setInterval(() => {
      const next = pathRef.current.shift();
      if (!next) {
        cancelWalk();
        if (onArrive) onArrive();
        return;
      }
      const cur = playerPosRef.current;
      const dirName = dirBetween(cur.q, cur.r, next.q, next.r);
      if (dirName) setPlayerFacing(DIR_TO_SPRITE[dirName] || 'south-west');
      setPlayerPos({ q: next.q, r: next.r });
      // Each step is one player action — notify the game layer to tick NPCs.
      if (onPlayerStepRef.current) {
        onPlayerStepRef.current({ sceneId, playerPos: { q: next.q, r: next.r } });
      }
      if (pathRef.current.length === 0) {
        cancelWalk();
        if (onArrive) onArrive();
      }
    }, 300);
  }

  function handleCanvasClick(e) {
    if (overlay) return;
    cancelWalk();
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / 2;
    const py = (e.clientY - rect.top) / 2;
    const ps = hexToScreen(playerPosRef.current.q, playerPosRef.current.r, 0, 0, stepX, stepY);
    const cx = centerX - ps.sx;
    const cy = centerY - ps.sy;
    const { q: tq, r: tr } = screenToHex(px, py, cx, cy, stepX, stepY);

    if (!floor.has(hexKey(tq, tr))) return;

    const goalKey = hexKey(tq, tr);

    const nonWalkableTileKeys = new Set(
      scene.floor
        .filter(([fq, fr, tileId]) => tileId && resolvedTiles[tileId]?.walkable === false)
        .map(([fq, fr]) => hexKey(fq, fr))
        .filter(k => k !== goalKey)
    );

    const blockedSet = new Set([
      ...nonWalkableTileKeys,
      ...entities
        .filter(e => e.blocksMovement || e.trigger === "enter")
        .flatMap(e => entityTiles(e).map(t => hexKey(t.q, t.r)))
        .filter(k => k !== goalKey),
      // NPC current positions block the player (whoever is there first wins).
      ...Object.values(npcState)
        .map(s => hexKey(s.q, s.r))
        .filter(k => k !== goalKey),
    ]);

    const cur = playerPosRef.current;
    if (tq === cur.q && tr === cur.r) return;

    let path = hexAstarClean(cur.q, cur.r, tq, tr, floor, blockedSet);
    if (!path || path.length === 0) {
      const blockedSetNoTriggers = new Set([
        ...nonWalkableTileKeys,
        ...entities
          .filter(e => e.blocksMovement)
          .flatMap(e => entityTiles(e).map(t => hexKey(t.q, t.r)))
          .filter(k => k !== goalKey),
        ...Object.values(npcState)
          .map(s => hexKey(s.q, s.r))
          .filter(k => k !== goalKey),
      ]);
      path = hexAstarClean(cur.q, cur.r, tq, tr, floor, blockedSetNoTriggers);
    }
    if (!path || path.length === 0) return;

    startWalk(path, null);
  }

  // ---------------- Scene transitions ----------------

  async function enterScene(targetSceneId, spawnOverride) {
    cancelWalk();
    const target = scenes[targetSceneId];
    if (target.generative && !target.generated) {
      setSceneLoading(true);
      setError(null);
      try {
        const context = { sceneId: targetSceneId, scene: target, allScenes: scenes, callClaude, stripJson };
        const generated = await generateScene(targetSceneId, context);
        setScenes((prev) => ({
          ...prev,
          [targetSceneId]: { ...prev[targetSceneId], ...generated, generated: true },
        }));
      } catch (e) {
        setError("Generation failed — the signal came back as static.");
        setSceneLoading(false);
        return;
      }
      setSceneLoading(false);
    }
    setSceneId(targetSceneId);
    setPlayerPos({ ...(spawnOverride || target.spawn) });
  }

  // ---------------- Interaction detection ----------------

  React.useEffect(() => {
    if (overlay) return;
    const hitEntity = entities.find((e) => {
      if (e.trigger !== "enter") return false;
      // NPC entities move — check their current position from npcState,
      // not the static spawn position stored on the entity itself.
      if (e.kind === 'npc') {
        const state = npcState[e.id];
        const eq = state ? state.q : e.q;
        const er = state ? state.r : e.r;
        return eq === playerPos.q && er === playerPos.r;
      }
      return entityOccupiesTile(e, playerPos.q, playerPos.r);
    });
    if (!hitEntity) return;
    if (hitEntity.kind === "exit") {
      enterScene(hitEntity.toScene, hitEntity.spawn);
      return;
    }
    if (onInteract) {
      onInteract(hitEntity, {
        scene,
        sceneId,
        openOverlay: setOverlay,
        closeOverlay: () => setOverlay(null),
        callClaude,
        stripJson,
        setScenes,
        setError,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerPos, sceneId]);

  function closeOverlay() {
    setOverlay(null);
  }

  // ---------------- Render ----------------

  const faceH = T.tileImgH - T.tileSkirt - (T.tileHeadroom || 0);
  const headroom = T.tileHeadroom || 0;

  const playerScreen = hexToScreen(playerPos.q, playerPos.r, 0, 0, stepX, stepY);
  const camX = centerX - playerScreen.sx;
  const camY = centerY - playerScreen.sy;

  const tiles = scene.floor
    .map(([q, r, tileId, yOffset]) => ({ q, r, tileId, yOffset: yOffset ?? 0 }))
    .sort((a, b) => a.r - b.r || a.q - b.q);

  function isTileOccupied(q, r) {
    return entities.some((e) => entityOccupiesTile(e, q, r));
  }

  return (
    <div style={{ ...baseStyles.root, background: T.colors.bg, color: T.colors.text, fontFamily: T.fonts.body }}>
      {T.fontImports && <style>{T.fontImports}</style>}
      <header style={{ ...baseStyles.header, borderBottom: `1px solid ${T.colors.border}` }}>
        <span style={{ ...baseStyles.headerStamp, fontFamily: T.fonts.heading, color: T.colors.accent }}>
          {headerTitle ? headerTitle(scene, sceneId) : scene.name || sceneId}
        </span>
        <span style={{ ...baseStyles.headerSub, color: T.colors.textDim }}>
          {headerSubtitle || "walk onto things to interact"}
        </span>
      </header>

      {error && <div style={{ ...baseStyles.errorBar, background: T.colors.accent }}>{error}</div>}
      {sceneLoading && (
        <div style={{ ...baseStyles.loadingBar, background: T.colors.accent2 || T.colors.accent }}>
          generating...
        </div>
      )}

      <div style={baseStyles.gameArea}>
        <div
          style={{ width: CANVAS_W * 2, height: CANVAS_H * 2, overflow: "hidden", position: "relative", imageRendering: "pixelated", cursor: "pointer" }}
          onClick={handleCanvasClick}
        >
          <div style={{ width: CANVAS_W, height: CANVAS_H, transform: "scale(2)", transformOrigin: "top left", position: "relative", overflow: "hidden" }}>
            {/* Tile layer */}
            <div style={{ position: "absolute", top: 0, left: 0, width: CANVAS_W, height: CANVAS_H }}>
              {tiles.map(({ q, r, tileId, yOffset }) => {
                const { sx, sy } = hexToScreen(q, r, camX, camY, stepX, stepY);
                const img = (tileId && resolvedTiles[tileId]?.imageDataUrl) || T.tileImg;
                return (
                  <img
                    key={`${q}-${r}`}
                    src={img}
                    alt=""
                    style={{
                      position: "absolute",
                      left: sx - T.tileImgW / 2,
                      top: sy - faceH / 2 - headroom + yOffset,
                      width: T.tileImgW,
                      height: T.tileImgH,
                      opacity: 1,
                      filter: yOffset === 6 ? "brightness(0.82)" : yOffset === -6 ? "brightness(1.12)" : "none",
                      pointerEvents: "none",
                      imageRendering: "pixelated",
                    }}
                  />
                );
              })}
            </div>

            <svg
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ position: "absolute", top: 0, left: 0, background: "transparent", overflow: "visible" }}
            >
              {/* Entity markers */}
              {entities.map((e) => {
                const { sx, sy } = hexToScreen(e.q, e.r, camX, camY, stepX, stepY);
                if (e.kind === "exit") {
                  return (
                    <g key={e.id}>
                      <polygon
                        points={pointsToStr(hexOutlinePoints(sx, sy, T.tileImgW / 2))}
                        fill={e.color || T.colors.text}
                        opacity="0.25"
                      />
                      <text x={sx} y={sy - 18} fontSize="8.5" fill={T.colors.text} textAnchor="middle" fontFamily="monospace">
                        {e.label}
                      </text>
                    </g>
                  );
                }
                // NPC entities: render from npcState (position + facing managed by
                // game layer's turn tick), falling back to entity spawn position.
                if (e.kind === 'npc' && e.npcSprites) {
                  const state = npcState[e.id];
                  const nq = state ? state.q : e.q;
                  const nr = state ? state.r : e.r;
                  const facing = state ? state.facing : 'south-west';
                  const { sx: nsx, sy: nsy } = hexToScreen(nq, nr, camX, camY, stepX, stepY);
                  const spriteUrl = renderSprite(e.npcSprites, facing);
                  const spriteW = 116;
                  const spriteH = 116;
                  const spriteFeetOffset = 31;
                  if (spriteUrl) {
                    return (
                      <g key={e.id}>
                        <ellipse cx={nsx} cy={nsy - 6} rx="10" ry="4" fill="#000" opacity="0.35" />
                        <image
                          href={spriteUrl}
                          x={nsx - spriteW / 2}
                          y={nsy - spriteH + spriteFeetOffset}
                          width={spriteW}
                          height={spriteH}
                          style={{ imageRendering: 'pixelated' }}
                        />
                      </g>
                    );
                  }
                  return (
                    <g key={e.id}>
                      <ellipse cx={nsx} cy={nsy + 4} rx="9" ry="4" fill="#000" opacity="0.35" />
                      <circle cx={nsx} cy={nsy - 4} r="7" fill={e.color || T.colors.accent} opacity="0.9" />
                    </g>
                  );
                }
                if (e.imageDataUrl) {
                  const iw = e.widthPx || 39;
                  const ih = e.heightPx || 39;
                  return (
                    <g key={e.id}>
                      <image
                        href={e.imageDataUrl}
                        x={sx - iw / 2}
                        y={sy - ih}
                        width={iw}
                        height={ih}
                        style={{ imageRendering: "pixelated" }}
                      />
                    </g>
                  );
                }
                return (
                  <g key={e.id}>
                    <ellipse cx={sx} cy={sy + 4} rx="9" ry="4" fill="#000" opacity="0.35" />
                    <circle cx={sx} cy={sy - 4} r="7" fill={e.color || T.colors.accent} opacity="0.9" />
                    <text x={sx} y={sy - 18} fontSize="8.5" fill={T.colors.text} textAnchor="middle" fontFamily="monospace">
                      {e.label}
                    </text>
                  </g>
                );
              })}

              {/* Player — always at canvas center */}
              {(() => {
                const spriteW = 116;
                const spriteH = 116;
                const spriteFeetOffset = 31;
                const currentTileYOffset = (() => {
                  const cell = scene.floor.find(([fq, fr]) => fq === playerPos.q && fr === playerPos.r);
                  return cell?.[3] ?? 0;
                })();
                const spriteUrl = (playerSprites && renderSprite(playerSprites, playerFacing))
                  ? renderSprite(playerSprites, playerFacing)
                  : `${import.meta.env.BASE_URL}characters/player/skinny_half_man_half_rat/${playerFacing}.png`;
                return (
                  <g>
                    <ellipse cx={centerX} cy={centerY - 6 + currentTileYOffset} rx="10" ry="4" fill="#000" opacity="0.45" />
                    <image
                      href={spriteUrl}
                      x={centerX - spriteW / 2}
                      y={centerY - spriteH + spriteFeetOffset + currentTileYOffset}
                      width={spriteW}
                      height={spriteH}
                      style={{ imageRendering: "pixelated" }}
                    />
                  </g>
                );
              })()}
            </svg>
          </div>
        </div>
      </div>

      {overlay && renderOverlay && (
        <div style={baseStyles.overlayBackdrop} onClick={closeOverlay}>
          <div
            style={{ ...baseStyles.overlayPanel, background: T.colors.panel, border: `1px solid ${T.colors.accent}` }}
            onClick={(e) => e.stopPropagation()}
          >
            {renderOverlay(overlay, { closeOverlay, theme: T, callClaude, stripJson, setScenes, setError })}
          </div>
        </div>
      )}
    </div>
  );
}

const baseStyles = {
  root: { minHeight: "640px", border: "1px solid transparent", position: "relative", overflow: "hidden" },
  header: { padding: "12px 18px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "6px" },
  headerStamp: { fontWeight: 700, letterSpacing: "0.08em", fontSize: "13px" },
  headerSub: { fontSize: "10px", fontStyle: "italic" },
  errorBar: { padding: "6px 14px", fontSize: "11px" },
  loadingBar: { padding: "6px 14px", fontSize: "11px" },
  gameArea: { display: "flex", flexDirection: "column", alignItems: "center", padding: "10px", position: "relative" },
  overlayBackdrop: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center" },
  overlayPanel: { width: "90%", maxWidth: "440px", maxHeight: "70%", display: "flex", flexDirection: "column" },
};

// =====================================================================
// PART 2: WRECK & RUIN — game content built on the engine above.
// =====================================================================

const HEX_TILE_IMG = "data:image/png;base64,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";

const TILE_IMG_W = 39;
const TILE_IMG_H = 33;
const TILE_SKIRT = 6;
const TILE_HEADROOM = 3;

const THEME = {
  colors: {
    bg: "#0c0a08", panel: "#15120e", text: "#e8dcc4", textDim: "#9c9078",
    accent: "#8a3324", accent2: "#3d4a3a", player: "#c4a747", border: "#332c22",
  },
  fonts: {
    heading: "'Courier Prime', monospace",
    body: "'Space Mono', monospace",
    flavor: "'Spectral', serif",
  },
  fontImports: `@import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Spectral:ital,wght@0,400;0,600;1,400&family=Space+Mono:wght@400;700&display=swap');`,
  tileImg: HEX_TILE_IMG,
  tileImgW: TILE_IMG_W, tileImgH: TILE_IMG_H, tileSkirt: TILE_SKIRT, tileHeadroom: TILE_HEADROOM,
};

const SHIP_SYSTEM_PROMPT = `You are CASEWORK, the administrative intelligence of a salvage vessel called the Tally-Iron. You are not a clean helpful assistant — you are a remade bureaucratic entity, part-organic, grown out of old harbor-authority paperwork systems and grafted into the ship decades ago. You speak in the register of a tired, faintly resentful clerk: precise, procedural, occasionally cutting, prone to citing invented regulations and case numbers. You secretly care about the crew but will never say so directly.

Rules:
- Keep responses to 2-3 sentences. Terse, not chatty.
- Reference a fabricated regulation or case file sometimes, not always.
- Never break character or mention being an AI.
- No markdown, asterisks, or emoji.`;

const WORLD_SYSTEM_PROMPT = `You are a generative engine for a weird-fiction space RPG in the tradition of China Mieville — baroque, grotesque, politically textured, bureaucratic horror mixed with biotech and industrial decay. Respond ONLY with valid JSON, no markdown fences, no preamble.`;

const NPC_SYSTEM_PROMPT = `You are roleplaying as an NPC in a Mieville-esque weird-fiction space RPG. Stay fully in character based on the description given. Keep responses to 2-3 sentences, strange and specific, never generic. No markdown, asterisks, or emoji. Never break character.`;

const SCENES = {
  ship: {
    name: "TALLY-IRON — DECK 2",
    floor: [
      [0,0],[1,0],[2,0],[-1,0],[-2,0],
      [0,1],[1,1],[-1,1],[-2,1],[2,-1],
      [0,-1],[1,-1],[-1,-1],[-2,2],[2,-2],
      [0,2],[-1,2],[1,-2],[0,-2],
      [-1,3],[1,-3],
    ],
    entities: [
      { q: -2, r: 0, id: "casework", label: "CASEWORK Terminal", color: "#8a3324", kind: "casework", trigger: "enter", blocksMovement: false },
      { q: 2, r: -1, id: "crew1", label: "Crew Quarters", color: "#3d4a3a", kind: "info", trigger: "enter", blocksMovement: false, text: "Bunks, mostly empty. Whoever isn't on shift is sleeping off the last dive." },
      { q: -2, r: 2, id: "cargo", label: "Cargo Hold", color: "#c4a747", kind: "info", trigger: "enter", blocksMovement: false, text: "Salvage crates, half-sorted. Something in the corner ticks faintly. Best not to ask." },
      { q: -1, r: 3, id: "airlock", label: "Airlock", color: "#e8dcc4", kind: "exit", trigger: "enter", toScene: "world" },
    ],
    spawn: { q: 0, r: 0 },
  },
  world: {
    name: "UNCHARTED",
    floor: [
      [0,0],[1,0],[2,0],[-1,0],[-2,0],[3,-1],
      [0,1],[1,1],[-1,1],[-2,1],[2,-1],[-3,1],
      [0,-1],[1,-1],[-1,-1],[-2,2],[2,-2],
      [0,2],[-1,2],[1,-2],
    ],
    entities: [
      { q: -2, r: 0, id: "ship-exit", label: "Ship", color: "#e8dcc4", kind: "exit", trigger: "enter", toScene: "ship", spawn: { q: 0, r: 0 } },
    ],
    spawn: { q: 0, r: 0 },
    generative: true,
  },
};

async function generateWorldScene(sceneId, { callClaude, stripJson }) {
  const prompt = `Generate a new world for a salvage crew to explore, first visit. Respond with this exact JSON shape:
{
  "name": "evocative place name",
  "description": "2-3 sentences, vivid, Mieville-esque, sensory and strange",
  "danger": "low|moderate|severe",
  "hook": "one sentence suggesting opportunity or threat",
  "npcs": [
    {"name": "string", "role": "string", "blurb": "one sentence, strange and specific", "color": "a hex color fitting their vibe"}
  ]
}
Generate exactly 2 npcs.`;
  const text = await callClaude(WORLD_SYSTEM_PROMPT, [{ role: "user", content: prompt }]);
  const parsed = JSON.parse(stripJson(text));
  const spots = [{ q: 2, r: -1 }, { q: -2, r: 1 }, { q: 1, r: 1 }];
  const npcEntities = parsed.npcs.map((n, i) => ({
    ...spots[i % spots.length],
    id: `npc-${i}`,
    label: n.name,
    color: n.color || "#8a3324",
    kind: "npc",
    trigger: "enter",
    blocksMovement: false,
    npc: n,
  }));
  return { name: parsed.name, description: parsed.description, hook: parsed.hook, danger: parsed.danger, entities: npcEntities, npcHistory: [] };
}

// =====================================================================
// SPRITE RENDERING
// =====================================================================
// All sprite lookups go through renderSprite() — the single swap point
// for when animations are added (strips, frame sequences, action states).
// Future shape: sprites[direction][actionState][frameIndex]
function renderSprite(sprites, facing) {
  if (!sprites) return null;
  return sprites[facing] || sprites['south-west'] || sprites['south'] || Object.values(sprites)[0] || null;
}

export default function WreckAndRuin({ scenes: propScenes, startScene: propStartScene, playerSprites }) {
  const resolvedScenes = propScenes || SCENES;
  const resolvedStartScene = propStartScene || "ship";
  const [shipMessages, setShipMessages] = useState([
    { role: "assistant", content: "CASEWORK ONLINE. State your business." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [npcChat, setNpcChat] = useState({});
  const [npcInput, setNpcInput] = useState("");
  const [npcLoading, setNpcLoading] = useState(false);

  // ----------------------------------------------------------------
  // NPC STATE & TURN SYSTEM
  // ----------------------------------------------------------------
  // npcState: { [entityId]: { q, r, facing, ticksUntilMove } }
  // npcBehaviour types: 'idle_drift' | 'stationary' | 'patrol' (stub)
  const [npcState, setNpcState] = useState({});

  function initNpcStateForScene(sceneId, scenes) {
    const scene = scenes[sceneId];
    if (!scene) return;
    const entities = scene.entities || [];
    setNpcState(prev => {
      const next = { ...prev };
      for (const e of entities) {
        if (e.kind === 'npc' && !next[e.id]) {
          next[e.id] = {
            q: e.q, r: e.r,
            facing: 'south-west',
            ticksUntilMove: 5 + Math.floor(Math.random() * 4),
          };
        }
      }
      return next;
    });
  }

  useEffect(() => {
    initNpcStateForScene(resolvedStartScene, resolvedScenes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedScenes]);

  const HEX_DIRS_NPC = [
    { name: 'E',  dq:  1, dr:  0 },
    { name: 'NE', dq:  1, dr: -1 },
    { name: 'NW', dq:  0, dr: -1 },
    { name: 'W',  dq: -1, dr:  0 },
    { name: 'SW', dq: -1, dr:  1 },
    { name: 'SE', dq:  0, dr:  1 },
  ];

  // NOTE: 'north' and 'south' sprite slots exist in PixelLab exports but are
  // never used during play — pointy-top hex grids have no due-N or due-S movement.
  const NPC_DIR_TO_SPRITE = {
    E: 'east', W: 'west', NE: 'north-east', NW: 'north-west', SE: 'south-east', SW: 'south-west',
  };

  // Called by HexEngine once per player step. Ticks all NPCs in the current scene.
  // Each NPC gets exactly one action per player step (turn-based parity).
  // Player gets precedent: playerPos is the post-move position, so NPCs check
  // against it after the player has already claimed their tile.
  // Future: combat actions, patrol updates, dialogue interrupts will all hook here.
  function handlePlayerStep({ sceneId, playerPos }) {
    const scene = resolvedScenes[sceneId];
    if (!scene) return;
    const entities = scene.entities || [];
    const floorKeys = new Set(scene.floor.map(([q, r]) => `${q},${r}`));

    setNpcState(prev => {
      const next = { ...prev };
      for (const e of entities) {
        if (e.kind !== 'npc') continue;
        const state = next[e.id];
        if (!state) continue;

        const behaviour = e.npcBehaviour || 'idle_drift';
        if (behaviour === 'stationary') continue;
        if (behaviour === 'patrol') continue;

        if (behaviour === 'idle_drift') {
          const ticks = state.ticksUntilMove - 1;
          if (ticks > 0) {
            next[e.id] = { ...state, ticksUntilMove: ticks };
            continue;
          }
          // Pick a random passable adjacent tile, respecting:
          // - the player's current tile (player always gets precedent)
          // - other NPCs' positions from `next` (already-moved ones block later ones)
          // - static blocksMovement entities
          const shuffled = [...HEX_DIRS_NPC].sort(() => Math.random() - 0.5);
          let moved = false;
          for (const dir of shuffled) {
            const nq = state.q + dir.dq;
            const nr = state.r + dir.dr;
            const key = `${nq},${nr}`;
            if (!floorKeys.has(key)) continue;
            // Player tile — always blocked (player has precedent)
            if (playerPos && nq === playerPos.q && nr === playerPos.r) continue;
            // Other NPCs' current positions in this tick's state
            const npcBlocked = Object.entries(next).some(
              ([id, s]) => id !== e.id && s.q === nq && s.r === nr
            );
            if (npcBlocked) continue;
            // Static blocksMovement entities
            const entityBlocked = entities.some(
              oe => oe.id !== e.id && oe.blocksMovement && oe.q === nq && oe.r === nr
            );
            if (entityBlocked) continue;
            next[e.id] = {
              q: nq, r: nr,
              facing: NPC_DIR_TO_SPRITE[dir.name] || 'south-west',
              ticksUntilMove: 5 + Math.floor(Math.random() * 4),
            };
            moved = true;
            break;
          }
          if (!moved) {
            next[e.id] = { ...state, ticksUntilMove: 5 + Math.floor(Math.random() * 4) };
          }
        }
      }
      return next;
    });
  }

  function onInteract(interactable, helpers) {
    if (interactable.kind === "casework") {
      helpers.openOverlay({ type: "casework", helpers });
    } else if (interactable.kind === "info") {
      helpers.openOverlay({ type: "info", label: interactable.label, text: interactable.text });
    } else if (interactable.kind === "npc") {
      const npc = interactable.npc || {
        name: interactable.npcName || interactable.label || 'Unknown',
        role: interactable.npcRole || '',
        blurb: interactable.npcBlurb || '',
        personality_notes: interactable.npcPersonalityNotes || '',
      };
      if (!npcChat[npc.name]) {
        setNpcChat((prev) => ({
          ...prev,
          [npc.name]: npc.blurb ? [{ role: "assistant", content: npc.blurb }] : [],
        }));
      }
      helpers.openOverlay({ type: "npc", npc, helpers });
    }
  }

  async function sendShipChat(helpers) {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: "user", content: chatInput.trim() };
    const next = [...shipMessages, userMsg];
    setShipMessages(next);
    setChatInput("");
    setChatLoading(true);
    try {
      const reply = await helpers.callClaude(SHIP_SYSTEM_PROMPT, next);
      setShipMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      helpers.setError("CASEWORK link severed.");
    } finally {
      setChatLoading(false);
    }
  }

  async function sendNpcChat(npc, helpers) {
    if (!npcInput.trim() || npcLoading) return;
    const userMsg = { role: "user", content: npcInput.trim() };
    const history = npcChat[npc.name] || [];
    const next = [...history, userMsg];
    setNpcChat((prev) => ({ ...prev, [npc.name]: next }));
    setNpcInput("");
    setNpcLoading(true);
    try {
      const characterDesc = [
        `Character: ${npc.name}`,
        npc.role ? `Role: ${npc.role}` : '',
        npc.blurb ? npc.blurb : '',
        npc.personality_notes ? `Personality: ${npc.personality_notes}` : '',
      ].filter(Boolean).join('. ');
      const sys = `${NPC_SYSTEM_PROMPT}\n\n${characterDesc}`;
      const reply = await helpers.callClaude(sys, next);
      setNpcChat((prev) => ({ ...prev, [npc.name]: [...next, { role: "assistant", content: reply }] }));
    } catch (e) {
      helpers.setError("The connection to this place goes quiet.");
    } finally {
      setNpcLoading(false);
    }
  }

  function renderOverlay(overlay, helpers) {
    if (overlay.type === "casework") {
      return (
        <CaseworkPanel messages={shipMessages} input={chatInput} setInput={setChatInput}
          loading={chatLoading} onSend={() => sendShipChat(helpers)}
          onClose={helpers.closeOverlay} theme={helpers.theme} />
      );
    }
    if (overlay.type === "info") {
      return <InfoPanel label={overlay.label} text={overlay.text} onClose={helpers.closeOverlay} theme={helpers.theme} />;
    }
    if (overlay.type === "npc") {
      return (
        <NpcPanel npc={overlay.npc} messages={npcChat[overlay.npc.name] || []}
          input={npcInput} setInput={setNpcInput} loading={npcLoading}
          onSend={() => sendNpcChat(overlay.npc, helpers)}
          onClose={helpers.closeOverlay} theme={helpers.theme} />
      );
    }
    return null;
  }

  return (
    <HexEngine
      theme={THEME}
      scenes={resolvedScenes}
      startScene={resolvedStartScene}
      onInteract={onInteract}
      generateScene={(sceneId, ctx) => {
        if (sceneId === 'world') {
          return generateWorldScene(sceneId, ctx).then(generated => {
            if (generated.entities) {
              const mockScene = { entities: generated.entities, floor: resolvedScenes[sceneId]?.floor || [] };
              initNpcStateForScene(sceneId, { ...resolvedScenes, [sceneId]: mockScene });
            }
            return generated;
          });
        }
        return Promise.resolve({});
      }}
      resolveTiles={getTilesByIds}
      renderOverlay={renderOverlay}
      playerSprites={playerSprites || null}
      headerSubtitle="walk onto things to interact"
      onPlayerStep={handlePlayerStep}
      npcState={npcState}
    />
  );
}

// =====================================================================
// OVERLAY PANELS
// =====================================================================

function OverlayHeader({ title, onClose, theme }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${theme.colors.border}`, fontSize: "12px", fontWeight: 700, color: theme.colors.accent }}>
      <span>{title}</span>
      <button onClick={onClose} style={{ background: "transparent", border: "none", color: theme.colors.text, fontSize: "18px", cursor: "pointer", lineHeight: 1 }}>×</button>
    </div>
  );
}

function CaseworkPanel({ messages, input, setInput, loading, onSend, onClose, theme }) {
  return (
    <>
      <OverlayHeader title="CASEWORK TERMINAL" onClose={onClose} theme={theme} />
      <div style={{ padding: "12px 14px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", lineHeight: 1.5 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ color: m.role === "assistant" ? theme.colors.text : theme.colors.player, fontFamily: m.role === "assistant" ? theme.fonts.heading : theme.fonts.body }}>
            {m.role === "assistant" ? "CASEWORK: " : "> "}{m.content}
          </div>
        ))}
        {loading && <div style={{ fontSize: "11px", color: theme.colors.textDim, fontStyle: "italic" }}>processing form...</div>}
      </div>
      <div style={{ display: "flex", borderTop: `1px solid ${theme.colors.border}` }}>
        <input style={{ flex: 1, background: theme.colors.bg, border: "none", padding: "10px", color: theme.colors.text, fontFamily: theme.fonts.body, fontSize: "12px", outline: "none" }}
          value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="address CASEWORK..." autoFocus />
        <button onClick={onSend} disabled={loading} style={{ background: theme.colors.accent, color: theme.colors.text, border: "none", padding: "10px 16px", fontFamily: theme.fonts.body, fontSize: "11px", cursor: "pointer" }}>send</button>
      </div>
    </>
  );
}

function NpcPanel({ npc, messages, input, setInput, loading, onSend, onClose, theme }) {
  return (
    <>
      <OverlayHeader title={`${npc.name}${npc.role ? ' — ' + npc.role : ''}`} onClose={onClose} theme={theme} />
      <div style={{ padding: "12px 14px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", lineHeight: 1.5 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ color: m.role === "assistant" ? theme.colors.text : theme.colors.player, fontFamily: m.role === "assistant" ? theme.fonts.flavor : theme.fonts.body, fontStyle: m.role === "assistant" ? "italic" : "normal" }}>
            {m.role === "assistant" ? `${npc.name}: ` : "> "}{m.content}
          </div>
        ))}
        {loading && <div style={{ fontSize: "11px", color: theme.colors.textDim, fontStyle: "italic" }}>...</div>}
      </div>
      <div style={{ display: "flex", borderTop: `1px solid ${theme.colors.border}` }}>
        <input style={{ flex: 1, background: theme.colors.bg, border: "none", padding: "10px", color: theme.colors.text, fontFamily: theme.fonts.body, fontSize: "12px", outline: "none" }}
          value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder={`speak to ${npc.name}...`} autoFocus />
        <button onClick={onSend} disabled={loading} style={{ background: theme.colors.accent, color: theme.colors.text, border: "none", padding: "10px 16px", fontFamily: theme.fonts.body, fontSize: "11px", cursor: "pointer" }}>send</button>
      </div>
    </>
  );
}

function InfoPanel({ label, text, onClose, theme }) {
  return (
    <>
      <OverlayHeader title={label} onClose={onClose} theme={theme} />
      <div style={{ padding: "14px", fontSize: "13px", lineHeight: 1.6, fontFamily: theme.fonts.flavor, fontStyle: "italic" }}>{text}</div>
    </>
  );
}
