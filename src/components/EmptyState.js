import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CLight, T } from "../constants/theme";

// actionLabel/onAction은 선택 — 넘기지 않으면 기존과 동일하게 버튼 없이 렌더링된다
// (MatchingScreen 오류 화면의 "다시 시도" 버튼을 위해 추가).
export default function EmptyState({ icon = "📝", title, message, actionLabel, onAction }) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[T.title, { color: CLight.gray900, marginTop: 12 }]}>{title}</Text>
      {message && <Text style={[T.caption, { color: CLight.gray500, marginTop: 4, textAlign: "center" }]}>{message}</Text>}
      {actionLabel && onAction && (
        <TouchableOpacity style={styles.actionBtn} onPress={onAction} activeOpacity={0.8}>
          <Text style={[T.captionBold, { color: CLight.white }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  icon: { fontSize: 48 },
  actionBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: CLight.pink,
  },
});
