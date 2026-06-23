import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

const PROXY = 'https://keqzqhykfygplolcnxnn.supabase.co/functions/v1/pixellab-proxy';
const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const DIR_LABEL = {
  north: 'N', 'north-east': 'NE', east: 'E', 'south-east': 'SE',
  south: 'S', 'south-west': 'SW', west: 'W', 'north-west': 'NW',
};

// Fetch a remote image URL and return a base64 data URL
async function urlToBase64(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Poll a background job until complete
async function pollJob(jobId, intervalMs = 3000, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    const res = await fetch(`${PROXY}/background-jobs/${jobId}`);
    const data = await res.json();
    if (data.status === 'completed') return data;
    if (data.status === 'failed') throw new Error(data.error || 'Job failed');
  }
  throw new Error('Job timed out');
}

// Extract sprites from a completed generation job
function extractSpritesFromJob(jobData) {
  const raw = jobData?.last_response;
  if (!raw) return null;
  const sprites = {};
  if (raw.rotations) {
    for (const dir of DIRECTIONS) {
      const img = raw.rotations[dir]?.image;
      if (img?.base64) sprites[dir] = img.base64;
    }
  }
  if (raw.images) {
    for (const item of raw.images) {
      const dir = item.direction?.toLowerCase().replace('_', '-');
      if (dir && item.image?.base64) sprites[dir] = item.image.base64;
    }
  }
  return Object.keys(sprites).length > 0 ? sprites : null;
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SpriteGrid({ sprites }) {
  if (!sprites) return null;
  return (
    <div style={s.spriteGrid}>
      {DIRECTIONS.map(dir => (
        <div key={dir} style={s.spriteCell}>
          {sprites[dir]
            ? <img src={sprites[dir]} alt={dir} style={s.spriteImg} />
            : <div style={s.spriteMissing} />}
          <span style={s.spriteLabel}>{DIR_LABEL[dir]}</span>
        </div>
      ))}
    </div>
  );
}

function CharacterCard({ char, type, onDelete }) {
  const preview = char.sprites?.south || char.sprites?.[Object.keys(char.sprites || {})[0]];
  return (
    <div style={s.card}>
      {preview ? <img src={preview} alt={char.name} style={s.cardThumb} /> : <div style={s.cardThumbEmpty} />}
      <div style={s.cardInfo}>
        <div style={s.cardName}>{char.name}</div>
        {type === 'npc' && <div style={s.cardRole}>{char.role}</div>}
        <div style={s.cardDesc}>{char.description || char.blurb}</div>
      </div>
      <button style={s.deleteBtn} onClick={() => onDelete(char.id)}>×</button>
    </div>
  );
}

// Card for a PixelLab library character (not yet imported)
function PixellabCard({ char, onImport, importing }) {
  const busy = importing === char.id;
  return (
    <div style={s.card}>
      <img src={char.preview_url} alt={char.name} style={s.cardThumb} crossOrigin="anonymous" />
      <div style={s.cardInfo}>
        <div style={s.cardName}>{char.name}</div>
        <div style={s.cardDesc} title={char.prompt}>{char.prompt}</div>
        <div style={{ ...s.cardDesc, marginTop: 2 }}>{char.size.width}×{char.size.height}px · {char.directions} dirs</div>
      </div>
      <button
        style={{ ...s.smallBtn, ...(busy ? s.btnDisabled : {}) }}
        onClick={() => onImport(char)}
        disabled={busy}
      >
        {busy ? '...' : 'Import'}
      </button>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function CharacterGenerator() {
  const [tab, setTab] = useState('player');
  // Generate form state
  const [description, setDescription] = useState('');
  const [npcRole, setNpcRole] = useState('');
  const [npcBlurb, setNpcBlurb] = useState('');
  const [npcNotes, setNpcNotes] = useState('');
  const [charName, setCharName] = useState('');
  const [status, setStatus] = useState('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [sprites, setSprites] = useState(null);
  // Library state
  const [savedChars, setSavedChars] = useState([]);
  // PixelLab import state
  const [plChars, setPlChars] = useState(null);  // null = not loaded
  const [plLoading, setPlLoading] = useState(false);
  const [importing, setImporting] = useState(null); // id of char being imported

  useEffect(() => { loadSaved(); }, [tab]);

  async function loadSaved() {
    const table = tab === 'player' ? 'player_characters' : 'npc_templates';
    const { data } = await supabase.from(table).select('*').order('created_at', { ascending: false });
    setSavedChars(data || []);
  }

  async function loadPixellab() {
    setPlLoading(true);
    try {
      const res = await fetch(`${PROXY}/characters`);
      const data = await res.json();
      setPlChars(data.characters || []);
    } catch (e) {
      setPlChars([]);
    }
    setPlLoading(false);
  }

  // Import a PixelLab character: fetch detail for rotation_urls, convert each to base64
  async function importPixellab(plChar) {
    setImporting(plChar.id);
    try {
      // Get full detail with rotation_urls
      const res = await fetch(`${PROXY}/characters/${plChar.id}`);
      const detail = await res.json();
      const rotationUrls = detail.rotation_urls || {};

      // Convert each direction URL to base64
      const convertedSprites = {};
      await Promise.all(
        Object.entries(rotationUrls).map(async ([dir, url]) => {
          convertedSprites[dir] = await urlToBase64(url);
        })
      );

      // Save to Supabase
      const table = tab === 'player' ? 'player_characters' : 'npc_templates';
      const record = tab === 'player'
        ? { name: plChar.name, description: plChar.prompt, sprites: convertedSprites }
        : { name: plChar.name, role: 'NPC', blurb: '', description: plChar.prompt,
            sprites: convertedSprites, ai_generated: false };
      await supabase.from(table).insert(record);
      loadSaved();
    } catch (e) {
      console.error('Import failed:', e);
    }
    setImporting(null);
  }

  function reset() {
    setSprites(null); setStatus('idle'); setStatusMsg('');
    setCharName(''); setDescription(''); setNpcRole(''); setNpcBlurb(''); setNpcNotes('');
  }

  async function generate() {
    if (!description.trim()) return;
    setStatus('generating'); setStatusMsg('Submitting to PixelLab...'); setSprites(null);
    try {
      const res = await fetch(`${PROXY}/create-character-v3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(),
          image_size: { width: 64, height: 64 }, no_background: true }),
      });
      const job = await res.json();
      if (!job.background_job_id) throw new Error(job.error || 'No job ID');
      setStatusMsg('Generating sprites (~30s)...');
      const result = await pollJob(job.background_job_id);
      const extracted = extractSpritesFromJob(result);
      if (!extracted) throw new Error('Could not extract sprites from response');
      setSprites(extracted); setStatus('idle'); setStatusMsg('');
    } catch (err) { setStatus('error'); setStatusMsg(err.message); }
  }

  async function save() {
    if (!sprites || !charName.trim()) return;
    setStatus('saving');
    try {
      const table = tab === 'player' ? 'player_characters' : 'npc_templates';
      const record = tab === 'player'
        ? { name: charName.trim(), description: description.trim(), sprites }
        : { name: charName.trim(), role: npcRole.trim(), blurb: npcBlurb.trim(),
            personality_notes: npcNotes.trim() || null, description: description.trim(),
            sprites, ai_generated: false };
      await supabase.from(table).insert(record);
      setStatus('done'); setStatusMsg('Saved.'); loadSaved();
    } catch (err) { setStatus('error'); setStatusMsg(err.message); }
  }

  async function deleteChar(id) {
    const table = tab === 'player' ? 'player_characters' : 'npc_templates';
    await supabase.from(table).delete().eq('id', id);
    loadSaved();
  }

  const busy = status === 'generating' || status === 'saving';

  return (
    <div style={s.root}>
      <div style={s.tabBar}>
        {['player', 'npc'].map(t => (
          <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
            onClick={() => { setTab(t); reset(); setPlChars(null); }}>
            {t === 'player' ? 'Player Characters' : 'NPC Templates'}
          </button>
        ))}
      </div>

      <div style={s.body}>
        {/* Left col: generate + import from PixelLab */}
        <div style={s.col}>
          {/* Generate new */}
          <div style={s.panel}>
            <div style={s.sectionTitle}>Generate New</div>
            <label style={s.label}>Description</label>
            <textarea style={s.textarea} rows={3} disabled={busy}
              placeholder={tab === 'player'
                ? 'e.g. a gaunt half-man half-rat in tattered salvager gear'
                : 'e.g. a stocky dock worker with mechanical arm and suspicious eyes'}
              value={description} onChange={e => setDescription(e.target.value)} />
            {tab === 'npc' && <>
              <label style={s.label}>Role</label>
              <input style={s.input} placeholder="e.g. Ship mechanic"
                value={npcRole} onChange={e => setNpcRole(e.target.value)} disabled={busy} />
              <label style={s.label}>Blurb</label>
              <input style={s.input} placeholder="e.g. Don't touch that. I mean it."
                value={npcBlurb} onChange={e => setNpcBlurb(e.target.value)} disabled={busy} />
              <label style={s.label}>Personality notes (optional)</label>
              <input style={s.input} placeholder="e.g. Distrustful, hides a debt"
                value={npcNotes} onChange={e => setNpcNotes(e.target.value)} disabled={busy} />
            </>}
            <button style={{ ...s.btn, ...(busy ? s.btnDisabled : {}) }}
              onClick={generate} disabled={busy || !description.trim()}>
              {status === 'generating' ? 'Generating...' : 'Generate Sprites'}
            </button>
            {statusMsg && <div style={{ ...s.statusMsg, ...(status === 'error' ? s.statusError : {}) }}>{statusMsg}</div>}
            {sprites && (
              <div style={s.previewSection}>
                <div style={s.sectionTitle}>Preview</div>
                <SpriteGrid sprites={sprites} />
                <label style={s.label}>Save as</label>
                <input style={s.input} placeholder="Character name"
                  value={charName} onChange={e => setCharName(e.target.value)} />
                <div style={s.row}>
                  <button style={{ ...s.btn, ...(busy ? s.btnDisabled : {}) }}
                    onClick={save} disabled={busy || !charName.trim()}>
                    {status === 'saving' ? 'Saving...' : 'Save to Library'}
                  </button>
                  <button style={s.secondaryBtn} onClick={reset}>Discard</button>
                </div>
              </div>
            )}
          </div>

          {/* Import from PixelLab */}
          <div style={s.panel}>
            <div style={s.sectionTitle}>Import from PixelLab</div>
            {plChars === null
              ? <button style={s.btn} onClick={loadPixellab} disabled={plLoading}>
                  {plLoading ? 'Loading...' : 'Load PixelLab Library'}
                </button>
              : plChars.length === 0
                ? <div style={s.empty}>No characters in PixelLab library.</div>
                : plChars.map(c => (
                    <PixellabCard key={c.id} char={c} onImport={importPixellab} importing={importing} />
                  ))
            }
          </div>
        </div>

        {/* Right col: saved library */}
        <div style={s.col}>
          <div style={s.panel}>
            <div style={s.sectionTitle}>
              {tab === 'player' ? 'Saved Players' : 'Saved NPCs'} ({savedChars.length})
            </div>
            {savedChars.length === 0
              ? <div style={s.empty}>None saved yet.</div>
              : savedChars.map(c => (
                  <CharacterCard key={c.id} char={c} type={tab} onDelete={deleteChar} />
                ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  root: { width: '100%', fontFamily: 'var(--font-body)', color: 'var(--text)', fontSize: '13px' },
  tabBar: { display: 'flex', gap: '6px', marginBottom: '16px' },
  tab: { background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text-dim)',
    padding: '7px 18px', fontFamily: 'var(--font-body)', fontSize: '12px', cursor: 'pointer' },
  tabActive: { color: 'var(--player)', borderColor: 'var(--player)' },
  body: { display: 'flex', gap: '24px', alignItems: 'flex-start' },
  col: { flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' },
  panel: { display: 'flex', flexDirection: 'column', gap: '8px',
    background: 'var(--panel)', border: '1px solid var(--border)', padding: '16px' },
  sectionTitle: { fontFamily: 'var(--font-heading)', fontSize: '11px', letterSpacing: '0.08em',
    color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '4px' },
  label: { fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' },
  input: { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '7px 9px', fontFamily: 'var(--font-body)',
    fontSize: '12px', boxSizing: 'border-box' },
  textarea: { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '7px 9px', fontFamily: 'var(--font-body)',
    fontSize: '12px', resize: 'vertical', boxSizing: 'border-box' },
  btn: { background: 'var(--accent)', color: 'var(--bg)', border: 'none',
    padding: '8px 18px', fontFamily: 'var(--font-body)', fontSize: '12px',
    cursor: 'pointer', marginTop: '4px', alignSelf: 'flex-start' },
  smallBtn: { background: 'var(--accent)', color: 'var(--bg)', border: 'none',
    padding: '5px 12px', fontFamily: 'var(--font-body)', fontSize: '11px',
    cursor: 'pointer', flexShrink: 0, alignSelf: 'center' },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  secondaryBtn: { background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-dim)', padding: '8px 14px', fontFamily: 'var(--font-body)',
    fontSize: '12px', cursor: 'pointer', marginTop: '4px' },
  row: { display: 'flex', gap: '8px' },
  statusMsg: { fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' },
  statusError: { color: '#e05' },
  previewSection: { marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' },
  spriteGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' },
  spriteCell: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
  spriteImg: { width: '64px', height: '64px', imageRendering: 'pixelated',
    background: 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 0 0 / 8px 8px' },
  spriteMissing: { width: '64px', height: '64px', background: 'var(--bg)',
    border: '1px dashed var(--border)' },
  spriteLabel: { fontSize: '10px', color: 'var(--text-dim)' },
  card: { display: 'flex', gap: '10px', alignItems: 'center', padding: '10px',
    background: 'var(--bg)', border: '1px solid var(--border)' },
  cardThumb: { width: '48px', height: '48px', imageRendering: 'pixelated', flexShrink: 0, objectFit: 'contain' },
  cardThumbEmpty: { width: '48px', height: '48px', background: 'var(--panel)',
    border: '1px dashed var(--border)', flexShrink: 0 },
  cardInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  cardName: { fontFamily: 'var(--font-heading)', fontSize: '12px', color: 'var(--accent)' },
  cardRole: { fontSize: '11px', color: 'var(--player)' },
  cardDesc: { fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  deleteBtn: { background: 'transparent', border: 'none', color: 'var(--text-dim)',
    fontSize: '16px', cursor: 'pointer', lineHeight: 1, padding: '0 2px', flexShrink: 0 },
  empty: { color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '12px' },
};
