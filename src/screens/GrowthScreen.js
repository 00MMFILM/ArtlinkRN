import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import {
  CLight,
  T,
  FIELD_COLORS,
  FIELD_EMOJIS,
} from "../constants/theme";

// ─── Score Ring ──────────────────────────────────────────────
function ScoreRing({ score }) {
  const { t } = useTranslation();
  const color =
    score >= 70 ? CLight.green : score >= 40 ? CLight.orange : CLight.pink;
  return (
    <View style={styles.ringOuter}>
      <View style={[styles.ringBorder, { borderColor: `${color}30` }]}>
        <View style={[styles.ringInner, { borderColor: color }]}>
          <Text style={[T.hero, { color }]}>{score}</Text>
          <Text style={[T.micro, { color: CLight.gray400, marginTop: -2 }]}>
            {t("growth.overall_score")}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Progress Bar ────────────────────────────────────────────
function ProgressBar({ label, value, color = CLight.pink }) {
  return (
    <View style={styles.progressRow}>
      <Text style={[T.small, { color: CLight.gray700, width: 64 }]}>
        {label}
      </Text>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.min(value, 100)}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={[T.smallBold, { color: CLight.gray900, width: 32, textAlign: "right" }]}>
        {value}
      </Text>
    </View>
  );
}

// ─── Monthly Bar Chart ───────────────────────────────────────
function MonthlyChart({ monthlyActivity }) {
  const { t } = useTranslation();
  const entries = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      const label = t("growth.month_suffix", { month: d.getMonth() + 1 });
      months.push({ key, label, count: monthlyActivity[key] || 0 });
    }
    return months;
  }, [monthlyActivity, t]);

  const maxCount = Math.max(...entries.map((e) => e.count), 1);

  return (
    <View style={styles.chartContainer}>
      {entries.map((entry) => {
        const barHeight = Math.max(4, (entry.count / maxCount) * 100);
        return (
          <View key={entry.key} style={styles.chartCol}>
            <Text style={[T.microBold, { color: CLight.pink, marginBottom: 4 }]}>
              {entry.count > 0 ? entry.count : ""}
            </Text>
            <View style={styles.chartBarBg}>
              <View
                style={[
                  styles.chartBar,
                  { height: barHeight, backgroundColor: CLight.pink },
                ]}
              />
            </View>
            <Text style={[T.tiny, { color: CLight.gray400, marginTop: 6 }]}>
              {entry.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Field Distribution ──────────────────────────────────────
function FieldBars({ fieldCounts }) {
  const { t } = useTranslation();
  const entries = useMemo(
    () =>
      Object.entries(fieldCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6),
    [fieldCounts]
  );
  const maxCount = entries.length > 0 ? entries[0][1] : 1;

  if (entries.length === 0) {
    return (
      <Text style={[T.small, { color: CLight.gray400, textAlign: "center", paddingVertical: 16 }]}>
        {t("growth.empty_fields")}
      </Text>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {entries.map(([field, count]) => {
        const color = FIELD_COLORS[field] || CLight.gray400;
        const emoji = FIELD_EMOJIS[field] || "";
        const label = t("fields." + field);
        const pct = Math.round((count / maxCount) * 100);
        return (
          <View key={field} style={styles.fieldRow}>
            <Text style={{ fontSize: 16, width: 24 }}>{emoji}</Text>
            <Text style={[T.small, { color: CLight.gray700, width: 40 }]}>
              {label}
            </Text>
            <View style={styles.fieldTrack}>
              <View
                style={[
                  styles.fieldFill,
                  { width: `${pct}%`, backgroundColor: color },
                ]}
              />
            </View>
            <Text style={[T.smallBold, { color: CLight.gray900, width: 24, textAlign: "right" }]}>
              {count}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Tag Pill ────────────────────────────────────────────────
function TagPill({ tag, count }) {
  return (
    <View style={styles.tagPill}>
      <Text style={[T.small, { color: CLight.pink }]}>{tag}</Text>
      <View style={styles.tagCount}>
        <Text style={[T.tinyBold, { color: "#FFFFFF" }]}>{count}</Text>
      </View>
    </View>
  );
}

// ─── Info Card ───────────────────────────────────────────────
function InfoCard({ icon, label, value, sub }) {
  return (
    <View style={styles.infoCard}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <Text style={[T.captionBold, { color: CLight.gray700, marginTop: 6 }]}>
        {label}
      </Text>
      <Text style={[T.h3, { color: CLight.gray900, marginTop: 2 }]}>
        {value}
      </Text>
      {sub ? (
        <Text style={[T.micro, { color: CLight.gray400, marginTop: 2 }]}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

// ─── Growth Screen ───────────────────────────────────────────
export default function GrowthScreen({ navigation }) {
  const { t } = useTranslation();
  const { artistProfile, savedNotes } = useApp();

  const {
    overallScore,
    noteScore,
    aiScore,
    diversityScore,
    depthScore,
    consistencyScore,
    monthlyActivity,
    fieldCounts,
    topTags,
    streak,
    weekNotes,
    weekGrowth,
    displayName,
  } = artistProfile;

  const growthLabel =
    weekGrowth > 0
      ? `+${weekGrowth}%`
      : weekGrowth < 0
        ? `${weekGrowth}%`
        : "--";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation?.goBack?.()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.backBtn}
        >
          <Text style={[T.title, { color: CLight.pink }]}>{"<"}</Text>
        </TouchableOpacity>
        <Text style={[T.title, { color: CLight.gray900 }]}>{t("growth.title")}</Text>
        <View style={{ minWidth: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Overall Score ── */}
        <View style={styles.section}>
          <Text style={[T.small, { color: CLight.gray400, textAlign: "center" }]}>
            {t("growth.personal_growth", { name: displayName })}
          </Text>
          <ScoreRing score={overallScore} />
        </View>

        {/* ── Score Breakdown ── */}
        <View style={styles.card}>
          <Text style={[T.title, { color: CLight.gray900, marginBottom: 16 }]}>
            {t("growth.score_analysis")}
          </Text>
          <ProgressBar label={t("growth.skill_volume")} value={noteScore} color={CLight.pink} />
          <ProgressBar label={t("growth.skill_ai")} value={aiScore} color={CLight.purple} />
          <ProgressBar label={t("growth.skill_diversity")} value={diversityScore} color={CLight.teal} />
          <ProgressBar label={t("growth.skill_depth")} value={depthScore} color={CLight.orange} />
          <ProgressBar label={t("growth.skill_consistency")} value={consistencyScore} color={CLight.green} />
        </View>

        {/* ── Streak & Weekly ── */}
        <View style={styles.infoRow}>
          <InfoCard
            icon={"\uD83D\uDD25"}
            label={t("growth.streak_label")}
            value={t("growth.streak_value", { count: streak })}
            sub={t("growth.streak_sub")}
          />
          <InfoCard
            icon={"\uD83D\uDCC8"}
            label={t("growth.this_week")}
            value={t("growth.this_week_value", { count: weekNotes.length })}
            sub={t("growth.week_compare", { label: growthLabel })}
          />
        </View>

        {/* ── Monthly Activity ── */}
        <View style={styles.card}>
          <Text style={[T.title, { color: CLight.gray900, marginBottom: 16 }]}>
            {t("growth.monthly_activity")}
          </Text>
          <MonthlyChart monthlyActivity={monthlyActivity} />
        </View>

        {/* ── Field Distribution ── */}
        <View style={styles.card}>
          <Text style={[T.title, { color: CLight.gray900, marginBottom: 16 }]}>
            {t("growth.field_distribution")}
          </Text>
          <FieldBars fieldCounts={fieldCounts} />
        </View>

        {/* ── Top Tags ── */}
        <View style={styles.card}>
          <Text style={[T.title, { color: CLight.gray900, marginBottom: 14 }]}>
            {t("growth.top_tags")}
          </Text>
          {topTags.length > 0 ? (
            <View style={styles.tagGrid}>
              {topTags.map(([tag, count]) => (
                <TagPill key={tag} tag={tag} count={count} />
              ))}
            </View>
          ) : (
            <Text
              style={[T.small, { color: CLight.gray400, textAlign: "center", paddingVertical: 12 }]}
            >
              {t("growth.empty_tags")}
            </Text>
          )}
        </View>

        {/* ── Portfolio Button ── */}
        <TouchableOpacity
          style={styles.portfolioBtn}
          activeOpacity={0.85}
          onPress={() => navigation?.navigate?.("Portfolio")}
        >
          <Text style={[T.bodyBold, { color: "#FFFFFF" }]}>
            {t("growth.view_portfolio")}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: CLight.bg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: CLight.topBarBg,
  },
  backBtn: {
    minWidth: 60,
    paddingVertical: 4,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },

  // Section / Card
  section: {
    alignItems: "center",
    paddingVertical: 20,
  },
  card: {
    backgroundColor: CLight.cardBg,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: CLight.cardBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  // Score Ring
  ringOuter: {
    marginTop: 16,
    alignItems: "center",
  },
  ringBorder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ringInner: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CLight.white,
  },

  // Progress Bar
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: CLight.gray100,
    overflow: "hidden",
  },
  progressFill: {
    height: 8,
    borderRadius: 4,
  },

  // Info Cards
  infoRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  infoCard: {
    flex: 1,
    backgroundColor: CLight.cardBg,
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CLight.cardBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  // Monthly Chart
  chartContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 140,
    paddingTop: 10,
  },
  chartCol: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  chartBarBg: {
    width: 28,
    height: 100,
    borderRadius: 6,
    backgroundColor: CLight.gray100,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  chartBar: {
    width: 28,
    borderRadius: 6,
  },

  // Field Distribution
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fieldTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: CLight.gray100,
    overflow: "hidden",
  },
  fieldFill: {
    height: 10,
    borderRadius: 5,
  },

  // Tags
  tagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: CLight.pinkSoft,
    backgroundColor: CLight.pinkSoft,
  },
  tagCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: CLight.pink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },

  // Portfolio Button
  portfolioBtn: {
    backgroundColor: CLight.pink,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
});
