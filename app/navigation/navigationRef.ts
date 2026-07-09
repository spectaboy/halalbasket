import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Imperative navigation used by notification-tap routing. */
export function navigateToScreen(screenName: string, params?: Record<string, any>) {
  if (!navigationRef.isReady()) return;
  try {
    navigationRef.dispatch(CommonActions.navigate({ name: 'Main' as any }));
    setTimeout(() => {
      try {
        navigationRef.dispatch(
          CommonActions.navigate({ name: screenName as any, params: params as any })
        );
      } catch {}
    }, 50);
  } catch {}
}
