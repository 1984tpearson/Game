import React, { useState } from 'react';
import { supabase } from '../lib/supabase.js';

const PROXY = 'https://keqzqhykfygplolcnxnn.supabase.co/functions/v1/pixellab-proxy';

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

// Get image dimensions from a base64 data URL
function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = dataUrl;
  });
}

function PixellabObjectCard({ obj, onImport, importing }) {
  const busy = importing === obj.id;
  const preview = obj.preview_url;
  return (
    <div style={s.card}>
      {preview
        ? <img src={preview} alt={obj.name} style={s.thumb} crossOrigin="anonymous" />
        : <div style={s.thumbEmpty} />}
      <div style={s.info}>
        <div style={s.name}>{obj.name}</div>
        <div style={s.desc} title={obj.prompt}>{obj.prompt}</div>
        {obj.size && <div style={s.meta}>{obj.size.width}×{obj.size.height}px</div>}
      </div>
      <button
        style={{ ...s.btn, ...(busy ? s.btnDisabled : {}) }}
        onClick={() => onImport(obj)}
        disabled={busy}
      >
        {busy ? '...' : 'Import'}
      </button>
    </div>
  );
}

export default function PixellabObjectImport() {
  const [open, setOpen] = useState(false);
  const [objects, setObjects] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(null);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${PROXY}/objects`);
      const data = await res.json();
      setObjects(data.objects || []);
    } catch (e) {
      setObjects([]);
    }
    setLoading(false);
  }

  async function importObject(plObj) {
    setImporting(plObj.id);
    setMsg('');
    try {
      // Get object detail for image URL
      const res = await fetch(`${PROXY}/objects/${plObj.id}`);
      const detail = await res.json();

      // Objects may have a single image or directional images
      // Use the preview_url from the list as the primary image
      const imageUrl = detail.image_url || plObj.preview_url;
      if (!imageUrl) throw new Error('No image URL found');

      const imageDataUrl = await urlToBase64(imageUrl);
      const { width, height } = await getImageDimensions(imageDataUrl);

      await supabase.from('objects').insert({
        name: plObj.name || plObj.prompt?.slice(0, 60) || 'Imported object',
        image_data_url: imageDataUrl,
        width_px: width,
        height_px: height,
        footprint: [[0, 0]],
        default_kind: 'object',
        default_trigger: null,
        default_blocks_movement: false,
      });

      setMsg(`Imported "${plObj.name}" to object library.`);
    } catch (e) {
      setMsg(`Import failed: ${e.message}`);
    }
    setImporting(null);
  }

  return (
    <div style={s.root}>
      <button style={s.toggleBtn} onClick={() => { setOpen(o => !o); if (!open && objects === null) load(); }}>
        {open ? '▲' : '▼'} Import from PixelLab
      </button>
      {open && (
        <div style={s.body}>
          {msg && <div style={s.msg}>{msg}</div>}
          {loading && <div style={s.hint}>Loading PixelLab objects...</div>}
          {objects !== null && objects.length === 0 && !loading &&
            <div style={s.hint}>No objects in your PixelLab library yet.</div>}
          {objects && objects.map(o => (
            <PixellabObjectCard key={o.id} obj={o} onImport={importObject} importing={importing} />
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  root: { width: '100%', marginTop: '16px', fontFamily: 'var(--font-body)', fontSize: '13px' },
  toggleBtn: { background: 'var(--panel)', border: '1px solid var(--border)',
    color: 'var(--accent)', padding: '7px 14px', fontFamily: 'var(--font-body)',
    fontSize: '12px', cursor: 'pointer', width: '100%', textAlign: 'left' },
  body: { background: 'var(--panel)', border: '1px solid var(--border)',
    borderTop: 'none', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' },
  card: { display: 'flex', gap: '10px', alignItems: 'center', padding: '8px',
    background: 'var(--bg)', border: '1px solid var(--border)' },
  thumb: { width: '48px', height: '48px', objectFit: 'contain',
    imageRendering: 'pixelated', flexShrink: 0 },
  thumbEmpty: { width: '48px', height: '48px', background: 'var(--panel)',
    border: '1px dashed var(--border)', flexShrink: 0 },
  info: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 },
  name: { fontFamily: 'var(--font-heading)', fontSize: '12px', color: 'var(--accent)' },
  desc: { fontSize: '11px', color: 'var(--text-dim)', fontStyle: 'italic',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: '10px', color: 'var(--text-dim)' },
  btn: { background: 'var(--accent)', color: 'var(--bg)', border: 'none',
    padding: '5px 12px', fontFamily: 'var(--font-body)', fontSize: '11px',
    cursor: 'pointer', flexShrink: 0 },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  hint: { fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' },
  msg: { fontSize: '12px', color: 'var(--accent)' },
};
