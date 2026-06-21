import React from 'react';
import { Link } from 'react-router-dom';
import WreckAndRuinGame from '../components/WreckAndRuinGame.jsx';

export default function GamePage() {
  return (
    <div style={styles.root}>
      <div style={styles.topBar}>
        <Link to="/" style={styles.backLink}>← back</Link>
        <Link to="/editor" style={styles.navLink}>tile fabricator →</Link>
      </div>
      <div style={styles.gameWrap}>
        <WreckAndRuinGame />
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
    maxWidth: '680px',
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
  gameWrap: {
    width: '100%',
    maxWidth: '680px',
  },
};
