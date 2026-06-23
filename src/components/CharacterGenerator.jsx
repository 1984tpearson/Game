import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

const PROXY = 'https://keqzqhykfygplolcnxnn.supabase.co/functions/v1/pixellab-proxy';

const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

// Direction label map for display
const DIR_LABEL = {
  north: 'N', 'north-east': 'NE', east: 'E', 'south-east': 'SE',
  south: 'S', 'south-west': 'SW', west: 'W', 'north-west': 'NW',
};

// Poll a background job until complete or failed
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

// Extract sprites from a completed character job response.
// PixelLab returns images keyed by direction in last_response.
function extractSprites(jobData) {
  const raw = jobData?.last_response;
  if (!raw) return null;
  // Structure varies by endpoint; normalise to {direction: base64DataUrl}
  const sprites = {};
  // create-character-v3 returns { rotations: { north: {image}, ... } }
  if (raw.rotations) {
    for (const dir of DIRECTIONS) {
      const img = raw.rotations[dir]?.image;
      if (img?.base64) sprites[dir] = img.base64;
    }
  }
  // create-character-with-8-directions returns { images: [{direction, image}] }
  if (raw.images) {
    for (const item of raw.images) {
      const dir = item.direction?.toLowerCase().replace('_', '-');
      if (dir && item.image?.base64) sprites[dir] = item.image.base64;
    }
  }
  return Object.keys(sprites).length > 0 ? sprites : null;
}

// ── Sprite grid preview ──────────────────────────────────────────────────────
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

// ── Saved character card ─────────────────────────────────────────────────────
function CharacterCard({ char, type, onDelete }) {
  const sprites = char.sprites || {};
  const preview = sprites['south'] || sprites[Object.keys(sprites)[0]];
  return (
    <div style={s.card}>
      {preview
        ? <img src={preview} alt={char.name} style={s.cardThumb} />
        : <div style={s.cardThumbEmpty} />}
      <div style={s.cardInfo}>
        <div style={s.cardName}>{char.name}</div>
        {type === 'npc' && <div style={s.cardRole}>{char.role}</div>}
        <div style={s.cardDesc}>{char.description || char.blurb}</div>
      </div>
      <button style={s.deleteBtn} onClick={() => onDelete(char.id)}>×</button>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function CharacterGenerator() {
  const [tab, setTab] = useState('player');       // 'player' | 'npc'
  const [description, setDescription] = useState('');
  const [npcRole, setNpcRole] = useState('');
  const [npcBlurb, setNpcBlurb] = useState('');
  const [npcNotes, setNpcNotes] = useState('');
  const [charName, setCharName] = useState('');
  const [status, setStatus] = useState('idle');   // idle | generating | saving | done | error
  const [statusMsg, setStatusMsg] = useState('');
  const [sprites, setSprites] = useState(null);
  const [savedPlayers, setSavedPlayers] = useState([]);
  const [savedNpcs, setSavedNpcs] = useState([]);

  // Load saved characters on mount and tab change
  useEffect(() => { loadSaved(); }, [tab]);

  async function loadSaved() {
    if (tab === 'player') {
      const { data } = await supabase.from('player_characters').select('*').order('created_at', { ascending: false });
      setSavedPlayers(data || []);
    } else {
      const { data } = await supabase.from('npc_templates').select('*').order('created_at', { ascending: false });
      setSavedNpcs(data || []);
    }
  }

  function reset() {
    setSprites(null);
    setStatus('idle');
    setStatusMsg('');
    setCharName('');
    setDescription('');
    setNpcRole('');
    setNpcBlurb('');
    setNpcNotes('');
  }

  async function generate() {
    if (!description.trim()) return;
    setStatus('generating');
    setStatusMsg('Submitting to PixelLab...');
    setSprites(null);
    try {
      const res = await fetch(`${PROXY}/create-character-v3`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          image_size: { width: 64, height: 64 },
          no_background: true,
        }),
      });
      const job = await res.json();
      if (!job.background_job_id) throw new Error(job.error || 'No job ID returned');

      setStatusMsg('Generating sprites (this takes ~30s)...');
      const result = await pollJob(job.background_job_id);
      const extracted = extractSprites(result);
      if (!extracted) throw new Error('Could not extract sprites from response');

      setSprites(extracted);
      setStatus('idle');
      setStatusMsg('');
    } catch (err) {
      setStatus('error');
      setStatusMsg(err.message);
    }
  }

  async function save() {
    if (!sprites || !charName.trim()) return;
    setStatus('saving');
    try {
      if (tab === 'player') {
        await supabase.from('player_characters').insert({
          name: charName.trim(),
          description: description.trim(),
          sprites,
        });
      } else {
        await supabase.from('npc_templates').insert({
          name: charName.trim(),
          role: npcRole.trim(),
          blurb: npcBlurb.trim(),
          personality_notes: npcNotes.trim() || null,
          description: description.trim(),
          sprites,
          ai_generated: false,
        });
      }
      setStatus('done');
      setStatusMsg('Saved.');
      loadSaved();
    } catch (err) {
      setStatus('error');
      setStatusMsg(err.message);
    }
  }

  async function deleteChar(id) {
    const table = tab === 'player' ? 'player_characters' : 'npc_templates';
    await supabase.from(table).delete().eq('id', id);
    loadSaved();
  }

  const busy = status === 'generating' || status === 'saving';
  const saved = tab === 'player' ? savedPlayers : savedNpcs;

  return (
    <div style={s.root}>
      {/* Tab bar */}
      <div style={s.tabBar}>
        {['player', 'npc'].map(t => (
          <button key={t} style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
            onClick={() => { setTab(t); reset(); }}>
            {t === 'player' ? 'Player Characters' : 'NPC Templates'}
          </button>
        ))}
      </div>

      <div style={s.body}>
        {/* Left: generator form */}
        <div style={s.panel}>
          <div style={s.sectionTitle}>Generate New</div>

          <label style={s.label}>Description</label>
          <textarea
            style={s.textarea}
            rows={3}
            placeholder={tab === 'player'
              ? 'e.g. a gaunt half-man half-rat in tattered salvager gear'
              : 'e.g. a stocky dock worker with mechanical arm and suspicious eyes'}
            value={description}
            onChange={e => setDescription(e.target.value)}
            disabled={busy}
          />

          {tab === 'npc' && <>
            <label style={s.label}>Role</label>
            <input style={s.input} placeholder="e.g. Ship mechanic" value={npcRole}
              onChange={e => setNpcRole(e.target.value)} disabled={busy} />
            <label style={s.label}>Blurb (opening line)</label>
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

          {statusMsg && (
            <div style={{ ...s.statusMsg, ...(status === 'error' ? s.statusError : {}) }}>
              {statusMsg}
            </div>
          )}

          {/* Sprite preview + save */}
          {sprites && (
            <div style={s.previewSection}>
              <div style={s.sectionTitle}>Preview</div>
              <SpriteGrid sprites={sprites} />
              <label style={s.label}>Save as</label>
              <input style={s.input} placeholder="Character name"
                value={charName} onChange={e => setCharName(e.target.value)} />
              <div style={s.saveRow}>
                <button style={{ ...s.btn, ...(busy ? s.btnDisabled : {}) }}
                  onClick={save} disabled={busy || !charName.trim()}>
                  {status === 'saving' ? 'Saving...' : 'Save to Library'}
                </button>
                <button style={s.secondaryBtn} onClick={reset}>Discard</button>
              </div>
            </div>
          )}
        </div>

        {/* Right: saved library */}
        <div style={s.panel}>
          <div style={s.sectionTitle}>
            {tab === 'player' ? 'Saved Players' : 'Saved NPCs'} ({saved.length})
          </div>
          {saved.length === 0
            ? <div style={s.empty}>None saved yet.</div>
            : saved.map(c => (
                <CharacterCard key={c.id} char={c} type={tab} onDelete={deleteChar} />
              ))}
        </div>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = {
  root: { width: '100%', fontFamily: 'var(--font-body)', color: 'var(--text)', fontSize: '13px' },
  tabBar: { display: 'flex', gap: '6px', marginBottom: '16px' },
  tab: { background: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--text-dim)',
    padding: '7px 18px', fontFamily: 'var(--font-body)', fontSize: '12px', cursor: 'pointer' },
  tabActive: { color: 'var(--player)', borderColor: 'var(--player)' },
  body: { display: 'flex', gap: '24px', alignItems: 'flex-start' },
  panel: { flex: 1, display: 'flex', flexDirection: 'column', gap: '8px',
    background: 'var(--panel)', border: '1px solid var(--border)', padding: '16px' },
  sectionTitle: { fontFamily: 'var(--font-heading)', fontSize: '11px', letterSpacing: '0.08em',
    color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '4px' },
  label: { fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' },
  input: { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '7px 9px', fontFamily: 'var(--font-body)', fontSize: '12px',
    boxSizing: 'border-box' },
  textarea: { width: '100%', background: 'var(--bg)', border: '1px solid var(--border)',
    color: 'var(--text)', padding: '7px 9px', fontFamily: 'var(--font-body)', fontSize: '12px',
    resize: 'vertical', boxSizing: 'border-box' },
  btn: { background: 'var(--accent)', color: 'var(--bg)', border: 'none',
    padding: '8px 18px', fontFamily: 'var(--font-body)', fontSize: '12px',
    cursor: 'pointer', marginTop: '4px' },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  secondaryBtn: { background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-dim)', padding: '8px 14px', fontFamily: 'var(--font-body)',
    fontSize: '12px', cursor: 'pointer', marginTop: '4px' },
  saveRow: { display: 'flex', gap: '8px' },
  statusMsg: { fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' },
  statusError: { color: '#e05' },
  previewSection: { marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' },
  spriteGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' },
  spriteCell: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
  spriteImg: { width: '64px', height: '64px', imageRendering: 'pixelated',
    background: 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 0 0 / 8px 8px' },
  spriteMissing: { width: '64px', height: '64px', background: 'var(--bg)',
    border: '1px dashed var(--border)' },
  spriteLabel: { fontSize: '10px', color: 'var(--text-dim)' },
  card: { display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px',
    background: 'var(--bg)', border: '1px solid var(--border)', position: 'relative' },
  cardThumb: { width: '48px', height: '48px', imageRendering: 'pixelated', flexShrink: 0 },
  cardThumbEmpty: { width: '48px', height: '48px', background: 'var(--panel)',
    border: '1px dashed var(--border)', flexShrink: 0 },
  cardInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' },
  cardName: { fontFamily: 'var(--font-heading)', fontSize: '12px', color: 'var(--accent)' },
  cardRole: { fontSize: '11px', color: 'var(--player)' },
  cardDesc: { fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic' },
  deleteBtn: { background: 'transparent', border: 'none', color: 'var(--text-dim)',
    fontSize: '16px', cursor: 'pointer', lineHeight: 1, padding: '0 2px' },
  empty: { color: 'var(--text-dim)', fontStyle: 'italic', fontSize: '12px' },
};
