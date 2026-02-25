import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { CLight, T } from "../constants/theme";

export default function TopBar({ title, left, right, bg }) {
  return (
    <View style={[styles.container, bg ? { backgroundColor: bg } : {}]}>
      <View style={styles.side}>{left}</View>
      <Text style={[T.title, { color: CLight.gray900 }]}>{title}</Text>
      <View style={[styles.side, { alignItems: "flex-end" }]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  side: { minWidth: 60 },
});
