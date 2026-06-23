import React from 'react';
import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div style={styles.root}>
      <div style={styles.stampRow}>
        <span style={styles.caseNum}>CASE FILE 0001</span>
      </div>

      <h1 style={styles.title}>WRECK &amp; RUIN</h1>
      <p style={styles.tagline}>
        A salvage crew, a bureaucratic ship-mind, and worlds that remember what you did to them.
      </p>

      <div style={styles.cardRow}>
        <Link to="/game" style={styles.cardLink}>
          <div style={styles.card}>
            <div style={styles.cardLabel}>ENTER</div>
            <div style={styles.cardTitle}>The Game</div>
            <div style={styles.cardDesc}>
              Walk the Tally-Iron, chart uncharted worlds, talk your way past things that
              shouldn't be able to talk back.
            </div>
          </div>
        </Link>

        <Link to="/editor" style={styles.cardLink}>
          <div style={styles.card}>
            <div style={styles.cardLabel}>BUILD</div>
            <div style={styles.cardTitle}>Tile Fabricator</div>
            <div style={styles.cardDesc}>
              A pixel art editor for the hex tiles this world is built from. Draw, export,
              drop into the game.
            </div>
          </div>
        </Link>

        <Link to="/map-editor" style={styles.cardLink}>
          <div style={styles.card}>
            <div style={styles.cardLabel}>LAY OUT</div>
            <div style={styles.cardTitle}>Map Editor</div>
            <div style={styles.cardDesc}>
              Click together a scene's floor and entities visually, then export it straight
              into the game's code.
            </div>
          </div>
        </Link>

        <Link to="/characters" style={styles.cardLink}>
          <div style={styles.card}>
            <div style={styles.cardLabel}>CREW</div>
            <div style={styles.cardTitle}>Character Builder</div>
            <div style={styles.cardDesc}>
              Generate player characters and NPC templates with PixelLab. Eight directions,
              imported straight to the ship's manifest.
            </div>
          </div>
        </Link>
      </div>

      <footer style={styles.footer}>
        built with a live AI layer · nothing here is final, everything here remembers
      </footer>
    </div>
  );
}

const styles = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    textAlign: 'center',
  },
  stampRow: {
    marginBottom: '8px',
  },
  caseNum: {
    fontSize: '11px',
    letterSpacing: '0.15em',
    color: 'var(--text-dim)',
    fontFamily: 'var(--font-heading)',
  },
  title: {
    fontFamily: 'var(--font-heading)',
    fontSize: 'clamp(32px, 8vw, 56px)',
    letterSpacing: '0.08em',
    color: 'var(--accent)',
    margin: '0 0 12px 0',
  },
  tagline: {
    fontFamily: 'var(--font-flavor)',
    fontStyle: 'italic',
    fontSize: '15px',
    color: 'var(--text-dim)',
    maxWidth: '480px',
    lineHeight: 1.6,
    marginBottom: '40px',
  },
  cardRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    justifyContent: 'center',
    maxWidth: '700px',
  },
  cardLink: {
    textDecoration: 'none',
    color: 'inherit',
  },
  card: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    padding: '24px',
    width: '280px',
    textAlign: 'left',
    transition: 'border-color 0.15s ease',
    cursor: 'pointer',
  },
  cardLabel: {
    fontSize: '10px',
    letterSpacing: '0.15em',
    color: 'var(--accent)',
    fontFamily: 'var(--font-heading)',
    marginBottom: '6px',
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: 700,
    marginBottom: '10px',
    color: 'var(--text)',
  },
  cardDesc: {
    fontSize: '13px',
    color: 'var(--text-dim)',
    lineHeight: 1.6,
  },
  footer: {
    marginTop: '50px',
    fontSize: '10px',
    color: 'var(--text-dim)',
    fontStyle: 'italic',
    opacity: 0.7,
  },
};
