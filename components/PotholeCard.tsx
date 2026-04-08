import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons'; // Added this import

interface PotholeProps {
  coordinate: { latitude: number; longitude: number };
  severity: string;
  speed?: number;
}

export default function PotholeCard({ coordinate, severity }: PotholeProps) {
  return (
    <Marker coordinate={coordinate}>
      <View style={[
        styles.marker, 
        { borderColor: severity === 'High' ? '#ef4444' : '#f59e0b' }
      ]}>
        <Ionicons 
          name="warning" 
          size={16} 
          color={severity === 'High' ? '#ef4444' : '#f59e0b'} 
        />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  marker: { 
    backgroundColor: 'white', 
    padding: 5, 
    borderRadius: 20, 
    borderWidth: 2, 
    alignItems: 'center',
    justifyContent: 'center'
  }
});