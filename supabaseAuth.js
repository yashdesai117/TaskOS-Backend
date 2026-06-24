import { initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

export const useSupabaseAuthState = async () => {
  if (!supabase) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are missing in environment variables.");
  }

  const writeData = async (data, id) => {
    try {
      const stringified = JSON.stringify(data, BufferJSON.replacer);
      await supabase.from('whatsapp_auth').upsert({ id, data: JSON.parse(stringified) });
    } catch (err) {
      console.error(`Error saving auth state for ${id}:`, err.message);
    }
  };

  const readData = async (id) => {
    try {
      const { data, error } = await supabase.from('whatsapp_auth').select('data').eq('id', id).single();
      if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        console.error(`Error reading auth state for ${id}:`, error.message);
      }
      if (data) {
        return JSON.parse(JSON.stringify(data.data), BufferJSON.reviver);
      }
    } catch (err) {
      console.error(`Error reading auth state for ${id}:`, err.message);
    }
    return null;
  };

  const removeData = async (id) => {
    try {
      await supabase.from('whatsapp_auth').delete().eq('id', id);
    } catch (err) {
      console.error(`Error removing auth state for ${id}:`, err.message);
    }
  };

  let creds = await readData('creds');
  if (!creds) {
    creds = initAuthCreds();
    await writeData(creds, 'creds');
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = Buffer.from(value.data, 'base64');
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const fileId = `${category}-${id}`;
              if (value) {
                tasks.push(writeData(value, fileId));
              } else {
                tasks.push(removeData(fileId));
              }
            }
          }
          await Promise.all(tasks);
        }
      }
    },
    saveCreds: () => {
      return writeData(creds, 'creds');
    }
  };
};
