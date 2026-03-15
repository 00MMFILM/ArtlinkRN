import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_EMOJIS } from "../constants/theme";
import {
  fetchComments,
  createComment,
  checkLiked,
  toggleLike,
  getDemoComments,
} from "../services/communityService";

const TYPE_COLORS = {
  공지: CLight.red,
  "팁 공유": CLight.blue,
  "작품 공유": CLight.purple,
  질문: CLight.orange,
  콜라보: CLight.pink,
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

function CommentItem({ comment }) {
  const field = comment.author_field || comment.field;
  const emoji = FIELD_EMOJIS[field] || "";
  const author = comment.author_name || comment.author;
  const timeAgo = comment.created_at ? formatTimeAgo(comment.created_at) : comment.timeAgo;

  return (
    <View style={styles.commentItem}>
      <View style={styles.commentHeader}>
        <Text style={styles.commentEmoji}>{emoji}</Text>
        <Text style={[T.captionBold, { color: CLight.gray900, flex: 1 }]}>
          {author}
        </Text>
        <Text style={[T.tiny, { color: CLight.gray400 }]}>{timeAgo}</Text>
      </View>
      <Text style={[T.body, { color: CLight.gray700, marginTop: 6 }]}>
        {comment.content}
      </Text>
    </View>
  );
}

export default function CommunityPostDetailScreen({ route, navigation }) {
  const { post, isDemo: routeIsDemo } = route.params;
  const { handleBlockUser, handleReportContent, deviceUserId, userProfile } = useApp();
  const [commentText, setCommentText] = useState("");
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes_count ?? post.likes ?? 0);
  const [comments, setComments] = useState([]);
  const [commentsCount, setCommentsCount] = useState(post.comments_count ?? post.comments ?? 0);
  const [loadingComments, setLoadingComments] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isDemo, setIsDemo] = useState(!!routeIsDemo);

  const field = post.author_field || post.field;
  const emoji = FIELD_EMOJIS[field] || "";
  const badgeColor = TYPE_COLORS[post.type] || CLight.gray500;
  const author = post.author_name || post.author;
  const timeAgo = post.created_at ? formatTimeAgo(post.created_at) : post.timeAgo;

  // Load comments and like status
  useEffect(() => {
    (async () => {
      try {
        if (isDemo || String(post.id).startsWith("demo-")) {
          setComments(getDemoComments(post.id));
          setIsDemo(true);
          setLoadingComments(false);
          return;
        }
        const [commentsData, likedStatus] = await Promise.all([
          fetchComments(post.id),
          deviceUserId ? checkLiked(post.id, deviceUserId) : false,
        ]);
        setComments(commentsData);
        setLiked(likedStatus);
      } catch (_) {
        // Fallback to demo comments
        setComments(getDemoComments(post.id));
        setIsDemo(true);
      } finally {
        setLoadingComments(false);
      }
    })();
  }, [post.id, deviceUserId]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleReport = useCallback(() => {
    Alert.alert("게시물 관리", null, [
      {
        text: "신고하기",
        onPress: () => {
          Alert.alert("신고하기", "이 게시물을 신고하시겠습니까?", [
            { text: "취소", style: "cancel" },
            {
              text: "부적절한 콘텐츠",
              onPress: () =>
                handleReportContent({
                  contentId: post.id,
                  type: "community_post",
                  reason: "inappropriate_content",
                  title: post.title,
                }),
            },
            {
              text: "스팸/사기",
              onPress: () =>
                handleReportContent({
                  contentId: post.id,
                  type: "community_post",
                  reason: "spam",
                  title: post.title,
                }),
            },
          ]);
        },
      },
      {
        text: "작성자 차단",
        style: "destructive",
        onPress: () => {
          Alert.alert(
            "차단하기",
            `'${author}'님을 차단하시겠습니까?\n이 사용자의 콘텐츠가 피드에서 즉시 제거됩니다.`,
            [
              { text: "취소", style: "cancel" },
              {
                text: "차단",
                style: "destructive",
                onPress: () => {
                  handleBlockUser(author);
                  navigation.goBack();
                },
              },
            ]
          );
        },
      },
      { text: "취소", style: "cancel" },
    ]);
  }, [post, author, handleBlockUser, handleReportContent, navigation]);

  const handleToggleLike = useCallback(async () => {
    if (isDemo || !deviceUserId) {
      // Local-only toggle for demo
      setLiked((prev) => !prev);
      setLikesCount((prev) => prev + (liked ? -1 : 1));
      return;
    }
    try {
      const nowLiked = await toggleLike(post.id, deviceUserId);
      setLiked(nowLiked);
      setLikesCount((prev) => prev + (nowLiked ? 1 : -1));
    } catch (_) {
      // Silent fail
    }
  }, [post.id, deviceUserId, liked, isDemo]);

  const scrollRef = React.useRef(null);

  const handleSubmitComment = useCallback(async () => {
    const text = commentText.trim();
    if (!text) return;

    if (isDemo || !deviceUserId) {
      // Local-only comment for demo
      const newComment = {
        id: `local_${Date.now()}`,
        author_name: userProfile.name || "나",
        author_field: userProfile.fields?.[0] || "acting",
        content: text,
        created_at: new Date().toISOString(),
      };
      setComments((prev) => [...prev, newComment]);
      setCommentsCount((prev) => prev + 1);
      setCommentText("");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      return;
    }

    setSubmitting(true);
    try {
      const newComment = await createComment({
        postId: post.id,
        userId: deviceUserId,
        authorName: userProfile.name || "익명",
        authorField: userProfile.fields?.[0] || null,
        content: text,
      });
      setComments((prev) => [...prev, newComment]);
      setCommentsCount((prev) => prev + 1);
      setCommentText("");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (_) {
      Alert.alert("오류", "댓글 작성에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setSubmitting(false);
    }
  }, [commentText, post.id, deviceUserId, userProfile, isDemo]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.topBarBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.topBarBtnText}>{"←"}</Text>
        </TouchableOpacity>
        <Text style={[T.title, { color: CLight.gray900 }]}>게시물</Text>
        <TouchableOpacity
          onPress={handleReport}
          style={styles.topBarBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.topBarBtnText}>{"⋯"}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Post Content */}
          <View style={styles.postCard}>
            {/* Author */}
            <View style={styles.authorRow}>
              <Text style={styles.authorEmoji}>{emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[T.captionBold, { color: CLight.gray900 }]}>
                  {author}
                </Text>
                <Text style={[T.tiny, { color: CLight.gray400 }]}>
                  {timeAgo}
                </Text>
              </View>
            </View>

            {/* Type Badge */}
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: `${badgeColor}14` },
              ]}
            >
              <Text style={[T.microBold, { color: badgeColor }]}>
                {post.type}
              </Text>
            </View>

            {/* Title & Content */}
            <Text
              style={[T.h3, { color: CLight.gray900, marginTop: 12 }]}
            >
              {post.title}
            </Text>
            <Text
              style={[T.body, { color: CLight.gray700, marginTop: 10, lineHeight: 26 }]}
            >
              {post.content}
            </Text>

            {/* Like / Comment counts */}
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.statBtn}
                onPress={handleToggleLike}
                activeOpacity={0.7}
              >
                <Text style={[styles.statIcon, liked && { color: CLight.pink }]}>
                  {liked ? "♥" : "♡"}
                </Text>
                <Text
                  style={[
                    T.small,
                    { color: liked ? CLight.pink : CLight.gray500 },
                  ]}
                >
                  {likesCount}
                </Text>
              </TouchableOpacity>
              <View style={styles.statBtn}>
                <Text style={styles.statIcon}>💬</Text>
                <Text style={[T.small, { color: CLight.gray500 }]}>
                  {commentsCount}
                </Text>
              </View>
            </View>
          </View>

          {/* Comments Section */}
          <View style={styles.commentsSection}>
            <Text
              style={[T.captionBold, { color: CLight.gray700, marginBottom: 12 }]}
            >
              댓글 {commentsCount}
            </Text>
            {loadingComments ? (
              <ActivityIndicator
                size="small"
                color={CLight.pink}
                style={{ marginVertical: 20 }}
              />
            ) : comments.length === 0 ? (
              <View style={styles.emptyComments}>
                <Text style={[T.body, { color: CLight.gray400, textAlign: "center" }]}>
                  아직 댓글이 없습니다.{"\n"}첫 댓글을 남겨보세요!
                </Text>
              </View>
            ) : (
              comments.map((comment) => (
                <CommentItem key={comment.id} comment={comment} />
              ))
            )}
          </View>
        </ScrollView>

        {/* Comment Input */}
        <View style={styles.commentInputBar}>
          <TextInput
            style={styles.commentInput}
            placeholder="댓글을 입력하세요..."
            placeholderTextColor={CLight.gray400}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!commentText.trim() || submitting) && styles.sendBtnDisabled,
            ]}
            onPress={handleSubmitComment}
            disabled={!commentText.trim() || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={CLight.white} />
            ) : (
              <Text
                style={[
                  T.captionBold,
                  {
                    color: commentText.trim() ? CLight.white : CLight.gray400,
                  },
                ]}
              >
                전송
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: CLight.bg,
  },

  // Top Bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: CLight.topBarBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CLight.gray200,
  },
  topBarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: CLight.gray100,
  },
  topBarBtnText: { fontSize: 20 },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  // Post Card
  postCard: {
    backgroundColor: CLight.cardBg,
    margin: 16,
    marginBottom: 0,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: CLight.cardBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  authorEmoji: {
    fontSize: 32,
    width: 44,
    height: 44,
    lineHeight: 44,
    textAlign: "center",
    backgroundColor: CLight.gray100,
    borderRadius: 22,
    overflow: "hidden",
  },
  typeBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 14,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CLight.gray200,
  },
  statBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statIcon: {
    fontSize: 18,
    color: CLight.gray400,
  },

  // Comments
  commentsSection: {
    margin: 16,
    backgroundColor: CLight.cardBg,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: CLight.cardBorder,
  },
  commentItem: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CLight.gray200,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  commentEmoji: {
    fontSize: 16,
  },
  emptyComments: {
    paddingVertical: 30,
    alignItems: "center",
  },

  // Comment Input Bar
  commentInputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: CLight.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CLight.gray200,
    gap: 10,
  },
  commentInput: {
    flex: 1,
    backgroundColor: CLight.gray100,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 15,
    color: CLight.gray900,
  },
  sendBtn: {
    backgroundColor: CLight.pink,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 50,
    alignItems: "center",
  },
  sendBtnDisabled: {
    backgroundColor: CLight.gray200,
  },
});
