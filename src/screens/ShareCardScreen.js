import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_COLORS, FIELD_EMOJIS } from "../constants/theme";
import TopBar from "../components/TopBar";

const CARD_STYLES = [
  { key: "minimal", labelKey: "shareCard.style_minimal", bg: "#FFFFFF", text: CLight.gray900, accent: CLight.pink },
  { key: "colorful", labelKey: "shareCard.style_colorful", bg: "linear", text: "#FFFFFF", accent: "#FFFFFF" },
  { key: "dark", labelKey: "shareCard.style_dark", bg: "#1A1A2E", text: "#FFFFFF", accent: CLight.pink },
];

const LEVEL_TIERS = [
  { min: 0,  label: "Seedling",   labelKey: "shareCard.level_1" },
  { min: 10, label: "Apprentice", labelKey: "shareCard.level_2" },
  { min: 20, label: "Explorer",   labelKey: "shareCard.level_3" },
  { min: 30, label: "Devotee",    labelKey: "shareCard.level_4" },
  { min: 40, label: "Artist",     labelKey: "shareCard.level_5" },
  { min: 50, label: "Performer",  labelKey: "shareCard.level_6" },
  { min: 60, label: "Specialist", labelKey: "shareCard.level_7" },
  { min: 70, label: "Virtuoso",   labelKey: "shareCard.level_8" },
  { min: 80, label: "Maestro",    labelKey: "shareCard.level_9" },
  { min: 90, label: "Luminary",   labelKey: "shareCard.level_10" },
];

function getLevel(score) {
  for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
    if (score >= LEVEL_TIERS[i].min) return LEVEL_TIERS[i];
  }
  return LEVEL_TIERS[0];
}

function getActivityPeriod(notes, t) {
  if (notes.length === 0) return null;
  const dates = notes.map((n) => new Date(n.createdAt).getTime());
  const earliest = new Date(Math.min(...dates));
  const now = new Date();
  const diffMs = now - earliest;
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return t("shareCard.started_today");
  if (days < 7) return t("shareCard.recording_days", { days });
  if (days < 30) return t("shareCard.recording_weeks", { weeks: Math.floor(days / 7) });
  return t("shareCard.recording_months", { months: Math.floor(days / 30) });
}

export default function ShareCardScreen({ navigation }) {
  const { t } = useTranslation();
  const { artistProfile, userProfile, savedNotes } = useApp();
  const [selectedStyle, setSelectedStyle] = useState("minimal");

  const topSkills = artistProfile.radarLabels
    .map((label, i) => ({ label, value: artistProfile.radarValues[i] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  const level = useMemo(() => getLevel(artistProfile.overallScore), [artistProfile.overallScore]);
  const activityPeriod = useMemo(() => getActivityPeriod(savedNotes, t), [savedNotes, t]);
  const topTags = useMemo(() => artistProfile.topTags?.slice(0, 3) || [], [artistProfile.topTags]);
  const primaryEmoji = FIELD_EMOJIS[artistProfile.primaryField] || "🎭";

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

  const getTagBg = () => {
    if (selectedStyle === "minimal") return CLight.gray100;
    if (selectedStyle === "colorful") return "rgba(255,255,255,0.2)";
    return "rgba(255,255,255,0.08)";
  };

  const getTagText = () => {
    if (selectedStyle === "minimal") return CLight.gray700;
    return "rgba(255,255,255,0.85)";
  };

  const getDivider = () => {
    if (selectedStyle === "minimal") return "rgba(0,0,0,0.06)";
    if (selectedStyle === "colorful") return "rgba(255,255,255,0.2)";
    return "rgba(255,255,255,0.1)";
  };

  const getStatValueColor = () => {
    if (selectedStyle === "minimal") return CLight.pink;
    return "#FFFFFF";
  };

  const handleShare = () => {
    Alert.alert(t("shareCard.share"), t("shareCard.share_coming_soon"), [
      { text: t("common.confirm") },
    ]);
  };

  const handleSaveImage = () => {
    Alert.alert(t("shareCard.save_image"), t("shareCard.save_coming_soon"), [
      { text: t("common.confirm") },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title={t("shareCard.title")}
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>{"<"} {t("common.back")}</Text>
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
          {/* Header: avatar + name + level badge */}
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={[T.h3, { color: getCardText() }]}>
                  {artistProfile.displayName}
                </Text>
              </View>
              <Text style={[T.small, { color: getCardSub(), marginTop: 2 }]}>
                {primaryEmoji} {artistProfile.displayFields || t("common.artist")}
              </Text>
            </View>
            {/* Level badge */}
            <View style={[styles.levelBadge, { backgroundColor: getScoreBg() }]}>
              <Text style={[T.microBold, { color: getStatValueColor() }]}>{level.label}</Text>
              <Text style={[T.tiny, { color: getCardSub() }]}>{t(level.labelKey)}</Text>
            </View>
          </View>

          {/* Score + growth */}
          <View style={[styles.scoreSection, { backgroundColor: getScoreBg() }]}>
            <Text style={[styles.scoreNumber, { color: getCardText() }]}>
              {artistProfile.overallScore}
            </Text>
            <Text style={[T.micro, { color: getCardSub(), marginTop: 2 }]}>
              {t("shareCard.overall_score")}
            </Text>
            {artistProfile.weekGrowth !== 0 && (
              <Text style={[T.tiny, { color: artistProfile.weekGrowth > 0 ? CLight.green : CLight.orange, marginTop: 4 }]}>
                {artistProfile.weekGrowth > 0 ? "+" : ""}{artistProfile.weekGrowth}% this week
              </Text>
            )}
          </View>

          {/* Mini stats row */}
          <View style={[styles.miniStatsRow, { borderBottomColor: getDivider() }]}>
            <View style={styles.miniStat}>
              <Text style={[T.captionBold, { color: getStatValueColor() }]}>
                {savedNotes.length}
              </Text>
              <Text style={[T.tiny, { color: getCardSub() }]}>{t("shareCard.total_records")}</Text>
            </View>
            <View style={[styles.miniStatDivider, { backgroundColor: getDivider() }]} />
            <View style={styles.miniStat}>
              <Text style={[T.captionBold, { color: getStatValueColor() }]}>
                {artistProfile.aiAnalyzedCount}
              </Text>
              <Text style={[T.tiny, { color: getCardSub() }]}>{t("shareCard.ai_analysis")}</Text>
            </View>
            <View style={[styles.miniStatDivider, { backgroundColor: getDivider() }]} />
            <View style={styles.miniStat}>
              <Text style={[T.captionBold, { color: getStatValueColor() }]}>
                {artistProfile.streak}{t("common.days")}
              </Text>
              <Text style={[T.tiny, { color: getCardSub() }]}>{t("shareCard.streak")}</Text>
            </View>
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

          {/* Top tags */}
          {topTags.length > 0 && (
            <View style={styles.tagsSection}>
              <Text style={[T.microBold, { color: getCardSub(), marginBottom: 8 }]}>
                INTERESTS
              </Text>
              <View style={styles.tagsRow}>
                {topTags.map(([tag]) => (
                  <View key={tag} style={[styles.tagChip, { backgroundColor: getTagBg() }]}>
                    <Text style={[T.tiny, { color: getTagText() }]}>#{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Activity period */}
          {activityPeriod && (
            <View style={[styles.activityRow, { borderTopColor: getDivider() }]}>
              <Text style={[T.tiny, { color: getCardSub() }]}>
                {activityPeriod}
              </Text>
            </View>
          )}

          {/* Watermark */}
          <Text style={[T.tiny, { color: getCardSub(), textAlign: "center", marginTop: 8 }]}>
            {t("shareCard.watermark")}
          </Text>
        </View>

        {/* Style selector */}
        <Text style={[T.captionBold, { color: CLight.gray700, marginTop: 24, marginBottom: 12 }]}>
          {t("shareCard.card_style")}
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
                {t(style.labelKey)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Action buttons */}
        <TouchableOpacity style={styles.primaryBtn} onPress={handleShare}>
          <Text style={[T.captionBold, { color: CLight.white }]}>{t("shareCard.share")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={handleSaveImage}>
          <Text style={[T.captionBold, { color: CLight.pink }]}>{t("shareCard.save_image")}</Text>
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
  levelBadge: {
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 2,
  },
  scoreSection: {
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 20,
  },
  scoreNumber: {
    fontSize: 36,
    fontWeight: "800",
    lineHeight: 42,
  },
  miniStatsRow: {
    flexDirection: "row",
    marginTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  miniStat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  miniStatDivider: {
    width: 1,
    height: 28,
    alignSelf: "center",
  },
  skillsSection: { marginTop: 16 },
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
  tagsSection: {
    marginTop: 16,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  activityRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    alignItems: "center",
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
