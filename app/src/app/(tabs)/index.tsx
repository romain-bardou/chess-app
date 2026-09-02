import { useLocalSearchParams } from 'expo-router';

import { ReviewScreen } from '@/features/review/ReviewScreen';

export default function ReviewRoute() {
  // `theme` est posé par l'écran de stats pour filtrer la file sur un motif.
  const { theme } = useLocalSearchParams<{ theme?: string }>();
  return <ReviewScreen initialTheme={theme ?? null} />;
}
