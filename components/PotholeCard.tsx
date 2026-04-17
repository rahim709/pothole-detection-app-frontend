import React from "react";
import { View, StyleSheet } from "react-native";
import { Marker } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons"; // Utilizing Expo's built-in icons

interface PotholeProps {
  coordinate: { latitude: number; longitude: number };
  severity: number;
}

export default function PotholeCard({ coordinate, severity }: PotholeProps) {
  // Severity accumulation implies:
  // ~1.0: single hit
  // ~2.0+: multiple hits
  // Decide badge colors
  let iconColor = "#f59e0b"; // Orange (Medium)
  let bgColor = "#fef3c7";
  let levelString = "Medium";
  let shadowOpacity = 0.3;

  if (severity >= 3) {
    // Extremely severe / deeply accumulated
    iconColor = "#450a0a"; // Very Dark Red / Almost Black
    bgColor = "#7f1d1d"; // Dark Red background
    levelString = "Critical";
    shadowOpacity = 0.8;
  } else if (severity >= 1.5) {
    iconColor = "#ef4444"; // Red (High)
    bgColor = "#fee2e2";
    levelString = "High";
    shadowOpacity = 0.5;
  }

  return (
    <Marker
      coordinate={coordinate}
      title={`${levelString} Severity Pothole`}
      description={`Severity Score: ${severity.toFixed(1)}`}
      tracksViewChanges={false} // Keeps the map fast!
    >
      {/* Custom Warning Badge */}
      <View
        style={[
          styles.badgeContainer,
          { backgroundColor: bgColor, borderColor: iconColor, shadowOpacity },
        ]}
      >
        <Ionicons
          name="warning" // This gives a classic warning triangle
          size={severity > 3 ? 24 : 20}
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
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4, // Shadow for Android
  },
});
