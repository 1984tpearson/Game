import { supabase } from './supabase.js';

// Shared tile-library operations, used by both the Tile Fabricator (save)
// and Map Editor (browse/select) so they stay in sync against the same
// `tiles` table rather than each rolling their own Supabase calls.

export async function listTiles() {
  const { data, error } = await supabase
    .from('tiles')
    .select('id, name, image_data_url, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Fetches a specific set of tiles by ID, used by the game engine to
// resolve the tile references baked into a scene's floor data (each
// floor cell can optionally point at a specific library tile instead of
// the theme's default art). Returns a plain {id: imageDataUrl} map for
// convenient lookup, and silently skips any IDs that no longer exist
// (e.g. a tile was deleted after a scene referenced it) rather than
// throwing — the engine falls back to default art for those.
export async function getTilesByIds(ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return {};
  const { data, error } = await supabase
    .from('tiles')
    .select('id, image_data_url')
    .in('id', uniqueIds);
  if (error) throw error;
  const map = {};
  for (const row of data) map[row.id] = row.image_data_url;
  return map;
}

export async function saveTile({ name, imageDataUrl }) {
  const { data, error } = await supabase
    .from('tiles')
    .insert({ name, image_data_url: imageDataUrl })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTile(id, { name, imageDataUrl }) {
  const patch = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  if (imageDataUrl !== undefined) patch.image_data_url = imageDataUrl;
  const { data, error } = await supabase
    .from('tiles')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTile(id) {
  const { error } = await supabase.from('tiles').delete().eq('id', id);
  if (error) throw error;
}
