import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import Mapbox, { Camera, MapView, PointAnnotation, ShapeSource, LineLayer } from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { MAPBOX_STYLES, ROUTE_STYLES } from '../config/mapbox';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface RouteMarker {
  id: string;
  coordinates: Coordinates;
  type: 'pickup' | 'dropoff' | 'driver' | 'passenger' | 'destination';
  label?: string;
  isActive?: boolean;
  isCompleted?: boolean;
  heading?: number;
}

export interface DeliveryMapViewProps {
  /** Route coordinates as [lng, lat] pairs */
  routeCoordinates?: Array<[number, number]>;
  /** Markers to display on the map */
  markers?: RouteMarker[];
  /** Initial center coordinate */
  initialCenter?: Coordinates;
  /** Initial zoom level */
  initialZoom?: number;
  /** Whether to fit bounds to route automatically */
  fitToRoute?: boolean;
  /** Padding for fitBounds */
  boundsPadding?: [number, number, number, number];
  /** Map style URL override */
  styleURL?: string;
  /** Whether the map is interactive */
  interactive?: boolean;
  /** Route line style override */
  routeStyle?: 'active' | 'primary' | 'inactive';
  /** Height of the map container */
  height?: import('react-native').DimensionValue;
}

export interface DeliveryMapViewRef {
  fitBounds: (ne: [number, number], sw: [number, number], padding?: number[], duration?: number) => void;
  setCamera: (options: { center?: [number, number]; zoom?: number; duration?: number }) => void;
  flyTo: (coordinates: [number, number], zoom?: number) => void;
}

const DeliveryMapView = forwardRef<DeliveryMapViewRef, DeliveryMapViewProps>(({
  routeCoordinates,
  markers = [],
  initialCenter,
  initialZoom = 14,
  fitToRoute = true,
  boundsPadding = [80, 80, 200, 80],
  styleURL,
  interactive = true,
  routeStyle = 'active',
  height = '100%',
}, ref) => {
  const cameraRef = useRef<Camera>(null);
  const hasInitialFit = useRef(false);

  // Expose camera methods to parent
  useImperativeHandle(ref, () => ({
    fitBounds: (ne, sw, padding = [50, 50, 50, 50], duration = 1000) => {
      cameraRef.current?.fitBounds(ne, sw, padding, duration);
    },
    setCamera: ({ center, zoom, duration = 1000 }) => {
      if (center) {
        cameraRef.current?.setCamera({
          centerCoordinate: center,
          zoomLevel: zoom || initialZoom,
          animationDuration: duration,
        });
      }
    },
    flyTo: (coordinates, zoom = 15) => {
      cameraRef.current?.setCamera({
        centerCoordinate: coordinates,
        zoomLevel: zoom,
        animationMode: 'flyTo',
        animationDuration: 1000,
      });
    },
  }));

  // Fit camera to route bounds on initial load
  useEffect(() => {
    if (fitToRoute && routeCoordinates && routeCoordinates.length > 0 && cameraRef.current && !hasInitialFit.current) {
      const lngs = routeCoordinates.map(c => c[0]);
      const lats = routeCoordinates.map(c => c[1]);
      
      const bounds = {
        ne: [Math.max(...lngs), Math.max(...lats)] as [number, number],
        sw: [Math.min(...lngs), Math.min(...lats)] as [number, number],
      };
      
      setTimeout(() => {
        cameraRef.current?.fitBounds(bounds.ne, bounds.sw, boundsPadding, 1000);
        hasInitialFit.current = true;
      }, 300);
    }
  }, [routeCoordinates, fitToRoute, boundsPadding]);

  const getDefaultCenter = (): [number, number] => {
    if (initialCenter) {
      return [initialCenter.longitude, initialCenter.latitude];
    }
    if (markers.length > 0) {
      return [markers[0].coordinates.longitude, markers[0].coordinates.latitude];
    }
    if (routeCoordinates && routeCoordinates.length > 0) {
      return routeCoordinates[0];
    }
    // Default map center (Calgary area) — only for initial camera position, not user location
    return [-114.0719, 51.0447];
  };

  const renderMarker = (marker: RouteMarker) => {
    const { id, coordinates, type, isActive, isCompleted, heading, label } = marker;
    
    if (coordinates.latitude === 0 && coordinates.longitude === 0) return null;

    const getMarkerContent = () => {
      switch (type) {
        case 'driver':
          return (
            <Image
              source={require('../../assets/cab_marker.png')}
              style={[styles.carIcon, { transform: [{ rotate: `${heading || 0}deg` }] }]}
            />
          );
        
        case 'pickup':
          return (
            <View style={[
              styles.pickupMarker,
              isActive && styles.pickupMarkerActive,
              isCompleted && styles.pickupMarkerCompleted,
            ]}>
              {isCompleted ? (
                <Ionicons name="checkmark" size={16} color="#fff" />
              ) : (
                <Ionicons name="location" size={18} color="#fff" />
              )}
            </View>
          );
        
        case 'dropoff':
        case 'destination':
          return (
            <View style={[styles.destinationMarker, !isActive && styles.destinationMarkerFaded]}>
              <Ionicons 
                name="flag" 
                size={22} 
                color={isActive ? '#00C853' : '#666'} 
              />
            </View>
          );
        
        case 'passenger':
          return (
            <View style={[
              styles.passengerMarker,
              isActive && styles.passengerMarkerActive,
              isCompleted && styles.passengerMarkerCompleted,
            ]}>
              {isCompleted ? (
                <Ionicons name="checkmark" size={14} color="#fff" />
              ) : (
                <Ionicons name="person" size={16} color="#fff" />
              )}
            </View>
          );
        
        default:
          return (
            <View style={styles.defaultMarker}>
              <Ionicons name="ellipse" size={12} color="#00C853" />
            </View>
          );
      }
    };

    return (
      <PointAnnotation
        key={id}
        id={id}
        coordinate={[coordinates.longitude, coordinates.latitude]}
        anchor={{ x: 0.5, y: 0.5 }}
      >
        {getMarkerContent()}
      </PointAnnotation>
    );
  };

  const getRouteLineStyle = () => {
    switch (routeStyle) {
      case 'active':
        return ROUTE_STYLES.active;
      case 'primary':
        return ROUTE_STYLES.primary;
      case 'inactive':
        return { ...ROUTE_STYLES.active, lineColor: '#666', lineOpacity: 0.5 };
      default:
        return ROUTE_STYLES.active;
    }
  };

  return (
    <View style={[styles.container, { height }]}>
      <MapView
        style={styles.map}
        styleURL={styleURL || MAPBOX_STYLES.navigationDay}
        attributionEnabled={false}
        logoEnabled={false}
        compassEnabled={interactive}
        scaleBarEnabled={false}
        scrollEnabled={interactive}
        pitchEnabled={interactive}
        rotateEnabled={interactive}
        zoomEnabled={interactive}
      >
        <Camera
          ref={cameraRef}
          centerCoordinate={getDefaultCenter()}
          zoomLevel={initialZoom}
          animationMode="flyTo"
          animationDuration={1000}
        />

        {/* Route line */}
        {routeCoordinates && routeCoordinates.length > 0 && (
          <ShapeSource
            id="route-source"
            shape={{
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: routeCoordinates,
              },
              properties: {},
            }}
          >
            <LineLayer
              id="route-line"
              style={{
                lineColor: getRouteLineStyle().lineColor,
                lineWidth: getRouteLineStyle().lineWidth,
                lineCap: getRouteLineStyle().lineCap,
                lineJoin: getRouteLineStyle().lineJoin,
              }}
            />
          </ShapeSource>
        )}

        {/* Render all markers */}
        {markers.map(renderMarker)}
      </MapView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  carIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
  },
  pickupMarker: {
    backgroundColor: '#FF9800',
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupMarkerActive: {
    backgroundColor: '#FF9800',
    transform: [{ scale: 1.1 }],
  },
  pickupMarkerCompleted: {
    backgroundColor: '#00C853',
  },
  destinationMarker: {
    backgroundColor: '#1A1A1A',
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#00C853',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationMarkerFaded: {
    opacity: 0.5,
    borderColor: '#666',
  },
  passengerMarker: {
    backgroundColor: '#666',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerMarkerActive: {
    backgroundColor: '#FF9800',
    transform: [{ scale: 1.15 }],
  },
  passengerMarkerCompleted: {
    backgroundColor: '#00C853',
  },
  defaultMarker: {
    backgroundColor: '#1A1A1A',
    padding: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#00C853',
  },
});

DeliveryMapView.displayName = 'DeliveryMapView';

export default DeliveryMapView;
