import React, { useEffect, useRef } from "react";
import { Animated, Text, StyleSheet, View } from "react-native";
import { CLight, T } from "../constants/theme";

const ICONS = { success: "✅", delete: "🗑", star: "⭐", unstar: "☆", edit: "✏️", info: "💡" };
const BG_COLORS = {
  success: CLight.green, delete: CLight.red, star: CLight.orange,
  unstar: CLight.gray500, edit: CLight.blue, info: CLight.gray700,
};

export default function Toast({ message, type = "success", visible, onHide }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      const timer = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
          onHide && onHide();
        });
      }, 2400);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View
        style={[
          styles.toast,
          { backgroundColor: BG_COLORS[type] || CLight.gray700 },
          {
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
          },
        ]}
      >
        <Text style={styles.icon}>{ICONS[type] || "✅"}</Text>
        <Text style={styles.message}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "absolute", bottom: 100, left: 20, right: 20, alignItems: "center", zIndex: 200 },
  toast: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 20,
  },
  icon: { fontSize: 16 },
  message: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
