import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Linking,
  Image,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_EMOJIS, APP_VERSION } from "../constants/theme";
import { calculateAge } from "../utils/helpers";

// ─── Language options ───

const LANGUAGE_OPTIONS = [
  { code: "ko", flag: "🇰🇷", name: "한국어" },
  { code: "en", flag: "🇺🇸", name: "English" },
  { code: "ja", flag: "🇯🇵", name: "日本語" },
  { code: "zh-CN", flag: "🇨🇳", name: "简体中文" },
  { code: "zh-TW", flag: "🇹🇼", name: "繁體中文" },
  { code: "vi", flag: "🇻🇳", name: "Tiếng Việt" },
  { code: "th", flag: "🇹🇭", name: "ภาษาไทย" },
  { code: "id", flag: "🇮🇩", name: "Bahasa" },
  { code: "ar", flag: "🇸🇦", name: "العربية" },
  { code: "es", flag: "🇪🇸", name: "Español" },
];

// ─── Menu items (Korean-only items marked) ───

const MENU_ITEMS = [
  { icon: "\u270F\uFE0F", labelKey: "profile.edit_profile", route: "ProfileEdit" },
  { icon: "\uD83C\uDFAF", labelKey: "profile.goals", route: "Goals" },
  { icon: "\uD83D\uDCC8", labelKey: "profile.growth", route: "Growth" },
  { icon: "\uD83E\uDD1D", labelKey: "profile.matching", route: "Matching", koOnly: true },
  { icon: "\uD83C\uDFA8", labelKey: "profile.share_card", route: "ShareCard" },
  { icon: "\uD83D\uDCC1", labelKey: "profile.portfolio", route: "Portfolio" },
  { icon: "\uD83C\uDFE2", labelKey: "profile.b2b", route: "B2B", koOnly: true },
  { icon: "\uD83D\uDCEC", labelKey: "profile.inbox", route: "Inbox", koOnly: true },
  { icon: "\uD83D\uDCAC", labelKey: "profile.feedback", route: "__feedback__" },
  { icon: "\uD83D\uDCE7", labelKey: "profile.support", route: "__support__" },
  { icon: "\uD83D\uDCDC", labelKey: "profile.terms", route: "__terms__" },
  { icon: "\uD83D\uDD12", labelKey: "profile.privacy", route: "__privacy__" },
];

// ─── Skill bar config ───

const SKILL_LABEL_KEYS = [
  "profile.skill_volume",
  "profile.skill_ai",
  "profile.skill_diversity",
  "profile.skill_depth",
  "profile.skill_consistency",
];
const SKILL_COLORS = [CLight.pink, CLight.purple, CLight.orange, CLight.blue, CLight.green];

export default function ProfileScreen({ navigation }) {
  const { t } = useTranslation();
  const {
    userProfile,
    savedNotes,
    artistProfile,
    handleSubmitFeedback,
    handleDeleteAccount,
    handleLogout,
    showToast,
    isKoreanLocale,
    language,
    handleChangeLanguage,
  } = useApp();
  const [showLangPicker, setShowLangPicker] = useState(false);

  const {
    primaryField,
    displayName,
    displayFields,
    noteScore,
    aiScore,
    diversityScore,
    depthScore,
    consistencyScore,
    overallScore,
    aiAnalyzedCount,
    streak,
  } = artistProfile;

  const avatarEmoji = FIELD_EMOJIS[primaryField] || "\uD83C\uDFA8";
  const skillValues = [noteScore, aiScore, diversityScore, depthScore, consistencyScore];
  const skillLabels = SKILL_LABEL_KEYS.map((key) => t(key));
  const filteredMenuItems = MENU_ITEMS.filter((item) => !item.koOnly || isKoreanLocale);
  const currentLang = LANGUAGE_OPTIONS.find((l) => l.code === language) || LANGUAGE_OPTIONS[0];

  // ─── Handlers ───

  const handleMenuPress = useCallback(
    (item) => {
      if (item.route === "__feedback__") {
        Alert.prompt
          ? Alert.prompt(
              t("profile.feedback_prompt_title"),
              t("profile.feedback_prompt_msg"),
              [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("profile.feedback_submit"),
                  onPress: (text) => {
                    if (text && text.trim()) {
                      handleSubmitFeedback({
                        id: Date.now(),
                        text: text.trim(),
                        createdAt: new Date().toISOString(),
                      });
                    }
                  },
                },
              ],
              "plain-text"
            )
          : Alert.alert(
              t("profile.feedback"),
              t("profile.feedback_ios_only"),
              [{ text: t("common.confirm") }]
            );
        return;
      }
      if (item.route === "__support__") {
        Alert.alert(
          t("profile.support_title"),
          t("profile.support_msg"),
          [
            { text: t("common.close"), style: "cancel" },
            { text: t("profile.send_email"), onPress: () => Linking.openURL("mailto:lcy1152@naver.com?subject=ArtLink%20%EB%AC%B8%EC%9D%98") },
          ]
        );
        return;
      }
      if (item.route === "__terms__") {
        Alert.alert(
          t("profile.terms"),
          t("profile.terms_detail"),
          [{ text: t("common.confirm") }]
        );
        return;
      }
      if (item.route === "__privacy__") {
        Alert.alert(
          t("profile.privacy"),
          t("profile.privacy_detail"),
          [{ text: t("common.confirm") }]
        );
        return;
      }
      navigation.navigate(item.route);
    },
    [navigation, handleSubmitFeedback, t]
  );

  const handleLogoutPress = useCallback(() => {
    Alert.alert(
      t("profile.logout"),
      t("profile.logout_confirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("profile.logout"), onPress: () => handleLogout() },
      ]
    );
  }, [handleLogout, t]);

  const handleDeleteAccountPress = useCallback(() => {
    Alert.alert(
      t("profile.delete_account"),
      t("profile.delete_confirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => handleDeleteAccount(),
        },
      ]
    );
  }, [handleDeleteAccount, t]);

  // ─── Render ───

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Avatar & Name ─── */}
        <View style={styles.avatarSection}>
          {(userProfile.photos?.[0] || userProfile.photoUrl) ? (
            <Image source={{ uri: userProfile.photos?.[0] || userProfile.photoUrl }} style={styles.avatarPhoto} />
          ) : (
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarEmoji}>{avatarEmoji}</Text>
            </View>
          )}
          <Text style={[T.h2, { color: CLight.gray900, marginTop: 14 }]}>{displayName}</Text>
          {displayFields ? (
            <Text style={[T.caption, { color: CLight.gray500, marginTop: 4 }]}>{displayFields}</Text>
          ) : null}
          {/* Body info badges */}
          {(userProfile.gender || userProfile.birthDate || userProfile.height) ? (
            <View style={styles.bodyBadgeRow}>
              {userProfile.gender ? (
                <View style={styles.bodyBadge}>
                  <Text style={styles.bodyBadgeText}>
                    {t(`gender.${userProfile.gender}`)}
                  </Text>
                </View>
              ) : null}
              {userProfile.birthDate ? (
                <View style={styles.bodyBadge}>
                  <Text style={styles.bodyBadgeText}>{calculateAge(userProfile.birthDate)}{t("common.years_old")}</Text>
                </View>
              ) : null}
              {userProfile.height ? (
                <View style={styles.bodyBadge}>
                  <Text style={styles.bodyBadgeText}>{userProfile.height}cm</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* ─── Stats Row ─── */}
        <View style={styles.statsRow}>
          <StatItem value={savedNotes.length} label={t("profile.total_notes")} />
          <View style={styles.statsDivider} />
          <StatItem value={aiAnalyzedCount} label={t("profile.ai_analysis")} />
          <View style={styles.statsDivider} />
          <StatItem value={`${streak}${t("common.days")}`} label={t("profile.streak")} />
          <View style={styles.statsDivider} />
          <StatItem value={overallScore} label={t("profile.overall_score")} accent />
        </View>

        {/* ─── Skill Bars ─── */}
        <View style={styles.sectionCard}>
          <Text style={[T.title, { color: CLight.gray900, marginBottom: 16 }]}>
            {t("profile.skill_analysis")}
          </Text>
          {skillLabels.map((label, idx) => (
            <SkillBar
              key={SKILL_LABEL_KEYS[idx]}
              label={label}
              value={skillValues[idx]}
              color={SKILL_COLORS[idx]}
            />
          ))}
        </View>

        {/* ─── Language Selector ─── */}
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.menuRow}
            onPress={() => setShowLangPicker(!showLangPicker)}
            activeOpacity={0.6}
          >
            <View style={styles.menuLeft}>
              <Text style={styles.menuIcon}>🌐</Text>
              <Text style={[T.body, { color: CLight.gray900 }]}>{t("settings.language")}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[T.caption, { color: CLight.gray500 }]}>{currentLang.flag} {currentLang.name}</Text>
              <Text style={[T.caption, { color: CLight.gray300 }]}>{showLangPicker ? "▲" : "▼"}</Text>
            </View>
          </TouchableOpacity>
          {showLangPicker && (
            <View style={styles.langGrid}>
              {LANGUAGE_OPTIONS.map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.langChip, language === lang.code && styles.langChipActive]}
                  onPress={() => {
                    handleChangeLanguage(lang.code);
                    setShowLangPicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.langFlag}>{lang.flag}</Text>
                  <Text style={[T.small, { color: language === lang.code ? "#fff" : CLight.gray700 }]}>{lang.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* ─── Menu List ─── */}
        <View style={styles.sectionCard}>
          {filteredMenuItems.map((item, idx) => (
            <React.Fragment key={item.route}>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => handleMenuPress(item)}
                activeOpacity={0.6}
              >
                <View style={styles.menuLeft}>
                  <Text style={styles.menuIcon}>{item.icon}</Text>
                  <Text style={[T.body, { color: CLight.gray900 }]}>{t(item.labelKey)}</Text>
                </View>
                <Text style={[T.caption, { color: CLight.gray300 }]}>{"\u203A"}</Text>
              </TouchableOpacity>
              {idx < filteredMenuItems.length - 1 && <View style={styles.menuDivider} />}
            </React.Fragment>
          ))}

          {/* Logout */}
          <View style={styles.menuDivider} />
          <TouchableOpacity
            style={styles.menuRow}
            onPress={handleLogoutPress}
            activeOpacity={0.6}
          >
            <View style={styles.menuLeft}>
              <Text style={styles.menuIcon}>{"\uD83D\uDEAA"}</Text>
              <Text style={[T.body, { color: CLight.gray900 }]}>{t("profile.logout")}</Text>
            </View>
            <Text style={[T.caption, { color: CLight.gray300 }]}>{"\u203A"}</Text>
          </TouchableOpacity>

        </View>

        {/* ─── App Version ─── */}
        <Text style={styles.versionText}>ArtLink v{APP_VERSION}</Text>

        {/* Account deletion — small, bottom */}
        <TouchableOpacity onPress={handleDeleteAccountPress} activeOpacity={0.6} style={{ alignSelf: "center", marginTop: 8, marginBottom: 32 }}>
          <Text style={[T.caption, { color: CLight.gray400 || "#999", textDecorationLine: "underline" }]}>{t("profile.delete_account")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───

function StatItem({ value, label, accent = false }) {
  return (
    <View style={styles.statItem}>
      <Text style={[T.h3, { color: accent ? CLight.pink : CLight.gray900 }]}>{value}</Text>
      <Text style={[T.micro, { color: CLight.gray500, marginTop: 2 }]}>{label}</Text>
    </View>
  );
}

function SkillBar({ label, value, color }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.skillBarRow}>
      <Text style={[T.small, styles.skillLabel]}>{label}</Text>
      <View style={styles.skillTrack}>
        <View
          style={[
            styles.skillFill,
            { width: `${clamped}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={[T.smallBold, { color, width: 40, textAlign: "right" }]}>{clamped}%</Text>
    </View>
  );
}

// ─── Styles ───

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CLight.bg,
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Avatar Section
  avatarSection: {
    alignItems: "center",
    paddingTop: 32,
    paddingBottom: 24,
    backgroundColor: CLight.white,
  },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: CLight.pinkSoft,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: CLight.pink,
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  avatarEmoji: { fontSize: 40 },
  avatarPhoto: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: CLight.pink },
  bodyBadgeRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  bodyBadge: { backgroundColor: CLight.pinkSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  bodyBadgeText: { ...T.micro, color: CLight.pink, fontWeight: "600" },

  // Stats Row
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    backgroundColor: CLight.white,
    paddingVertical: 20,
    paddingHorizontal: 12,
    marginTop: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CLight.gray200,
  },
  statItem: {
    alignItems: "center",
    flex: 1,
  },
  statsDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    backgroundColor: CLight.gray200,
  },

  // Section Card
  sectionCard: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: CLight.white,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },

  // Skill Bars
  skillBarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  skillLabel: {
    width: 56,
    color: CLight.gray700,
  },
  skillTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: CLight.gray100,
    marginHorizontal: 10,
    overflow: "hidden",
  },
  skillFill: {
    height: "100%",
    borderRadius: 4,
  },

  // Menu
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  menuLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuIcon: { fontSize: 20, width: 28, textAlign: "center" },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CLight.gray200,
  },

  // Language selector
  langGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  langChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: CLight.gray100,
  },
  langChipActive: {
    backgroundColor: CLight.pink,
  },
  langFlag: {
    fontSize: 16,
  },

  // Version
  versionText: {
    textAlign: "center",
    marginTop: 28,
    marginBottom: 12,
    ...T.micro,
    color: CLight.gray400,
  },
});
