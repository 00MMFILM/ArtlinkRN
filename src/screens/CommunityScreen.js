import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_EMOJIS } from "../constants/theme";
import Pill from "../components/Pill";

// ─── Demo Data ───────────────────────────────────────────────
const demoPosts = [
  {
    id: 1,
    author: "연기하는 민수",
    field: "acting",
    type: "팁 공유",
    title: "셀프테이프 조명 세팅 공유합니다",
    content: "자연광 + 링라이트 조합이 가장 자연스러워요...",
    likes: 24,
    comments: 8,
    timeAgo: "2시간 전",
  },
  {
    id: 2,
    author: "재즈피아니스트 윤아",
    field: "music",
    type: "작품 공유",
    title: "즉흥 연주 세션 녹음",
    content: "Miles Davis 트리뷰트 세션에서...",
    likes: 31,
    comments: 12,
    timeAgo: "5시간 전",
  },
  {
    id: 3,
    author: "무용가 지현",
    field: "dance",
    type: "질문",
    title: "컨템포러리 워크숍 추천해주세요",
    content: "서울 근처 주말 워크숍 찾고 있어요...",
    likes: 15,
    comments: 22,
    timeAgo: "어제",
  },
  {
    id: 4,
    author: "일러스트 소영",
    field: "art",
    type: "콜라보",
    title: "뮤지션과 앨범 아트 콜라보 원해요",
    content: "포트폴리오 보시고 관심있으시면...",
    likes: 42,
    comments: 6,
    timeAgo: "2일 전",
  },
];

const TABS = ["전체", "팁 공유", "작품 공유", "질문", "콜라보"];

const TYPE_COLORS = {
  "팁 공유": CLight.blue,
  "작품 공유": CLight.purple,
  "질문": CLight.orange,
  "콜라보": CLight.pink,
};

// ─── Post Card ───────────────────────────────────────────────
function PostCard({ post, onReport }) {
  const emoji = FIELD_EMOJIS[post.field] || "";
  const badgeColor = TYPE_COLORS[post.type] || CLight.gray500;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.authorRow}>
          <Text style={styles.fieldEmoji}>{emoji}</Text>
          <Text style={[T.captionBold, { color: CLight.gray900 }]}>
            {post.author}
          </Text>
        </View>
        <TouchableOpacity onPress={() => onReport(post)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.moreBtn}>···</Text>
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
        <View style={styles.statRow}>
          <Text style={styles.statIcon}>{"<3"}</Text>
          <Text style={[T.small, { color: CLight.gray500 }]}>{post.likes}</Text>
        </View>
        <View style={[styles.statRow, { marginLeft: 16 }]}>
          <Text style={styles.statIcon}>{"..."}</Text>
          <Text style={[T.small, { color: CLight.gray500 }]}>
            {post.comments}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Community Screen ────────────────────────────────────────
export default function CommunityScreen() {
  const { darkMode, blockedUsers, handleBlockUser, handleReportContent } = useApp();
  const [activeTab, setActiveTab] = useState("전체");

  const filtered = useMemo(
    () => {
      const posts = activeTab === "전체"
        ? demoPosts
        : demoPosts.filter((p) => p.type === activeTab);
      return posts.filter((p) => !blockedUsers.includes(p.author));
    },
    [activeTab, blockedUsers]
  );

  const handlePostAction = useCallback((post) => {
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
          Alert.alert("차단하기", `'${post.author}'님을 차단하시겠습니까?\n이 사용자의 콘텐츠가 피드에서 즉시 제거됩니다.`, [
            { text: "취소", style: "cancel" },
            { text: "차단", style: "destructive", onPress: () => handleBlockUser(post.author) },
          ]);
        },
      },
      { text: "취소", style: "cancel" },
    ]);
  }, [handleBlockUser, handleReportContent]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Text style={[T.h2, { color: CLight.gray900 }]}>커뮤니티</Text>
      </View>

      {/* Tab Filter */}
      <View style={styles.tabRow}>
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
      </View>

      {/* Post List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <PostCard post={item} onReport={handlePostAction} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[T.body, { color: CLight.gray400, textAlign: "center" }]}>
              해당 카테고리의 게시물이 없습니다.
            </Text>
          </View>
        }
      />

      {/* FAB removed - community posting not yet available */}
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
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 100,
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
  moreBtn: {
    fontSize: 18,
    color: CLight.gray400,
    fontWeight: "700",
    paddingHorizontal: 4,
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
