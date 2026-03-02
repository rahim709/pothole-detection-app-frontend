import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';

interface PotholeProps {
  coordinate: { latitude: number; longitude: number };
  severity: string;
  speed?: number; // Added to handle the speed you want to measure
}

export default function PotholeCard({ coordinate, severity, speed }: PotholeProps) {
  return (
    <Marker coordinate={coordinate}>
      <View style={[styles.marker, { borderColor: severity === 'High' ? 'red' : 'orange' }]}>
        <Text style={{ fontSize: 14 }}>⚠️</Text>
        {speed !== undefined && <Text style={styles.speedText}>{speed.toFixed(1)}</Text>}
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  marker: { backgroundColor: 'white', padding: 5, borderRadius: 20, borderWidth: 2, alignItems: 'center' },
  speedText: { fontSize: 8, fontWeight: 'bold' }
});