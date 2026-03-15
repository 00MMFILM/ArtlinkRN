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
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_LABELS, FIELD_COLORS, FIELD_EMOJIS } from "../constants/theme";
import { FIELDS } from "../utils/helpers";
import { computeMatchPercent } from "../services/analyticsService";
import { fetchMatchingFeed } from "../services/matchingService";
import TopBar from "../components/TopBar";
import EmptyState from "../components/EmptyState";

const CATEGORY_TABS = ["프로젝트", "오디션", "콜라보"];
const SOURCE_TABS = [
  { key: "ai", label: "공고", emoji: "🤖" },
  { key: "user", label: "직접 등록", emoji: "👤" },
];

const FIELD_TABS = [
  { key: "all", label: "전체", emoji: "📋" },
  ...FIELDS.map((f) => ({ key: f, label: FIELD_LABELS[f] || f, emoji: FIELD_EMOJIS[f] || "📝" })),
];

export default function MatchingScreen({ navigation }) {
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

  const getDaysLeft = (deadline) => {
    if (!deadline) return null;
    const diff = Math.ceil((new Date(deadline) - new Date()) / 86400000);
    if (diff <= 0) return "마감";
    return `D-${diff}`;
  };

  const handleDetailPress = useCallback((item) => {
    if (item.source === "ai" && item.externalUrl) {
      Linking.openURL(item.externalUrl).catch(() => {
        Alert.alert("링크 열기 실패", "외부 브라우저에서 열 수 없습니다.");
      });
    } else {
      navigation.navigate("MatchingPostDetail", { post: item });
    }
  }, [navigation]);

  const handleReportPost = useCallback((item) => {
    Alert.alert("신고하기", "이 게시물을 신고하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "부적절한 콘텐츠",
        onPress: () => handleReportContent({ contentId: item.id, type: "matching_post", reason: "inappropriate_content", title: item.title }),
      },
      {
        text: "스팸/사기",
        onPress: () => handleReportContent({ contentId: item.id, type: "matching_post", reason: "spam", title: item.title }),
      },
      {
        text: "괴롭힘/혐오",
        onPress: () => handleReportContent({ contentId: item.id, type: "matching_post", reason: "harassment", title: item.title }),
      },
    ]);
  }, [handleReportContent]);

  const handleBlockPost = useCallback((item) => {
    const authorName = item.authorName || `user_${item.id}`;
    Alert.alert("차단하기", `이 작성자를 차단하시겠습니까?\n차단하면 이 사용자의 콘텐츠가 피드에서 즉시 제거됩니다.`, [
      { text: "취소", style: "cancel" },
      {
        text: "차단",
        style: "destructive",
        onPress: () => handleBlockUser(authorName),
      },
    ]);
  }, [handleBlockUser]);

  const handlePostAction = useCallback((item) => {
    Alert.alert("게시물 관리", null, [
      { text: "신고하기", onPress: () => handleReportPost(item) },
      { text: "작성자 차단", style: "destructive", onPress: () => handleBlockPost(item) },
      { text: "취소", style: "cancel" },
    ]);
  }, [handleReportPost, handleBlockPost]);

  const handleLongPressUserPost = useCallback((item) => {
    Alert.alert("매칭 글 관리", item.title, [
      {
        text: "수정",
        onPress: () => navigation.navigate("MatchingPostCreate", { post: item }),
      },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          Alert.alert("삭제 확인", "이 글을 삭제할까요?", [
            { text: "취소", style: "cancel" },
            { text: "삭제", style: "destructive", onPress: () => handleDeleteMatchingPost(item.id) },
          ]);
        },
      },
      { text: "취소", style: "cancel" },
    ]);
  }, [navigation, handleDeleteMatchingPost]);

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
              {isAi ? `🤖 AI수집${item.sourcePlatform ? ` · ${item.sourcePlatform}` : ""}` : "👤 직접 등록"}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => handlePostAction(item)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.reportBtnIcon}>⚠</Text>
            <Text style={styles.reportBtnText}>신고</Text>
          </TouchableOpacity>
        </View>

        {/* Header badges */}
        <View style={styles.cardHeader}>
          <View style={[styles.fieldBadge, { backgroundColor: (FIELD_COLORS[item.field] || CLight.pink) + "18" }]}>
            <Text style={[T.micro, { color: FIELD_COLORS[item.field] || CLight.pink, fontWeight: "600" }]}>
              {FIELD_EMOJIS[item.field] || ""} {FIELD_LABELS[item.field] || item.field}
            </Text>
          </View>
          <View style={[styles.matchBadge, { backgroundColor: getMatchColor(item.matchPercent) + "18" }]}>
            <Text style={[T.microBold, { color: getMatchColor(item.matchPercent) }]}>
              {item.matchPercent}% 매칭
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
            {item.deadline ? `마감: ${item.deadline}` : "마감일 미정"}
          </Text>
          {daysLeft && (
            <View style={[styles.dDayBadge, daysLeft === "마감" ? { backgroundColor: CLight.red + "18" } : {}]}>
              <Text style={[T.microBold, { color: daysLeft === "마감" ? CLight.red : CLight.pink }]}>
                {daysLeft}
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.applyBtn} onPress={() => handleDetailPress(item)}>
          <Text style={[T.captionBold, { color: CLight.white }]}>
            {isAi && item.externalUrl ? "원본 보기" : "상세 보기"}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar
        title="매칭"
        left={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backBtn}>{"<"} 뒤로</Text>
          </TouchableOpacity>
        }
      />

      {/* Source Tabs */}
      <View style={styles.sourceTabRow}>
        {SOURCE_TABS.map((st) => {
          const isActive = sourceTab === st.key;
          return (
            <TouchableOpacity
              key={st.key}
              style={[styles.sourceTab, isActive && styles.sourceTabActive]}
              onPress={() => setSourceTab(st.key)}
            >
              <Text style={[styles.sourceTabText, isActive && styles.sourceTabTextActive]}>
                {st.emoji} {st.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Category Tabs */}
      <View style={styles.tabRow}>
        {CATEGORY_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="매칭 항목 검색..."
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
          <Text style={[T.captionBold, { color: CLight.gray700 }]}>내 매칭 프로필</Text>
          <Text style={[T.small, { color: CLight.gray500, marginTop: 4 }]}>
            {artistProfile.displayName} | {artistProfile.displayFields || "미설정"} | 종합 점수{" "}
            {artistProfile.overallScore}점
          </Text>
          <View style={styles.profileBadges}>
            <View style={styles.profileBadge}>
              <Text style={[T.microBold, { color: CLight.pink }]}>📸 {portfolioItems.length}</Text>
              <Text style={[T.tiny, { color: CLight.gray400 }]}>포트폴리오</Text>
            </View>
            <View style={styles.profileBadge}>
              <Text style={[T.microBold, { color: CLight.purple }]}>📝 {savedNotes.length}</Text>
              <Text style={[T.tiny, { color: CLight.gray400 }]}>노트</Text>
            </View>
          </View>
        </View>

        {/* Result Count */}
        <Text style={[T.micro, { color: CLight.gray400, marginBottom: 8 }]}>
          {filtered.length}개 매칭
        </Text>

        {/* Loading state for AI tab */}
        {sourceTab === "ai" && aiLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={CLight.pink} />
            <Text style={[T.caption, { color: CLight.gray400, marginTop: 12 }]}>
              공고를 불러오는 중...
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          sourceTab === "user" ? (
            <EmptyState
              icon="📋"
              title="아직 등록한 글이 없습니다"
              message="+ 버튼을 눌러 등록해보세요."
            />
          ) : (
            <EmptyState
              icon="🔍"
              title="매칭 항목이 없습니다"
              message="검색어나 필터를 변경해보세요."
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
