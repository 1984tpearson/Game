import { supabase } from './supabase.js';

// Shared object-library operations, used by both the Pixel Editor
// (save/load objects) and Map Editor (browse/place objects) so they stay
// in sync against the same `objects` table. Mirrors tiles.js's shape,
// but objects carry extra fields tiles don't need: variable pixel size,
// a multi-hex footprint, and default entity-behavior flags that get
// pre-filled when an object is placed on the map.

export async function listObjects() {
  const { data, error } = await supabase
    .from('objects')
    .select('id, name, image_data_url, width_px, height_px, footprint, default_kind, default_trigger, default_blocks_movement, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Fetches specific objects by ID, used by the game engine to resolve
// object references baked into placed entities. Returns a plain
// {id: objectRow} map; silently skips deleted objects rather than
// throwing, same pattern as getTilesByIds.
export async function getObjectsByIds(ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return {};
  const { data, error } = await supabase
    .from('objects')
    .select('id, image_data_url, width_px, height_px, footprint')
    .in('id', uniqueIds);
  if (error) throw error;
  const map = {};
  for (const row of data) map[row.id] = row;
  return map;
}

export async function saveObject({ name, imageDataUrl, widthPx, heightPx, footprint, defaultKind, defaultTrigger, defaultBlocksMovement }) {
  const { data, error } = await supabase
    .from('objects')
    .insert({
      name,
      image_data_url: imageDataUrl,
      width_px: widthPx,
      height_px: heightPx,
      footprint,
      default_kind: defaultKind,
      default_trigger: defaultTrigger,
      default_blocks_movement: defaultBlocksMovement,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateObject(id, { name, imageDataUrl, widthPx, heightPx, footprint, defaultKind, defaultTrigger, defaultBlocksMovement }) {
  const patch = { updated_at: new Date().toISOString() };
  if (name !== undefined) patch.name = name;
  if (imageDataUrl !== undefined) patch.image_data_url = imageDataUrl;
  if (widthPx !== undefined) patch.width_px = widthPx;
  if (heightPx !== undefined) patch.height_px = heightPx;
  if (footprint !== undefined) patch.footprint = footprint;
  if (defaultKind !== undefined) patch.default_kind = defaultKind;
  if (defaultTrigger !== undefined) patch.default_trigger = defaultTrigger;
  if (defaultBlocksMovement !== undefined) patch.default_blocks_movement = defaultBlocksMovement;
  const { data, error } = await supabase
    .from('objects')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteObject(id) {
  const { error } = await supabase.from('objects').delete().eq('id', id);
  if (error) throw error;
}
