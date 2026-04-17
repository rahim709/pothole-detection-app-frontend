import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = process.env.EXPO_PUBLIC_POTHOLE_API_URL || 'YOUR_POTHOLE_API_URL' || "10.159.100.113:3000";

// ─── VALIDATION THRESHOLDS ──────────────────────────────────────────────
const MIN_SPEED_MS = 2.0; // Minimum ~7.2 km/h to be considered "driving"
const MAX_ACCURACY_M = 25; // Anything > 25 meters usually means you are indoors

export default function DetectionScreen() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordedPoints, setRecordedPoints] = useState(0);
  
  const [displayData, setDisplayData] = useState({
    speed: 0, accuracy: 100, ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0
  });

  const lastLocation = useRef({ lat: 0, lon: 0, speed: 0, accuracy: 100 });
  const lastAccel = useRef({ x: 0, y: 0, z: 0 });
  const lastGyro = useRef({ x: 0, y: 0, z: 0 });
  const sessionData = useRef<any[]>([]);

  useEffect(() => {
    let accelSub: any, gyroSub: any, locSub: any;

    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        locSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 0 },
          (loc) => {
            const speed = loc.coords.speed || 0;
            const accuracy = loc.coords.accuracy || 100;
            
            lastLocation.current = { 
              lat: loc.coords.latitude, 
              lon: loc.coords.longitude, 
              speed: speed,
              accuracy: accuracy
            };
            
            setDisplayData(prev => ({ ...prev, speed, accuracy }));
          }
        );
      }
    })();

    if (isMonitoring) {
      setRecordedPoints(0);
      sessionData.current = [];

      Accelerometer.setUpdateInterval(100); 
      accelSub = Accelerometer.addListener(data => {
        lastAccel.current = data;
        setDisplayData(prev => ({ ...prev, ax: data.x, ay: data.y, az: data.z }));
      });

      Gyroscope.setUpdateInterval(100);
      gyroSub = Gyroscope.addListener(data => {
        lastGyro.current = data;
        setDisplayData(prev => ({ ...prev, gx: data.x, gy: data.y, gz: data.z }));
      });

      const interval = setInterval(() => {
        if (lastLocation.current.lat !== 0) {
          sessionData.current.push({
            timestamp: new Date().toISOString(),
            latitude: lastLocation.current.lat,
            longitude: lastLocation.current.lon,
            speed: lastLocation.current.speed,
            accuracy: lastLocation.current.accuracy,
            accelerometerX: lastAccel.current.x,
            accelerometerY: lastAccel.current.y,
            accelerometerZ: lastAccel.current.z,
            gyroX: lastGyro.current.x,
            gyroY: lastGyro.current.y,
            gyroZ: lastGyro.current.z,
          });
          setRecordedPoints(sessionData.current.length);
        }
      }, 100);

      return () => {
        clearInterval(interval);
        accelSub?.remove();
        gyroSub?.remove();
      };
    }

    return () => {
      locSub?.remove();
    }
  }, [isMonitoring]);

  const processSessionData = async () => {
    setIsMonitoring(false);

    if (sessionData.current.length === 0) {
      Alert.alert("No Data", "No points captured.");
      return;
    }

    setIsUploading(true);
    try {
      const header = "timestamp,latitude,longitude,speed,accuracy,accelX,accelY,accelZ,gyroX,gyroY,gyroZ\n";
      const rows = sessionData.current.map(d => 
        `${d.timestamp},${d.latitude},${d.longitude},${d.speed},${d.accuracy},${d.accelerometerX},${d.accelerometerY},${d.accelerometerZ},${d.gyroX},${d.gyroY},${d.gyroZ}`
      ).join('\n');

      const fileName = `Session_${Date.now()}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, header + rows, { encoding: 'utf8' });

      // Calculate if this session actually met the real-world driving criteria
      const isValidDrivingSession = 
        lastLocation.current.accuracy <= MAX_ACCURACY_M && 
        lastLocation.current.speed >= MIN_SPEED_MS;

      const payload = {
        latitude: lastLocation.current.lat,
        longitude: lastLocation.current.lon,
        sensorData: sessionData.current.slice(-100), 
        isValidDrivingSession: isValidDrivingSession // 👉 Sent to backend!
      };

      const response = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      Alert.alert(
        "Session Saved", 
        `Data stored locally.\nAI Result: ${result.message}`,
        [
          { text: "Export CSV", onPress: () => Sharing.shareAsync(fileUri) },
          { text: "Close" }
        ]
      );

    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Check your internet and try again.");
    } finally {
      setIsUploading(false);
      sessionData.current = [];
      setRecordedPoints(0);
    }
  };

  const handleStartDetection = () => {
    // 1. Hard Block: We still need basic GPS coordinates to record anything useful
    if (lastLocation.current.lat === 0) {
      Alert.alert("Waiting for GPS", "Please wait for a satellite lock before detecting potholes.");
      return;
    }

    let warningMessage = "";

    // 2. Soft Warning: Check if they are indoors (poor accuracy)
    if (lastLocation.current.accuracy > MAX_ACCURACY_M) {
      warningMessage = `Your GPS accuracy is poor (${lastLocation.current.accuracy.toFixed(0)}m). You might be indoors.`;
    } 
    // 3. Soft Warning: Check if they are driving (speed check)
    else if (lastLocation.current.speed < MIN_SPEED_MS) {
      warningMessage = "You appear to be stationary. Data is usually only valid while driving.";
    }

    // If there is a warning, ask the user if they want to override it
    if (warningMessage) {
      Alert.alert(
        "Validation Warning", 
        `${warningMessage}\n\nDo you want to force recording anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "Force Record", 
            style: "destructive", 
            onPress: () => setIsMonitoring(true) // Allows them to bypass the check
          }
        ]
      );
    } else {
      // All checks pass, start immediately
      setIsMonitoring(true);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.headerTitle}>Pothole Data Collector</Text>
      
      <View style={styles.speedCard}>
        <Text style={styles.speedValue}>{(displayData.speed * 3.6).toFixed(0)}</Text>
        <Text style={styles.speedUnit}>km/h</Text>
      </View>

      <View style={styles.counterBox}>
        <Text style={[styles.statusText, { color: displayData.accuracy <= MAX_ACCURACY_M ? '#10b981' : '#f59e0b' }]}>
          {displayData.accuracy <= MAX_ACCURACY_M 
            ? `🛰️ Good GPS (${displayData.accuracy.toFixed(0)}m)` 
            : `⚠️ Poor GPS (${displayData.accuracy.toFixed(0)}m)`}
        </Text>
        <Text style={styles.pointsText}>Points: {recordedPoints}</Text>
      </View>

      <TouchableOpacity 
        style={[
          styles.btn, 
          isMonitoring ? styles.stop : styles.start,
        ]}
        onPress={() => {
          if (isMonitoring) {
            processSessionData(); 
          } else {
            handleStartDetection();
          }
        }}
        disabled={isUploading}
      >
        {isUploading ? <ActivityIndicator color="white" /> : (
          <Ionicons name={isMonitoring ? "alert-circle" : "play-circle"} size={28} color="white" />
        )}
        <Text style={styles.btnText}>
          {isUploading ? "PROCESSING..." : isMonitoring ? "DETECT POTHOLE" : "START RECORDING"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 25, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#1e293b', marginBottom: 20 },
  speedCard: { backgroundColor: '#3b82f6', width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center', elevation: 5, marginBottom: 20 },
  speedValue: { fontSize: 40, fontWeight: 'bold', color: 'white' },
  speedUnit: { fontSize: 16, color: '#dbeafe' },
  counterBox: { marginBottom: 20, alignItems: 'center' },
  statusText: { fontWeight: 'bold', fontSize: 14, marginBottom: 5 },
  pointsText: { fontSize: 16, color: '#475569' },
  btn: { flexDirection: 'row', width: '100%', padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 10 },
  start: { backgroundColor: '#10b981' },
  stop: { backgroundColor: '#ef4444' },
  btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});