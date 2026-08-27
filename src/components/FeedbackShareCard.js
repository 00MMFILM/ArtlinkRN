import React, { forwardRef } from "react";
import { View, Text, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

// AI 피드백 공유 카드 (오프스크린 렌더 → view-shot으로 캡처).
// variant "feed"=4:5(1080×1350, 인스타 피드·스레드), "story"=9:16(1080×1920, 스토리·틱톡)
// 360pt 폭 기준으로 디자인하고 캡처 시 1080px로 3배 확대(폰트 비율 유지).

const PINK = "#FF2D78";
const CARD_W = 360;
const DIMS = {
  feed: { h: 450, pad: 26 },
  story: { h: 640, pad: 30 },
};

const FeedbackShareCard = forwardRef(function FeedbackShareCard(
  { variant = "feed", fieldEmoji, fieldLabel, dateLabel, title, subtitle, chips = [], blocks = [] },
  ref
) {
  const d = DIMS[variant] || DIMS.feed;
  return (
    <View ref={ref} collapsable={false} style={[styles.wrap, { width: CARD_W, height: d.h }]}>
      <LinearGradient
        colors={["#FFF5F8", "#FFFFFF"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 0.6 }}
        style={[styles.card, { padding: d.pad }]}
      >
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>A</Text>
          </View>
          <Text style={styles.brandText}>ARTLINK · AI 코치</Text>
        </View>

        <View style={styles.meta}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{fieldEmoji} {fieldLabel}</Text>
          </View>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>

        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}

        {chips.length > 0 && (
          <View style={styles.chips}>
            <View style={[styles.chip, styles.chipLead]}>
              <Text style={[styles.chipText, styles.chipLeadText]}>AI 분석 {chips.length}개 항목</Text>
            </View>
            {chips.map((c, i) => (
              <View key={i} style={styles.chip}>
                <Text style={styles.chipText}>{c}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.blocks}>
          {blocks.map((b, i) => (
            <View key={i} style={styles.block}>
              <Text style={styles.blockH}>{b.h}</Text>
              <Text style={styles.blockB} numberOfLines={variant === "story" ? 4 : 3}>{b.b}</Text>
            </View>
          ))}
        </View>

        <View style={{ flex: 1, minHeight: 8 }} />
        <View style={styles.divider} />
        <View style={styles.ctaWrap}>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>전체 코칭 받기 →</Text>
          </View>
          <Text style={styles.foot}>아트링크 · art-link.kr</Text>
        </View>
      </LinearGradient>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  card: { flex: 1 },
  brand: { flexDirection: "row", alignItems: "center", gap: 6 },
  logo: { width: 18, height: 18, borderRadius: 5, backgroundColor: PINK, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  brandText: { fontSize: 9.5, fontWeight: "700", color: "#8A8A8E", letterSpacing: -0.2 },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18 },
  badge: { backgroundColor: "#FFE1EC", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  badgeText: { color: PINK, fontWeight: "800", fontSize: 10.5 },
  date: { fontSize: 10.5, color: "#B0B0B5", fontWeight: "600" },
  title: { marginTop: 12, fontSize: 22, fontWeight: "800", color: "#1C1C1E", lineHeight: 27, letterSpacing: -0.6 },
  subtitle: { marginTop: 4, fontSize: 11.5, color: "#8A8A8E", fontWeight: "600" },
  chips: { marginTop: 14, flexDirection: "row", flexWrap: "wrap", gap: 5 },
  chip: { backgroundColor: "#F2F2F5", paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 999 },
  chipText: { fontSize: 8.8, fontWeight: "700", color: "#7A7A80" },
  chipLead: { backgroundColor: "#FFE1EC" },
  chipLeadText: { color: PINK },
  blocks: { marginTop: 14, gap: 9 },
  block: { backgroundColor: "#F7F7FA", borderRadius: 10, padding: 11, paddingBottom: 12, borderLeftWidth: 3, borderLeftColor: PINK },
  blockH: { fontSize: 11, fontWeight: "800", color: "#1C1C1E", marginBottom: 4 },
  blockB: { fontSize: 11.5, lineHeight: 16, color: "#2A2A2E", fontWeight: "500", letterSpacing: -0.2 },
  divider: { height: 1, backgroundColor: "#EDEDF2", marginBottom: 12 },
  ctaWrap: { alignItems: "center" },
  cta: { backgroundColor: PINK, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 999 },
  ctaText: { color: "#fff", fontSize: 12.5, fontWeight: "800", letterSpacing: -0.2 },
  foot: { marginTop: 8, fontSize: 10, color: "#B0B0B5", fontWeight: "600" },
});

export default FeedbackShareCard;
