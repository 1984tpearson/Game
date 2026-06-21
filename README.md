# Wreck & Ruin

A hex-grid salvage RPG with a generic reusable engine (`src/components/WreckAndRuinGame.jsx`
contains both the engine and this game's content — see the comments inside for the split)
plus a companion pixel-art tile editor.

## What's in here

- `/` — landing page
- `/game` — the playable game
- `/editor` — the Tile Fabricator (pixel art editor for the hex tiles)

## ⚠️ AI features are not connected yet

The ship terminal (CASEWORK) chat, world generation, and NPC dialogue all call the
Claude API. That call currently has no API key wired up — see `AI_BACKEND_CONFIGURED`
near the top of `src/components/WreckAndRuinGame.jsx`. Until that's set up, those
features will show an error message in the game UI instead of crashing.

**To fix this later:** you'll need a small backend (a Vercel or Netlify "serverless
function" is the easiest option — a few lines of code that runs in the cloud, holds
your API key safely, and the game calls *that* instead of Anthropic directly). Ask
Claude to help set this up when you're ready — it's a relatively small addition.

## Getting this onto GitHub (first time)

1. Create a free account at [github.com](https://github.com) if you don't have one.
2. Click the "+" in the top right → "New repository". Name it something like
   `wreck-and-ruin`. Leave it public or private, doesn't matter. Don't add a
   README/gitignore/license (you already have these).
3. On your computer, open a terminal in this project folder and run:
   ```
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/wreck-and-ruin.git
   git push -u origin main
   ```
   (GitHub shows you these exact commands on the new repo page too — just copy
   them from there, they'll have your actual repo URL already filled in.)

If you don't have `git` installed locally, GitHub Desktop (a GUI app) is the
easiest alternative — github.com/apps/desktop.

## Deploying (Vercel or Netlify, both free for this)

**Vercel:**
1. Go to [vercel.com](https://vercel.com), sign up with your GitHub account.
2. "Add New" → "Project" → pick your `wreck-and-ruin` repo.
3. It should auto-detect Vite — leave settings as default, click Deploy.
4. A few minutes later you'll have a live URL.

**Netlify** works almost identically — "Add new site" → "Import an existing
project" → pick the repo → deploy.

Either way: once connected, every time you push new changes to GitHub, the site
redeploys automatically.

## Running locally (optional)

If you want to preview changes on your own machine before pushing:

1. Install [Node.js](https://nodejs.org) (the LTS version) if you don't have it.
2. In this folder, run `npm install` once.
3. Run `npm run dev` — it'll print a `localhost` URL to open in your browser.
4. `npm run build` produces the production files in `dist/` (this is what
   Vercel/Netlify do automatically, so you don't normally need to run it yourself).

## Project structure

```
src/
  pages/
    LandingPage.jsx
    GamePage.jsx
    EditorPage.jsx
  components/
    WreckAndRuinGame.jsx   ← engine (Part 1) + this game's content (Part 2)
    TileEditor.jsx         ← the Tile Fabricator pixel art tool
  styles/
    global.css             ← shared theme variables (colors, fonts)
```

To build a *different* game on the same engine, copy `WreckAndRuinGame.jsx`,
keep "Part 1" as-is, and replace "Part 2" with new scenes/prompts/content.
