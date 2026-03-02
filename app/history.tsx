import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy'; //
import * as Sharing from 'expo-sharing'; //
import { Ionicons } from '@expo/vector-icons';

export default function HistoryScreen() {
  const [files, setFiles] = useState<string[]>([]);

  // Scan the app's document directory for saved CSV files
  const loadFiles = async () => {
    try {
      const folderContent = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory!);
      const csvFiles = folderContent.filter(file => file.endsWith('.csv'));
      setFiles(csvFiles.sort().reverse()); // Show most recent sessions first
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not load your saved sessions.");
    }
  };

  // Reload files whenever the screen is viewed
  useEffect(() => {
    loadFiles();
  }, []);

  // Opens the file directly in a CSV viewer, Excel, or Files app
  const openFile = async (fileName: string) => {
    const fileUri = FileSystem.documentDirectory + fileName;
    const canShare = await Sharing.isAvailableAsync();
    
    if (canShare) {
      await Sharing.shareAsync(fileUri);
    } else {
      Alert.alert("Error", "Sharing/Opening is not available on this device.");
    }
  };

  const deleteFile = (fileName: string) => {
    Alert.alert("Delete Log", `Are you sure you want to remove ${fileName}?`, [
      { text: "Cancel", style: "cancel" },
      { 
        text: "Delete", 
        style: "destructive", 
        onPress: async () => {
          await FileSystem.deleteAsync(FileSystem.documentDirectory + fileName);
          loadFiles(); // Refresh the list after deletion
        } 
      }
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <TouchableOpacity onPress={loadFiles} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {files.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={80} color="#cbd5e1" />
          <Text style={styles.emptyText}>No data logs found yet.</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.fileInfo}>
                <Ionicons name="stats-chart" size={24} color="#3b82f6" />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.fileName}>{item}</Text>
                  <Text style={styles.fileType}>CSV Data Log</Text>
                </View>
              </View>
              
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => openFile(item)} style={styles.actionBtn}>
                  <Ionicons name="eye-outline" size={22} color="#10b981" />
                  <Text style={[styles.actionLabel, { color: '#10b981' }]}>Open</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => deleteFile(item)} style={styles.actionBtn}>
                  <Ionicons name="trash-outline" size={22} color="#ef4444" />
                  <Text style={[styles.actionLabel, { color: '#ef4444' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 40, marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1e293b' },
  refreshBtn: { padding: 8, backgroundColor: '#eff6ff', borderRadius: 10 },
  card: { 
    backgroundColor: '#fff', 
    padding: 16, 
    borderRadius: 15, 
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5
  },
  fileInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  fileName: { fontSize: 13, fontWeight: '600', color: '#334155', fontFamily: 'monospace' },
  fileType: { fontSize: 12, color: '#94a3b8' },
  actions: { 
    flexDirection: 'row', 
    borderTopWidth: 1, 
    borderTopColor: '#f1f5f9', 
    paddingTop: 12,
    justifyContent: 'space-around'
  },
  actionBtn: { alignItems: 'center', flex: 1 },
  actionLabel: { fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#94a3b8', marginTop: 10, fontSize: 16 }
});