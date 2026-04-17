import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import PotholeCard from '../components/PotholeCard';

// ─── API KEYS ─────────────────────────────────────────────────────────────────
const GOOGLE_MAPS_APIKEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY';
const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_API_KEY || 'YOUR_ORS_API_KEY';
const POTHOLE_API_URL = process.env.EXPO_PUBLIC_POTHOLE_API_URL || "YOUR_POTHOLE_API_URL";

// ─── Nominatim Autocomplete ───────────────────────────────────────────────────
interface NominatimProps {
  placeholder: string;
  onSelect: (coords: { latitude: number; longitude: number }, label: string) => void;
}

function NominatimAutocomplete({ placeholder, onSelect }: NominatimProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.length < 3) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(text)}&format=json&addressdetails=1&limit=5&countrycodes=in`,
          { headers: { 'Accept-Language': 'en', 'User-Agent': 'PotholeApp/1.0' } }
        );
        const data = await res.json();
        setResults(data);
      } catch (e) {
        console.error('Nominatim error:', e);
      } finally {
        setLoading(false);
      }
    }, 400);
  };

  const handleSelect = (item: any) => {
    onSelect(
      { latitude: parseFloat(item.lat), longitude: parseFloat(item.lon) },
      item.display_name
    );
    setQuery(item.display_name.split(',').slice(0, 2).join(', '));
    setResults([]);
  };

  return (
    <View style={nominatimStyles.wrapper}>
      <View style={nominatimStyles.inputRow}>
        <TextInput
          style={nominatimStyles.input}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          value={query}
          onChangeText={search}
        />
        {loading && <ActivityIndicator style={{ marginLeft: 4 }} size="small" color="#3b82f6" />}
      </View>
      {results.length > 0 && (
        <FlatList
          style={nominatimStyles.list}
          data={results}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity style={nominatimStyles.row} onPress={() => handleSelect(item)}>
              <Text style={nominatimStyles.rowText} numberOfLines={2}>{item.display_name}</Text>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={nominatimStyles.separator} />}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const nominatimStyles = StyleSheet.create({
  wrapper: { width: '100%' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    paddingRight: 10,
  },
  input: { flex: 1, height: 50, paddingHorizontal: 15, fontSize: 15, color: '#1e293b' },
  list: { backgroundColor: 'white', borderRadius: 10, elevation: 10, marginTop: 4, maxHeight: 200 },
  row: { padding: 13 },
  rowText: { fontSize: 14, color: '#334155' },
  separator: { height: 1, backgroundColor: '#f1f5f9' },
});

// ─── Decode ORS Polyline ──────────────────────────────────────────────────────
function orsToLatLng(coords: number[][]): { latitude: number; longitude: number }[] {
  return coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function RouteMapScreen() {
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [destination, setDestination] = useState<{ latitude: number; longitude: number } | null>(null);
  const [routeCoords, setRouteCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [potholes, setPotholes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);
  const [debugText, setDebugText] = useState('Waiting for input...');

  const mapRef = useRef<MapView>(null);

  // ─── Helper: Snap Potholes to Nearest Road (Fixes GPS Drift) ──────────────
  const snapPotholesToRoad = async (rawPotholes: any[]) => {
    if (!rawPotholes || rawPotholes.length === 0) return [];

    // Google Roads API allows up to 100 points per request.
    const pointsToSnap = rawPotholes.slice(0, 100); 

    const pathString = pointsToSnap.map(p => `${p.latitude},${p.longitude}`).join('|');
    const url = `https://roads.googleapis.com/v1/snapToRoads?path=${pathString}&interpolate=false&key=${GOOGLE_MAPS_APIKEY}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (data.snappedPoints) {
        return pointsToSnap.map((pothole, index) => {
          const snappedPoint = data.snappedPoints.find((sp: any) => sp.originalIndex === index);
          if (snappedPoint) {
            return {
              ...pothole,
              latitude: snappedPoint.location.latitude,
              longitude: snappedPoint.location.longitude
            };
          }
          return pothole;
        });
      }
    } catch (error) {
      console.error("Snap to Roads error:", error);
    }
    
    return rawPotholes; 
  };

  // ─── Get GPS + Potholes on Mount ──────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // 1. Get Location
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          let loc = await Location.getCurrentPositionAsync({});
          const gpsCoords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          setOrigin(gpsCoords);
          setDebugText('GPS location found ✅');
        } else {
          setDebugText('Location permission denied');
        }
      } catch (e) {
        console.error('Location Error:', e);
        setDebugText('GPS error — set origin manually');
      }

      // 2. Fetch & Snap Potholes
      try {
        const response = await fetch(POTHOLE_API_URL);
        const data = await response.json();
        
        const validData = Array.isArray(data) ? data : [];
        const snappedData = await snapPotholesToRoad(validData);
        
        setPotholes(snappedData);
      } catch (e) {
        console.error('Pothole Fetch Error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ─── Fetch ORS Route whenever origin + destination set ────────────────────
  useEffect(() => {
    if (!origin || !destination) return;
    fetchORSRoute(origin, destination);
  }, [origin, destination]);

  const fetchORSRoute = async (
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number }
  ) => {
    setRouteLoading(true);
    setRouteCoords([]);
    setRouteInfo(null);
    setDebugText('Fetching route...');

    try {
      const body = {
        coordinates: [
          [from.longitude, from.latitude],
          [to.longitude, to.latitude],
        ],
        radiuses: [-1, -1] // <--- This is the crucial part that bypasses the 350m limit
      };

      const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': ORS_API_KEY,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        const msg = data.error?.message || 'ORS request failed';
        console.error('ORS Error:', msg);
        setDebugText(`Route error: ${msg}`);
        Alert.alert('Route Error', msg);
        return;
      }

      const coords = data.features[0].geometry.coordinates;
      const latLngs = orsToLatLng(coords);
      setRouteCoords(latLngs);

      const summary = data.features[0].properties.summary;
      const distanceKm = (summary.distance / 1000).toFixed(1);
      const durationMin = Math.ceil(summary.duration / 60);
      setRouteInfo({ distance: `${distanceKm} km`, duration: `${durationMin} min` });
      setDebugText(`Route: ${distanceKm}km, ${durationMin}min ✅`);

      mapRef.current?.fitToCoordinates(latLngs, {
        edgePadding: { right: 50, bottom: 150, left: 50, top: 300 },
        animated: true,
      });
    } catch (e) {
      console.error('ORS fetch error:', e);
      setDebugText('Network error fetching route');
      Alert.alert('Network Error', 'Could not fetch route. Check your connection.');
    } finally {
      setRouteLoading(false);
    }
  };

  // ─── Clear Route ────────────────────────────────────────────────────────────
  const clearRoute = () => {
    setDestination(null);
    setRouteCoords([]);
    setRouteInfo(null);
    setDebugText('Cleared. Enter destination again.');
  };

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loaderText}>Loading map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* ── MAP ── */}
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        showsUserLocation={true}
        showsMyLocationButton={true}
        initialRegion={
          origin
            ? { ...origin, latitudeDelta: 0.05, longitudeDelta: 0.05 }
            : { latitude: 13.0827, longitude: 80.2707, latitudeDelta: 0.1, longitudeDelta: 0.1 }
        }
      >
        {/* ── ROUTE POLYLINE (ORS) ── */}
        {routeCoords.length > 0 && (
          <Polyline
            coordinates={routeCoords}
            strokeWidth={5}
            strokeColor="#3b82f6"
          />
        )}

        {/* ── ORIGIN MARKER ── */}
        {origin && (
          <Marker coordinate={origin} title="Start" pinColor="blue" />
        )}

        {/* ── DESTINATION MARKER ── */}
        {destination && (
          <Marker coordinate={destination} title="End" pinColor="red" />
        )}

        {/* ── POTHOLE MARKERS ── */}
        {potholes.map((p, index) => (
          <PotholeCard
            key={p.id || `pothole-${index}`}
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            severity={p.severity > 0.8 ? 'High' : 'Medium'}
          />
        ))}
      </MapView>

      {/* ── SEARCH OVERLAY ── */}
      <View style={styles.searchWrapper}>
        <NominatimAutocomplete
          placeholder="📍 From (Source)"
          onSelect={(coords) => {
            setOrigin(coords);
            setDebugText(`Origin: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
          }}
        />
        <View style={{ height: 8 }} />
        <NominatimAutocomplete
          placeholder="🏁 To (Destination)"
          onSelect={(coords) => {
            setDestination(coords);
            setDebugText(`Destination: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`);
          }}
        />
      </View>

      {/* ── ROUTE LOADING SPINNER ── */}
      {routeLoading && (
        <View style={styles.routeLoadingBanner}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.routeLoadingText}>Finding route...</Text>
        </View>
      )}

      {/* ── DEBUG BANNER ── */}
      <View style={styles.debugBanner}>
        <Text style={styles.debugText}>🔍 {debugText}</Text>
        <Text style={styles.debugCoords}>
          Origin: {origin ? `${origin.latitude.toFixed(3)}, ${origin.longitude.toFixed(3)}` : 'not set'}
        </Text>
        <Text style={styles.debugCoords}>
          Dest: {destination ? `${destination.latitude.toFixed(3)}, ${destination.longitude.toFixed(3)}` : 'not set'}
        </Text>
      </View>

      {/* ── ROUTE INFO CARD ── */}
      {routeInfo && (
        <View style={styles.routeInfoCard}>
          <Text style={styles.routeInfoText}>🛣️ {routeInfo.distance}</Text>
          <Text style={styles.routeInfoText}>⏱️ {routeInfo.duration}</Text>
          <TouchableOpacity onPress={clearRoute} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>✕ Clear</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  map: { width: '100%', height: '100%' },
  loaderContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4ff',
  },
  loaderText: { marginTop: 12, fontSize: 16, color: '#3b82f6', fontWeight: '500' },
  searchWrapper: {
    position: 'absolute',
    top: 55,
    width: '94%',
    alignSelf: 'center',
    zIndex: 1000,
  },
  routeLoadingBanner: {
    position: 'absolute',
    top: 175,
    alignSelf: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 999,
  },
  routeLoadingText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  debugBanner: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    zIndex: 999,
    minWidth: '80%',
  },
  debugText: { color: '#facc15', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  debugCoords: { color: '#86efac', fontSize: 11, textAlign: 'center', marginTop: 2 },
  routeInfoCard: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 999,
  },
  routeInfoText: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  clearButton: { backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  clearButtonText: { color: '#dc2626', fontWeight: '600', fontSize: 13 },
});