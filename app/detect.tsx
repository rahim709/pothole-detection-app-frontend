import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = process.env.EXPO_PUBLIC_POTHOLE_API_URL || 'YOUR_POTHOLE_API_URL';

const MIN_SPEED_MS = 2.0;
const MAX_ACCURACY_M = 25;
const SHAKE_THRESHOLD_G = 1.3;

export default function DetectionScreen() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordedPoints, setRecordedPoints] = useState(0);

  const [displayData, setDisplayData] = useState({
    speed: 0, accuracy: 100, gForce: 1.0, ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0
  });

  // ✅ Removed realSpeed — only one source of truth now
  const lastLocation = useRef({ lat: 0, lon: 0, speed: 0, accuracy: 100 });
  const lastAccel = useRef({ x: 0, y: 0, z: 0, gForce: 1.0 });
  const lastGyro = useRef({ x: 0, y: 0, z: 0 });
  const sessionData = useRef<any[]>([]);

  useEffect(() => {
    let accelSub: any, gyroSub: any, locSub: any;

    // 1. GPS — only source of speed
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        locSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 0 },
          (loc) => {
            const speed = Math.max(loc.coords.speed ?? 0, 0); // clamp negatives
            const accuracy = loc.coords.accuracy ?? 100;

            lastLocation.current = {
              lat: loc.coords.latitude,
              lon: loc.coords.longitude,
              speed,       // ✅ raw GPS speed only
              accuracy,
            };

            setDisplayData(prev => ({ ...prev, speed, accuracy }));
          }
        );
      }
    })();

    // 2. Accelerometer — only for G-force display & recording
    Accelerometer.setUpdateInterval(100);
    accelSub = Accelerometer.addListener(data => {
      const totalGForce = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
      lastAccel.current = { ...data, gForce: totalGForce };

      // ✅ No speed override here anymore
      setDisplayData(prev => ({
        ...prev,
        ax: data.x, ay: data.y, az: data.z,
        gForce: totalGForce,
      }));
    });

    if (isMonitoring) {
      setRecordedPoints(0);
      sessionData.current = [];

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
            speed: lastLocation.current.speed,       // ✅ real GPS speed
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
        gyroSub?.remove();
      };
    }

    return () => {
      locSub?.remove();
      accelSub?.remove();
    };
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
        `${d.timestamp},${d.latitude},${d.longitude},${d.speed.toFixed(2)},${d.accuracy},${d.accelerometerX},${d.accelerometerY},${d.accelerometerZ},${d.gyroX},${d.gyroY},${d.gyroZ}`
      ).join('\n');

      const fileName = `Session_${Date.now()}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, header + rows, { encoding: 'utf8' });

      // ✅ Validation uses real GPS values only
      const isValidDrivingSession =
        lastLocation.current.accuracy <= MAX_ACCURACY_M &&
        lastLocation.current.speed >= MIN_SPEED_MS;

      const payload = {
        latitude: lastLocation.current.lat,
        longitude: lastLocation.current.lon,
        sensorData: sessionData.current.slice(-100),
        isValidDrivingSession,
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
    if (lastLocation.current.lat === 0) {
      Alert.alert("Waiting for GPS", "Please wait for a satellite lock before detecting potholes.");
      return;
    }

    let warningMessage = "";

    if (lastLocation.current.accuracy > MAX_ACCURACY_M) {
      warningMessage = `Your GPS accuracy is poor (${lastLocation.current.accuracy.toFixed(0)}m). You might be indoors.`;
    } else if (lastLocation.current.speed < MIN_SPEED_MS) {
      // ✅ Honest message — no shake workaround
      warningMessage = `You appear to be stationary (${(lastLocation.current.speed * 3.6).toFixed(1)} km/h). Drive at least 7 km/h before recording.`;
    }

    if (warningMessage) {
      Alert.alert(
        "Validation Warning",
        `${warningMessage}\n\nForce record anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Force Record", style: "destructive", onPress: () => setIsMonitoring(true) }
        ]
      );
    } else {
      setIsMonitoring(true);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.headerTitle}>Pothole Data Collector</Text>

      <View style={styles.meterContainer}>
        <View style={[styles.speedCard, { backgroundColor: '#3b82f6' }]}>
          <Text style={styles.speedValue}>{(displayData.speed * 3.6).toFixed(0)}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>
        <View style={[styles.speedCard, { backgroundColor: displayData.gForce > SHAKE_THRESHOLD_G ? '#ef4444' : '#8b5cf6' }]}>
          <Text style={styles.speedValue}>{displayData.gForce.toFixed(1)}</Text>
          <Text style={styles.speedUnit}>G-Force</Text>
        </View>
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
        style={[styles.btn, isMonitoring ? styles.stop : styles.start]}
        onPress={() => { if (isMonitoring) processSessionData(); else handleStartDetection(); }}
        disabled={isUploading}
      >
        {isUploading ? <ActivityIndicator color="white" /> : (
          <Ionicons name={isMonitoring ? "alert-circle" : "play-circle"} size={28} color="white" />
        )}
        <Text style={styles.btnText}>
          {isUploading ? "PROCESSING..." : isMonitoring ? "STOP RECORDING" : "DETECT POTHOLE"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 25, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#1e293b', marginBottom: 20 },
  meterContainer: { flexDirection: 'row', gap: 20, marginBottom: 20 },
  speedCard: { width: 130, height: 130, borderRadius: 65, alignItems: 'center', justifyContent: 'center', elevation: 5 },
  speedValue: { fontSize: 36, fontWeight: 'bold', color: 'white' },
  speedUnit: { fontSize: 14, color: '#e2e8f0' },
  counterBox: { marginBottom: 20, alignItems: 'center' },
  statusText: { fontWeight: 'bold', fontSize: 14, marginBottom: 5 },
  pointsText: { fontSize: 16, color: '#475569' },
  btn: { flexDirection: 'row', width: '100%', padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 10 },
  start: { backgroundColor: '#10b981' },
  stop: { backgroundColor: '#ef4444' },
  btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});