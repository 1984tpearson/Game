import { supabase } from './supabase.js';

export async function listPlayerCharacters() {
  const { data, error } = await supabase
    .from('player_characters')
    .select('id, name, description, sprites, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
