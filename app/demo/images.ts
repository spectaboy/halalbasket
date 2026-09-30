import type { ImageSourcePropType } from 'react-native';

const images: Record<string, ImageSourcePropType> = {
  'demo:grill': require('../../assets/onboarding/restaurant.png'),
  'demo:curry': require('../../assets/discovery/curry.png'),
  'demo:butcher': require('../../assets/onboarding/butchers-and-farms.png'),
  'demo:shawarma': require('../../assets/discovery/shawarma.png'),
  'demo:burger': require('../../assets/discovery/burger.png'),
  'demo:baklava': require('../../assets/discovery/baklava.png'),
};

export const marketplaceImage = (uri: string): ImageSourcePropType => images[uri] ?? { uri };
