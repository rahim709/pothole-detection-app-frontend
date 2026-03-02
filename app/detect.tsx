import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Platform } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing'; // Added for opening the file immediately
import { Ionicons } from '@expo/vector-icons';

export default function DetectionScreen() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [recordedPoints, setRecordedPoints] = useState(0); // Live counter
  
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

      Accelerometer.setUpdateInterval(50); 
      accelSub = Accelerometer.addListener(data => {
        lastAccel.current = data;
        setDisplayData(prev => ({ ...prev, ax: data.x, ay: data.y, az: data.z }));
      });

      Gyroscope.setUpdateInterval(50);
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
        // Only record if we have a valid GPS lock to prevent empty-looking CSVs
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

  const saveAndOpenSession = async () => {
    if (sessionData.current.length === 0) {
      Alert.alert("No Data", "Wait for GPS lock (green text) before stopping.");
      return;
    }

    try {
      const header = "timestamp,latitude,longitude,speed,accelerometerX,accelerometerY,accelerometerZ,gyroX,gyroY,gyroZ\n";
      const rows = sessionData.current.map(d => 
        `${d.timestamp},${d.latitude},${d.longitude},${d.speed},${d.accelerometerX},${d.accelerometerY},${d.accelerometerZ},${d.gyroX},${d.gyroY},${d.gyroZ}`
      ).join('\n');

      const fileName = `Session_${Date.now()}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;

      // Write with UTF8 and await fully
      await FileSystem.writeAsStringAsync(fileUri, header + rows, { encoding: FileSystem.EncodingType.UTF8 });
      
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      
      Alert.alert("File Saved", `Saved ${sessionData.current.length} points.`, [
        { text: "Open File", onPress: () => Sharing.shareAsync(fileUri) },
        { text: "OK" }
      ]);
      
      sessionData.current = [];
      setRecordedPoints(0);
    } catch (e) {
      Alert.alert("Error", "Could not save file.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.headerTitle}>Live Pothole Detection</Text>
      
      <View style={styles.speedCard}>
        <Text style={styles.speedValue}>{displayData.speed.toFixed(1)}</Text>
        <Text style={styles.speedUnit}>m/s (Speed)</Text>
      </View>

      <View style={styles.counterBox}>
        <Text style={[styles.statusText, { color: lastLocation.current.lat !== 0 ? '#10b981' : '#f59e0b' }]}>
          {lastLocation.current.lat !== 0 ? "🛰️ GPS Locked" : "🛰️ Searching for GPS..."}
        </Text>
        <Text style={styles.pointsText}>Points Captured: {recordedPoints}</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.statBox}><Text style={styles.statLabel}>ACCEL: {displayData.ax.toFixed(2)} | {displayData.ay.toFixed(2)} | {displayData.az.toFixed(2)}</Text></View>
        <View style={styles.statBox}><Text style={styles.statLabel}>GYRO: {displayData.gx.toFixed(2)} | {displayData.gy.toFixed(2)} | {displayData.gz.toFixed(2)}</Text></View>
      </View>

      <TouchableOpacity 
        style={[styles.btn, isMonitoring ? styles.stop : styles.start]}
        onPress={() => {
          if (isMonitoring) saveAndOpenSession();
          setIsMonitoring(!isMonitoring);
        }}
      >
        <Ionicons name={isMonitoring ? "stop-circle" : "play-circle"} size={28} color="white" />
        <Text style={styles.btnText}>{isMonitoring ? "STOP & SAVE CSV" : "START MEASURING"}</Text>
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
  grid: { width: '100%', marginBottom: 20 },
  statBox: { backgroundColor: 'white', padding: 12, borderRadius: 10, marginBottom: 10, elevation: 1 },
  statLabel: { fontSize: 13, fontFamily: 'monospace', color: '#1e293b' },
  btn: { flexDirection: 'row', width: '100%', padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 10 },
  start: { backgroundColor: '#10b981' },
  stop: { backgroundColor: '#ef4444' },
  btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});