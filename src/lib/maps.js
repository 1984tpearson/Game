import { supabase } from './supabase.js';

export async function listMaps() {
  const { data, error } = await supabase
    .from('maps')
    .select('id, name, scene_id, created_at, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function loadMap(id) {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function saveMap({ name, sceneId, floor, entities, spawn }) {
  const { data, error } = await supabase
    .from('maps')
    .insert({ name, scene_id: sceneId, floor, entities, spawn })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMap(id, { name, sceneId, floor, entities, spawn }) {
  const { data, error } = await supabase
    .from('maps')
    .update({
      name,
      scene_id: sceneId,
      floor,
      entities,
      spawn,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMap(id) {
  const { error } = await supabase.from('maps').delete().eq('id', id);
  if (error) throw error;
}

export async function getGameConfig() {
  const { data, error } = await supabase
    .from('game_config')
    .select('start_scene_id')
    .eq('id', 1)
    .single();
  if (error) throw error;
  return data;
}

export async function setStartScene(sceneId) {
  const { error } = await supabase
    .from('game_config')
    .update({ start_scene_id: sceneId, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw error;
}
