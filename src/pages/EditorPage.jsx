import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import TileEditor from '../components/TileEditor.jsx';
import ObjectEditor from '../components/ObjectEditor.jsx';
import CharacterGenerator from '../components/CharacterGenerator.jsx';

export default function EditorPage() {
  const [mode, setMode] = useState('tile'); // 'tile' | 'object' | 'character'

  return (
    <div style={styles.root}>
      <div style={styles.topBar}>
        <Link to="/" style={styles.backLink}>← back</Link>
        <div style={styles.modeRow}>
          <button
            style={{ ...styles.modeBtn, ...(mode === 'tile' ? styles.modeBtnActive : {}) }}
            onClick={() => setMode('tile')}
          >
            Tiles
          </button>
          <button
            style={{ ...styles.modeBtn, ...(mode === 'object' ? styles.modeBtnActive : {}) }}
            onClick={() => setMode('object')}
          >
            Objects
          </button>
          <button
            style={{ ...styles.modeBtn, ...(mode === 'character' ? styles.modeBtnActive : {}) }}
            onClick={() => setMode('character')}
          >
            Characters
          </button>
        </div>
        <Link to="/map-editor" style={styles.navLink}>map editor</Link>
      </div>
      <div style={styles.editorWrap}>
        {mode === 'tile' && <TileEditor />}
        {mode === 'object' && <ObjectEditor />}
        {mode === 'character' && <CharacterGenerator />}
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
  },
  topBar: {
    width: '100%',
    maxWidth: '1200px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '14px',
    fontSize: '12px',
    fontFamily: 'var(--font-body)',
  },
  backLink: {
    color: 'var(--text-dim)',
    textDecoration: 'none',
  },
  navLink: {
    color: 'var(--text-dim)',
    textDecoration: 'none',
  },
  modeRow: {
    display: 'flex',
    gap: '6px',
  },
  modeBtn: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    color: 'var(--text-dim)',
    padding: '6px 16px',
    fontFamily: 'var(--font-body)',
    fontSize: '12px',
    cursor: 'pointer',
  },
  modeBtnActive: {
    color: 'var(--player)',
    borderColor: 'var(--player)',
  },
  editorWrap: {
    width: '100%',
    maxWidth: '1200px',
    overflowX: 'auto',
  },
};
