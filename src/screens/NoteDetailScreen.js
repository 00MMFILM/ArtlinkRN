import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  StyleSheet,
  Image,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Audio, Video, ResizeMode } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";
import { getRelatedNotes } from "../services/analyticsService";
import { analyzeNote, analyzeVideoFrames, lastAiMeta, rateFeedback, buildPreviousContext, focusSummary } from "../services/aiService";
import { submitTrainingData, submitAnonymousMetadata } from "../services/dataCollectionService";
import { incrementDailyAICount, shouldShowInterstitial, showInterstitialAd, showRewardedAd } from "../services/adService";
import { SERVER_URL, getApiHeaders } from "../services/apiConfig";
import { aiFeedbackDone, newUuid } from "../services/practiceService";
import { trackFunnelEvent } from "../services/mauService";
import FocusPicker from "../components/FocusPicker";
import { formatDate, timeAgo } from "../utils/helpers";
import FeedbackShareCard from "../components/FeedbackShareCard";
import { buildCardProps, shareCardImage } from "../utils/shareCard";
import { useTranslation } from "react-i18next";

export default function NoteDetailScreen({ route, navigation }) {
  const { t } = useTranslation();
  const { noteId } = route.params;
  const {
    savedNotes,
    userProfile,
    handleDeleteNote,
    handleToggleStar,
    handleUpdateNote,
    showToast,
    dataConsent,
    dataConsentAsked,
    handleSetDataConsent,
    handleDataConsentAsked,
    aiDisclosureAccepted,
    handleAcceptAIDisclosure,
    isKoreanLocale,
    setAuthState,
    premium,
  } = useApp();

  // 게스트(비로그인)면 로그인 유도, 무료 로그인 유저면 프리미엄 안내,
  // 이미 프리미엄이면 결제 권유 대신 남은 한도 안내. AI 쿼터 소진 공통 처리.
  const promptQuotaExceeded = useCallback((kind = "video", info = {}) => {
    if (!userProfile?.authUserId) {
      Alert.alert(t("premium.guest_trial_title"), t("premium.guest_trial_msg"), [
        { text: t("premium.guest_trial_cta"), onPress: () => setAuthState("auth") },
        { text: t("common.cancel") || "OK", style: "cancel" },
      ]);
    } else if (premium?.active) {
      const max = info.max ?? (kind === "text" ? 10 : 15);
      const key = kind === "text" ? "premium.limit_text_reached" : "premium.limit_video_reached";
      Alert.alert(t("premium.active_title"), t(key, { max }));
    } else {
      Alert.alert(t("common.video_quota_exceeded"), "", [
        { text: t("premium.quota_cta"), onPress: () => navigation.navigate("Subscription") },
        { text: t("common.cancel") || "OK", style: "cancel" },
      ]);
    }
  }, [userProfile?.authUserId, premium?.active, setAuthState, navigation, t]);

  const note = useMemo(
    () => savedNotes.find((n) => n.id === noteId),
    [savedNotes, noteId]
  );

  // AI 응답이 도착했을 때 저장 대상은 항상 "최신" note여야 한다.
  // runRequestAI/startVideoAI는 호출 시점의 note를 클로저로 캡처하는데,
  // 분석이 진행되는 수십 초 동안 사용자가 제목/본문을 편집·저장하면
  // 그 캡처가 낡아져 AI 저장 시 편집분을 덮어쓴다. ref로 최신값을 따라간다.
  const noteRef = useRef(note);
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  const TABS = [
    { key: "content", label: t("noteDetail.tab_content") },
    { key: "ai", label: t("noteDetail.tab_ai") },
    { key: "related", label: t("noteDetail.tab_related") },
  ];

  const [activeTab, setActiveTab] = useState("content");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(note?.title || "");
  const [editContent, setEditContent] = useState(note?.content || "");
  const [aiLoading, setAiLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [videoAiLoading, setVideoAiLoading] = useState(false);
  const [videoAiProgress, setVideoAiProgress] = useState({ phase: "", percent: 0, message: "" });
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackKind, setFeedbackKind] = useState("text"); // 'text' | 'video' — 어느 피드백에 대한 평가인지
  const [sharing, setSharing] = useState(false);
  const feedCardRef = useRef(null);
  const storyCardRef = useRef(null);

  // AI 피드백을 카드 이미지로 공유 (인스타/스레드/틱톡). variant 선택 → 캡처 → 공유 시트
  const handleShareFeedback = useCallback(() => {
    Alert.alert(
      t("noteDetail.share_title"),
      t("noteDetail.share_msg"),
      [
        { text: t("noteDetail.share_feed"), onPress: () => doShare("feed") },
        { text: t("noteDetail.share_story"), onPress: () => doShare("story") },
        { text: t("common.cancel"), style: "cancel" },
      ]
    );
  }, [t]);

  const doShare = useCallback(async (variant) => {
    const ref = variant === "story" ? storyCardRef : feedCardRef;
    setSharing(true);
    try {
      // 오프스크린 카드가 레이아웃될 시간을 잠깐 준다
      await new Promise((r) => setTimeout(r, 60));
      await shareCardImage(ref, variant);
    } catch (e) {
      showToast(t("noteDetail.share_failed"), "error");
    } finally {
      setSharing(false);
    }
  }, [showToast, t]);

  const noteVideos = useMemo(
    () => (note?.images || []).filter((i) => i.type === "video"),
    [note]
  );

  // Media playback state
  const [playingSound, setPlayingSound] = useState(null);
  const [playingIdx, setPlayingIdx] = useState(null);
  const [expandedImage, setExpandedImage] = useState(null);

  useEffect(() => {
    return () => {
      if (playingSound) playingSound.unloadAsync();
    };
  }, []);

  const handlePlayVoice = useCallback(async (uri, index) => {
    try {
      if (playingSound) {
        await playingSound.unloadAsync();
        if (playingIdx === index) {
          setPlayingSound(null);
          setPlayingIdx(null);
          return;
        }
      }
      const { sound } = await Audio.Sound.createAsync({ uri });
      setPlayingSound(sound);
      setPlayingIdx(index);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setPlayingSound(null);
          setPlayingIdx(null);
        }
      });
      await sound.playAsync();
    } catch (e) {
      // silent fail
    }
  }, [playingSound, playingIdx]);

  const formatDuration = (sec) => {
    const m = Math.floor((sec || 0) / 60);
    const s = (sec || 0) % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // 지난 연습 — 이 노트가 재연습(parentNoteId)이고 그 노트가 기기에 남아 있을 때만
  const previousNote = useMemo(
    () => (note?.parentNoteId ? savedNotes.find((n) => n.id === note.parentNoteId) || null : null),
    [note?.parentNoteId, savedNotes]
  );

  const relatedNotes = useMemo(() => {
    if (!note) return [];
    return getRelatedNotes(note, savedNotes);
  }, [note, savedNotes]);

  // 고칠 점 선택 — 노트에 저장하고 퍼널에 최초 1회 기록
  const handleChooseFocus = useCallback((value) => {
    if (!note) return;
    handleUpdateNote({ ...(noteRef.current || note), chosenFocus: value || undefined }, { silent: true });
    if (value) trackFunnelEvent("focus_selected");
  }, [note, handleUpdateNote]);

  // 고른 초점으로 같은 장면 다시 연습 — 새 노트가 체인(rootNoteId·parentNoteId)을 들고 열린다
  const handleRepractice = useCallback(() => {
    if (!note) return;
    trackFunnelEvent("repractice_started");
    navigation.navigate("NoteCreate", {
      prefill: {
        title: note.title,
        field: note.field,
        seriesName: note.seriesName || note.title,
        rootNoteId: note.rootNoteId || note.id,
        parentNoteId: note.id,
        focus: note.chosenFocus,
        sceneId: note.sceneId,
      },
    });
  }, [note, navigation]);

  const fieldEmoji = FIELD_EMOJIS[note?.field] || "\uD83D\uDCDD";
  const fieldLabel = t("fields." + (note?.field || "etc"));
  const fieldColor = FIELD_COLORS[note?.field] || CLight.gray500;

  // ─── Handlers ───

  const handleBack = useCallback(() => {
    if (isEditing) {
      Alert.alert(t("noteDetail.edit_cancel_title"), t("noteDetail.edit_cancel_msg"), [
        { text: t("noteDetail.keep_editing"), style: "cancel" },
        {
          text: t("noteDetail.discard"),
          style: "destructive",
          onPress: () => {
            setIsEditing(false);
            setEditTitle(note?.title || "");
            setEditContent(note?.content || "");
            navigation.goBack();
          },
        },
      ]);
    } else {
      navigation.goBack();
    }
  }, [isEditing, note, navigation, t]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      t("noteDetail.delete_title"),
      t("noteDetail.delete_msg"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: () => {
            handleDeleteNote(noteId);
            navigation.goBack();
          },
        },
      ]
    );
  }, [noteId, handleDeleteNote, navigation, t]);

  const handleSaveEdit = useCallback(() => {
    if (!editTitle.trim()) {
      showToast(t("noteDetail.title_required"), "error");
      return;
    }
    handleUpdateNote({ ...note, title: editTitle.trim(), content: editContent.trim() });
    setIsEditing(false);
  }, [editTitle, editContent, note, handleUpdateNote, showToast, t]);

  const handleStartEdit = useCallback(() => {
    setEditTitle(note?.title || "");
    setEditContent(note?.content || "");
    setIsEditing(true);
  }, [note]);

  const handleCancelEdit = useCallback(() => {
    setEditTitle(note?.title || "");
    setEditContent(note?.content || "");
    setIsEditing(false);
  }, [note]);

  const runRequestAI = useCallback(async () => {
    if (!note) return;
    setAiLoading(true);
    try {
      // Foreign users: show interstitial ad from 2nd AI use per day
      if (!isKoreanLocale) {
        const count = await incrementDailyAICount();
        if (shouldShowInterstitial(isKoreanLocale, count)) {
          await showInterstitialAd(); // proceeds even if ad fails
        }
      }
      setStreamingText("");
      const result = await analyzeNote(
        note.field,
        note.content,
        savedNotes,
        note,
        userProfile,
        (partial) => setStreamingText(partial),
        { focus: note.focus, previous: buildPreviousContext(previousNote) }
      );
      const analysis = result.analysis || result;
      const scores = result.scores || null;
      setStreamingText("");
      // 분석 중 사용자가 편집·저장했을 수 있으므로 캡처된 note가 아닌 최신 note에 병합한다.
      handleUpdateNote({ ...(noteRef.current || note), aiComment: analysis, aiScores: scores, focusOptions: result.focusOptions || undefined, aiModel: lastAiMeta.model, promptVersion: lastAiMeta.promptVersion });
      showToast(t("noteDetail.ai_complete"), "success");
      // 재분석도 연습 한 번 — 이 화면엔 시작 지점이 없어 단건 세션으로 보낸다
      aiFeedbackDone({ sessionId: newUuid(), kind: "reanalysis", subjectKey: note.id, field: note.field });

      // Submit anonymous metadata for ALL users (no personal content)
      submitAnonymousMetadata({
        field: note.field,
        noteTitle: note.title,
        aiFeedback: analysis,
        tags: note.tags || [],
        userType: userProfile.userType,
      }).catch(() => {});

      // Submit full training data if consented
      if (dataConsent) {
        submitTrainingData({
          field: note.field,
          noteContent: note.content,
          aiFeedback: analysis,
          noteTitle: note.title,
        }).catch(() => {});
      }

      // Show 1-time consent popup for existing users
      if (!dataConsentAsked) {
        setTimeout(() => {
          Alert.alert(
            t("noteDetail.data_consent_title"),
            t("noteDetail.data_consent_msg"),
            [
              {
                text: t("noteDetail.data_consent_later"),
                style: "cancel",
                onPress: () => handleDataConsentAsked(),
              },
              {
                text: t("noteDetail.data_consent_join"),
                onPress: () => {
                  handleSetDataConsent(true);
                  handleDataConsentAsked();
                  // Submit the current result now that user consented
                  submitTrainingData({
                    field: note.field,
                    noteContent: note.content,
                    aiFeedback: analysis,
                    noteTitle: note.title,
                  }).catch(() => {});
                },
              },
            ]
          );
        }, 500);
      }
    } catch (e) {
      if (e?.message === "AI_QUOTA") {
        promptQuotaExceeded("text", { max: e.quotaMax, used: e.quotaUsed }); // 게스트→로그인, 무료→프리미엄, 프리미엄→한도 안내
      } else {
        showToast(t("noteDetail.ai_failed"), "error");
      }
    } finally {
      setAiLoading(false);
    }
  }, [note, savedNotes, userProfile, handleUpdateNote, showToast, dataConsent, dataConsentAsked, handleSetDataConsent, handleDataConsentAsked, isKoreanLocale, t, navigation, previousNote]);

  const handleRequestAI = useCallback(async () => {
    if (!note) return;
    if (!aiDisclosureAccepted) {
      Alert.alert(
        t("aiDisclosure.title"),
        t("aiDisclosure.message"),
        [
          { text: t("aiDisclosure.cancel"), style: "cancel" },
          { text: t("aiDisclosure.accept"), onPress: () => { handleAcceptAIDisclosure(); runRequestAI(); } },
        ]
      );
      return;
    }
    runRequestAI();
  }, [note, aiDisclosureAccepted, handleAcceptAIDisclosure, runRequestAI, t]);

  // 재시도 버튼에서 자신을 다시 부르기 위한 참조 (useCallback 자기참조 회피)
  const startVideoAIRef = useRef(null);

  const startVideoAI = useCallback(async () => {
    setVideoAiLoading(true);
    setVideoAiProgress({ phase: "extracting", percent: 0, message: t("noteDetail.video_preparing") });
    try {
      const result = await analyzeVideoFrames(
        note.field,
        note.content,
        note.title,
        noteVideos,
        userProfile,
        (progress) => setVideoAiProgress(progress),
        { focus: note.focus, previous: buildPreviousContext(previousNote) }
      );
      // 분석 중 사용자가 편집·저장했을 수 있으므로 캡처된 note가 아닌 최신 note에 병합한다.
      const latestNote = noteRef.current || note;
      handleUpdateNote({ ...latestNote, videoAnalysis: result, focusOptions: lastAiMeta.focusOptions?.length ? lastAiMeta.focusOptions : latestNote.focusOptions, aiModel: lastAiMeta.model, promptVersion: lastAiMeta.promptVersion, transcript: lastAiMeta.transcript || latestNote.transcript });
      showToast(t("noteDetail.video_ai_complete"), "success");
      aiFeedbackDone({ sessionId: newUuid(), kind: "reanalysis", subjectKey: note.id, field: note.field });
    } catch (e) {
      // 실패는 노트에 저장하지 않는다 — 안내만 띄우고 재시도를 제안한다
      const quota = e?.videoAiReason === "QUOTA";
      if (quota) {
        promptQuotaExceeded("video", { max: e.quotaMax, used: e.quotaUsed }); // 게스트→로그인, 무료→프리미엄, 프리미엄→한도 안내
      } else {
        Alert.alert(
          t("noteDetail.video_ai_failed"),
          t("common.video_ai_retry_msg"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("common.retry"), onPress: () => startVideoAIRef.current?.() },
          ]
        );
      }
    } finally {
      setVideoAiLoading(false);
      setVideoAiProgress({ phase: "", percent: 0, message: "" });
    }
  }, [note, noteVideos, userProfile, handleUpdateNote, showToast, t, promptQuotaExceeded, previousNote]);

  useEffect(() => {
    startVideoAIRef.current = startVideoAI;
  }, [startVideoAI]);

  const runVideoAIFlow = useCallback(async () => {
    const video = noteVideos[0];
    const durationSec = video.duration ? Math.round(video.duration / 1000) : 0;
    if (durationSec > 300) {
      Alert.alert(t("noteCreate.video_too_long"), t("noteCreate.video_too_long_msg"));
      return;
    }
    try {
      const fileInfo = await FileSystem.getInfoAsync(video.uri, { size: true });
      const sizeMB = (fileInfo.size || 0) / (1024 * 1024);
      if (sizeMB > 100) {
        Alert.alert(t("noteCreate.video_too_large"), t("noteCreate.video_too_large_msg", { size: Math.round(sizeMB) }));
        return;
      }
    } catch {}
    // Foreign users: must watch rewarded ad before video AI
    if (!isKoreanLocale) {
      const rewarded = await showRewardedAd();
      if (!rewarded) {
        Alert.alert(t("common.error"), t("ads.rewarded_required"));
        return;
      }
    }
    startVideoAI();
  }, [noteVideos, startVideoAI, isKoreanLocale, t]);

  const handleRequestVideoAI = useCallback(async () => {
    if (!note || noteVideos.length === 0) return;
    if (!aiDisclosureAccepted) {
      Alert.alert(
        t("aiDisclosure.title"),
        t("aiDisclosure.message"),
        [
          { text: t("aiDisclosure.cancel"), style: "cancel" },
          { text: t("aiDisclosure.accept"), onPress: () => { handleAcceptAIDisclosure(); runVideoAIFlow(); } },
        ]
      );
      return;
    }
    runVideoAIFlow();
  }, [note, noteVideos, aiDisclosureAccepted, handleAcceptAIDisclosure, runVideoAIFlow, t]);

  const handleRelatedNotePress = useCallback(
    (relatedNoteId) => {
      navigation.push("NoteDetail", { noteId: relatedNoteId });
    },
    [navigation]
  );

  // ─── Guard: note not found ───

  if (!note) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>{"😶"}</Text>
          <Text style={[T.title, { color: CLight.gray900, marginTop: 12 }]}>
            {t("noteDetail.not_found")}
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={[T.bodyBold, { color: CLight.pink }]}>{t("noteDetail.go_back")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render ───

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleBack} style={styles.topBarBtn} hitSlop={hitSlop}>
          <Text style={styles.topBarBtnText}>{"\u2190"}</Text>
        </TouchableOpacity>

        <View style={styles.topBarActions}>
          {isEditing ? (
            <>
              <TouchableOpacity onPress={handleCancelEdit} style={styles.topBarTextBtn}>
                <Text style={[T.captionBold, { color: CLight.gray500 }]}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveEdit} style={styles.saveBtn}>
                <Text style={[T.captionBold, { color: CLight.white }]}>{t("common.save")}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity onPress={handleStartEdit} style={styles.topBarBtn} hitSlop={hitSlop}>
                <Text style={styles.topBarBtnText}>{"\u270F\uFE0F"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleToggleStar(note.id)}
                style={styles.topBarBtn}
                hitSlop={hitSlop}
              >
                <Text style={styles.topBarBtnText}>{note.starred ? "\u2B50" : "\u2606"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.topBarBtn} hitSlop={hitSlop}>
                <Text style={styles.topBarBtnText}>{"\uD83D\uDDD1\uFE0F"}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Note Header */}
        <View style={styles.header}>
          <View style={styles.headerMeta}>
            <View style={[styles.fieldPill, { backgroundColor: `${fieldColor}15` }]}>
              <Text style={[T.small, { color: fieldColor }]}>
                {fieldEmoji} {fieldLabel}
              </Text>
            </View>
            <Text style={[T.micro, { color: CLight.gray400 }]}>{timeAgo(note.createdAt)}</Text>
          </View>

          {isEditing ? (
            <TextInput
              style={[T.h2, styles.titleInput]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder={t("noteDetail.enter_title")}
              placeholderTextColor={CLight.gray300}
              multiline
            />
          ) : (
            <Text style={[T.h2, { color: CLight.gray900, marginTop: 8 }]}>{note.title}</Text>
          )}

          <Text style={[T.small, { color: CLight.gray400, marginTop: 4 }]}>
            {formatDate(note.createdAt)}
          </Text>

          {/* Tags */}
          {note.tags && note.tags.length > 0 && (
            <View style={styles.tagsRow}>
              {note.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={[T.micro, { color: CLight.pink }]}>#{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Tab Bar */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[styles.tab, isActive && styles.tabActive]}
              >
                <Text
                  style={[
                    T.captionBold,
                    { color: isActive ? CLight.pink : CLight.gray400 },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tab Content */}
        {activeTab === "content" && renderContentTab()}
        {activeTab === "ai" && renderAITab()}
        {activeTab === "related" && renderRelatedTab()}
      </ScrollView>

      {/* Feedback Modal (cross-platform replacement for Alert.prompt) */}
      <Modal
        visible={feedbackModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackModalVisible(false)}
      >
        <View style={styles.feedbackModalOverlay}>
          <View style={styles.feedbackModalBox}>
            <Text style={[T.titleBold, { color: CLight.gray900, marginBottom: 8 }]}>
              {t("noteDetail.ai_feedback_prompt")}
            </Text>
            <Text style={[T.caption, { color: CLight.gray500, marginBottom: 12 }]}>
              {t("noteDetail.ai_feedback_ask")}
            </Text>
            <TextInput
              style={styles.feedbackModalInput}
              value={feedbackText}
              onChangeText={setFeedbackText}
              placeholder={t("noteDetail.ai_feedback_placeholder") || ""}
              multiline
              autoFocus
            />
            <View style={styles.feedbackModalBtns}>
              <TouchableOpacity
                style={styles.feedbackModalCancelBtn}
                onPress={() => setFeedbackModalVisible(false)}
              >
                <Text style={[T.captionBold, { color: CLight.gray500 }]}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.feedbackModalSubmitBtn, !feedbackText.trim() && { opacity: 0.4 }]}
                disabled={!feedbackText.trim()}
                onPress={() => {
                  fetch(`${SERVER_URL}/api/report`, {
                    method: "POST",
                    headers: getApiHeaders(),
                    body: JSON.stringify({
                      type: "ai_feedback",
                      rating: "bad",
                      kind: feedbackKind,
                      comment: feedbackText.trim(),
                      noteField: note.field,
                      noteId: note.id,
                      sentAt: new Date().toISOString(),
                    }),
                  }).catch(() => {});
                  // 구조화 평가 저장 (학습 데이터 라벨)
                  rateFeedback({ noteLocalId: note.id, kind: feedbackKind, rating: "down", aiModel: note.aiModel, promptVersion: note.promptVersion });
                  setFeedbackModalVisible(false);
                  showToast(t("noteDetail.ai_feedback_sent"), "success");
                }}
              >
                <Text style={[T.captionBold, { color: CLight.white }]}>{t("noteDetail.ai_feedback_submit") || t("common.submit")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 공유 카드 — 화면 밖에서 렌더(캡처용). aiComment 있을 때만 */}
      {note.aiComment ? (
        <View style={styles.offscreen} pointerEvents="none">
          <FeedbackShareCard ref={feedCardRef} {...buildCardProps(note, "feed")} />
          <FeedbackShareCard ref={storyCardRef} {...buildCardProps(note, "story")} />
        </View>
      ) : null}
    </SafeAreaView>
  );

  // ─── Content Tab ───
  function renderContentTab() {
    const noteImages = note.images || [];
    const noteVoices = note.voiceRecordings || [];
    const noteAudioFiles = note.audioFiles || [];
    const notePdfFiles = note.pdfFiles || [];
    const screenWidth = Dimensions.get("window").width;

    return (
      <View style={styles.tabContent}>
        {isEditing ? (
          <TextInput
            style={[T.body, styles.contentInput]}
            value={editContent}
            onChangeText={setEditContent}
            placeholder={t("noteDetail.enter_content")}
            placeholderTextColor={CLight.gray300}
            multiline
            textAlignVertical="top"
          />
        ) : (
          <View style={styles.contentCard}>
            <Text style={[T.body, { color: CLight.gray900 }]}>
              {note.content || t("common.no_content")}
            </Text>
          </View>
        )}

        {/* Attached Media */}
        {noteImages.length > 0 && (
          <View style={styles.mediaSection}>
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
              {t("noteDetail.attached_media")} ({noteImages.length})
            </Text>
            {expandedImage !== null ? (
              <TouchableOpacity onPress={() => setExpandedImage(null)} activeOpacity={0.95}>
                <Image
                  source={{ uri: noteImages[expandedImage].uri }}
                  style={{ width: screenWidth - 64, height: screenWidth - 64, borderRadius: 12 }}
                  resizeMode="contain"
                />
              </TouchableOpacity>
            ) : (
              <View style={styles.mediaGrid}>
                {noteImages.map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => item.type === "video" ? null : setExpandedImage(idx)}
                    activeOpacity={0.8}
                  >
                    {item.type === "video" ? (
                      <View style={styles.detailVideoWrap}>
                        <Video
                          source={{ uri: item.uri }}
                          style={styles.detailThumbnail}
                          resizeMode={ResizeMode.COVER}
                          useNativeControls
                        />
                      </View>
                    ) : (
                      <Image source={{ uri: item.uri }} style={styles.detailThumbnail} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Voice Recordings */}
        {noteVoices.length > 0 && (
          <View style={styles.mediaSection}>
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
              {t("noteDetail.voice_recordings")} ({noteVoices.length})
            </Text>
            {noteVoices.map((rec, idx) => (
              <View key={idx} style={styles.detailVoiceItem}>
                <TouchableOpacity style={styles.detailVoicePlayBtn} onPress={() => handlePlayVoice(rec.uri, `voice-${idx}`)}>
                  <Text style={{ fontSize: 16 }}>{playingIdx === `voice-${idx}` ? "⏸" : "▶️"}</Text>
                </TouchableOpacity>
                <Text style={[T.small, { color: CLight.gray700, flex: 1 }]}>
                  {t("noteDetail.voice_label", { index: idx + 1 })} · {formatDuration(rec.duration)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Audio Files */}
        {noteAudioFiles.length > 0 && (
          <View style={styles.mediaSection}>
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
              {t("noteDetail.audio_files")} ({noteAudioFiles.length})
            </Text>
            {noteAudioFiles.map((file, idx) => (
              <View key={idx} style={styles.detailVoiceItem}>
                <TouchableOpacity style={styles.detailAudioPlayBtn} onPress={() => handlePlayVoice(file.uri, `audio-${idx}`)}>
                  <Text style={{ fontSize: 16 }}>{playingIdx === `audio-${idx}` ? "⏸" : "▶️"}</Text>
                </TouchableOpacity>
                <Text style={[T.small, { color: CLight.gray700, flex: 1 }]} numberOfLines={1}>
                  🎵 {file.name}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* PDF Files */}
        {notePdfFiles.length > 0 && (
          <View style={styles.mediaSection}>
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
              {t("noteDetail.attached_documents")} ({notePdfFiles.length})
            </Text>
            {notePdfFiles.map((file, idx) => (
              <View key={idx} style={styles.detailVoiceItem}>
                <View style={styles.detailPdfIcon}>
                  <Text style={{ fontSize: 16 }}>📄</Text>
                </View>
                <Text style={[T.small, { color: CLight.gray700, flex: 1 }]} numberOfLines={1}>
                  {file.name}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  // ─── AI Analysis Tab ───
  function renderAITab() {
    const videoProgressText = videoAiProgress.message || t("noteDetail.video_preparing");
    const videoPercent = videoAiProgress.percent || 0;

    return (
      <View style={styles.tabContent}>
        {/* 지난 연습 — 직전 노트가 기기에 남아 있을 때만 */}
        {previousNote ? (
          <View style={styles.prevCard}>
            <Text style={[T.captionBold, { color: CLight.gray700 }]}>{t("focus.previous_title")}</Text>
            <Text style={[T.small, { color: CLight.gray500, marginTop: 2 }]} numberOfLines={1}>
              {previousNote.title} · {timeAgo(previousNote.createdAt)}
            </Text>
            {previousNote.chosenFocus ? (
              <Text style={[T.small, { color: CLight.pink, marginTop: 8 }]}>
                {t("focus.previous_focus")}: {previousNote.chosenFocus}
              </Text>
            ) : null}
            {focusSummary(previousNote.aiComment || previousNote.videoAnalysis || "", 200) ? (
              <Text style={[T.small, { color: CLight.gray700, marginTop: 6 }]}>
                {focusSummary(previousNote.aiComment || previousNote.videoAnalysis || "", 200)}
              </Text>
            ) : null}
            {note.aiScores && previousNote.aiScores ? (
              <>
                <Text style={[T.micro, { color: CLight.gray500, marginTop: 10 }]}>{t("focus.score_delta")}</Text>
                <Text style={[T.small, { color: CLight.gray700, marginTop: 2 }]}>
                  {["technique", "expression", "creativity", "consistency", "growth"]
                    .map((k) => {
                      const d = (note.aiScores[k] || 0) - (previousNote.aiScores[k] || 0);
                      return `${t("focus.axis_" + k)} ${d > 0 ? "+" : ""}${d}`;
                    })
                    .join(" · ")}
                </Text>
              </>
            ) : null}
          </View>
        ) : null}

        {/* Text AI Analysis */}
        {aiLoading ? (
          streamingText ? (
            // 스트리밍 도착분 실시간 표시
            <View style={styles.aiCard}>
              <View style={styles.aiCardHeader}>
                <Text style={styles.aiIcon}>{"🤖"}</Text>
                <Text style={[T.captionBold, { color: CLight.pink }]}>{t("noteDetail.ai_result")}</Text>
                <ActivityIndicator size="small" color={CLight.pink} style={{ marginLeft: 8 }} />
              </View>
              <View style={styles.aiDivider} />
              <Text style={[T.body, { color: CLight.gray900 }]}>{streamingText}</Text>
            </View>
          ) : (
            <View style={styles.aiLoadingContainer}>
              <ActivityIndicator size="large" color={CLight.pink} />
              <Text style={[T.caption, { color: CLight.gray500, marginTop: 16 }]}>
                {t("noteDetail.ai_analyzing")}
              </Text>
            </View>
          )
        ) : note.aiComment ? (
          <View style={styles.aiCard}>
            <View style={styles.aiCardHeader}>
              <Text style={styles.aiIcon}>{"\uD83E\uDD16"}</Text>
              <Text style={[T.captionBold, { color: CLight.pink }]}>{t("noteDetail.ai_result")}</Text>
            </View>
            <View style={styles.aiDivider} />
            <Text style={[T.body, { color: CLight.gray900 }]}>{note.aiComment}</Text>
            <FocusPicker
              title={t("focus.pick_title")}
              options={note.focusOptions}
              value={note.chosenFocus}
              onSelect={handleChooseFocus}
            />
            {note.chosenFocus ? (
              <TouchableOpacity style={styles.repracticeBtn} onPress={handleRepractice} activeOpacity={0.85}>
                <Text style={[T.smallBold, { color: CLight.white }]}>{t("focus.repractice_cta")}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.aiActionRow}>
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareFeedback} disabled={sharing}>
                {sharing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[T.smallBold, { color: "#fff" }]}>{t("noteDetail.share_cta")}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.reAnalyzeBtn} onPress={handleRequestAI}>
                <Text style={[T.smallBold, { color: CLight.pink }]}>{t("noteDetail.ai_reanalyze")}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.aiFeedbackRow}>
              <Text style={[T.small, { color: CLight.gray500 }]}>{t("noteDetail.ai_feedback_question")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={styles.aiFeedbackBtn} onPress={() => {
                  fetch(`${SERVER_URL}/api/report`, {
                    method: "POST", headers: getApiHeaders(),
                    body: JSON.stringify({ type: "ai_feedback", rating: "good", noteField: note.field, noteId: note.id, sentAt: new Date().toISOString() }),
                  }).catch(() => {});
                  // \uAD6C\uC870\uD654 \uD3C9\uAC00 \uC800\uC7A5 (\uD559\uC2B5 \uB370\uC774\uD130 \uB77C\uBCA8 \u2014 feedback_ratings \uD14C\uC774\uBE14)
                  rateFeedback({ noteLocalId: note.id, kind: "text", rating: "up", aiModel: note.aiModel, promptVersion: note.promptVersion });
                  showToast(t("noteDetail.ai_feedback_thanks"), "success");
                }}>
                  <Text style={{ fontSize: 18 }}>{"\uD83D\uDC4D"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.aiFeedbackBtn} onPress={() => {
                  setFeedbackKind("text");
                  setFeedbackText("");
                  setFeedbackModalVisible(true);
                }}>
                  <Text style={{ fontSize: 18 }}>{"\uD83D\uDC4E"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.aiEmptyContainer}>
            <Text style={styles.aiEmptyIcon}>{"\uD83E\uDDE0"}</Text>
            <Text style={[T.title, { color: CLight.gray900, marginTop: 12, textAlign: "center" }]}>
              {t("noteDetail.ai_empty_title")}
            </Text>
            <Text
              style={[
                T.caption,
                { color: CLight.gray500, marginTop: 6, textAlign: "center", paddingHorizontal: 20 },
              ]}
            >
              {t("noteDetail.ai_empty_desc")}
            </Text>
            <TouchableOpacity style={styles.requestAIBtn} onPress={handleRequestAI}>
              <Text style={[T.bodyBold, { color: CLight.white }]}>{t("noteDetail.ai_request")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Video AI Analysis */}
        {noteVideos.length > 0 && (
          <View style={styles.videoAiSection}>
            {videoAiLoading ? (
              <View style={styles.videoAiLoadingContainer}>
                <View style={{ width: "100%", height: 6, backgroundColor: "#007AFF15", borderRadius: 3, marginBottom: 12 }}>
                  <View style={{ width: `${videoPercent}%`, height: 6, backgroundColor: "#007AFF", borderRadius: 3 }} />
                </View>
                <Text style={[T.caption, { color: CLight.gray500 }]}>
                  {videoProgressText} ({videoPercent}%)
                </Text>
              </View>
            ) : note.videoAnalysis ? (
              <View style={styles.videoAiCard}>
                <View style={styles.videoAiCardHeader}>
                  <Text style={styles.aiIcon}>{"🎥"}</Text>
                  <Text style={[T.captionBold, { color: "#007AFF" }]}>{t("noteDetail.video_ai_result")}</Text>
                </View>
                <View style={styles.aiDivider} />
                <Text style={[T.body, { color: CLight.gray900 }]}>{note.videoAnalysis}</Text>
                <TouchableOpacity style={styles.videoReAnalyzeBtn} onPress={handleRequestVideoAI}>
                  <Text style={[T.smallBold, { color: "#007AFF" }]}>{t("noteDetail.video_ai_reanalyze")}</Text>
                </TouchableOpacity>
                <View style={styles.aiFeedbackRow}>
                  <Text style={[T.small, { color: CLight.gray500 }]}>{t("noteDetail.ai_feedback_question")}</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity style={styles.aiFeedbackBtn} onPress={() => {
                      rateFeedback({ noteLocalId: note.id, kind: "video", rating: "up", aiModel: note.aiModel, promptVersion: note.promptVersion });
                      showToast(t("noteDetail.ai_feedback_thanks"), "success");
                    }}>
                      <Text style={{ fontSize: 18 }}>{"👍"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.aiFeedbackBtn} onPress={() => {
                      setFeedbackKind("video");
                      setFeedbackText("");
                      setFeedbackModalVisible(true);
                    }}>
                      <Text style={{ fontSize: 18 }}>{"👎"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <>
                <TouchableOpacity style={styles.videoAiBtn} onPress={handleRequestVideoAI}>
                  <Text style={[T.bodyBold, { color: CLight.white }]}>{t("noteDetail.video_ai_request")}</Text>
                </TouchableOpacity>
                <Text style={[T.micro, { color: CLight.gray400, textAlign: "center", marginTop: 8 }]}>
                  {t("noteDetail.video_ai_recommend")}
                </Text>
              </>
            )}
          </View>
        )}
      </View>
    );
  }

  // ─── Related Notes Tab ───
  function renderRelatedTab() {
    return (
      <View style={styles.tabContent}>
        {relatedNotes.length === 0 ? (
          <View style={styles.relatedEmpty}>
            <Text style={styles.relatedEmptyIcon}>{"\uD83D\uDD17"}</Text>
            <Text style={[T.title, { color: CLight.gray900, marginTop: 12, textAlign: "center" }]}>
              {t("noteDetail.no_related")}
            </Text>
            <Text style={[T.caption, { color: CLight.gray500, marginTop: 6, textAlign: "center" }]}>
              {t("noteDetail.no_related_desc")}
            </Text>
          </View>
        ) : (
          relatedNotes.map(({ note: rNote, score }) => {
            const rFieldColor = FIELD_COLORS[rNote.field] || CLight.gray500;
            const rFieldEmoji = FIELD_EMOJIS[rNote.field] || "\uD83D\uDCDD";
            const rFieldLabel = t("fields." + (rNote.field || "etc"));
            return (
              <TouchableOpacity
                key={rNote.id}
                style={styles.relatedCard}
                onPress={() => handleRelatedNotePress(rNote.id)}
                activeOpacity={0.7}
              >
                <View style={styles.relatedCardTop}>
                  <View style={[styles.relatedFieldPill, { backgroundColor: `${rFieldColor}15` }]}>
                    <Text style={[T.micro, { color: rFieldColor }]}>
                      {rFieldEmoji} {rFieldLabel}
                    </Text>
                  </View>
                  <View style={styles.scoreIndicator}>
                    <View
                      style={[
                        styles.scoreDot,
                        {
                          backgroundColor:
                            score >= 5 ? CLight.green : score >= 3 ? CLight.orange : CLight.gray300,
                        },
                      ]}
                    />
                    <Text style={[T.tiny, { color: CLight.gray400, marginLeft: 4 }]}>
                      {score >= 5 ? t("noteDetail.high_related") : score >= 3 ? t("noteDetail.medium_related") : t("noteDetail.low_related")}
                    </Text>
                  </View>
                </View>
                <Text style={[T.bodyBold, { color: CLight.gray900, marginTop: 8 }]} numberOfLines={2}>
                  {rNote.title}
                </Text>
                <Text style={[T.small, { color: CLight.gray500, marginTop: 4 }]} numberOfLines={2}>
                  {rNote.content}
                </Text>
                <Text style={[T.micro, { color: CLight.gray400, marginTop: 8 }]}>
                  {timeAgo(rNote.createdAt)}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    );
  }
}

// ─── Constants ───

const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

// ─── Styles ───

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CLight.bg,
  },

  // Empty / Not found
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyIcon: { fontSize: 48 },
  backButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: CLight.pinkSoft,
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
  topBarActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  topBarTextBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: CLight.gray100,
  },
  saveBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: CLight.pink,
  },

  // ScrollView
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  // Header
  header: {
    padding: 20,
    backgroundColor: CLight.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CLight.gray200,
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  titleInput: {
    color: CLight.gray900,
    marginTop: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: CLight.pink,
    paddingBottom: 4,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 6,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: CLight.pinkSoft,
  },

  // Tab Bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: CLight.white,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CLight.gray200,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: CLight.pink,
  },

  // Tab Content
  tabContent: {
    padding: 16,
  },

  // Content Tab
  contentCard: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  contentInput: {
    color: CLight.gray900,
    minHeight: 200,
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: CLight.pink,
  },

  // AI Tab
  aiLoadingContainer: {
    alignItems: "center",
    paddingVertical: 60,
  },
  prevCard: {
    backgroundColor: CLight.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CLight.gray200,
  },
  repracticeBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: CLight.pink,
  },
  aiCard: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: `${CLight.pink}20`,
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  aiCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aiIcon: { fontSize: 22 },
  aiDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: CLight.gray200,
    marginVertical: 14,
  },
  aiActionRow: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  shareBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: CLight.pink,
    minWidth: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  reAnalyzeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: CLight.pinkSoft,
  },
  offscreen: {
    position: "absolute",
    left: -10000,
    top: 0,
  },
  aiFeedbackRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: CLight.gray200,
  },
  aiFeedbackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CLight.gray100,
    justifyContent: "center",
    alignItems: "center",
  },
  aiEmptyContainer: {
    alignItems: "center",
    paddingVertical: 50,
  },
  aiEmptyIcon: { fontSize: 48 },
  requestAIBtn: {
    marginTop: 24,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: CLight.pink,
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },

  // Video AI Analysis
  videoAiSection: {
    marginTop: 20,
  },
  videoAiLoadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
    backgroundColor: CLight.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#007AFF20",
  },
  videoAiCard: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#007AFF30",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  videoAiCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  videoReAnalyzeBtn: {
    marginTop: 16,
    alignSelf: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "#007AFF15",
  },
  videoAiBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: "#007AFF",
    alignItems: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },

  // Related Notes Tab
  relatedEmpty: {
    alignItems: "center",
    paddingVertical: 50,
  },
  relatedEmptyIcon: { fontSize: 48 },
  relatedCard: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  relatedCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  relatedFieldPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreIndicator: {
    flexDirection: "row",
    alignItems: "center",
  },
  scoreDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // ─── Media Display ───
  mediaSection: {
    marginTop: 16,
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  detailThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 10,
    backgroundColor: CLight.gray100,
  },
  detailVideoWrap: {
    width: 100,
    height: 100,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: CLight.gray100,
  },
  detailVoiceItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CLight.gray200,
  },
  detailVoicePlayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: CLight.pinkSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  detailAudioPlayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#E8F4FD",
    justifyContent: "center",
    alignItems: "center",
  },
  detailPdfIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFF3E0",
    justifyContent: "center",
    alignItems: "center",
  },
  feedbackModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  feedbackModalBox: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 360,
  },
  feedbackModalInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: "top",
    color: "#111",
  },
  feedbackModalBtns: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 16,
    gap: 10,
  },
  feedbackModalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  feedbackModalSubmitBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: CLight.pink,
    borderRadius: 8,
  },
});
