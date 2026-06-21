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
