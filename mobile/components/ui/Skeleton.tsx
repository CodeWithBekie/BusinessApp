import { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleProp, ViewStyle } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { radius as radiusTokens } from '@/constants/theme';

// A pulsing placeholder block for loading states — replaces bare ActivityIndicator spinners with
// shaped outlines matching the content about to render, the single biggest lever for a premium
// first-load impression. Compose a few of these per screen (e.g. one wide "title" bar + one
// narrower "meta" bar) rather than building screen-specific skeleton variants.
export function Skeleton({
  width,
  height,
  radius = radiusTokens.sm,
  style,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const colorScheme = useColorScheme();
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  const backgroundColor = colorScheme === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)';

  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor, opacity }, style]} />;
}
