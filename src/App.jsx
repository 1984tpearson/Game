import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage.jsx';
import GamePage from './pages/GamePage.jsx';
import EditorPage from './pages/EditorPage.jsx';

// basename must match vite.config.js's `base` — GitHub Pages serves this
// site under /Game/, not the domain root, so the router needs to know that
// to correctly match /game and /editor instead of treating them as 404s.
export default function App() {
  return (
    <BrowserRouter basename="/Game">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/editor" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  );
}
