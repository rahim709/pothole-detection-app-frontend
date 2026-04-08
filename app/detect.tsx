import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Location from 'expo-location';
// Use the legacy import to support writeAsStringAsync in Expo v54+
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = process.env.EXPO_PUBLIC_POTHOLE_API_URL || 'YOUR_POTHOLE_API_URL';

export default function DetectionScreen() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordedPoints, setRecordedPoints] = useState(0);
  
  const [displayData, setDisplayData] = useState({
    speed: 0, ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0
  });

  const lastLocation = useRef({ lat: 0, lon: 0, speed: 0 });
  const lastAccel = useRef({ x: 0, y: 0, z: 0 });
  const lastGyro = useRef({ x: 0, y: 0, z: 0 });
  const sessionData = useRef<any[]>([]);

  useEffect(() => {
    let accelSub: any, gyroSub: any, locSub: any;

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

      (async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          locSub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 0 },
            (loc) => {
              lastLocation.current = { lat: loc.coords.latitude, lon: loc.coords.longitude, speed: loc.coords.speed || 0 };
              setDisplayData(prev => ({ ...prev, speed: loc.coords.speed || 0 }));
            }
          );
        }
      })();

      const interval = setInterval(() => {
        if (lastLocation.current.lat !== 0) {
          sessionData.current.push({
            timestamp: new Date().toISOString(),
            latitude: lastLocation.current.lat,
            longitude: lastLocation.current.lon,
            speed: lastLocation.current.speed,
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
        locSub?.remove();
      };
    }
  }, [isMonitoring]);

  const processSessionData = async () => {
    if (sessionData.current.length === 0) {
      Alert.alert("No Data", "No points captured. Wait for GPS lock.");
      setIsMonitoring(false);
      return;
    }

    setIsUploading(true);
    try {
      // 1. GENERATE CSV CONTENT
      const header = "timestamp,latitude,longitude,speed,accelX,accelY,accelZ,gyroX,gyroY,gyroZ\n";
      const rows = sessionData.current.map(d => 
        `${d.timestamp},${d.latitude},${d.longitude},${d.speed},${d.accelerometerX},${d.accelerometerY},${d.accelerometerZ},${d.gyroX},${d.gyroY},${d.gyroZ}`
      ).join('\n');

      const fileName = `Session_${Date.now()}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;

      // 2. SAVE LOCALLY (Legacy API)
      await FileSystem.writeAsStringAsync(fileUri, header + rows, { encoding: 'utf8' });

      // 3. UPLOAD TO BACKEND
      const payload = {
        latitude: lastLocation.current.lat,
        longitude: lastLocation.current.lon,
        sensorData: sessionData.current.slice(-100), 
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
      setIsMonitoring(false);
      sessionData.current = [];
      setRecordedPoints(0);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.headerTitle}>Pothole Data Collector</Text>
      
      <View style={styles.speedCard}>
        <Text style={styles.speedValue}>{displayData.speed.toFixed(1)}</Text>
        <Text style={styles.speedUnit}>m/s</Text>
      </View>

      <View style={styles.counterBox}>
        <Text style={[styles.statusText, { color: lastLocation.current.lat !== 0 ? '#10b981' : '#f59e0b' }]}>
          {lastLocation.current.lat !== 0 ? "🛰️ GPS Locked" : "🛰️ Searching GPS..."}
        </Text>
        <Text style={styles.pointsText}>Points: {recordedPoints}</Text>
      </View>

      <TouchableOpacity 
        style={[styles.btn, isMonitoring ? styles.stop : styles.start]}
        onPress={() => {
          if (isMonitoring) processSessionData();
          else setIsMonitoring(true);
        }}
        disabled={isUploading}
      >
        {isUploading ? <ActivityIndicator color="white" /> : (
          <Ionicons name={isMonitoring ? "stop-circle" : "play-circle"} size={28} color="white" />
        )}
        <Text style={styles.btnText}>
          {isUploading ? "UPLOADING..." : isMonitoring ? "STOP & SAVE" : "START RECORDING"}
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
  speedUnit: { fontSize: 12, color: '#dbeafe' },
  counterBox: { marginBottom: 20, alignItems: 'center' },
  statusText: { fontWeight: 'bold', fontSize: 14, marginBottom: 5 },
  pointsText: { fontSize: 16, color: '#475569' },
  btn: { flexDirection: 'row', width: '100%', padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 10 },
  start: { backgroundColor: '#10b981' },
  stop: { backgroundColor: '#ef4444' },
  btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});