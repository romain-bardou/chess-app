import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY manquants : copier .env.example en .env.'
  );
}

/**
 * La clé anon est publique (l'app est distribuée sur l'App Store) : c'est RLS
 * qui protège les données, pas le secret de la clé. Voir
 * supabase/migrations/001_init.sql.
 */
export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Pas de flux OAuth par redirection : inutile de lire l'URL au démarrage.
    detectSessionInUrl: false,
  },
});

// Supabase ne peut pas rafraîchir le token pendant que l'app est en arrière-plan ;
// on met le minuteur en pause pour éviter des rafraîchissements en échec.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
