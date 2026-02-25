import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_COLORS } from "../constants/theme";
import TopBar from "../components/TopBar";

const CARD_STYLES = [
  { key: "minimal", label: "미니멀", bg: "#FFFFFF", text: CLight.gray900, accent: CLight.pink },
  { key: "colorful", label: "컬러풀", bg: "linear", text: "#FFFFFF", accent: "#FFFFFF" },
  { key: "dark", label: "다크", bg: "#1A1A2E", text: "#FFFFFF", accent: CLight.pink },
];

export default function ShareCardScreen({ navigation }) {
  const { artistProfile, userProfile } = useApp();
  const [selectedStyle, setSelectedStyle] = useState("minimal");

  const currentStyle = CARD_STYLES.find((s) => s.key === selectedStyle);

  const topSkills = artistProfile.radarLabels
    .map((label, i) => ({ label, value: artistProfile.radarValues[i] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const getCardBg = () => {
    if (selectedStyle === "colorful") return CLight.pink;
    if (selectedStyle === "dark") return "#1A1A2E";
    return CLight.white;
  };

  const getCardText = () => {
    if (selectedStyle === "minimal") return CLight.gray900;
    return "#FFFFFF";
  };

  const getCardSub = () => {
    if (selectedStyle === "minimal") return CLight.gray500;
    if (selectedStyle === "colorful") return "rgba(255,255,255,0.75)";
    return "rgba(255,255,255,0.6)";
  };

  const getScoreBg = () => {
    if (selectedStyle === "minimal") return CLight.pinkSoft;
    if (selectedStyle === "colorful") return "rgba(255,255,255,0.2)";
    return "rgba(255,45,120,0.25)";
  };

  const getSkillBarBg = () => {
    if (selectedStyle === "minimal") return CLight.gray100;
    if (selectedStyle === "colorful") return "rgba(255,255,255,0.25)";
    return "rgba(255,255,255,0.1)";
  };

  const getSkillBarFill = () => {
    if (selectedStyle === "minimal") return CLight.pink;
    if (selectedStyle === "colorful") return "#FFFFFF";
    return CLight.pink;
  };

  const handleShare = () => {
    Alert.alert("공유하기", "공유 기능은 추후 업데이트에서 지원됩니다.", [
      { text: "확인" },
    ]);
  };

  const handleSaveImage = () => {
    Alert.alert("이미지 저장", "이미지 저장 기능은 추후 업데이트에서 지원됩니다.", [
      { text: "확인" },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title="공유 카드"
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>{"<"} 뒤로</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Card preview */}
        <View style={[styles.previewCard, { backgroundColor: getCardBg() }]}>
          {/* Header */}
          <View style={styles.previewHeader}>
            <View
              style={[
                styles.avatarCircle,
                {
                  backgroundColor:
                    selectedStyle === "minimal" ? CLight.pinkSoft : "rgba(255,255,255,0.2)",
                },
              ]}
            >
              <Text style={[T.h2, { color: selectedStyle === "minimal" ? CLight.pink : "#FFFFFF" }]}>
                {(userProfile.name || "A").charAt(0)}
              </Text>
            </View>
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={[T.h3, { color: getCardText() }]}>
                {artistProfile.displayName}
              </Text>
              <Text style={[T.small, { color: getCardSub(), marginTop: 2 }]}>
                {artistProfile.displayFields || "아티스트"}
              </Text>
            </View>
          </View>

          {/* Score */}
          <View style={[styles.scoreSection, { backgroundColor: getScoreBg() }]}>
            <Text style={[T.h1, { color: getCardText() }]}>
              {artistProfile.overallScore}
            </Text>
            <Text style={[T.micro, { color: getCardSub(), marginTop: 2 }]}>
              종합 점수
            </Text>
          </View>

          {/* Top skills */}
          <View style={styles.skillsSection}>
            <Text style={[T.microBold, { color: getCardSub(), marginBottom: 8 }]}>
              TOP SKILLS
            </Text>
            {topSkills.map((skill) => (
              <View key={skill.label} style={styles.skillRow}>
                <Text style={[T.small, { color: getCardText(), flex: 1 }]}>
                  {skill.label}
                </Text>
                <View style={[styles.skillBar, { backgroundColor: getSkillBarBg() }]}>
                  <View
                    style={[
                      styles.skillBarFill,
                      {
                        width: `${skill.value}%`,
                        backgroundColor: getSkillBarFill(),
                      },
                    ]}
                  />
                </View>
                <Text style={[T.microBold, { color: getCardText(), width: 30, textAlign: "right" }]}>
                  {skill.value}
                </Text>
              </View>
            ))}
          </View>

          {/* Streak */}
          <View style={styles.streakRow}>
            <Text style={[T.small, { color: getCardSub() }]}>
              연속 기록
            </Text>
            <Text style={[T.captionBold, { color: getCardText() }]}>
              {artistProfile.streak}일
            </Text>
          </View>

          {/* Watermark */}
          <Text style={[T.tiny, { color: getCardSub(), textAlign: "center", marginTop: 12 }]}>
            Artlink | 아티스트 성장 노트
          </Text>
        </View>

        {/* Style selector */}
        <Text style={[T.captionBold, { color: CLight.gray700, marginTop: 24, marginBottom: 12 }]}>
          카드 스타일
        </Text>
        <View style={styles.styleRow}>
          {CARD_STYLES.map((style) => (
            <TouchableOpacity
              key={style.key}
              style={[
                styles.styleOption,
                selectedStyle === style.key && styles.styleOptionActive,
              ]}
              onPress={() => setSelectedStyle(style.key)}
            >
              <View
                style={[
                  styles.stylePreview,
                  {
                    backgroundColor:
                      style.key === "colorful" ? CLight.pink : style.bg,
                    borderWidth: style.key === "minimal" ? 1 : 0,
                    borderColor: CLight.gray200,
                  },
                ]}
              />
              <Text
                style={[
                  T.micro,
                  {
                    color:
                      selectedStyle === style.key ? CLight.pink : CLight.gray500,
                    marginTop: 6,
                    fontWeight: selectedStyle === style.key ? "600" : "400",
                  },
                ]}
              >
                {style.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Action buttons */}
        <TouchableOpacity style={styles.primaryBtn} onPress={handleShare}>
          <Text style={[T.captionBold, { color: CLight.white }]}>공유하기</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={handleSaveImage}>
          <Text style={[T.captionBold, { color: CLight.pink }]}>이미지 저장</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CLight.bg },
  backBtn: { ...T.caption, color: CLight.pink },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },
  previewCard: {
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreSection: {
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 20,
  },
  skillsSection: { marginTop: 20 },
  skillRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  skillBar: {
    flex: 2,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    marginHorizontal: 8,
  },
  skillBarFill: {
    height: 6,
    borderRadius: 3,
  },
  streakRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.15)",
  },
  styleRow: {
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
  },
  styleOption: {
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  styleOptionActive: {
    borderColor: CLight.pink,
    backgroundColor: CLight.pinkSoft,
  },
  stylePreview: {
    width: 56,
    height: 36,
    borderRadius: 8,
  },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: CLight.pink,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBtn: {
    marginTop: 10,
    backgroundColor: CLight.white,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: CLight.pink,
  },
});
