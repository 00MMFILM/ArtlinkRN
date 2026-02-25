import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Dimensions,
} from "react-native";
import { useApp } from "../context/AppContext";
import { CLight, CDark, T, FIELD_LABELS, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";
import { timeAgo, truncate } from "../utils/helpers";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function HomeScreen({ navigation }) {
  const {
    savedNotes,
    userProfile,
    artistProfile,
    showBetaGuide,
    handleDismissGuide,
    darkMode,
  } = useApp();

  const C = darkMode ? CDark : CLight;

  // ---- Computed data ----
  const recentNotes = useMemo(() => savedNotes.slice(0, 5), [savedNotes]);

  const weeklySummary = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const thisWeekNotes = savedNotes.filter(
      (n) => new Date(n.createdAt) >= weekStart
    );
    const prevWeekNotes = savedNotes.filter(
      (n) => new Date(n.createdAt) >= prevWeekStart && new Date(n.createdAt) < weekStart
    );

    const thisCount = thisWeekNotes.length;
    const prevCount = prevWeekNotes.length;
    const weekGrowth =
      prevCount > 0 ? Math.round(((thisCount - prevCount) / prevCount) * 100) : thisCount > 0 ? 100 : 0;

    // Calculate streak (consecutive days with notes, counting back from today)
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 365; i++) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dayStr = day.toISOString().split("T")[0];
      const hasNote = savedNotes.some((n) => n.createdAt && n.createdAt.startsWith(dayStr));
      if (hasNote) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return { count: thisCount, streak, weekGrowth };
  }, [savedNotes]);

  // ---- Greeting based on time ----
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 6) return "\uC88B\uC740 \uC0C8\uBCBD\uC774\uC5D0\uC694";
    if (hour < 12) return "\uC88B\uC740 \uC544\uCE68\uC774\uC5D0\uC694";
    if (hour < 18) return "\uC88B\uC740 \uC624\uD6C4\uC608\uC694";
    return "\uC88B\uC740 \uC800\uB141\uC774\uC5D0\uC694";
  }, []);

  const userName = userProfile?.name || "\uC544\uD2F0\uC2A4\uD2B8";

  // ---- Quick actions ----
  const quickActions = [
    {
      key: "note",
      emoji: "\u270F\uFE0F",
      label: "\uC0C8 \uB178\uD2B8 \uC791\uC131",
      color: C.pink,
      route: "NoteCreate",
    },
    {
      key: "growth",
      emoji: "\uD83D\uDCC8",
      label: "\uC131\uC7A5 \uB9AC\uD3EC\uD2B8",
      color: C.purple,
      route: "Growth",
    },
    {
      key: "matching",
      emoji: "\uD83E\uDD1D",
      label: "\uB9E4\uCE6D",
      color: C.teal,
      route: "Matching",
    },
  ];

  // ===== RENDER =====
  return (
    <View style={[styles.container, { backgroundColor: C.bg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Top section: greeting + bell ---- */}
        <View style={styles.topSection}>
          <View style={styles.greetingContainer}>
            <Text style={[T.h3, { color: C.gray900 }]}>
              {greeting},{" "}
              <Text style={{ color: C.pink }}>{userName}</Text>
              {"\uB2D8"}
            </Text>
            <Text style={[T.caption, { color: C.gray500, marginTop: 2 }]}>
              {"\uC624\uB298\uB3C4 \uC608\uC220\uC744 \uAE30\uB85D\uD574\uBCFC\uAE4C\uC694?"}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.bellButton, { backgroundColor: C.surface }]}
            onPress={() => navigation.navigate("Notifications")}
            activeOpacity={0.7}
          >
            <Text style={styles.bellIcon}>{"\uD83D\uDD14"}</Text>
          </TouchableOpacity>
        </View>

        {/* ---- Beta guide banner ---- */}
        {showBetaGuide && (
          <View style={[styles.betaBanner, { backgroundColor: C.pinkSoft }]}>
            <View style={styles.betaBannerContent}>
              <Text style={styles.betaEmoji}>{"\uD83D\uDE80"}</Text>
              <View style={styles.betaTextContainer}>
                <Text style={[T.captionBold, { color: C.pink }]}>
                  {"\uBCA0\uD0C0 \uBC84\uC804\uC744 \uC0AC\uC6A9 \uC911\uC774\uC5D0\uC694!"}
                </Text>
                <Text style={[T.small, { color: C.gray500, marginTop: 2 }]}>
                  {"\uD53C\uB4DC\uBC31\uC744 \uBCF4\uB0B4\uC8FC\uC2DC\uBA74 \uB354 \uC88B\uC740 \uC571\uC744 \uB9CC\uB4DC\uB294 \uB370 \uD070 \uB3C4\uC6C0\uC774 \uB429\uB2C8\uB2E4."}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.betaDismiss}
                onPress={handleDismissGuide}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[T.caption, { color: C.gray400 }]}>{"\u2715"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ---- Weekly summary card ---- */}
        <View style={[styles.summaryCard, { backgroundColor: C.surface }]}>
          <Text style={[T.captionBold, { color: C.gray500, marginBottom: 12 }]}>
            {"\uC774\uBC88 \uC8FC \uC694\uC57D"}
          </Text>
          <View style={styles.summaryRow}>
            {/* Practice count */}
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: C.pink }]}>
                {weeklySummary.count}
              </Text>
              <Text style={[T.micro, { color: C.gray500 }]}>{"\uC774\uBC88 \uC8FC \uC5F0\uC2B5"}</Text>
            </View>

            <View style={[styles.summaryDivider, { backgroundColor: C.gray200 }]} />

            {/* Streak */}
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: C.orange }]}>
                {weeklySummary.streak}
                <Text style={[T.small, { color: C.gray500 }]}>{"\uC77C"}</Text>
              </Text>
              <Text style={[T.micro, { color: C.gray500 }]}>{"\uC5F0\uC18D \uAE30\uB85D"}</Text>
            </View>

            <View style={[styles.summaryDivider, { backgroundColor: C.gray200 }]} />

            {/* Growth */}
            <View style={styles.summaryItem}>
              <Text
                style={[
                  styles.summaryValue,
                  { color: weeklySummary.weekGrowth >= 0 ? C.green : C.red },
                ]}
              >
                {weeklySummary.weekGrowth >= 0 ? "+" : ""}
                {weeklySummary.weekGrowth}%
              </Text>
              <Text style={[T.micro, { color: C.gray500 }]}>{"\uC8FC\uAC04 \uC131\uC7A5"}</Text>
            </View>
          </View>
        </View>

        {/* ---- Quick actions ---- */}
        <View style={styles.quickActionsContainer}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={[styles.quickActionCard, { backgroundColor: C.surface }]}
              onPress={() => navigation.navigate(action.route)}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: `${action.color}15` }]}>
                <Text style={styles.quickActionEmoji}>{action.emoji}</Text>
              </View>
              <Text style={[T.smallBold, { color: C.gray900, marginTop: 8 }]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ---- Recent notes ---- */}
        <View style={styles.sectionHeader}>
          <Text style={[T.title, { color: C.gray900 }]}>{"\uCD5C\uADFC \uB178\uD2B8"}</Text>
          {savedNotes.length > 5 && (
            <TouchableOpacity onPress={() => navigation.navigate("Notes")}>
              <Text style={[T.small, { color: C.pink }]}>{"\uBAA8\uB450 \uBCF4\uAE30"}</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentNotes.length > 0 ? (
          <View style={styles.notesContainer}>
            {recentNotes.map((note) => {
              const fieldColor = note.field ? FIELD_COLORS[note.field] || C.gray500 : C.gray500;
              const fieldLabel = note.field ? FIELD_LABELS[note.field] : null;
              const fieldEmoji = note.field ? FIELD_EMOJIS[note.field] : null;

              return (
                <TouchableOpacity
                  key={note.id}
                  style={[styles.noteCard, { backgroundColor: C.surface }]}
                  onPress={() => navigation.navigate("NoteDetail", { noteId: note.id })}
                  activeOpacity={0.7}
                >
                  <View style={styles.noteCardHeader}>
                    {fieldLabel && (
                      <View style={[styles.noteFieldBadge, { backgroundColor: `${fieldColor}15` }]}>
                        <Text style={styles.noteFieldEmoji}>{fieldEmoji}</Text>
                        <Text style={[T.micro, { color: fieldColor, fontWeight: "600" }]}>
                          {fieldLabel}
                        </Text>
                      </View>
                    )}
                    {note.starred && <Text style={styles.starIcon}>{"\u2B50"}</Text>}
                    <Text style={[T.micro, { color: C.gray400, marginLeft: "auto" }]}>
                      {timeAgo(note.createdAt)}
                    </Text>
                  </View>

                  <Text style={[T.bodyBold, { color: C.gray900, marginTop: 8 }]} numberOfLines={1}>
                    {note.title || "\uC81C\uBAA9 \uC5C6\uC74C"}
                  </Text>

                  {note.content && (
                    <Text style={[T.small, { color: C.gray500, marginTop: 4 }]} numberOfLines={2}>
                      {truncate(note.content, 120)}
                    </Text>
                  )}

                  {note.keywords && note.keywords.length > 0 && (
                    <View style={styles.noteKeywords}>
                      {note.keywords.slice(0, 3).map((kw, idx) => (
                        <View key={idx} style={[styles.keywordTag, { backgroundColor: C.gray100 }]}>
                          <Text style={[T.tiny, { color: C.gray500 }]}>{kw}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          /* ---- Empty state ---- */
          <View style={[styles.emptyCard, { backgroundColor: C.surface }]}>
            <Text style={styles.emptyEmoji}>{"\uD83C\uDFB5"}</Text>
            <Text style={[T.title, { color: C.gray900, marginTop: 12 }]}>
              {"\uCCAB \uBC88\uC9F8 \uB178\uD2B8\uB97C \uC791\uC131\uD574\uBCF4\uC138\uC694!"}
            </Text>
            <Text style={[T.caption, { color: C.gray500, marginTop: 6, textAlign: "center" }]}>
              {"\uC5F0\uC2B5, \uACF5\uC5F0, \uC601\uAC10 \uB4F1\n\uC608\uC220 \uD65C\uB3D9\uC744 \uAE30\uB85D\uD558\uBA74 AI\uAC00 \uBD84\uC11D\uD574\uB4DC\uB824\uC694."}
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate("NoteCreate")}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyButtonText}>{"\uB178\uD2B8 \uC791\uC131\uD558\uAE30"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === "ios" ? 60 : 24,
    paddingHorizontal: 20,
  },

  // ---- Top section ----
  topSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  greetingContainer: {
    flex: 1,
    marginRight: 12,
  },
  bellButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  bellIcon: {
    fontSize: 20,
  },

  // ---- Beta banner ----
  betaBanner: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  betaBannerContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  betaEmoji: {
    fontSize: 24,
    marginTop: 2,
  },
  betaTextContainer: {
    flex: 1,
  },
  betaDismiss: {
    padding: 4,
  },

  // ---- Summary card ----
  summaryCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  summaryValue: {
    ...T.h2,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    marginHorizontal: 8,
  },

  // ---- Quick actions ----
  quickActionsContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  quickActionCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  quickActionEmoji: {
    fontSize: 20,
  },

  // ---- Section header ----
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  // ---- Note cards ----
  notesContainer: {
    gap: 12,
  },
  noteCard: {
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  noteCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  noteFieldBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  noteFieldEmoji: {
    fontSize: 12,
  },
  starIcon: {
    fontSize: 14,
  },
  noteKeywords: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
  },
  keywordTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  // ---- Empty state ----
  emptyCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyButton: {
    marginTop: 20,
    backgroundColor: CLight.pink,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyButtonText: {
    ...T.bodyBold,
    color: "#FFFFFF",
  },
});
