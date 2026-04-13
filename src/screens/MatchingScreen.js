import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_COLORS, FIELD_EMOJIS } from "../constants/theme";
import { FIELDS } from "../utils/helpers";
import { computeMatchPercent } from "../services/analyticsService";
import { fetchMatchingFeed } from "../services/matchingService";
import TopBar from "../components/TopBar";
import EmptyState from "../components/EmptyState";

// Data values used for filtering (must match item.tab from server/store)
const CATEGORY_TABS_DATA = ["프로젝트", "오디션", "콜라보"];
// i18n key suffixes mapped to each data value
const CATEGORY_TAB_I18N = ["tab_project", "tab_audition", "tab_collab"];
const SOURCE_TAB_KEYS = [
  { key: "ai", labelKey: "source_crawled", emoji: "🤖" },
  { key: "user", labelKey: "source_user", emoji: "👤" },
];

// FIELD_TABS labels are resolved at render time via t() for the "all" entry;
// field-specific labels use labelKey and are resolved inside the component.
const FIELD_TAB_FIELD_KEYS = FIELDS.map((f) => ({
  key: f,
  labelKey: "fields." + f,
  emoji: FIELD_EMOJIS[f] || "📝",
}));

export default function MatchingScreen({ navigation }) {
  const { t } = useTranslation();
  const {
    artistProfile, userProfile, savedNotes, portfolioItems,
    matchingPosts, handleDeleteMatchingPost,
    blockedUsers, handleBlockUser, handleReportContent,
  } = useApp();

  const [sourceTab, setSourceTab] = useState("ai");
  const [activeTab, setActiveTab] = useState("프로젝트");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedField, setSelectedField] = useState("all");

  // AI feed state
  const [aiPostings, setAiPostings] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Load AI feed on mount
  useEffect(() => {
    let mounted = true;
    setAiLoading(true);
    fetchMatchingFeed(userProfile.fields || []).then((data) => {
      if (mounted) {
        setAiPostings(data);
        setAiLoading(false);
      }
    });
    return () => { mounted = false; };
  }, [userProfile.fields]);

  const dataSource = sourceTab === "ai" ? aiPostings : matchingPosts;

  const filtered = useMemo(() => {
    let items = dataSource
      .filter((item) => item.tab === activeTab)
      .filter((item) => !blockedUsers.includes(item.authorName || `user_${item.id}`))
      .map((item) => ({
        ...item,
        matchPercent: computeMatchPercent(item, artistProfile, userProfile, portfolioItems),
      }));

    if (selectedField !== "all") {
      items = items.filter((item) => item.field === selectedField);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter((item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    items.sort((a, b) => b.matchPercent - a.matchPercent);
    return items;
  }, [dataSource, activeTab, selectedField, searchQuery, artistProfile, userProfile, portfolioItems, blockedUsers]);

  const getMatchColor = (percent) => {
    if (percent >= 70) return CLight.green;
    if (percent >= 40) return CLight.orange;
    return CLight.gray400;
  };

  const FIELD_TABS = [
    { key: "all", label: t("common.all"), emoji: "📋" },
    ...FIELD_TAB_FIELD_KEYS.map((ft) => ({ ...ft, label: t(ft.labelKey) })),
  ];

  const getDaysLeft = (deadline) => {
    if (!deadline) return null;
    const diff = Math.ceil((new Date(deadline) - new Date()) / 86400000);
    if (diff <= 0) return t("matching.deadline_expired");
    return `D-${diff}`;
  };

  const handleDetailPress = useCallback((item) => {
    if (item.source === "ai" && item.externalUrl) {
      Linking.openURL(item.externalUrl).catch(() => {
        Alert.alert(t("matching.link_error"), t("matching.link_error_msg"));
      });
    } else {
      navigation.navigate("MatchingPostDetail", { post: item });
    }
  }, [navigation, t]);

  const handleReportPost = useCallback((item) => {
    Alert.alert(t("common.report_title"), t("common.report_confirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.inappropriate_content"),
        onPress: () => handleReportContent({ contentId: item.id, type: "matching_post", reason: "inappropriate_content", title: item.title }),
      },
      {
        text: t("common.spam_scam"),
        onPress: () => handleReportContent({ contentId: item.id, type: "matching_post", reason: "spam", title: item.title }),
      },
      {
        text: t("common.harassment"),
        onPress: () => handleReportContent({ contentId: item.id, type: "matching_post", reason: "harassment", title: item.title }),
      },
    ]);
  }, [handleReportContent, t]);

  const handleBlockPost = useCallback((item) => {
    const authorName = item.authorName || `user_${item.id}`;
    Alert.alert(t("common.block_title"), t("common.block_confirm", { name: authorName }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.block"),
        style: "destructive",
        onPress: () => handleBlockUser(authorName),
      },
    ]);
  }, [handleBlockUser, t]);

  const handlePostAction = useCallback((item) => {
    Alert.alert(t("common.post_management"), null, [
      { text: t("common.report_title"), onPress: () => handleReportPost(item) },
      { text: t("common.block_author"), style: "destructive", onPress: () => handleBlockPost(item) },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [handleReportPost, handleBlockPost, t]);

  const handleLongPressUserPost = useCallback((item) => {
    Alert.alert(t("matching.manage_post"), item.title, [
      {
        text: t("common.edit"),
        onPress: () => navigation.navigate("MatchingPostCreate", { post: item }),
      },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          Alert.alert(t("matching.delete_confirm"), t("matching.delete_confirm_msg"), [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("common.delete"), style: "destructive", onPress: () => handleDeleteMatchingPost(item.id) },
          ]);
        },
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [navigation, handleDeleteMatchingPost, t]);

  const renderCard = (item) => {
    const isAi = item.source === "ai";
    const daysLeft = getDaysLeft(item.deadline);

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => handleDetailPress(item)}
        onLongPress={!isAi ? () => handleLongPressUserPost(item) : undefined}
      >
        {/* Source badge + report */}
        <View style={styles.sourceBadgeRow}>
          <View style={[styles.sourceBadge, isAi ? styles.sourceBadgeAi : styles.sourceBadgeUser]}>
            <Text style={[T.tiny, { color: isAi ? CLight.blue : CLight.purple, fontWeight: "600" }]}>
              {isAi ? t("matching.badge_ai") : t("matching.badge_user")}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => handlePostAction(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.reportBtnIcon}>⚠</Text>
            <Text style={styles.reportBtnText}>{t("common.report")}</Text>
          </TouchableOpacity>
        </View>

        {/* Header badges */}
        <View style={styles.cardHeader}>
          <View style={[styles.fieldBadge, { backgroundColor: (FIELD_COLORS[item.field] || CLight.pink) + "18" }]}>
            <Text style={[T.micro, { color: FIELD_COLORS[item.field] || CLight.pink, fontWeight: "600" }]}>
              {FIELD_EMOJIS[item.field] || ""} {t("fields." + item.field)}
            </Text>
          </View>
          <View style={[styles.matchBadge, { backgroundColor: getMatchColor(item.matchPercent) + "18" }]}>
            <Text style={[T.microBold, { color: getMatchColor(item.matchPercent) }]}>
              {t("matching.match_percent", { percent: item.matchPercent })}
            </Text>
          </View>
        </View>

        <Text style={[T.title, { color: CLight.gray900, marginTop: 8 }]}>{item.title}</Text>
        <Text style={[T.small, { color: CLight.gray500, marginTop: 6 }]} numberOfLines={2}>
          {item.description}
        </Text>

        {/* Tags */}
        {item.tags?.length > 0 && (
          <View style={styles.tagsRow}>
            {item.tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={[T.tiny, { color: CLight.gray500 }]}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Match bar */}
        <View style={styles.matchBarContainer}>
          <View style={styles.matchBarBg}>
            <View
              style={[styles.matchBarFill, { width: `${item.matchPercent}%`, backgroundColor: getMatchColor(item.matchPercent) }]}
            />
          </View>
        </View>

        {/* Footer */}
        <View style={styles.cardFooter}>
          <Text style={[T.micro, { color: CLight.gray400 }]}>
            {item.deadline ? t("matching.deadline_prefix", { date: item.deadline }) : t("matching.deadline_none")}
          </Text>
          {daysLeft && (
            <View style={[styles.dDayBadge, daysLeft === t("matching.deadline_expired") ? { backgroundColor: CLight.red + "18" } : {}]}>
              <Text style={[T.microBold, { color: daysLeft === t("matching.deadline_expired") ? CLight.red : CLight.pink }]}>
                {daysLeft}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.applyBtn} onPress={() => handleDetailPress(item)}>
          <Text style={[T.captionBold, { color: CLight.white }]}>
            {isAi && item.externalUrl ? t("matching.view_original") : t("matching.view_detail")}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title={t("matching.title")}
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>{t("matching.back")}</Text>
          </TouchableOpacity>
        }
      />

      {/* Source Tabs */}
      <View style={styles.sourceTabRow}>
        {SOURCE_TAB_KEYS.map((st) => {
          const isActive = sourceTab === st.key;
          return (
            <TouchableOpacity
              key={st.key}
              style={[styles.sourceTab, isActive && styles.sourceTabActive]}
              onPress={() => setSourceTab(st.key)}
            >
              <Text style={[styles.sourceTabText, isActive && styles.sourceTabTextActive]}>
                {st.emoji} {t(`matching.${st.labelKey}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Category Tabs */}
      <View style={styles.tabRow}>
        {CATEGORY_TABS_DATA.map((dataValue, idx) => {
          const tabLabel = t(`matching.${CATEGORY_TAB_I18N[idx]}`);
          return (
            <TouchableOpacity
              key={dataValue}
              style={[styles.tab, activeTab === dataValue && styles.tabActive]}
              onPress={() => setActiveTab(dataValue)}
            >
              <Text style={[styles.tabText, activeTab === dataValue && styles.tabTextActive]}>{tabLabel}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder={t("matching.search_placeholder")}
            placeholderTextColor={CLight.gray400}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Field Filter Tabs */}
      <View style={styles.filterSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {FIELD_TABS.map((tab) => {
            const isActive = selectedField === tab.key;
            const color = tab.key === "all" ? CLight.pink : FIELD_COLORS[tab.key] || CLight.gray500;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.filterTab,
                  {
                    backgroundColor: isActive ? `${color}15` : CLight.white,
                    borderColor: isActive ? color : CLight.gray200,
                    borderWidth: isActive ? 1.5 : 1,
                  },
                ]}
                onPress={() => setSelectedField(tab.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.filterEmoji}>{tab.emoji}</Text>
                <Text
                  style={[
                    styles.filterLabel,
                    { color: isActive ? color : CLight.gray500, fontWeight: isActive ? "600" : "400" },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Summary */}
        <View style={styles.summaryCard}>
          <Text style={[T.captionBold, { color: CLight.gray700 }]}>{t("matching.my_profile")}</Text>
          <Text style={[T.small, { color: CLight.gray500, marginTop: 4 }]}>
            {artistProfile.displayName} | {artistProfile.displayFields || t("matching.not_set")} | {t("matching.overall_score")}{" "}
            {artistProfile.overallScore}점
          </Text>
          <View style={styles.profileBadges}>
            <View style={styles.profileBadge}>
              <Text style={[T.microBold, { color: CLight.pink }]}>📸 {portfolioItems.length}</Text>
              <Text style={[T.tiny, { color: CLight.gray400 }]}>{t("matching.portfolio_label")}</Text>
            </View>
            <View style={styles.profileBadge}>
              <Text style={[T.microBold, { color: CLight.purple }]}>📝 {savedNotes.length}</Text>
              <Text style={[T.tiny, { color: CLight.gray400 }]}>{t("matching.notes_label")}</Text>
            </View>
          </View>
        </View>

        {/* Result Count */}
        <Text style={[T.micro, { color: CLight.gray400, marginBottom: 8 }]}>
          {t("matching.result_count", { count: filtered.length })}
        </Text>

        {/* Loading state for AI tab */}
        {sourceTab === "ai" && aiLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={CLight.pink} />
            <Text style={[T.caption, { color: CLight.gray400, marginTop: 12 }]}>
              {t("matching.loading")}
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          sourceTab === "user" ? (
            <EmptyState
              icon="📋"
              title={t("matching.empty_user_title")}
              message={t("matching.empty_user_msg")}
            />
          ) : (
            <EmptyState
              icon="🔍"
              title={t("matching.empty_title")}
              message={t("matching.empty_msg")}
            />
          )
        ) : (
          filtered.map(renderCard)
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* FAB for user tab */}
      {sourceTab === "user" && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate("MatchingPostCreate")}
          activeOpacity={0.85}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CLight.bg },
  backBtn: { ...T.caption, color: CLight.pink },

  // Source tabs (underline style)
  sourceTabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: CLight.gray200,
  },
  sourceTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  sourceTabActive: {
    borderBottomColor: CLight.pink,
  },
  sourceTabText: {
    ...T.captionBold,
    color: CLight.gray400,
  },
  sourceTabTextActive: {
    color: CLight.pink,
  },

  // Category tabs
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: CLight.white,
    alignItems: "center",
    borderWidth: 1,
    borderColor: CLight.gray200,
  },
  tabActive: {
    backgroundColor: CLight.pink,
    borderColor: CLight.pink,
  },
  tabText: { ...T.captionBold, color: CLight.gray500 },
  tabTextActive: { color: CLight.white },

  // Search
  searchContainer: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CLight.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CLight.inputBorder,
    paddingHorizontal: 12,
    height: 42,
  },
  searchIcon: { fontSize: 15, marginRight: 8 },
  searchInput: { flex: 1, ...T.body, color: CLight.gray900, paddingVertical: 0 },

  // Field filter
  filterSection: { paddingBottom: 4 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterTab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 5,
  },
  filterEmoji: { fontSize: 14 },
  filterLabel: { fontSize: 13 },

  // Scroll content
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

  // Profile summary
  summaryCard: {
    backgroundColor: CLight.pinkSoft,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  profileBadges: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8,
  },
  profileBadge: { alignItems: "center" },

  // Source badge
  sourceBadgeRow: { marginBottom: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CLight.gray100,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  reportBtnIcon: { fontSize: 12 },
  reportBtnText: { fontSize: 12, color: CLight.gray500, fontWeight: "600" },
  sourceBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sourceBadgeAi: { backgroundColor: CLight.blue + "15" },
  sourceBadgeUser: { backgroundColor: CLight.purple + "15" },

  // Cards
  card: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fieldBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  matchBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  tagChip: {
    backgroundColor: CLight.gray100,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  matchBarContainer: { marginTop: 12 },
  matchBarBg: {
    height: 6,
    backgroundColor: CLight.gray100,
    borderRadius: 3,
    overflow: "hidden",
  },
  matchBarFill: {
    height: 6,
    borderRadius: 3,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  dDayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: CLight.pinkSoft,
  },
  applyBtn: {
    marginTop: 12,
    backgroundColor: CLight.pink,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },

  // Loading
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },

  // FAB
  fab: {
    position: "absolute",
    right: 20,
    bottom: 30,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CLight.pink,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  fabText: {
    fontSize: 28,
    color: CLight.white,
    fontWeight: "300",
    marginTop: -2,
  },
});
