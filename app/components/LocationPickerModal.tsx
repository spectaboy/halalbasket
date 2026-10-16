import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  FlatList,
  Keyboard,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import { lightColors } from '../../constants/theme';
import { searchPlaces, reverseGeocode, clearSessionToken, getPlaceDetails, geocodePlace } from '../lib/geocode';
import { notify } from '../lib/notify';
import BackgroundPattern from './BackgroundPattern';

export interface PickedLocation {
  address: string;
  lat: number;
  lng: number;
  name?: string;
}

interface SearchResult {
  id: string;
  name: string;
  address: string;
  coordinates: { lat: number; lng: number };
  placeType: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onLocationSelect: (location: PickedLocation) => void;
  title: string;
  quickLocations?: PickedLocation[];
}

const RECENTS_KEY = 'recentLocations:v1';
const { height: SCREEN_H } = Dimensions.get('window');

const LocationPickerModal: React.FC<Props> = ({ visible, onClose, onLocationSelect, title, quickLocations = [] }) => {
  const [recentLocations, setRecentLocations] = useState<PickedLocation[]>([]);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const { location: sharedLocation } = useCurrentLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) {
      setSearchQuery('');
      setSearchResults([]);
      clearSessionToken();
      return;
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(RECENTS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as PickedLocation[];
          const valid = parsed.filter(l => l.lat && l.lng && !(l.lat === 0 && l.lng === 0));
          setRecentLocations(valid);
          if (valid.length !== parsed.length) await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(valid));
        }
      } catch {}
    })();
  }, [visible]);

  const upsertRecent = async (loc: PickedLocation) => {
    try {
      if (!loc.lat || !loc.lng || (loc.lat === 0 && loc.lng === 0)) return;
      const deduped = [loc, ...recentLocations.filter(r => r.address !== loc.address)].slice(0, 8);
      setRecentLocations(deduped);
      await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(deduped));
    } catch {}
  };

  const handleSelect = async (location: PickedLocation) => {
    Keyboard.dismiss();
    let validLocation = location;
    if (!location.lat || !location.lng || (location.lat === 0 && location.lng === 0)) {
      try {
        const geocoded = await geocodePlace(location.address);
        if (geocoded && geocoded.lat !== 0 && geocoded.lng !== 0) {
          validLocation = { ...location, lat: geocoded.lat, lng: geocoded.lng };
        } else {
          notify.error('Could not get coordinates. Please try searching again.');
          return;
        }
      } catch {
        notify.error('Could not verify this location. Please try again.');
        return;
      }
    }
    await upsertRecent(validLocation);
    clearSessionToken();
    onLocationSelect(validLocation);
  };

  const handleSearchResultSelect = async (result: SearchResult) => {
    try {
      const details = await getPlaceDetails(result.id);
      if (details && details.lat !== 0 && details.lng !== 0) {
        await handleSelect({ address: details.address || result.address, name: result.name, lat: details.lat, lng: details.lng });
      } else if (result.coordinates.lat !== 0 && result.coordinates.lng !== 0) {
        await handleSelect({ address: result.address, name: result.name, lat: result.coordinates.lat, lng: result.coordinates.lng });
      } else {
        notify.error('Could not get coordinates. Please try a different location.');
      }
    } catch {
      notify.error('Could not get location details. Please try again.');
    }
  };

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (text.length < 2) { setSearchResults([]); setIsSearching(false); return; }
    setIsSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(text, { limit: 8 });
        setSearchResults(results);
      } catch { } finally { setIsSearching(false); }
    }, 300);
  }, []);

  const getCurrentLocation = async () => {
    setIsGettingLocation(true);
    try {
      if (!sharedLocation) {
        notify.warning('Check your device location settings.', { title: 'Location unavailable' });
        return;
      }
      const geocodeResult = await reverseGeocode(sharedLocation.latitude, sharedLocation.longitude);
      await handleSelect({
        address: geocodeResult?.address || geocodeResult?.placeName || 'Current Location',
        name: 'Current Location',
        lat: sharedLocation.latitude,
        lng: sharedLocation.longitude,
      });
    } catch {
      notify.error('Unable to get your current location.');
    } finally {
      setIsGettingLocation(false);
    }
  };

  const showQuickAndRecents = searchQuery.length < 2;

  const renderSearchResult = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity style={styles.row} onPress={() => handleSearchResultSelect(item)} activeOpacity={0.7}>
      <View style={styles.rowIcon}>
        <Ionicons name={item.placeType === 'poi' ? 'business-outline' : 'location-outline'} size={20} color="#1A5C38" />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{item.address}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={lightColors.textMuted} />
    </TouchableOpacity>
  );

  const renderRecent = (loc: PickedLocation, idx: number) => {
    const displayName = loc.name && loc.name !== 'Current Location' ? loc.name : loc.address.split(',')[0];
    const displaySub = loc.address;
    return (
      <TouchableOpacity key={`${loc.address}-${idx}`} style={styles.row} onPress={() => handleSelect(loc)} activeOpacity={0.7}>
        <View style={styles.rowIcon}>
          <Ionicons name="time-outline" size={20} color={lightColors.textMuted} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.rowSub} numberOfLines={1}>{displaySub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={lightColors.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <BackgroundPattern />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="arrow-back" size={24} color="#1A5C38" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Search bar — big and tappable */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={22} color={lightColors.textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search for a location..."
            placeholderTextColor={lightColors.textMuted}
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={20} color={lightColors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Search results */}
        {searchQuery.length >= 2 && (
          <>
            {isSearching ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color="#1A5C38" />
                <Text style={styles.hint}>Searching...</Text>
              </View>
            ) : searchResults.length > 0 ? (
              <FlatList
                data={searchResults}
                renderItem={renderSearchResult}
                keyExtractor={item => item.id}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
                ItemSeparatorComponent={() => <View style={styles.sep} />}
              />
            ) : (
              <View style={styles.centered}>
                <Ionicons name="search-outline" size={48} color={lightColors.textMuted} style={{ opacity: 0.4 }} />
                <Text style={styles.emptyTitle}>No results found</Text>
                <Text style={styles.hint}>Try a different search term</Text>
              </View>
            )}
          </>
        )}

        {/* Default state — current location + recents */}
        {showQuickAndRecents && (
          <FlatList
            data={recentLocations}
            keyExtractor={(item, idx) => `${item.address}-${idx}`}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            ListHeaderComponent={
              <>
                {/* Use Current Location */}
                <TouchableOpacity style={styles.currentLocBtn} onPress={getCurrentLocation} disabled={isGettingLocation} activeOpacity={0.8}>
                  {isGettingLocation
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="locate" size={22} color="#fff" />
                  }
                  <Text style={styles.currentLocText}>{isGettingLocation ? 'Getting location...' : 'Use Current Location'}</Text>
                </TouchableOpacity>

                {recentLocations.length > 0 && (
                  <Text style={styles.sectionLabel}>Recent</Text>
                )}
              </>
            }
            renderItem={({ item, index }) => renderRecent(item, index)}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.hint}>Your recent locations will appear here</Text>
              </View>
            }
          />
        )}

      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#1A2E1F',
    fontSize: 18,
    fontWeight: '700',
  },
  // Search bar
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: lightColors.inputBg,
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
  },
  searchInput: {
    flex: 1,
    color: '#1A2E1F',
    fontSize: 16,
    padding: 0,
  },
  // Current location button
  currentLocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#1A5C38',
    borderRadius: 9999,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 24,
  },
  currentLocText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  sectionLabel: {
    color: lightColors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  // Rows
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: {
    color: '#1A2E1F',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  rowSub: {
    color: lightColors.textMuted,
    fontSize: 13,
  },
  sep: {
    height: 1,
    backgroundColor: lightColors.divider,
    marginLeft: 56,
  },
  // Empty / loading states
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyTitle: {
    color: '#1A2E1F',
    fontSize: 17,
    fontWeight: '600',
  },
  hint: {
    color: lightColors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

export default LocationPickerModal;
