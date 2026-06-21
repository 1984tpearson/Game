import React from 'react';
import { Link } from 'react-router-dom';
import MapEditor from '../components/MapEditor.jsx';

export default function MapEditorPage() {
  return (
    <div style={styles.root}>
      <div style={styles.topBar}>
        <Link to="/" style={styles.backLink}>← back</Link>
        <Link to="/editor" style={styles.navLink}>tile fabricator</Link>
        <Link to="/game" style={styles.navLink}>play game →</Link>
      </div>
      <div style={styles.editorWrap}>
        <MapEditor />
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
    maxWidth: '960px',
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '14px',
    fontSize: '12px',
    fontFamily: 'var(--font-body)',
  },
  backLink: {
    color: 'var(--text-dim)',
    textDecoration: 'none',
  },
  navLink: {
    color: 'var(--accent2)',
    textDecoration: 'none',
  },
  editorWrap: {
    width: '100%',
    maxWidth: '960px',
  },
};
