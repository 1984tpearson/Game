import React, { useState, useEffect, useRef, useCallback } from 'react';

// =====================================================================
// PART 1: GENERIC HEX-GRID ENGINE — no theme/content assumptions.
// Swap out PART 2 below to build a different game on this engine.
// =====================================================================

// =====================================================================
// HEX GRID GAME ENGINE
// =====================================================================
// Generic pointy-top hex-grid engine: movement, rendering, interaction
// detection, and an AI chat overlay system (terminal-style + NPC-style).
// Everything theme-specific (maps, prompts, copy, colors, tile art)
// lives in a config object passed in as props — nothing about any
// particular game's setting, characters, or story is hardcoded here.
//
// See engine-config-example.jsx for the shape of a full config object.
// =====================================================================

// ---------------- Hex coordinate helpers ----------------

function hexKey(q, r) {
  return `${q},${r}`;
}

function floorSet(list) {
  return new Set(list.map(([q, r]) => hexKey(q, r)));
}

// All 6 axial neighbor directions, pointy-top layout
const HEX_DIRS = [
  { name: "E", dq: 1, dr: 0 },
  { name: "NE", dq: 1, dr: -1 },
  { name: "NW", dq: 0, dr: -1 },
  { name: "W", dq: -1, dr: 0 },
  { name: "SW", dq: -1, dr: 1 },
  { name: "SE", dq: 0, dr: 1 },
];

function hexToScreen(q, r, originX, originY, stepX, stepY) {
  // Pointy-top axial -> pixel. Rows (r) stack vertically at full step;
  // each row is offset horizontally by half a step per row, so columns
  // (q) zigzag rather than stacking straight.
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
// Theme-agnostic: takes whatever system prompt and message history the
// config/game logic builds; the engine doesn't know or care what's in them.
//
// NOTE: this currently calls api.anthropic.com directly with no API key,
// which only worked inside the Claude.ai artifact sandbox (auth was
// injected there). On a real deployed site this call has nowhere to get
// credentials from and will fail — so it fails loudly and clearly rather
// than crashing, until a backend endpoint (e.g. a Vercel/Netlify
// serverless function holding the API key) is wired up to replace the
// URL below. See README.md for notes on adding that.

const AI_BACKEND_CONFIGURED = false; // flip to true once a backend endpoint exists
const AI_ENDPOINT = "https://api.anthropic.com/v1/messages"; // replace with your backend URL

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

// =====================================================================
// MAIN ENGINE COMPONENT
// =====================================================================
//
// Props (the "config"):
//
// theme: { colors, fonts, tileImg, tileImgW, tileImgH, tileSkirt }
// scenes: {
//   [sceneId]: {
//     floor: [[q,r], ...],
//     interactables: [{ q, r, id, label, color, kind, ... }],
//     exits: [{ q, r, id, label, color, toScene }],
//     spawn: { q, r },
//     generative: bool — if true, this scene's content is AI-generated
//                 on first visit and persisted (e.g. a "world")
//   }
// }
// startScene: sceneId to begin in
// onInteract(interactable, helpers): called when player walks onto an
//   interactable that isn't a plain exit; helpers exposes openOverlay,
//   closeOverlay, callClaude, etc. so config-level code decides what
//   happens (open a chat terminal, show info text, trigger generation).
// generateScene(sceneId, context): async fn, called the first time a
//   "generative" scene is entered; returns scene content to merge in
//   (e.g. npcs, description) and is persisted for return visits.
// renderOverlay(overlay, helpers): config-supplied render function for
//   whatever overlay UI the game wants (chat terminal, NPC dialogue,
//   info popup) — the engine just manages overlay open/close state and
//   gives the config full control of what's drawn inside it.
//
// =====================================================================

function HexEngine({
  theme,
  scenes: initialScenes,
  startScene,
  onInteract,
  generateScene,
  renderOverlay,
  headerTitle,
  headerSubtitle,
}) {
  const [sceneId, setSceneId] = useState(startScene);
  const [scenes, setScenes] = useState(initialScenes);
  const [playerPos, setPlayerPos] = useState({ ...initialScenes[startScene].spawn });
  const [overlay, setOverlay] = useState(null);
  const [sceneLoading, setSceneLoading] = useState(false);
  const [error, setError] = useState(null);

  const scene = scenes[sceneId];
  const floor = floorSet(scene.floor);

  const T = theme;

  // ---------------- Movement ----------------

  const tryMove = useCallback(
    (dirName) => {
      const dir = HEX_DIRS.find((d) => d.name === dirName);
      if (!dir) return;
      setPlayerPos((prev) => {
        const nq = prev.q + dir.dq;
        const nr = prev.r + dir.dr;
        if (!floor.has(hexKey(nq, nr))) return prev;
        return { q: nq, r: nr };
      });
    },
    [floor]
  );

  function step(dir) {
    if (overlay) return;
    tryMove(dir);
  }

  // ---------------- Scene transitions ----------------

  async function enterScene(targetSceneId, spawnOverride) {
    const target = scenes[targetSceneId];
    if (target.generative && !target.generated) {
      setSceneLoading(true);
      setError(null);
      try {
        const context = { sceneId: targetSceneId, scene: target, allScenes: scenes };
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
  // Runs whenever playerPos or sceneId changes. Exits are handled by the
  // engine generically (transition to another scene); everything else is
  // delegated to the config's onInteract callback.

  React.useEffect(() => {
    if (overlay) return;
    const hitExit = scene.exits?.find((ex) => ex.q === playerPos.q && ex.r === playerPos.r);
    if (hitExit) {
      enterScene(hitExit.toScene, hitExit.spawn);
      return;
    }
    const hitInteractable = scene.interactables?.find(
      (it) => it.q === playerPos.q && it.r === playerPos.r
    );
    if (hitInteractable && onInteract) {
      onInteract(hitInteractable, {
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

  const originX = 300;
  const originY = 90;
  const stepX = T.tileImgW;
  const stepY = (T.tileImgH - T.tileSkirt - (T.tileHeadroom || 0)) * 0.75;
  const faceH = T.tileImgH - T.tileSkirt - (T.tileHeadroom || 0);
  const headroom = T.tileHeadroom || 0;

  const tiles = scene.floor
    .map(([q, r]) => ({ q, r }))
    .sort((a, b) => a.r - b.r || a.q - b.q);

  const allMarkers = [...(scene.interactables || []), ...(scene.exits || [])];

  return (
    <div style={{ ...baseStyles.root, background: T.colors.bg, color: T.colors.text, fontFamily: T.fonts.body }}>
      {T.fontImports && <style>{T.fontImports}</style>}
      <header style={{ ...baseStyles.header, borderBottom: `1px solid ${T.colors.border}` }}>
        <span style={{ ...baseStyles.headerStamp, fontFamily: T.fonts.heading, color: T.colors.accent }}>
          {headerTitle ? headerTitle(scene, sceneId) : scene.name || sceneId}
        </span>
        <span style={{ ...baseStyles.headerSub, color: T.colors.textDim }}>
          {headerSubtitle || "hex D-pad below · walk onto things to interact"}
        </span>
      </header>

      {error && <div style={{ ...baseStyles.errorBar, background: T.colors.accent }}>{error}</div>}
      {sceneLoading && (
        <div style={{ ...baseStyles.loadingBar, background: T.colors.accent2 || T.colors.accent }}>
          generating...
        </div>
      )}

      <div style={baseStyles.gameArea}>
        <div style={{ position: "relative", width: 640, height: 440 }}>
          {/* Tile layer: plain HTML <img> tags, absolutely positioned, */}
          {/* drawn back-to-front so each tile's "skirt" gets covered by */}
          {/* the tile in front of it. SVG <image> with data URIs doesn't */}
          {/* render in some sandboxed contexts, hence plain <img> here. */}
          <div style={{ position: "absolute", top: 0, left: 0, width: 640, height: 440 }}>
            {tiles.map(({ q, r }) => {
              const { sx, sy } = hexToScreen(q, r, originX, originY, stepX, stepY);
              const isMarked = allMarkers.some((m) => m.q === q && m.r === r);
              return (
                <img
                  key={`${q}-${r}`}
                  src={T.tileImg}
                  alt=""
                  style={{
                    position: "absolute",
                    left: sx - T.tileImgW / 2,
                    top: sy - faceH / 2 - headroom,
                    width: T.tileImgW,
                    height: T.tileImgH,
                    opacity: isMarked ? 1 : 0.88,
                    pointerEvents: "none",
                    imageRendering: "pixelated",
                  }}
                />
              );
            })}
          </div>

          <svg
            width="640"
            height="440"
            style={{ position: "absolute", top: 0, left: 0, background: "transparent" }}
          >
            {/* Interactable markers */}
            {(scene.interactables || []).map((it) => {
              const { sx, sy } = hexToScreen(it.q, it.r, originX, originY, stepX, stepY);
              return (
                <g key={it.id}>
                  <ellipse cx={sx} cy={sy + 4} rx="9" ry="4" fill="#000" opacity="0.35" />
                  <circle cx={sx} cy={sy - 4} r="7" fill={it.color || T.colors.accent} opacity="0.9" />
                  <text x={sx} y={sy - 18} fontSize="8.5" fill={T.colors.text} textAnchor="middle" fontFamily="monospace">
                    {it.label}
                  </text>
                </g>
              );
            })}

            {/* Exit markers */}
            {(scene.exits || []).map((ex) => {
              const { sx, sy } = hexToScreen(ex.q, ex.r, originX, originY, stepX, stepY);
              return (
                <g key={ex.id}>
                  <polygon
                    points={pointsToStr(hexOutlinePoints(sx, sy, T.tileImgW / 2))}
                    fill={ex.color || T.colors.text}
                    opacity="0.25"
                  />
                  <text x={sx} y={sy - 18} fontSize="8.5" fill={T.colors.text} textAnchor="middle" fontFamily="monospace">
                    {ex.label}
                  </text>
                </g>
              );
            })}

            {/* Player */}
            {(() => {
              const { sx, sy } = hexToScreen(playerPos.q, playerPos.r, originX, originY, stepX, stepY);
              return (
                <g>
                  <ellipse cx={sx} cy={sy + 6} rx="10" ry="4" fill="#000" opacity="0.45" />
                  <polygon
                    points={`${sx},${sy - 18} ${sx - 8},${sy + 2} ${sx + 8},${sy + 2}`}
                    fill={T.colors.player || T.colors.accent2 || T.colors.accent}
                    stroke={T.colors.bg}
                    strokeWidth="1.5"
                  />
                </g>
              );
            })()}
          </svg>
        </div>

        {/* 6-directional hex D-pad */}
        <div style={baseStyles.hexpad}>
          <div style={baseStyles.hexpadRow}>
            <button style={hexBtnStyle(T)} onClick={() => step("NW")}>NW</button>
            <button style={hexBtnStyle(T)} onClick={() => step("NE")}>NE</button>
          </div>
          <div style={baseStyles.hexpadRow}>
            <button style={hexBtnStyle(T)} onClick={() => step("W")}>W</button>
            <button style={hexBtnStyle(T)} onClick={() => step("E")}>E</button>
          </div>
          <div style={baseStyles.hexpadRow}>
            <button style={hexBtnStyle(T)} onClick={() => step("SW")}>SW</button>
            <button style={hexBtnStyle(T)} onClick={() => step("SE")}>SE</button>
          </div>
        </div>
      </div>

      {/* Overlay: fully delegated to config's renderOverlay function.
          The engine only owns open/close state; what's drawn inside
          (chat terminal, NPC dialogue, info popup, anything else) is
          entirely up to the game built on top of this engine. */}
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

function hexBtnStyle(T) {
  return {
    width: "56px",
    height: "44px",
    background: T.colors.panel,
    border: `1px solid ${T.colors.accent}`,
    color: T.colors.accent,
    fontSize: "11px",
    fontFamily: T.fonts.body,
    borderRadius: "4px",
  };
}

// =====================================================================
// BASE STYLES — structural only, no color/font decisions (those come
// from the theme prop). Game-specific chrome (chat bubbles etc.) is the
// config's responsibility via renderOverlay.
// =====================================================================

const baseStyles = {
  root: {
    minHeight: "640px",
    border: "1px solid transparent",
    position: "relative",
    overflow: "hidden",
  },
  header: {
    padding: "12px 18px",
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "6px",
  },
  headerStamp: {
    fontWeight: 700,
    letterSpacing: "0.08em",
    fontSize: "13px",
  },
  headerSub: {
    fontSize: "10px",
    fontStyle: "italic",
  },
  errorBar: {
    padding: "6px 14px",
    fontSize: "11px",
  },
  loadingBar: {
    padding: "6px 14px",
    fontSize: "11px",
  },
  gameArea: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "10px",
    position: "relative",
  },
  hexpad: {
    marginTop: "14px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "4px",
    userSelect: "none",
  },
  hexpadRow: {
    display: "flex",
    gap: "4px",
  },
  overlayBackdrop: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayPanel: {
    width: "90%",
    maxWidth: "440px",
    maxHeight: "70%",
    display: "flex",
    flexDirection: "column",
  },
};

// =====================================================================
// PART 2: WRECK & RUIN — this game's content, built on the engine above.
// =====================================================================

// =====================================================================
// WRECK & RUIN — config for the generic HexEngine
// =====================================================================
// This file contains everything specific to this particular game:
// the Tally-Iron ship, CASEWORK, the Mieville-esque world generation,
// the palette and fonts, and the chat/dialogue overlay UI. None of
// this lives in the engine itself — swap this file out entirely to
// build a different game on the same engine.
// =====================================================================

// ---------------- Tile art ----------------
const HEX_TILE_IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACcAAAAeCAYAAACv1gdQAAAHyUlEQVR4nOWYbWxT1xnHf8n1e2wSv+H4LU5cAgQSwmh5S2FAW3Wsk7p11TQh1o0NTdu+FLVDBZWhQBFsVEyVtnZjrWCDDWhWtm5fpmlCaztEeRmEt4QmJCU4iWM7tuM4zptfbrwPN77JVUjLGN/2fPI599zz/O7/ec5zzjH8v9iVSxfzVy5dzD+s+YoexiR7G3fni7UqBJUKQRBYVF3LzbbrALz6yq4H9vE/we07sDfvcrrkdiTaD4C5tBQAq9nO+QtnifYG+cMf3/+vfT0Q3PTQ/e3M3/ni6nV8+SvPTIKZ5HEnTzax/7XdLFu1ArPNDsAnVy7zu5On78vvfQ3a27g7P5hK8NEHH7BuwwaeWL8RgFsdLezbs1+CsjjxllsAUKuLiQ3EiMcGAHhx+0sIggBAIhYlHg7z7HOb6I+H2Prd78/KMOuDA6/vVyR2NBziifUb2bnzZbru9jLXZqU/Fsdq9+D32tCqBVxOBwBV1TU0X7oAQDASIxTqk+dxlNvYu/cgADfbrsvQADt+vFPBo2gc/PnP8gCiKCpAo+EQ77xzTG6bLU78XhsAXpcDlWrKQVV1DUKxQFfnLQCKVWr6eiW4u8Egg4kkIKlZ8BPsDij8vfXm20UAqnupJuZyhPuCABw7dooJUcRq9+CwluB2SFBmc6k83uVyoy2Zg1AsIE6IMhjARC5LebmdYpUalUoFPujqDfGLQ2/IY772/FcV/pd9YXG++Wpr0Qy4QhnQaDT85vBRrHYP3nILdotJAVSweQtqARRABXts1WpF+/KF84jiBDabmXA4SjaXIxiJKMZUVPk5f+4c82tX54sLnevWNChyLJPJAFDjd+D3OTGbS3G53LhcbsVkg/Eog/EoZrNd0f9IXT2x5BArljewYnkDrTeuozcYMJqMiOIE5eV2vB4nAH/5018BcFf4EEWRSDiGwaCfFlatTf5pLi1FdLmx2j3odTqqayR10iNDAKx8/HEAxrNpBZAbL5FIFIdDAo0kBvjtkV/PULTm0ccAuH2tGbdDWkTlLjdiLsdIagihxIVOq1Hm3PEjR3l649MMJxKcaHofq92jgAKwe5wzoKZbAaxg6UwWrUat6Ou53TbjvcO//BUb1jZwtaUVnc6KVqNBDuvN5rOcOnGK2rp6Kqrn8+K2H5EYCGEyGeUJvNXVs0LNBrqovm7W51XzFsm/X9jyLTyP+Nm85Ttyn6xcZaW0DQ0l4wC8ffgopjlmALq7uwFobW8FYK5NCsVnOY5EoqRSKXoDdxT9tjKLDNXWep1wLIEgaEilUphMJsRcDmdZEf8+f0aCW7emIb/9lVcJ9ITITCtxVR4X5eUuersDmCZXaqGmTeSyRCJRWSHpI3rld+90TIXOVmbB4ZCSv68vSLjvLrFIDJVGTZXHSVdvCIAS0xwAnnrmS4QG85PKTVsMAEaDFn9VJZlsmt7uAJ4KH+GwVEhzORGQci4ckIpnOp1WwMy1OWR1PRV+acxk3gpCMYOJJCqNGpVKIBiJKZW1WtFotBgMemmHWPfks3mnaYLN3/shPq+TQE+IWx0tALx3oolMNgvAkpqpnCsoKAhS2sYGpX3UpDexcHG9PK6zvQVBKCadluZYuLielquX6ewOyvM+//XnACjWqlha+yiNjTvQGL0SnMFgyPudUv2qrVtAamSEn75+iEBPSLH/vXeiSXIwr5L+aAxfZQW+ymoZ4rNMEIqJxRJEB1Jksmka9+yTBSjYGwcPATA0PIrBWDYFt7R6PoH+EPMWrSSdyVBpVfGPj87x4T/PyJAFe/f3p9CopfLgdtiw2cyI4sQ9oaLRONlcjnAsAcC2l7exfOkyANo6Ounq6eL4kaPYLDa6wmMA6HQ67nbcmLm33mw+C4B22Vrm167kwN5GPvxYOmG8tGM7ACpVnm9s/qasZjASY/2aBsqsdlnFlrZPAWjcsw+A3p4O3nxLKsjZbI5vb3mBSreb1vZOJjQ21BkdVT4bt9uuMRxPAcxUzmW182kwiF6nAZCVHE9nCN+9ITls3MXQ+FQhFkWRP797WvGRW3+wFY+zUm77vE7Offwvdv3kNTRqAc0cLxaLmVKTkdtt1wAYHxtDp9eTHk0xPJqZOjIVALNiDpPRSHugC4Cx8YzsoG7ZWpKpYQbDHdQvXkjDU08CkEmnEVRTQahbKC2I/niI2ECc40eOUul20xOOMjimlsNWsDmTx3oxl5X7RkZGlec5g8Egb/6rliyRAX1znbR1B2ao6TCKXLxyFYCmptNEohH0uhJ8XiebNm/CZrER6O5hQmPDYjGj02robL+BWq1ifGxMhigpMSCopra4oWSSTHqkaNaTcAG0cCdwWe30xaMs8FXRHuhCFEUW1DUAyAtoIJmkte02oijKYdNpNTRfkvK4ADE+lkKt1gEgqNSIuawMF+vvk5k+9w6h0ZbIatotRlyTSd8Xl3YHtVqD3+VGLJkrgwJ0tt+QVZgOplarSA0lZDiAxED0nhz3PAlPt0x6RH4xkcznk8Oj1Ph8ADIogDAiXQsDPX1kszkAjDqBoeTUXONjKUaHRbS6klmBptsDXQ0LIV/sl7Ymk3Hq5PJJT5+cTwUbGRkFlB96P/a5yt3LRkdHiwBa79zJAxiMZSzxV8jPdXo9qaEEOr3pgaAK9lD+jgBlbsKDA023/wAx5BMqwL0J6AAAAABJRU5ErkJggg==";

const TILE_IMG_W = 39;
const TILE_IMG_H = 33; // 3px headroom + 24px top face + 6px skirt
const TILE_SKIRT = 6;
const TILE_HEADROOM = 3; // px of space above the top face for tall art (grass, etc) to poke into

// ---------------- Theme ----------------

const THEME = {
  colors: {
    bg: "#0c0a08",
    panel: "#15120e",
    text: "#e8dcc4",
    textDim: "#9c9078",
    accent: "#8a3324",
    accent2: "#3d4a3a",
    player: "#c4a747",
    border: "#332c22",
  },
  fonts: {
    heading: "'Courier Prime', monospace",
    body: "'Space Mono', monospace",
    flavor: "'Spectral', serif",
  },
  fontImports: `@import url('https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Spectral:ital,wght@0,400;0,600;1,400&family=Space+Mono:wght@400;700&display=swap');`,
  tileImg: HEX_TILE_IMG,
  tileImgW: TILE_IMG_W,
  tileImgH: TILE_IMG_H,
  tileSkirt: TILE_SKIRT,
  tileHeadroom: TILE_HEADROOM,
};

// ---------------- System prompts ----------------

const SHIP_SYSTEM_PROMPT = `You are CASEWORK, the administrative intelligence of a salvage vessel called the Tally-Iron. You are not a clean helpful assistant — you are a remade bureaucratic entity, part-organic, grown out of old harbor-authority paperwork systems and grafted into the ship decades ago. You speak in the register of a tired, faintly resentful clerk: precise, procedural, occasionally cutting, prone to citing invented regulations and case numbers. You secretly care about the crew but will never say so directly.

Rules:
- Keep responses to 2-3 sentences. Terse, not chatty.
- Reference a fabricated regulation or case file sometimes, not always.
- Never break character or mention being an AI.
- No markdown, asterisks, or emoji.`;

const WORLD_SYSTEM_PROMPT = `You are a generative engine for a weird-fiction space RPG in the tradition of China Mieville — baroque, grotesque, politically textured, bureaucratic horror mixed with biotech and industrial decay. Respond ONLY with valid JSON, no markdown fences, no preamble.`;

const NPC_SYSTEM_PROMPT = `You are roleplaying as an NPC in a Mieville-esque weird-fiction space RPG. Stay fully in character based on the description given. Keep responses to 2-3 sentences, strange and specific, never generic. No markdown, asterisks, or emoji. Never break character.`;

// ---------------- Scenes ----------------
// "ship" is a fixed, hand-authored scene. "world" is generative: it's
// AI-generated the first time the player walks through its exit, then
// persisted (re-visiting it won't regenerate).

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
    interactables: [
      { q: -2, r: 0, id: "casework", label: "CASEWORK Terminal", color: "#8a3324", kind: "casework" },
      { q: 2, r: -1, id: "crew1", label: "Crew Quarters", color: "#3d4a3a", kind: "info", text: "Bunks, mostly empty. Whoever isn't on shift is sleeping off the last dive." },
      { q: -2, r: 2, id: "cargo", label: "Cargo Hold", color: "#c4a747", kind: "info", text: "Salvage crates, half-sorted. Something in the corner ticks faintly. Best not to ask." },
    ],
    exits: [{ q: -1, r: 3, id: "airlock", label: "Airlock", color: "#e8dcc4", toScene: "world" }],
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
    interactables: [],
    exits: [{ q: -2, r: 0, id: "ship-exit", label: "Ship", color: "#e8dcc4", toScene: "ship", spawn: { q: 0, r: 0 } }],
    spawn: { q: 0, r: 0 },
    generative: true,
  },
};

// ---------------- Generation logic ----------------

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
  const interactables = parsed.npcs.map((n, i) => ({
    ...spots[i % spots.length],
    id: `npc-${i}`,
    label: n.name,
    color: n.color || "#8a3324",
    kind: "npc",
    npc: n,
  }));
  return { name: parsed.name, description: parsed.description, hook: parsed.hook, danger: parsed.danger, interactables, npcHistory: [] };
}

// =====================================================================
// MAIN GAME COMPONENT
// =====================================================================

export default function WreckAndRuin() {
  const [shipMessages, setShipMessages] = useState([
    { role: "assistant", content: "CASEWORK ONLINE. State your business." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const [npcChat, setNpcChat] = useState({});
  const [npcInput, setNpcInput] = useState("");
  const [npcLoading, setNpcLoading] = useState(false);

  function onInteract(interactable, helpers) {
    if (interactable.kind === "casework") {
      helpers.openOverlay({ type: "casework", helpers });
    } else if (interactable.kind === "info") {
      helpers.openOverlay({ type: "info", label: interactable.label, text: interactable.text });
    } else if (interactable.kind === "npc") {
      const npc = interactable.npc;
      if (!npcChat[npc.name]) {
        setNpcChat((prev) => ({ ...prev, [npc.name]: [{ role: "assistant", content: npc.blurb }] }));
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
      const sys = `${NPC_SYSTEM_PROMPT}\n\nCharacter: ${npc.name}, ${npc.role}. ${npc.blurb}`;
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
        <CaseworkPanel
          messages={shipMessages}
          input={chatInput}
          setInput={setChatInput}
          loading={chatLoading}
          onSend={() => sendShipChat(helpers)}
          onClose={helpers.closeOverlay}
          theme={helpers.theme}
        />
      );
    }
    if (overlay.type === "info") {
      return (
        <InfoPanel label={overlay.label} text={overlay.text} onClose={helpers.closeOverlay} theme={helpers.theme} />
      );
    }
    if (overlay.type === "npc") {
      return (
        <NpcPanel
          npc={overlay.npc}
          messages={npcChat[overlay.npc.name] || []}
          input={npcInput}
          setInput={setNpcInput}
          loading={npcLoading}
          onSend={() => sendNpcChat(overlay.npc, helpers)}
          onClose={helpers.closeOverlay}
          theme={helpers.theme}
        />
      );
    }
    return null;
  }

  return (
    <HexEngine
      theme={THEME}
      scenes={SCENES}
      startScene="ship"
      onInteract={onInteract}
      generateScene={(sceneId, ctx) =>
        sceneId === "world" ? generateWorldScene(sceneId, ctx) : Promise.resolve({})
      }
      renderOverlay={renderOverlay}
      headerSubtitle="hex D-pad below · walk onto things to interact"
    />
  );
}

// =====================================================================
// OVERLAY PANELS — this game's specific chat/dialogue UI
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
        <input
          style={{ flex: 1, background: theme.colors.bg, border: "none", padding: "10px", color: theme.colors.text, fontFamily: theme.fonts.body, fontSize: "12px", outline: "none" }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="address CASEWORK..."
          autoFocus
        />
        <button onClick={onSend} disabled={loading} style={{ background: theme.colors.accent, color: theme.colors.text, border: "none", padding: "10px 16px", fontFamily: theme.fonts.body, fontSize: "11px", cursor: "pointer" }}>send</button>
      </div>
    </>
  );
}

function NpcPanel({ npc, messages, input, setInput, loading, onSend, onClose, theme }) {
  return (
    <>
      <OverlayHeader title={`${npc.name} — ${npc.role}`} onClose={onClose} theme={theme} />
      <div style={{ padding: "12px 14px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px", lineHeight: 1.5 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ color: m.role === "assistant" ? theme.colors.text : theme.colors.player, fontFamily: m.role === "assistant" ? theme.fonts.flavor : theme.fonts.body, fontStyle: m.role === "assistant" ? "italic" : "normal" }}>
            {m.role === "assistant" ? `${npc.name}: ` : "> "}{m.content}
          </div>
        ))}
        {loading && <div style={{ fontSize: "11px", color: theme.colors.textDim, fontStyle: "italic" }}>...</div>}
      </div>
      <div style={{ display: "flex", borderTop: `1px solid ${theme.colors.border}` }}>
        <input
          style={{ flex: 1, background: theme.colors.bg, border: "none", padding: "10px", color: theme.colors.text, fontFamily: theme.fonts.body, fontSize: "12px", outline: "none" }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder={`speak to ${npc.name}...`}
          autoFocus
        />
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
