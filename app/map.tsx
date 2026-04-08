import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import PotholeMarker from '../components/PotholeCard';

// Your Hosted Backend URL
const API_URL = process.env.EXPO_PUBLIC_POTHOLE_API_URL || 'YOUR_POTHOLE_API_URL';

export default function MapScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [potholes, setPotholes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPotholes = async () => {
    try {
      setRefreshing(true);
      const response = await fetch(API_URL);
      const data = await response.json();
      // Ensure we set an array even if the DB is empty
      setPotholes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching potholes:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      let curLocation = await Location.getCurrentPositionAsync({});
      setLocation(curLocation);
      fetchPotholes();
    })();
  }, []);

  if (loading || !location) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={{ marginTop: 10, color: '#64748b' }}>Loading Live Map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={{
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation
        showsMyLocationButton
      >
        {potholes.map((p, index) => (
          <PotholeMarker 
            key={p.id || `pothole-${index}`} // Use index if p.id is missing or duplicate
            coordinate={{ latitude: p.latitude, longitude: p.longitude }} 
            severity={p.severity > 0.8 ? 'High' : 'Medium'} 
          />
        ))}
      </MapView>

      {/* Floating Refresh Button */}
      <TouchableOpacity 
        style={styles.refreshButton} 
        onPress={fetchPotholes}
        disabled={refreshing}
      >
        {refreshing ? (
          <ActivityIndicator color="white" />
        ) : (
          <Ionicons name="refresh" size={24} color="white" />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  refreshButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#3b82f6',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5
  }
});