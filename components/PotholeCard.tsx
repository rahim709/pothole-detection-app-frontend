import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons'; // Utilizing Expo's built-in icons

interface PotholeProps {
  coordinate: { latitude: number; longitude: number };
  severity: string;
}

export default function PotholeCard({ coordinate, severity }: PotholeProps) {
  const isHighSeverity = severity === 'High';

  // Choose colors based on how bad the pothole is
  const iconColor = isHighSeverity ? '#ef4444' : '#f59e0b'; // Red for High, Orange for Medium
  const bgColor = isHighSeverity ? '#fee2e2' : '#fef3c7';   // Light Red or Light Orange background

  return (
    <Marker 
      coordinate={coordinate}
      title={`${severity} Severity Pothole`}
      tracksViewChanges={false} // Keeps the map fast!
    >
      {/* Custom Warning Badge */}
      <View style={[styles.badgeContainer, { backgroundColor: bgColor, borderColor: iconColor }]}>
        <Ionicons 
          name="warning" // This gives a classic warning triangle
          size={20} 
          color={iconColor} 
        />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  badgeContainer: {
    width: 34,
    height: 34,
    borderRadius: 17, // Makes it a perfect circle
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4, // Shadow for Android
  }
});