import { supabase } from './supabase.js';

export async function listPlayerCharacters() {
  const { data, error } = await supabase
    .from('player_characters')
    .select('id, name, description, sprites, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Fetches all NPC templates, used by MapEditor's NPC placement picker.
export async function listNpcTemplates() {
  const { data, error } = await supabase
    .from('npc_templates')
    .select('id, name, role, blurb, personality_notes, sprites, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Fetches specific NPC templates by ID, used by GamePage to stamp NPC
// data onto placed entities at load time. Returns a plain {id: row} map;
// silently skips deleted templates rather than throwing, same pattern
// as getObjectsByIds.
export async function getNpcTemplatesByIds(ids) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return {};
  const { data, error } = await supabase
    .from('npc_templates')
    .select('id, name, role, blurb, personality_notes, sprites')
    .in('id', uniqueIds);
  if (error) throw error;
  const map = {};
  for (const row of data) map[row.id] = row;
  return map;
}
