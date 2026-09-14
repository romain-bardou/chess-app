import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { preloadPieceImages } from '@/chess/Pieces';
import { Loader, Screen } from '@/components/ui';
import { AuthProvider, useAuth } from '@/lib/auth';
import { t } from '@/lib/i18n';

// Réchauffe le cache des 12 images de pièces avant le premier échiquier :
// sinon leur tout premier montage (32 pièces d'un coup) charge chacune pour
// la première fois en même temps, d'où l'apparition par vagues.
preloadPieceImages();

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Redirige vers l'écran de connexion tant qu'aucune session n'est ouverte. */
function RootNavigator() {
  const { session, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const onLoginScreen = segments[0] === 'login';
    if (!session && !onLoginScreen) {
      router.replace('/login');
    } else if (session && onLoginScreen) {
      router.replace('/');
    }
  }, [session, initializing, segments, router]);

  if (initializing) {
    return (
      <Screen>
        <Loader label={t('common.loading')} />
      </Screen>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
