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
import { useApp } from "../context/AppContext";
import { useNavigation } from "@react-navigation/native";
import { CLight, T, FIELD_EMOJIS } from "../constants/theme";
import Pill from "../components/Pill";
import {
  fetchPosts,
  getDemoPosts,
  invalidatePostsCache,
} from "../services/communityService";

const TABS = ["전체", "공지", "팁 공유", "작품 공유", "질문", "콜라보"];

const TYPE_COLORS = {
  "공지": CLight.red,
  "팁 공유": CLight.blue,
  "작품 공유": CLight.purple,
  "질문": CLight.orange,
  "콜라보": CLight.pink,
};

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR");
}

// ─── Post Card ───────────────────────────────────────────────
function PostCard({ post, onReport, onPress }) {
  const field = post.author_field || post.field;
  const emoji = FIELD_EMOJIS[field] || "";
  const badgeColor = TYPE_COLORS[post.type] || CLight.gray500;
  const author = post.author_name || post.author;
  const timeAgo = post.created_at ? formatTimeAgo(post.created_at) : post.timeAgo;

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
          <Text style={styles.reportBtnText}>신고</Text>
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
    Alert.alert("게시물 관리", null, [
      {
        text: "신고하기",
        onPress: () => {
          Alert.alert("신고하기", "이 게시물을 신고하시겠습니까?", [
            { text: "취소", style: "cancel" },
            { text: "부적절한 콘텐츠", onPress: () => handleReportContent({ contentId: post.id, type: "community_post", reason: "inappropriate_content", title: post.title }) },
            { text: "스팸/사기", onPress: () => handleReportContent({ contentId: post.id, type: "community_post", reason: "spam", title: post.title }) },
          ]);
        },
      },
      {
        text: "작성자 차단",
        style: "destructive",
        onPress: () => {
          Alert.alert("차단하기", `'${author}'님을 차단하시겠습니까?\n이 사용자의 콘텐츠가 피드에서 즉시 제거됩니다.`, [
            { text: "취소", style: "cancel" },
            { text: "차단", style: "destructive", onPress: () => handleBlockUser(author) },
          ]);
        },
      },
      { text: "취소", style: "cancel" },
    ]);
  }, [handleBlockUser, handleReportContent]);

  const handleCreatePost = useCallback(() => {
    if (!deviceUserId) {
      Alert.alert("잠시만요", "커뮤니티 연결 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    navigation.navigate("CommunityPostCreate");
  }, [navigation, deviceUserId]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Text style={[T.h2, { color: CLight.gray900 }]}>커뮤니티</Text>
      </View>

      {/* Tab Filter */}
      <View style={styles.tabContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {TABS.map((tab) => (
            <Pill
              key={tab}
              active={activeTab === tab}
              color={CLight.pink}
              onPress={() => setActiveTab(tab)}
            >
              {tab}
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
                아직 게시물이 없습니다.{"\n"}첫 글을 작성해보세요!
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
