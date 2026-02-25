import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  SafeAreaView,
  Alert,
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_EMOJIS, APP_VERSION } from "../constants/theme";

// ─── Menu items ───

const MENU_ITEMS = [
  { icon: "\uD83C\uDFAF", label: "\uBAA9\uD45C \uAD00\uB9AC", route: "Goals" },
  { icon: "\uD83D\uDCC8", label: "\uC131\uC7A5 \uB9AC\uD3EC\uD2B8", route: "Growth" },
  { icon: "\uD83E\uDD1D", label: "\uB9E4\uCE6D", route: "Matching" },
  { icon: "\uD83C\uDFA8", label: "\uACF5\uC720 \uCE74\uB4DC", route: "ShareCard" },
  { icon: "\uD83D\uDCC1", label: "\uD3EC\uD2B8\uD3F4\uB9AC\uC624", route: "Portfolio" },
  { icon: "\uD83C\uDFE2", label: "B2B \uB300\uC2DC\uBCF4\uB4DC", route: "B2B" },
  { icon: "\uD83D\uDCB3", label: "\uAD6C\uB3C5 \uAD00\uB9AC", route: "Subscription" },
  { icon: "\uD83D\uDDFA\uFE0F", label: "\uAC1C\uBC1C \uB85C\uB4DC\uB9F5", route: "DevRoadmap" },
  { icon: "\uD83D\uDCAC", label: "\uD53C\uB4DC\uBC31 \uBCF4\uB0B4\uAE30", route: "__feedback__" },
];

// ─── Skill bar config ───

const SKILL_LABELS = ["\uAE30\uB85D\uB7C9", "AI\uD65C\uC6A9", "\uB2E4\uC591\uC131", "\uAE4A\uC774", "\uAFB8\uC900\uD568"];
const SKILL_COLORS = [CLight.pink, CLight.purple, CLight.orange, CLight.blue, CLight.green];

export default function ProfileScreen({ navigation }) {
  const {
    userProfile,
    savedNotes,
    darkMode,
    artistProfile,
    handleSetDarkMode,
    handleSubmitFeedback,
    showToast,
  } = useApp();

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

  // ─── Handlers ───

  const handleMenuPress = useCallback(
    (item) => {
      if (item.route === "__feedback__") {
        Alert.prompt
          ? Alert.prompt(
              "\uD53C\uB4DC\uBC31 \uBCF4\uB0B4\uAE30",
              "ArtLink\uC5D0 \uB300\uD55C \uC758\uACAC\uC774\uB098 \uAC1C\uC120 \uC0AC\uD56D\uC744 \uC54C\uB824\uC8FC\uC138\uC694.",
              [
                { text: "\uCDE8\uC18C", style: "cancel" },
                {
                  text: "\uBCF4\uB0B4\uAE30",
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
              "\uD53C\uB4DC\uBC31",
              "\uD53C\uB4DC\uBC31 \uAE30\uB2A5\uC740 iOS\uC5D0\uC11C \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
              [{ text: "\uD655\uC778" }]
            );
        return;
      }
      navigation.navigate(item.route);
    },
    [navigation, handleSubmitFeedback]
  );

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
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarEmoji}>{avatarEmoji}</Text>
          </View>
          <Text style={[T.h2, { color: CLight.gray900, marginTop: 14 }]}>{displayName}</Text>
          {displayFields ? (
            <Text style={[T.caption, { color: CLight.gray500, marginTop: 4 }]}>{displayFields}</Text>
          ) : null}
        </View>

        {/* ─── Stats Row ─── */}
        <View style={styles.statsRow}>
          <StatItem value={savedNotes.length} label={"\uC804\uCCB4 \uB178\uD2B8"} />
          <View style={styles.statsDivider} />
          <StatItem value={aiAnalyzedCount} label={"AI \uBD84\uC11D"} />
          <View style={styles.statsDivider} />
          <StatItem value={`${streak}\uC77C`} label={"\uC2A4\uD2B8\uB9AD"} />
          <View style={styles.statsDivider} />
          <StatItem value={overallScore} label={"\uC885\uD569 \uC810\uC218"} accent />
        </View>

        {/* ─── Skill Bars ─── */}
        <View style={styles.sectionCard}>
          <Text style={[T.title, { color: CLight.gray900, marginBottom: 16 }]}>
            {"\uC2E4\uB825 \uBD84\uC11D"}
          </Text>
          {SKILL_LABELS.map((label, idx) => (
            <SkillBar
              key={label}
              label={label}
              value={skillValues[idx]}
              color={SKILL_COLORS[idx]}
            />
          ))}
        </View>

        {/* ─── Menu List ─── */}
        <View style={styles.sectionCard}>
          {MENU_ITEMS.map((item, idx) => (
            <React.Fragment key={item.route}>
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => handleMenuPress(item)}
                activeOpacity={0.6}
              >
                <View style={styles.menuLeft}>
                  <Text style={styles.menuIcon}>{item.icon}</Text>
                  <Text style={[T.body, { color: CLight.gray900 }]}>{item.label}</Text>
                </View>
                <Text style={[T.caption, { color: CLight.gray300 }]}>{"\u203A"}</Text>
              </TouchableOpacity>
              {idx < MENU_ITEMS.length - 1 && <View style={styles.menuDivider} />}
            </React.Fragment>
          ))}

          {/* Dark mode toggle */}
          <View style={styles.menuDivider} />
          <View style={styles.menuRow}>
            <View style={styles.menuLeft}>
              <Text style={styles.menuIcon}>{"\uD83C\uDF19"}</Text>
              <Text style={[T.body, { color: CLight.gray900 }]}>{"\uB2E4\uD06C\uBAA8\uB4DC"}</Text>
            </View>
            <Switch
              value={darkMode}
              onValueChange={handleSetDarkMode}
              trackColor={{ false: CLight.gray200, true: `${CLight.pink}60` }}
              thumbColor={darkMode ? CLight.pink : CLight.gray400}
            />
          </View>
        </View>

        {/* ─── App Version ─── */}
        <Text style={styles.versionText}>ArtLink v{APP_VERSION}</Text>
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

  // Version
  versionText: {
    textAlign: "center",
    marginTop: 28,
    marginBottom: 12,
    ...T.micro,
    color: CLight.gray400,
  },
});
