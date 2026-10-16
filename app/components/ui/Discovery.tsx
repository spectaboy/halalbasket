import { marketplaceImage } from '../../demo/images';
import { useDemo } from '../../demo/DemoContext';
import React, { useState } from 'react';
import { Image, ImageSourcePropType, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightColors as c } from '../../../constants/theme';
import { fonts } from '../../../constants/typography';
import type { Database, SellerType } from '../../types/database';
import BrandLogo from '../BrandLogo';

export const discoveryImages = {
  restaurant: require('../../../assets/onboarding/restaurant.png'),
  butcher: require('../../../assets/onboarding/butchers-and-farms.png'),
  home_cook: require('../../../assets/onboarding/home-cooking.png'),
  shawarma: require('../../../assets/discovery/shawarma.png'),
  email: require('../../../assets/discovery/verify-email.png'),
};

export const categories: {
  type: SellerType;
  title: string;
  shortTitle: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  image: ImageSourcePropType;
}[] = [
  {
    type: 'restaurant',
    title: 'Restaurants',
    shortTitle: 'Restaurants',
    subtitle: 'Freshly made, delivered warm.',
    icon: 'restaurant-outline',
    image: discoveryImages.shawarma,
  },
  {
    type: 'butcher',
    title: 'Butchers & Farms',
    shortTitle: 'Butchers',
    subtitle: 'Fresh halal cuts for your kitchen.',
    icon: 'storefront-outline',
    image: discoveryImages.butcher,
  },
  {
    type: 'home_cook',
    title: 'Home cooks',
    shortTitle: 'Home cooks',
    subtitle: 'Made with care. Pre-order from your neighbours.',
    icon: 'home-outline',
    image: discoveryImages.home_cook,
  },
];

export function BrandWordmark() {
  return (
    <BrandLogo size="sm" />
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={s.back}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Ionicons name="arrow-back" size={22} color={c.textDark} />
    </TouchableOpacity>
  );
}

export function CategoryTiles({ onPress }: { onPress: (type: SellerType) => void }) {
  return (
    <View style={s.tiles}>
      {categories.map((category) => (
        <TouchableOpacity
          key={category.type}
          accessibilityRole="button"
          accessibilityLabel={`Browse ${category.title}`}
          style={s.tile}
          activeOpacity={0.85}
          onPress={() => onPress(category.type)}
        >
          <Image
            source={discoveryImages[category.type]}
            style={s.tilePhoto}
            accessibilityIgnoresInvertColors
          />
          <View style={s.tileCaption}>
            <Text style={s.tileLabel}>{category.shortTitle}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

type Seller = Database['public']['Views']['public_sellers']['Row'];
export function SellerCard({
  seller,
  onPress,
  compact = false,
  footer,
}: {
  seller: Seller;
  onPress: () => void;
  compact?: boolean;
  footer?: string;
}) {
  const demo = useDemo();
  const saved = demo.favourites.includes(seller.id);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo = seller.banner_url || seller.logo_url;
  const hasPhoto = !!photo && failedUrl !== photo;
  const category = categories.find((item) => item.type === seller.seller_type)!;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`View ${seller.business_name}`}
      activeOpacity={0.85}
      onPress={onPress}
      style={[s.seller, compact && s.compact]}
    >
      {hasPhoto ? (
        <Image
          source={marketplaceImage(photo)}
          style={compact ? s.compactPhoto : s.sellerPhoto}
          onError={() => setFailedUrl(photo)}
        />
      ) : (
        <View style={[compact ? s.compactPhoto : s.sellerPhoto, s.photoFallback]}>
          <Ionicons name={category.icon} size={compact ? 30 : 42} color={c.primary} />
          <Text style={s.photoFallbackText}>{category.shortTitle}</Text>
        </View>
      )}
      {demo.enabled && (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={`${saved ? 'Unsave' : 'Save'} ${seller.business_name}`}
          accessibilityState={{ selected: saved }}
          onPress={(event) => {
            event.stopPropagation();
            demo.toggleFavourite(seller.id);
          }}
          style={{
            position: 'absolute',
            right: 10,
            top: 10,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#FFFFFFF5',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          <Ionicons name={saved ? 'heart' : 'heart-outline'} size={22} color={c.primary} />
        </TouchableOpacity>
      )}
      <View
        style={[
          s.sellerBody,
          compact && s.compactBody,
          compact && demo.enabled && { paddingRight: 45 },
        ]}
      >
        <Text style={s.sellerName} numberOfLines={2}>
          {seller.business_name}
        </Text>
        <View style={s.metaRow}>
          {seller.avg_rating != null ? (
            <>
              <Ionicons name="star" color="#A95812" size={14} />
              <Text style={s.meta}>
                {Number(seller.avg_rating).toFixed(1)}
                {seller.rating_count ? ` (${seller.rating_count})` : ''}
              </Text>
            </>
          ) : (
            <Text style={s.meta}>New to HalalBasket</Text>
          )}
          {!compact && (
            <Text style={[s.status, seller.is_open && s.open]}>
              {seller.seller_type === 'home_cook'
                ? 'Pre-order'
                : seller.is_open
                  ? 'Open now'
                  : 'Closed'}
            </Text>
          )}
        </View>
        {demo.enabled && seller.seller_type !== 'home_cook' && (
          <Text style={s.meta}>
            {seller.prep_time_mins}–{(seller.prep_time_mins ?? 25) + 10} min · $3.99 delivery
          </Text>
        )}
        {!!seller.cuisine_tags?.length && (
          <View style={s.tags}>
            {seller.cuisine_tags.slice(0, 3).map((tag) => (
              <Text key={tag} style={s.tag}>
                {tag}
              </Text>
            ))}
          </View>
        )}
        {!!footer && <Text style={s.footer}>{footer}</Text>}
      </View>
    </TouchableOpacity>
  );
}

export function DiscoveryEmpty({
  title,
  message,
  onPress,
  action = 'Explore categories',
  error = false,
}: {
  title: string;
  message: string;
  onPress?: () => void;
  action?: string;
  error?: boolean;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons
          name={error ? 'cloud-offline-outline' : 'basket-outline'}
          size={26}
          color={c.primary}
        />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyMessage}>{message}</Text>
      {onPress && (
        <TouchableOpacity accessibilityRole="button" onPress={onPress} style={s.emptyButton}>
          <Text style={s.emptyAction}>{action}</Text>
          <Ionicons name="arrow-forward" size={17} color={c.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: c.primaryDark },
  tilePhoto: { width: '100%', height: 110 },
  tileCaption: { paddingHorizontal: 3, paddingVertical: 10, alignItems: 'center' },
  tileLabel: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 12 },
  seller: {
    backgroundColor: c.surface,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: c.divider,
    marginBottom: 16,
  },
  sellerPhoto: { width: '100%', height: 185 },
  sellerBody: { padding: 15, gap: 8 },
  sellerName: { fontFamily: fonts.extraBold, fontSize: 20, color: c.textDark, letterSpacing: -0.5 },
  metaRow: { flexDirection: 'row', gap: 5, alignItems: 'center', flexWrap: 'wrap' },
  meta: { fontFamily: fonts.medium, fontSize: 13, color: c.textMuted },
  status: { fontFamily: fonts.semibold, fontSize: 12, marginLeft: 'auto', color: c.textMuted },
  open: { color: c.primary },
  tags: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  tag: {
    fontSize: 11,
    fontFamily: fonts.medium,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: c.inputBg,
    color: c.textMuted,
    borderRadius: 8,
  },
  compact: {
    flexDirection: 'row',
    borderWidth: 0,
    backgroundColor: 'transparent',
    borderRadius: 14,
  },
  compactPhoto: { width: 94, height: 104, borderRadius: 14 },
  compactBody: { flex: 1, paddingVertical: 1, paddingRight: 0, paddingLeft: 12 },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: c.chipBg,
  },
  photoFallbackText: { color: c.primary, fontFamily: fonts.semibold, fontSize: 12 },
  footer: { fontFamily: fonts.semibold, fontSize: 13, color: c.primary },
  empty: {
    padding: 24,
    borderRadius: 20,
    backgroundColor: '#F0F1E9',
    alignItems: 'center',
    gap: 10,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: c.surface,
  },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 20, color: c.textDark, textAlign: 'center' },
  emptyMessage: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: c.textMuted,
    textAlign: 'center',
  },
  emptyButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyAction: { fontFamily: fonts.bold, fontSize: 14, color: c.primary },
});
