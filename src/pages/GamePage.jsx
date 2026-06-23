import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import WreckAndRuinGame from '../components/WreckAndRuinGame.jsx';
import { listMaps, loadMap, getGameConfig } from '../lib/maps.js';
import { getObjectsByIds } from '../lib/objects.js';

export default function GamePage() {
  const [scenes, setScenes] = useState(null);
  const [startScene, setStartScene] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchGameData() {
      try {
        const [mapList, config] = await Promise.all([listMaps(), getGameConfig()]);

        // Load all maps in parallel
        const fullMaps = await Promise.all(mapList.map(m => loadMap(m.id)));

        // Build the scenes object keyed by scene_id
        const scenesObj = {};
        for (const map of fullMaps) {
          scenesObj[map.scene_id] = {
            name: map.name,
            floor: map.floor || [],
            entities: map.entities || [],
            spawn: map.spawn || { q: 0, r: 0 },
          };
        }

        // Resolve object images: collect all objectIds across all scenes,
        // fetch in one query, then stamp imageDataUrl/dimensions onto each entity.
        const allObjectIds = Object.values(scenesObj)
          .flatMap(s => s.entities)
          .map(e => e.objectId)
          .filter(Boolean);

        if (allObjectIds.length > 0) {
          const objMap = await getObjectsByIds(allObjectIds);
          for (const scene of Object.values(scenesObj)) {
            scene.entities = scene.entities.map(e => {
              if (e.objectId && objMap[e.objectId]) {
                const obj = objMap[e.objectId];
                return { ...e, imageDataUrl: obj.image_data_url, widthPx: obj.width_px, heightPx: obj.height_px };
              }
              return e;
            });
          }
        }

        if (Object.keys(scenesObj).length === 0) {
          setError('No maps found in the database. Create one in the Map Editor first.');
          return;
        }

        const start = config.start_scene_id;
        if (!scenesObj[start]) {
          setError(`Start scene "${start}" not found. Set a valid start scene in the Map Editor.`);
          return;
        }

        setScenes(scenesObj);
        setStartScene(start);
      } catch (e) {
        setError(e.message || 'Failed to load game data.');
      }
    }

    fetchGameData();
  }, []);

  return (
    <div style={styles.root}>
      <div style={styles.topBar}>
        <Link to="/" style={styles.backLink}>← back</Link>
        <Link to="/editor" style={styles.navLink}>tile fabricator →</Link>
      </div>
      <div style={styles.gameWrap}>
        {error ? (
          <div style={styles.message}>{error}</div>
        ) : !scenes ? (
          <div style={styles.loading}>
            <div style={styles.loadingStamp}>LOADING</div>
            <div style={styles.loadingDots}>
              <span>·</span><span>·</span><span>·</span>
            </div>
          </div>
        ) : (
          <WreckAndRuinGame scenes={scenes} startScene={startScene} />
        )}
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
    background: '#0c0a08',
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
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    gap: '12px',
  },
  loadingStamp: {
    fontFamily: "'Courier Prime', monospace",
    fontWeight: 700,
    fontSize: '18px',
    letterSpacing: '0.2em',
    color: '#8a3324',
  },
  loadingDots: {
    display: 'flex',
    gap: '8px',
    fontSize: '24px',
    color: '#c4a747',
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  message: {
    fontFamily: "'Space Mono', monospace",
    fontSize: '12px',
    color: '#9c9078',
    padding: '40px 20px',
    textAlign: 'center',
    lineHeight: 1.8,
  },
};
