import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import WreckAndRuinGame from '../components/WreckAndRuinGame.jsx';
import { listMaps, loadMap, getGameConfig } from '../lib/maps.js';
import { getObjectsByIds } from '../lib/objects.js';
import { listPlayerCharacters } from '../lib/characters.js';

export default function GamePage() {
  const [scenes, setScenes] = useState(null);
  const [startScene, setStartScene] = useState(null);
  const [characters, setCharacters] = useState(null); // null = loading, [] = none
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchGameData() {
      try {
        const [mapList, config, chars] = await Promise.all([
          listMaps(),
          getGameConfig(),
          listPlayerCharacters(),
        ]);

        setCharacters(chars);

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

        // Resolve object images
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

  const loading = !scenes || characters === null;

  return (
    <div style={styles.root}>
      <div style={styles.topBar}>
        <Link to="/" style={styles.backLink}>← back</Link>
        <Link to="/editor" style={styles.navLink}>tile fabricator →</Link>
      </div>
      <div style={styles.gameWrap}>
        {error ? (
          <div style={styles.message}>{error}</div>
        ) : loading ? (
          <div style={styles.loading}>
            <div style={styles.loadingStamp}>LOADING</div>
            <div style={styles.loadingDots}>
              <span>·</span><span>·</span><span>·</span>
            </div>
          </div>
        ) : !selectedCharacter && characters.length > 0 ? (
          <CharacterSelect
            characters={characters}
            onSelect={setSelectedCharacter}
            onSkip={() => setSelectedCharacter('default')}
          />
        ) : (
          <WreckAndRuinGame
            scenes={scenes}
            startScene={startScene}
            playerSprites={selectedCharacter && selectedCharacter !== 'default' ? selectedCharacter.sprites : null}
          />
        )}
      </div>
    </div>
  );
}

// Direction mapping: game facing names -> sprite keys from PixelLab
const FACING_TO_SPRITE_KEY = {
  'south':     'south',
  'north':     'north',
  'east':      'east',
  'west':      'west',
  'south-east':'south-east',
  'south-west':'south-west',
  'north-east':'north-east',
  'north-west':'north-west',
};

function CharacterSelect({ characters, onSelect, onSkip }) {
  return (
    <div style={selStyles.root}>
      <div style={selStyles.stamp}>SELECT CREW MEMBER</div>
      <p style={selStyles.sub}>Choose who boards the Tally-Iron today.</p>
      <div style={selStyles.grid}>
        {characters.map(char => (
          <button
            key={char.id}
            style={selStyles.card}
            onClick={() => onSelect(char)}
          >
            {char.sprites?.south && (
              <img
                src={char.sprites.south}
                alt={char.name}
                style={selStyles.portrait}
              />
            )}
            <div style={selStyles.name}>{char.name}</div>
            {char.description && (
              <div style={selStyles.desc}>{char.description}</div>
            )}
          </button>
        ))}
      </div>
      <button style={selStyles.skipBtn} onClick={onSkip}>
        skip — use default
      </button>
    </div>
  );
}

const selStyles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 20px',
    minHeight: '300px',
    gap: '20px',
  },
  stamp: {
    fontFamily: "'Courier Prime', monospace",
    fontWeight: 700,
    fontSize: '14px',
    letterSpacing: '0.2em',
    color: '#8a3324',
  },
  sub: {
    fontFamily: "'Space Mono', monospace",
    fontSize: '11px',
    color: '#9c9078',
    fontStyle: 'italic',
    margin: 0,
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    justifyContent: 'center',
  },
  card: {
    background: '#15120e',
    border: '1px solid #332c22',
    padding: '16px',
    width: '160px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    color: 'inherit',
    fontFamily: 'inherit',
    transition: 'border-color 0.15s',
  },
  portrait: {
    width: '80px',
    height: '80px',
    imageRendering: 'pixelated',
    objectFit: 'contain',
  },
  name: {
    fontFamily: "'Courier Prime', monospace",
    fontWeight: 700,
    fontSize: '12px',
    color: '#e8dcc4',
    textAlign: 'center',
    wordBreak: 'break-word',
  },
  desc: {
    fontFamily: "'Space Mono', monospace",
    fontSize: '10px',
    color: '#9c9078',
    textAlign: 'center',
    lineHeight: 1.5,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  skipBtn: {
    background: 'transparent',
    border: 'none',
    color: '#9c9078',
    fontFamily: "'Space Mono', monospace",
    fontSize: '10px',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: '4px',
  },
};

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
