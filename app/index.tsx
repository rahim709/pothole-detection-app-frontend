import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="car-outline" size={80} color="#3b82f6" />
        <Text style={styles.title}>RoadSafe</Text>
        <Text style={styles.subtitle}>AI-Powered Pothole Detection</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={styles.mainButton} 
          onPress={() => router.push('/detect')}
        >
          <Ionicons name="scan" size={24} color="white" style={styles.icon} />
          <Text style={styles.buttonText}>Start Detection</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.secondaryButton, { marginTop: 15 }]} 
          onPress={() => router.push('/map')}
        >
          <Ionicons name="map-outline" size={24} color="#3b82f6" style={styles.icon} />
          <Text style={styles.secondaryButtonText}>View Pothole Map</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.secondaryButton, { marginTop: 15 }]} 
          onPress={() => router.push('/history')}
        >
          <Ionicons name="time-outline" size={24} color="#3b82f6" style={styles.icon} />
          <Text style={styles.secondaryButtonText}>Detection History</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 20, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 50 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#1e293b', marginTop: 10 },
  subtitle: { fontSize: 16, color: '#64748b' },
  buttonContainer: { width: '100%' },
  mainButton: { 
    backgroundColor: '#3b82f6', 
    flexDirection: 'row', 
    padding: 18, 
    borderRadius: 16, 
    alignItems: 'center', 
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#3b82f6',
    shadowOpacity: 0.3,
    shadowRadius: 10
  },
  secondaryButton: { 
    backgroundColor: 'white', 
    flexDirection: 'row', 
    padding: 18, 
    borderRadius: 16, 
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#e2e8f0'
  },
  buttonText: { color: 'white', fontSize: 18, fontWeight: '600' },
  secondaryButtonText: { color: '#3b82f6', fontSize: 18, fontWeight: '600' },
  icon: { marginRight: 10 }
});