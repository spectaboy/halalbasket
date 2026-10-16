// app/components/DeliveryMapView.tsx — picks the map implementation at runtime.
//
// @rnmapbox/maps is a native module that Expo Go does not ship, so importing it
// there crashes the whole app. In Expo Go we render a placeholder instead and
// only `require` the Mapbox implementation in real (dev / EAS) builds.

import React, { forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import type { DeliveryMapViewProps, DeliveryMapViewRef } from './DeliveryMapView.mapbox';

export type {
  Coordinates,
  RouteMarker,
  DeliveryMapViewProps,
  DeliveryMapViewRef,
} from './DeliveryMapView.mapbox';

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const MapPlaceholder = forwardRef<DeliveryMapViewRef, DeliveryMapViewProps>(({ height = '100%' }, ref) => {
  // Camera calls from parent screens become no-ops.
  useImperativeHandle(ref, () => ({
    fitBounds: () => {},
    setCamera: () => {},
    flyTo: () => {},
  }));

  return (
    <View style={[styles.placeholder, { height }]}>
      <Ionicons name="map-outline" size={32} color="#667166" />
      <Text style={styles.title}>Map unavailable in Expo Go</Text>
      <Text style={styles.body}>Live maps work in the full app build.</Text>
    </View>
  );
});

MapPlaceholder.displayName = 'DeliveryMapView';

const DeliveryMapView: typeof MapPlaceholder = isExpoGo
  ? MapPlaceholder
  : require('./DeliveryMapView.mapbox').default;

const styles = StyleSheet.create({
  placeholder: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#E9EEE2',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#19382A',
  },
  body: {
    fontSize: 13,
    color: '#667166',
  },
});

export default DeliveryMapView;
