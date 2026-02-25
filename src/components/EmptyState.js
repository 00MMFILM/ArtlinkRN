import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { CLight, T } from "../constants/theme";

export default function EmptyState({ icon = "📝", title, message }) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[T.title, { color: CLight.gray900, marginTop: 12 }]}>{title}</Text>
      {message && <Text style={[T.caption, { color: CLight.gray500, marginTop: 4, textAlign: "center" }]}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  icon: { fontSize: 48 },
});
