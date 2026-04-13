import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { useNavigation } from "@react-navigation/native";
import { CLight, T, FIELD_EMOJIS } from "../constants/theme";
import Pill from "../components/Pill";
import {
  fetchPosts,
  getDemoPosts,
  invalidatePostsCache,
} from "../services/communityService";

const TAB_KEYS = [
  { key: "tab_all", value: "전체" },
  { key: "tab_notice", value: "공지" },
  { key: "tab_tip", value: "팁 공유" },
  { key: "tab_work", value: "작품 공유" },
  { key: "tab_question", value: "질문" },
  { key: "tab_collab", value: "콜라보" },
];

const TYPE_COLORS = {
  "공지": CLight.red,
  "팁 공유": CLight.blue,
  "작품 공유": CLight.purple,
  "질문": CLight.orange,
  "콜라보": CLight.pink,
};

function formatTimeAgo(dateStr, t) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("common.just_now");
  if (mins < 60) return t("common.mins_ago", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("common.hours_ago", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("common.days_ago", { count: days });
  return new Date(dateStr).toLocaleDateString("ko-KR");
}

// ─── Post Card ───────────────────────────────────────────────
function PostCard({ post, onReport, onPress }) {
  const { t } = useTranslation();
  const field = post.author_field || post.field;
  const emoji = FIELD_EMOJIS[field] || "";
  const badgeColor = TYPE_COLORS[post.type] || CLight.gray500;
  const author = post.author_name || post.author;
  const timeAgo = post.created_at ? formatTimeAgo(post.created_at, t) : post.timeAgo;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => onPress(post)}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.authorRow}>
          <Text style={styles.fieldEmoji}>{emoji}</Text>
          <Text style={[T.captionBold, { color: CLight.gray900 }]}>
            {author}
          </Text>
          <Text style={[T.tiny, { color: CLight.gray400, marginLeft: 4 }]}>
            {timeAgo}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => onReport(post)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.reportBtnIcon}>⚠</Text>
          <Text style={styles.reportBtnText}>{t("common.report")}</Text>
        </TouchableOpacity>
      </View>

      {/* Type Badge */}
      <View style={[styles.typeBadge, { backgroundColor: `${badgeColor}14` }]}>
        <Text style={[T.microBold, { color: badgeColor }]}>{post.type}</Text>
      </View>

      {/* Title & Content */}
      <Text style={[T.title, { color: CLight.gray900, marginTop: 8 }]}>
        {post.title}
      </Text>
      <Text
        style={[T.body, { color: CLight.gray500, marginTop: 4 }]}
        numberOfLines={2}
      >
        {post.content}
      </Text>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <View style={styles.footerLeft}>
          <View style={styles.statRow}>
            <Text style={styles.statIcon}>{"♡"}</Text>
            <Text style={[T.small, { color: CLight.gray500 }]}>
              {post.likes_count ?? post.likes ?? 0}
            </Text>
          </View>
          <View style={[styles.statRow, { marginLeft: 16 }]}>
            <Text style={styles.statIcon}>{"💬"}</Text>
            <Text style={[T.small, { color: CLight.gray500 }]}>
              {post.comments_count ?? post.comments ?? 0}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Community Screen ────────────────────────────────────────
export default function CommunityScreen() {
  const { t } = useTranslation();
  const { blockedUsers, handleBlockUser, handleReportContent, deviceUserId } = useApp();
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState("전체");
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [usingDemo, setUsingDemo] = useState(false);

  const loadPosts = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) invalidatePostsCache();
      const data = await fetchPosts(activeTab);
      setPosts(data);
      setUsingDemo(false);
    } catch (_) {
      // Fallback to demo data
      setPosts(getDemoPosts());
      setUsingDemo(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setLoading(true);
    loadPosts();
  }, [activeTab]);

  // Refresh when returning from post create
  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      loadPosts(true);
    });
    return unsub;
  }, [navigation, loadPosts]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadPosts(true);
  }, [loadPosts]);

  const filtered = useMemo(() => {
    const authorKey = (p) => p.author_name || p.author;
    return posts.filter((p) => !blockedUsers.includes(authorKey(p)));
  }, [posts, blockedUsers]);

  const handlePostPress = useCallback((post) => {
    navigation.navigate("CommunityPostDetail", { post, isDemo: usingDemo });
  }, [navigation, usingDemo]);

  const handlePostAction = useCallback((post) => {
    const author = post.author_name || post.author;
    Alert.alert(t("common.post_management"), null, [
      {
        text: t("common.report_title"),
        onPress: () => {
          Alert.alert(t("common.report_title"), t("common.report_confirm"), [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("common.inappropriate_content"), onPress: () => handleReportContent({ contentId: post.id, type: "community_post", reason: "inappropriate_content", title: post.title }) },
            { text: t("common.spam_scam"), onPress: () => handleReportContent({ contentId: post.id, type: "community_post", reason: "spam", title: post.title }) },
          ]);
        },
      },
      {
        text: t("common.block_author"),
        style: "destructive",
        onPress: () => {
          Alert.alert(t("common.block_title"), t("common.block_confirm", { name: author }), [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("common.block"), style: "destructive", onPress: () => handleBlockUser(author) },
          ]);
        },
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [handleBlockUser, handleReportContent, t]);

  const handleCreatePost = useCallback(() => {
    if (!deviceUserId) {
      Alert.alert(t("community.wait_title"), t("community.wait_msg"));
      return;
    }
    navigation.navigate("CommunityPostCreate");
  }, [navigation, deviceUserId, t]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Text style={[T.h2, { color: CLight.gray900 }]}>{t("community.title")}</Text>
      </View>

      {/* Tab Filter */}
      <View style={styles.tabContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {TAB_KEYS.map(({ key, value }) => (
            <Pill
              key={key}
              active={activeTab === value}
              color={CLight.pink}
              onPress={() => setActiveTab(value)}
            >
              {t(`community.${key}`)}
            </Pill>
          ))}
        </ScrollView>
      </View>

      {/* Post List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={CLight.pink} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <PostCard post={item} onReport={handlePostAction} onPress={handlePostPress} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={CLight.pink}
              colors={[CLight.pink]}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>💬</Text>
              <Text style={[T.body, { color: CLight.gray400, textAlign: "center" }]}>
                {t("community.empty_posts")}
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={handleCreatePost}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: CLight.topBarBg,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: CLight.topBarBg,
    flexGrow: 0,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  // Card
  card: {
    backgroundColor: CLight.cardBg,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CLight.cardBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fieldEmoji: {
    fontSize: 18,
  },
  reportBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CLight.gray100,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  reportBtnIcon: {
    fontSize: 12,
  },
  reportBtnText: {
    fontSize: 12,
    color: CLight.gray500,
    fontWeight: "600",
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  typeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 10,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CLight.gray200,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statIcon: {
    fontSize: 14,
    color: CLight.gray400,
  },

  // Empty state
  empty: {
    paddingVertical: 60,
    alignItems: "center",
  },

  // FAB
  fab: {
    position: "absolute",
    right: 20,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: CLight.pink,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 28,
    color: "#FFFFFF",
    fontWeight: "300",
    marginTop: -2,
  },
});
