import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { CLight } from "../constants/theme";

export default function Pill({ children, active, color = CLight.pink, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.pill,
        {
          borderColor: active ? color : CLight.gray200,
          borderWidth: active ? 1.5 : 1,
          backgroundColor: active ? `${color}11` : CLight.white,
        },
      ]}
    >
      <Text style={[styles.text, { color: active ? color : CLight.gray500, fontWeight: active ? "600" : "400" }]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  text: { fontSize: 13 },
});
