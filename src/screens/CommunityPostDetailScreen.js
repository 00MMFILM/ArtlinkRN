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
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_EMOJIS } from "../constants/theme";
import {
  fetchComments,
  createComment,
  checkLiked,
  toggleLike,
  deletePost,
  getDemoComments,
  moderateContent,
} from "../services/communityService";
import { checkProfanity } from "../utils/profanityFilter";

const TYPE_COLORS = {
  공지: CLight.red,
  "팁 공유": CLight.blue,
  "작품 공유": CLight.purple,
  질문: CLight.orange,
  콜라보: CLight.pink,
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

function CommentItem({ comment }) {
  const { t } = useTranslation();
  const field = comment.author_field || comment.field;
  const emoji = FIELD_EMOJIS[field] || "";
  const author = comment.author_name || comment.author;
  const timeAgo = comment.created_at ? formatTimeAgo(comment.created_at, t) : comment.timeAgo;

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
  const { t } = useTranslation();
  const { post, isDemo: routeIsDemo } = route.params;
  const { handleBlockUser, handleReportContent, deviceUserId, userProfile, showToast } = useApp();
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
  const timeAgo = post.created_at ? formatTimeAgo(post.created_at, t) : post.timeAgo;

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

  const isMyPost = post.user_id && deviceUserId && post.user_id === deviceUserId;

  const handleReport = useCallback(() => {
    const options = [];

    if (isMyPost) {
      options.push({
        text: t("communityDetail.delete_title"),
        style: "destructive",
        onPress: () => {
          Alert.alert(
            t("communityDetail.delete_title"),
            t("communityDetail.delete_msg"),
            [
              { text: t("common.cancel"), style: "cancel" },
              {
                text: t("common.delete"),
                style: "destructive",
                onPress: async () => {
                  try {
                    if (!isDemo) {
                      await deletePost(post.id, deviceUserId);
                    }
                    showToast(t("communityDetail.delete_success"), "success");
                    navigation.goBack();
                  } catch (_) {
                    Alert.alert(t("common.error"), t("communityDetail.delete_failed"));
                  }
                },
              },
            ]
          );
        },
      });
    } else {
      options.push({
        text: t("common.report_title"),
        onPress: () => {
          Alert.alert(t("common.report_title"), t("common.report_confirm"), [
            { text: t("common.cancel"), style: "cancel" },
            {
              text: t("common.inappropriate_content"),
              onPress: () =>
                handleReportContent({
                  contentId: post.id,
                  type: "community_post",
                  reason: "inappropriate_content",
                  title: post.title,
                }),
            },
            {
              text: t("common.spam_scam"),
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
      });
      options.push({
        text: t("common.block_author"),
        style: "destructive",
        onPress: () => {
          Alert.alert(
            t("common.block_title"),
            t("common.block_confirm", { name: author }),
            [
              { text: t("common.cancel"), style: "cancel" },
              {
                text: t("common.block"),
                style: "destructive",
                onPress: () => {
                  handleBlockUser(author);
                  navigation.goBack();
                },
              },
            ]
          );
        },
      });
    }

    options.push({ text: t("common.cancel"), style: "cancel" });
    Alert.alert(t("common.post_management"), null, options);
  }, [post, author, isMyPost, isDemo, deviceUserId, handleBlockUser, handleReportContent, navigation, showToast, t]);

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

    // Layer 1: Client-side profanity filter (instant)
    const profanityResult = checkProfanity(text);
    if (profanityResult.blocked) {
      Alert.alert(t("communityDetail.comment_blocked"), t("communityDetail.comment_inappropriate"));
      return;
    }

    if (isDemo || !deviceUserId) {
      // Local-only comment for demo
      const newComment = {
        id: `local_${Date.now()}`,
        author_name: userProfile.name || t("communityDetail.me"),
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
      // Layer 2: Server AI moderation (fail-open)
      const aiResult = await moderateContent(text, "comment");
      if (!aiResult.safe) {
        Alert.alert(t("communityDetail.comment_blocked"), t("communityDetail.comment_guideline"));
        return;
      }

      const newComment = await createComment({
        postId: post.id,
        userId: deviceUserId,
        authorName: userProfile.name || t("common.anonymous"),
        authorField: userProfile.fields?.[0] || null,
        content: text,
      });
      setComments((prev) => [...prev, newComment]);
      setCommentsCount((prev) => prev + 1);
      setCommentText("");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (_) {
      Alert.alert(t("common.error"), t("communityDetail.comment_failed"));
    } finally {
      setSubmitting(false);
    }
  }, [commentText, post.id, deviceUserId, userProfile, isDemo, t]);

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
        <Text style={[T.title, { color: CLight.gray900 }]}>{t("communityDetail.title")}</Text>
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
              {t("communityDetail.comments", { count: commentsCount })}
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
                  {t("communityDetail.empty_comments")}
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
            placeholder={t("communityDetail.comment_placeholder")}
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
                {t("common.send")}
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
