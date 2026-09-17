// 다음 연습에서 고칠 점 하나 고르기 — AI가 준 후보([[FOCUS]]) 1~3개를 칩으로 보여주고 하나만 선택.
// 후보가 없으면(구서버 응답 등) 아무것도 렌더하지 않는다.
import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CLight, T } from "../constants/theme";

export default function FocusPicker({ title, options, value, onSelect }) {
  const opts = (options || []).filter(Boolean).slice(0, 3);
  if (opts.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {title ? <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 8 }]}>{title}</Text> : null}
      {opts.map((opt) => {
        const on = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, on && styles.chipOn]}
            onPress={() => onSelect && onSelect(on ? null : opt)}
            activeOpacity={0.8}
          >
            <Text style={[T.small, { color: on ? CLight.white : CLight.gray700 }]}>
              {on ? "✓ " : ""}{opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: CLight.gray100,
    borderWidth: 1,
    borderColor: CLight.gray200,
  },
  chipOn: { backgroundColor: CLight.pink, borderColor: CLight.pink },
});
