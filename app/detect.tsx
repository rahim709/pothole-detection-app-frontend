import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';

const BACKEND_URL = process.env.EXPO_PUBLIC_POTHOLE_API_URL || 'YOUR_POTHOLE_API_URL';

// ─── VALIDATION THRESHOLDS ──────────────────────────────────────────────
const MIN_SPEED_MS = 2.0; // ~7.2 km/h (Driving)
const MAX_ACCURACY_M = 25; // > 25m usually means indoors
const SHAKE_THRESHOLD_G = 1.3; // Anything above 1.3G is a shake/bump.

export default function DetectionScreen() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordedPoints, setRecordedPoints] = useState(0);
  
  const [displayData, setDisplayData] = useState({
    speed: 0, accuracy: 100, gForce: 1.0, ax: 0, ay: 0, az: 0, gx: 0, gy: 0, gz: 0
  });

  // We added a 'realSpeed' tracker so we don't overwrite actual driving data later
  const lastLocation = useRef({ lat: 0, lon: 0, speed: 0, realSpeed: 0, accuracy: 100 });
  const lastAccel = useRef({ x: 0, y: 0, z: 0, gForce: 1.0 });
  const lastGyro = useRef({ x: 0, y: 0, z: 0 });
  const sessionData = useRef<any[]>([]);

  useEffect(() => {
    let accelSub: any, gyroSub: any, locSub: any;

    // 1. Start GPS Tracking
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        locSub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 0 },
          (loc) => {
            const actualSpeed = loc.coords.speed || 0;
            const accuracy = loc.coords.accuracy || 100;
            
            lastLocation.current = { 
              ...lastLocation.current,
              lat: loc.coords.latitude, 
              lon: loc.coords.longitude, 
              realSpeed: actualSpeed, // Keep track of the real GPS speed
              accuracy: accuracy
            };
            
            // Only update display if we aren't currently faking the speed
            if (lastLocation.current.speed === actualSpeed) {
                setDisplayData(prev => ({ ...prev, speed: actualSpeed, accuracy }));
            }
          }
        );
      }
    })();

    // 2. Start Accelerometer (Always running to catch shakes)
    Accelerometer.setUpdateInterval(100); 
    accelSub = Accelerometer.addListener(data => {
      const totalGForce = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
      
      // 🌟 FAKE SPEED GENERATOR (INDOOR TESTING) 🌟
      // If our real GPS speed is basically 0, and we are shaking the phone...
      let activeSpeed = lastLocation.current.realSpeed;
      
      if (lastLocation.current.realSpeed < 1.0) {
          if (totalGForce > 1.1) {
              // Convert the shake intensity into fake forward speed!
              // e.g., 1.5G shake = 10 m/s = 36 km/h
              activeSpeed = (totalGForce - 1.0) * 20; 
          } else {
              // Reset to 0 when you stop shaking
              activeSpeed = 0; 
          }
      }

      // Temporarily overwrite the main speed variable so validations pass
      lastLocation.current.speed = activeSpeed;
      lastAccel.current = { ...data, gForce: totalGForce };
      
      setDisplayData(prev => ({ 
          ...prev, 
          ax: data.x, ay: data.y, az: data.z, 
          gForce: totalGForce,
          speed: activeSpeed // Updates the blue meter instantly!
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
            speed: lastLocation.current.speed, // This will now log your fake speed!
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
        `${d.timestamp},${d.latitude},${d.longitude},${d.speed.toFixed(2)},${d.accuracy},${d.accelerometerX},${d.accelerometerY},${d.accelerometerZ},${d.gyroX},${d.gyroY},${d.gyroZ}`
      ).join('\n');

      const fileName = `Session_${Date.now()}.csv`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, header + rows, { encoding: 'utf8' });

      const isValidDrivingSession = 
        lastLocation.current.accuracy <= MAX_ACCURACY_M && 
        lastLocation.current.speed >= MIN_SPEED_MS;

      const payload = {
        latitude: lastLocation.current.lat,
        longitude: lastLocation.current.lon,
        sensorData: sessionData.current.slice(-100), 
        isValidDrivingSession: isValidDrivingSession 
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
    } 
    // Now that speed is tied to shaking, you just need to shake it while pressing the button to pass this check!
    else if (lastLocation.current.speed < MIN_SPEED_MS) {
      warningMessage = "You appear to be stationary. Shake the phone to simulate driving speed!";
    }

    if (warningMessage) {
      Alert.alert(
        "Validation Warning", 
        `${warningMessage}\n\nDo you want to force recording anyway?`,
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
        {/* Speed Meter (Now responds to shaking!) */}
        <View style={[styles.speedCard, { backgroundColor: '#3b82f6' }]}>
          <Text style={styles.speedValue}>{(displayData.speed * 3.6).toFixed(0)}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>

        {/* Impact / Shake Meter */}
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
        onPress={() => {
          if (isMonitoring) processSessionData(); 
          else handleStartDetection();
        }}
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
  btnText: { color: 'white', fontSize: 18, fontWeight: 'bold' }
});