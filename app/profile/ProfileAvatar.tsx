import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { lightColors as c } from '../../constants/theme';
import { fonts } from '../../constants/typography';

export function profileInitials(
  first?: string | null,
  last?: string | null,
  email?: string | null,
) {
  return (
    `${first?.trim()[0] ?? ''}${last?.trim()[0] ?? ''}`.toUpperCase() ||
    (email?.[0] ?? 'H').toUpperCase()
  );
}

export default function ProfileAvatar({
  uri,
  initials,
  size = 80,
}: {
  uri?: string | null;
  initials: string;
  size?: number;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  return (
    <View style={[s.ring, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri && failedUri !== uri ? (
        <Image source={{ uri }} style={s.image} onError={() => setFailedUri(uri)} />
      ) : (
        <Text style={[s.initials, { fontSize: size * 0.3 }]}>{initials}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  ring: {
    borderWidth: 4,
    borderColor: c.surface,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  initials: { fontFamily: fonts.extraBold, color: c.surface, letterSpacing: -1 },
});
