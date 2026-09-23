import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Audio } from "expo-av";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as FileSystem from "expo-file-system/legacy";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";
import { analyzeNote, analyzeVideoFrames, lastAiMeta, buildPreviousContext } from "../services/aiService";
import { incrementDailyAICount, shouldShowInterstitial, showInterstitialAd, showRewardedAd } from "../services/adService";
import { FIELDS } from "../utils/helpers";
import { hasAskedReminder, markReminderAsked, scheduleDailyPracticeReminder } from "../services/reminderService";
import { trackFunnelEvent } from "../services/mauService";
import { saveDraft, clearDraft, hasDraftContent } from "../services/noteDraft";
import { startPractice, resumePractice, completePractice, aiFeedbackDone } from "../services/practiceService";
import TopBar from "../components/TopBar";
import FocusPicker from "../components/FocusPicker";
import { useTranslation } from "react-i18next";

// 게스트 가입 유도는 기기당 딱 1회 (리마인더 플래그와 같은 방식)
const SIGNUP_NUDGE_KEY = "artlink-signup-nudge-asked";
async function hasAskedSignupNudge() {
  try {
    return (await AsyncStorage.getItem(SIGNUP_NUDGE_KEY)) === "true";
  } catch {
    return false;
  }
}
async function markSignupNudgeAsked() {
  try {
    await AsyncStorage.setItem(SIGNUP_NUDGE_KEY, "true");
  } catch {}
}

export default function NoteCreateScreen({ navigation, route }) {
  const { t, i18n } = useTranslation();
  const { handleSaveNote, savedNotes, userProfile, aiDisclosureAccepted, handleAcceptAIDisclosure, isKoreanLocale, setAuthState, premium } = useApp();

  // 초안 보관용 — 렌더마다 최신 상태를 담아두고, 인증 화면으로 떠날 때 그대로 저장한다
  const draftStateRef = useRef({});

  // 인증 화면으로 가면 NoteCreate가 언마운트된다 → 초안을 확실히 보관한 뒤에만 전환
  const goToAuthWithDraft = useCallback(async () => {
    // 보관할 내용이 없으면 그냥 이동 (잃을 것이 없다)
    if (!hasDraftContent(draftStateRef.current)) {
      setAuthState("auth");
      return;
    }
    const ok = await saveDraft(draftStateRef.current);
    if (!ok) {
      Alert.alert(t("noteCreate.draft_keep_failed"), t("noteCreate.draft_keep_failed_msg"));
      return;
    }
    setAuthState("auth");
  }, [setAuthState, t]);

  // 화면이 이미 사라진 뒤(분석 중 뒤로가기 등)에는 알림·상태 변경을 하지 않는다 —
  // 다른 화면 위에 엉뚱한 실패·한도 안내가 뜨던 문제.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const safeAlert = useCallback((...args) => {
    if (isMountedRef.current) Alert.alert(...args);
  }, []);

  // AI 쿼터 소진: 게스트→로그인 유도, 무료 로그인 유저→프리미엄 안내,
  // 프리미엄 유저→이미 프리미엄이므로 "프리미엄 보기"가 아니라 남은 한도 안내를 보여준다.
  const promptQuotaExceeded = useCallback((kind = "video", info = {}) => {
    if (!userProfile?.authUserId) {
      safeAlert(t("premium.guest_trial_title"), t("premium.guest_trial_msg"), [
        { text: t("premium.guest_trial_cta"), onPress: goToAuthWithDraft },
        { text: t("common.cancel") || "OK", style: "cancel" },
      ]);
    } else if (premium?.active) {
      const max = info.max ?? (kind === "text" ? 10 : 15);
      const key = kind === "text" ? "premium.limit_text_reached" : "premium.limit_video_reached";
      safeAlert(t("premium.active_title"), t(key, { max }));
    } else {
      // 글 피드백 한도와 영상 분석 한도는 문구가 다르다 (횟수·주기가 다름)
      const quotaKey = kind === "text" ? "common.text_quota_exceeded" : "common.video_quota_exceeded";
      safeAlert(t(quotaKey), "", [
        { text: t("premium.quota_cta"), onPress: () => navigation.navigate("Subscription") },
        { text: t("common.cancel") || "OK", style: "cancel" },
      ]);
    }
  }, [userProfile?.authUserId, premium?.active, goToAuthWithDraft, navigation, t, safeAlert]);

  // 딥링크 프리필 (artlink://practice — 비움스튜디오 대본 등)
  const prefill = route?.params?.prefill || null;
  // 가입 왕복 후 복원으로 열린 경우 (App.js가 보관된 초안을 prefill로 넘긴다)
  const restoredDraft = !!route?.params?.restoredDraft;
  const [title, setTitle] = useState(prefill?.title || "");
  const [content, setContent] = useState(prefill?.content || "");
  const [field, setField] = useState(prefill?.field && FIELDS.includes(prefill.field) ? prefill.field : FIELDS[0]);
  // 사용자가 제목을 한 번이라도 편집했으면 기본 제목으로 덮어쓰지 않는다
  const titleEditedRef = useRef(!!prefill?.title);
  const [tags, setTags] = useState(Array.isArray(prefill?.tags) ? prefill.tags : []);
  const [tagInput, setTagInput] = useState("");
  const [seriesName, setSeriesName] = useState(prefill?.seriesName || "");
  const [aiComment, setAiComment] = useState(prefill?.aiComment || "");
  const [aiScores, setAiScores] = useState(prefill?.aiScores || null);
  // 재연습 체인 — 이번 연습의 초점(focus), 어느 장면·어느 노트의 재연습인지 (기기 로컬 노트에만 저장)
  const focus = prefill?.focus || null;
  const sceneId = prefill?.sceneId || null;
  const parentNoteId = prefill?.parentNoteId || null;
  const rootNoteId = prefill?.rootNoteId || prefill?.parentNoteId || null;
  const parentNote = useMemo(
    () => (parentNoteId ? savedNotes.find((n) => n.id === parentNoteId) || null : null),
    [savedNotes, parentNoteId]
  );
  // AI가 준 "다음에 고칠 점" 후보와 이번에 고른 값
  const [focusOptions, setFocusOptions] = useState(Array.isArray(prefill?.focusOptions) ? prefill.focusOptions : []);
  const [chosenFocus, setChosenFocus] = useState(prefill?.chosenFocus ?? null);
  // 스트리밍 실패 시 잘린 부분 텍스트가 aiComment에 남지 않도록,
  // 분석 시작 전 확정값을 기억해뒀다가 실패 시 복원한다.
  const aiCommentRef = useRef(aiComment);
  useEffect(() => {
    aiCommentRef.current = aiComment;
  }, [aiComment]);
  const [aiLoading, setAiLoading] = useState(false);
  const [videoAnalysis, setVideoAnalysis] = useState(prefill?.videoAnalysis || "");
  const [videoAiLoading, setVideoAiLoading] = useState(false);
  const [videoAiProgress, setVideoAiProgress] = useState({ phase: "", percent: 0, message: "" });
  const hasUnsavedChangesRef = useRef(false);

  // Media state
  const [images, setImages] = useState(Array.isArray(prefill?.images) ? prefill.images : []); // [{ uri, type, width, height }]
  const [voiceRecordings, setVoiceRecordings] = useState(Array.isArray(prefill?.voiceRecordings) ? prefill.voiceRecordings : []); // [{ uri, duration }]
  const [audioFiles, setAudioFiles] = useState(Array.isArray(prefill?.audioFiles) ? prefill.audioFiles : []); // [{ uri, name, duration }]
  const [pdfFiles, setPdfFiles] = useState(Array.isArray(prefill?.pdfFiles) ? prefill.pdfFiles : []); // [{ uri, name }]

  const applyPrefill = useCallback((p) => {
    if (p.title) setTitle(p.title);
    if (p.content) setContent(p.content);
    if (p.field && FIELDS.includes(p.field)) setField(p.field);
    if (Array.isArray(p.tags) && p.tags.length > 0) setTags(p.tags);
    if (p.seriesName) setSeriesName(p.seriesName);
    if (p.aiComment) setAiComment(p.aiComment);
    if (p.aiScores) setAiScores(p.aiScores);
    if (p.videoAnalysis) setVideoAnalysis(p.videoAnalysis);
    if (Array.isArray(p.images) && p.images.length > 0) setImages(p.images);
    if (Array.isArray(p.voiceRecordings) && p.voiceRecordings.length > 0) setVoiceRecordings(p.voiceRecordings);
    if (Array.isArray(p.audioFiles) && p.audioFiles.length > 0) setAudioFiles(p.audioFiles);
    if (Array.isArray(p.pdfFiles) && p.pdfFiles.length > 0) setPdfFiles(p.pdfFiles);
    if (p.title) titleEditedRef.current = true;
  }, []);

  // 화면이 이미 떠 있는 상태에서 새 딥링크/복원 prefill이 오면 params만 갱신됨 → 반영.
  // 단, 이미 쓰고 있던 내용이 있으면 말없이 덮어쓰지 않고 먼저 물어본다.
  const appliedPrefillRef = useRef(route?.params?.prefill || null);
  useEffect(() => {
    const p = route?.params?.prefill;
    if (!p || p === appliedPrefillRef.current) return; // 마운트 때 쓴 최초 prefill은 이미 반영됨
    appliedPrefillRef.current = p;
    const hasWork = !!title.trim() || !!content.trim() || hasAttachments;
    if (!hasWork) {
      applyPrefill(p);
      return;
    }
    Alert.alert(
      t("noteCreate.replace_with_new_title"),
      t("noteCreate.replace_with_new_message"),
      [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.confirm"), onPress: () => applyPrefill(p) },
      ]
    );
  }, [route?.params?.prefill]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const [playingSound, setPlayingSound] = useState(null);
  const [playingIdx, setPlayingIdx] = useState(null);
  // 언마운트 cleanup은 []로 걸려 있어 최초 렌더의 playingSound(null)만 본다 →
  // ref로 최신 재생 객체를 따라가야 화면을 나갈 때 소리가 실제로 멈춘다.
  const playingSoundRef = useRef(null);
  useEffect(() => {
    playingSoundRef.current = playingSound;
  }, [playingSound]);

  // Recording blink animation
  const recordBlink = useRef(new Animated.Value(1)).current;

  // Shimmer animation for AI loading
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (aiLoading) {
      Animated.loop(
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      shimmerAnim.setValue(0);
    }
  }, [aiLoading, shimmerAnim]);

  // Recording blink animation
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordBlink, { toValue: 0.2, duration: 500, useNativeDriver: true }),
          Animated.timing(recordBlink, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      recordBlink.setValue(1);
    }
  }, [isRecording, recordBlink]);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (playingSoundRef.current) {
        playingSoundRef.current.unloadAsync?.();
        playingSoundRef.current = null;
      }
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  // Track unsaved changes
  useEffect(() => {
    if (restoredDraft || title || content || tags.length > 0 || seriesName || aiComment || videoAnalysis || images.length > 0 || voiceRecordings.length > 0 || audioFiles.length > 0 || pdfFiles.length > 0) {
      hasUnsavedChangesRef.current = true;
    }
  }, [restoredDraft, title, content, tags, seriesName, aiComment, videoAnalysis, images, voiceRecordings, audioFiles, pdfFiles]);

  // 저장 가능 여부 판단 재료 — 글이 없어도 첨부나 분석 결과가 있으면 기록으로 남긴다
  const hasAttachments = images.length > 0 || voiceRecordings.length > 0 || audioFiles.length > 0 || pdfFiles.length > 0;
  const hasAiResult = !!aiComment || !!videoAnalysis;

  // 첨부·분석이 생기는 순간 제목이 비어 있으면 기본 제목을 넣어준다 (입력란에 보이므로 바로 고칠 수 있다)
  useEffect(() => {
    if (titleEditedRef.current || title.trim()) return;
    if (!hasAttachments && !hasAiResult) return;
    const d = new Date();
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setTitle(`${t("fields." + field)} ${ymd}`);
  }, [hasAttachments, hasAiResult, title, field, t]);

  // 연습 세션 — 이 화면 한 번이 연습 한 번. 초안 복원이면 새로 만들지 않고 이어받는다.
  // 재연습·2인 대사에서 왔으면 "같은 장면/같은 연습"으로 묶이도록 subjectKey를 고정한다
  // (장면 id > 체인의 최초 노트 id > 직전 노트 id). 없으면 저장 시 노트 id로 채운다.
  const practiceSubjectKey = sceneId || rootNoteId || parentNoteId || null;
  const practiceRef = useRef(null);
  // 초안 복원·2인 대사에서 넘어온 세션은 그대로 이어받는다 (계측용 객체 생성뿐 — 이벤트는 안 보낸다)
  const keptSessionId = route?.params?.prefill?.sessionId || null;
  if (!practiceRef.current && keptSessionId) {
    practiceRef.current = resumePractice(keptSessionId, "text", practiceSubjectKey, field);
  }
  // 화면을 열기만 한 건 연습이 아니다 — 사용자가 내용을 넣거나 분석·저장을 누를 때 세션을 시작한다
  const ensurePracticeSession = useCallback(() => {
    if (!practiceRef.current) {
      practiceRef.current = startPractice("text", practiceSubjectKey, field);
    }
    return practiceRef.current;
  }, [practiceSubjectKey, field]);

  // 첫 입력이 곧 연습 시작
  const handleChangeTitle = useCallback((v) => {
    titleEditedRef.current = true;
    if (v.trim()) ensurePracticeSession();
    setTitle(v);
  }, [ensurePracticeSession]);
  const handleChangeContent = useCallback((v) => {
    if (v.trim()) ensurePracticeSession();
    setContent(v);
  }, [ensurePracticeSession]);

  useEffect(() => {
    if (practiceRef.current) practiceRef.current.field = field;
  }, [field]);

  draftStateRef.current = { title, content, field, tags, seriesName, aiComment, aiScores, videoAnalysis, images, voiceRecordings, audioFiles, pdfFiles, sessionId: practiceRef.current?.sessionId, sceneId, parentNoteId, rootNoteId, focus, chosenFocus, focusOptions };

  // Handle back with unsaved changes warning
  const handleCancel = useCallback(() => {
    if (savingRef.current) return;
    if (hasUnsavedChangesRef.current) {
      Alert.alert(
        t("common.discard_title"),
        t("common.discard_message"),
        [
          { text: t("common.keep_editing"), style: "cancel" },
          { text: t("common.leave"), style: "destructive", onPress: () => { hasUnsavedChangesRef.current = false; clearDraft(); navigation.goBack(); } },
        ]
      );
    } else {
      navigation.goBack();
    }
  }, [navigation, t]);

  // Intercept hardware back / navigation gesture
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
      if (savingRef.current) { e.preventDefault(); return; }
      if (!hasUnsavedChangesRef.current) return;
      e.preventDefault();
      Alert.alert(
        t("common.discard_title"),
        t("common.discard_message"),
        [
          { text: t("common.keep_editing"), style: "cancel" },
          {
            text: t("common.leave"),
            style: "destructive",
            onPress: () => { clearDraft(); navigation.dispatch(e.data.action); },
          },
        ]
      );
    });
    return unsubscribe;
  }, [navigation]);

  // Add tag
  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim().replace(/^#/, "");
    if (!trimmed) return;
    if (tags.includes(trimmed)) {
      setTagInput("");
      return;
    }
    setTags((prev) => [...prev, trimmed]);
    setTagInput("");
  }, [tagInput, tags]);

  // Remove tag
  const handleRemoveTag = useCallback((tagToRemove) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  }, []);

  // AI Analysis
  const runAnalyze = useCallback(async () => {
    setAiLoading(true);
    const previousComment = aiCommentRef.current;
    try {
      // Foreign users: show interstitial ad from 2nd AI use per day (프리미엄은 광고 없음)
      if (!isKoreanLocale && !premium?.active) {
        const count = await incrementDailyAICount();
        if (shouldShowInterstitial(isKoreanLocale, count)) {
          await showInterstitialAd();
        }
      }
      // 스트리밍: 도착하는 대로 실시간 표시 (체감 대기 감소)
      const result = await analyzeNote(
        field, content, savedNotes,
        { title, field, images, voiceRecordings, audioFiles, pdfFiles },
        userProfile,
        (partial) => setAiComment(partial),
        { focus, previous: buildPreviousContext(parentNote) }
      );
      if (!isMountedRef.current) return; // 화면을 나갔으면 결과를 반영하지 않는다
      setAiComment(result.analysis || result);
      if (result.scores) setAiScores(result.scores);
      const newOptions = result.focusOptions || [];
      setFocusOptions(newOptions);
      // 재분석이면 옛 선택이 새 후보에 없을 수 있다 — 남겨두면 엉뚱한 초점으로 재연습하게 된다
      setChosenFocus((prev) => (prev && newOptions.includes(prev) ? prev : null));
      trackFunnelEvent("ai_feedback_done", i18n.language);
      aiFeedbackDone(practiceRef.current, "text");
      maybeOfferReminder();
    } catch (e) {
      if (!isMountedRef.current) return;
      // 스트리밍 도중 실패 시 잘린 부분 텍스트가 남지 않도록 실패 이전 값으로 복원
      setAiComment(previousComment);
      if (e?.message === "AI_QUOTA") promptQuotaExceeded("text", { max: e.quotaMax, used: e.quotaUsed });
      else safeAlert(t("noteCreate.ai_failed"), t(e?.message === "AI_AUDIO_INCOMPLETE" ? "common.audio_analysis_failed" : "noteCreate.ai_failed_msg"));
    } finally {
      if (isMountedRef.current) setAiLoading(false);
    }
  }, [content, field, savedNotes, title, images, voiceRecordings, audioFiles, pdfFiles, userProfile, isKoreanLocale, premium?.active, t, i18n.language, promptQuotaExceeded, focus, parentNote, safeAlert]);

  // 첫 AI 피드백 직후 딱 한 번 — 게스트는 가입 유도, 로그인 유저는 연습 알림 제안 (Calm 패턴)
  const maybeOfferReminder = useCallback(async () => {
    try {
      if (!userProfile?.authUserId) {
        if (await hasAskedSignupNudge()) return;
        if (!isMountedRef.current) return;
        await markSignupNudgeAsked();
        trackFunnelEvent("signup_nudge_shown", i18n.language);
        safeAlert(
          t("signupNudge.title"),
          t("signupNudge.msg"),
          [
            { text: t("signupNudge.later"), style: "cancel" },
            {
              text: t("signupNudge.cta"),
              onPress: async () => {
                trackFunnelEvent("signup_nudge_tapped", i18n.language);
                await goToAuthWithDraft();
              },
            },
          ]
        );
        return;
      }
      if (await hasAskedReminder()) return;
      if (!isMountedRef.current) return;
      await markReminderAsked();
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const hh = `${hour}`.padStart(2, "0");
      const mm = `${minute}`.padStart(2, "0");
      safeAlert(
        t("reminder.offer_title"),
        t("reminder.offer_msg", { time: `${hh}:${mm}` }),
        [
          { text: t("reminder.offer_no"), style: "cancel" },
          {
            text: t("reminder.offer_yes"),
            onPress: async () => {
              const ok = await scheduleDailyPracticeReminder(
                hour, minute,
                t("reminder.push_title"),
                t("reminder.push_body")
              );
              if (ok) trackFunnelEvent("reminder_set");
            },
          },
        ]
      );
    } catch {}
  }, [t, i18n.language, userProfile?.authUserId, goToAuthWithDraft, safeAlert]);

  const handleAnalyze = useCallback(async () => {
    // 글이 없어도 녹음·오디오·문서·사진이 있으면 글 분석의 재료가 있다 (2인 대사 녹음 등).
    // 영상은 글 분석에 실리지 않으므로(영상 AI 분석이 따로 있음) 영상만 있을 때는 막는다 — 빈 분석으로 횟수만 쓰게 된다.
    const hasTextMaterial =
      voiceRecordings.length > 0 || audioFiles.length > 0 || pdfFiles.length > 0 ||
      images.some((i) => i.type !== "video");
    if (!content.trim() && !hasTextMaterial) {
      Alert.alert(t("noteCreate.ai_content_required"), t("noteCreate.ai_content_required_msg"));
      return;
    }
    ensurePracticeSession(); // AI 분석 요청 = 연습 시작
    if (!aiDisclosureAccepted) {
      Alert.alert(
        t("aiDisclosure.title"),
        t("aiDisclosure.message"),
        [
          { text: t("aiDisclosure.cancel"), style: "cancel" },
          { text: t("aiDisclosure.accept"), onPress: () => { handleAcceptAIDisclosure(); runAnalyze(); } },
        ]
      );
      return;
    }
    runAnalyze();
  }, [content, voiceRecordings, audioFiles, pdfFiles, images, aiDisclosureAccepted, handleAcceptAIDisclosure, runAnalyze, t, ensurePracticeSession]);

  // Video AI Analysis
  const noteVideos = images.filter((i) => i.type === "video");

  const runVideoAnalyzeFlow = useCallback(async () => {
    if (noteVideos.length === 0) {
      Alert.alert(t("noteCreate.video_required"), t("noteCreate.video_required_msg"));
      return;
    }
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
    // Foreign users: must watch rewarded ad before video AI (프리미엄은 광고 없이 바로 분석)
    if (!isKoreanLocale && !premium?.active) {
      const rewarded = await showRewardedAd();
      if (!rewarded) {
        Alert.alert(t("common.error"), t("ads.rewarded_required"));
        return;
      }
    }
    startVideoAnalysis();
  }, [noteVideos, field, content, title, userProfile, isKoreanLocale, premium?.active, t]);

  const handleVideoAnalyze = useCallback(async () => {
    ensurePracticeSession(); // 영상 AI 분석 요청 = 연습 시작
    if (!aiDisclosureAccepted) {
      Alert.alert(
        t("aiDisclosure.title"),
        t("aiDisclosure.message"),
        [
          { text: t("aiDisclosure.cancel"), style: "cancel" },
          { text: t("aiDisclosure.accept"), onPress: () => { handleAcceptAIDisclosure(); runVideoAnalyzeFlow(); } },
        ]
      );
      return;
    }
    runVideoAnalyzeFlow();
  }, [aiDisclosureAccepted, handleAcceptAIDisclosure, runVideoAnalyzeFlow, t, ensurePracticeSession]);

  // 재시도 버튼에서 자신을 다시 부르기 위한 참조 (useCallback 자기참조 회피)
  const startVideoAnalysisRef = useRef(null);

  const startVideoAnalysis = useCallback(async () => {
    setVideoAiLoading(true);
    setVideoAiProgress({ phase: "extracting", percent: 0, message: t("noteCreate.preparing") });
    try {
      const result = await analyzeVideoFrames(
        field,
        content,
        title,
        noteVideos,
        userProfile,
        (progress) => setVideoAiProgress(progress),
        { focus, previous: buildPreviousContext(parentNote) }
      );
      if (!isMountedRef.current) return; // 화면을 나갔으면 결과를 반영하지 않는다
      setVideoAnalysis(result);
      if (lastAiMeta.focusOptions?.length) {
        const newOptions = lastAiMeta.focusOptions;
        setFocusOptions(newOptions);
        // 재분석이면 옛 선택이 새 후보에 없을 수 있다
        setChosenFocus((prev) => (prev && newOptions.includes(prev) ? prev : null));
      }
      aiFeedbackDone(practiceRef.current, "video");
    } catch (e) {
      if (!isMountedRef.current) return;
      // 실패는 결과로 채우지 않는다 — 안내만 띄우고 재시도를 제안한다
      const quota = e?.videoAiReason === "QUOTA";
      if (quota) {
        promptQuotaExceeded("video", { max: e.quotaMax, used: e.quotaUsed }); // 게스트→로그인, 무료→프리미엄, 프리미엄→한도 안내
      } else {
        safeAlert(
          t("noteCreate.ai_failed"),
          t("common.video_ai_retry_msg"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("common.retry"), onPress: () => startVideoAnalysisRef.current?.() },
          ]
        );
      }
    } finally {
      if (isMountedRef.current) {
        setVideoAiLoading(false);
        setVideoAiProgress({ phase: "", percent: 0, message: "" });
      }
    }
  }, [noteVideos, field, content, title, userProfile, t, promptQuotaExceeded, focus, parentNote, safeAlert]);

  useEffect(() => {
    startVideoAnalysisRef.current = startVideoAnalysis;
  }, [startVideoAnalysis]);

  // ─── Media Handlers ───

  const handleTakePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("common.permission_required"), t("common.camera_permission"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      const mediaDir = FileSystem.documentDirectory + "media/";
      const dirInfo = await FileSystem.getInfoAsync(mediaDir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true });
      const ext = asset.uri.split(".").pop()?.split("?")[0] || "jpg";
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const destUri = mediaDir + fileName;
      ensurePracticeSession(); // 첫 첨부 = 연습 시작
      try {
        await FileSystem.copyAsync({ from: asset.uri, to: destUri });
        setImages((prev) => [...prev, { uri: destUri, type: "image", width: asset.width, height: asset.height }]);
      } catch {
        setImages((prev) => [...prev, { uri: asset.uri, type: "image", width: asset.width, height: asset.height }]);
      }
    }
  }, [ensurePracticeSession]);

  const handlePickMedia = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("common.permission_required"), t("common.gallery_permission"));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: false,
      quality: 0.8,
      videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality,
    });

    if (!result.canceled && result.assets?.length > 0) {
      const mediaDir = FileSystem.documentDirectory + "media/";
      const dirInfo = await FileSystem.getInfoAsync(mediaDir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true });

      const newItems = [];
      for (const asset of result.assets) {
        const isVideo = asset.type === "video";
        const ext = asset.uri.split(".").pop()?.split("?")[0] || (isVideo ? "mov" : "jpg");
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const destUri = mediaDir + fileName;
        let finalUri = asset.uri;
        try {
          await FileSystem.copyAsync({ from: asset.uri, to: destUri });
          finalUri = destUri;
        } catch (e) {
          console.warn("[handlePickMedia] copyAsync failed:", e.message, "using original URI");
        }
        // Generate thumbnail for videos
        let thumbnail = null;
        if (isVideo) {
          try {
            const thumb = await VideoThumbnails.getThumbnailAsync(finalUri, { time: 1000 });
            thumbnail = thumb.uri;
          } catch (e) {
            console.warn("[handlePickMedia] thumbnail failed:", e.message);
          }
        }
        newItems.push({ uri: finalUri, type: isVideo ? "video" : "image", width: asset.width, height: asset.height, duration: asset.duration, thumbnail });
      }
      ensurePracticeSession(); // 첫 첨부 = 연습 시작
      setImages((prev) => [...prev, ...newItems]);
    }
  }, [ensurePracticeSession]);

  const handleRemoveMedia = useCallback((index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleStartRecording = useCallback(async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(t("common.permission_required"), t("common.mic_permission"));
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (e) {
      Alert.alert(t("noteCreate.recording_error"), t("noteCreate.recording_error_msg"));
    }
  }, [t]);

  const handleStopRecording = useCallback(async () => {
    if (!recordingRef.current) return;
    try {
      clearInterval(recordingTimerRef.current);
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI();
      const finalDuration = recordingDuration;
      recordingRef.current = null;
      setIsRecording(false);
      if (uri) {
        ensurePracticeSession(); // 녹음 첨부 = 연습 시작
        setVoiceRecordings((prev) => [...prev, { uri, duration: finalDuration }]);
      }
    } catch (e) {
      setIsRecording(false);
    }
  }, [recordingDuration, ensurePracticeSession]);

  const handleRemoveRecording = useCallback((index) => {
    setVoiceRecordings((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handlePlayRecording = useCallback(async (uri, index) => {
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
      Alert.alert(t("noteCreate.playback_error"), t("noteCreate.voice_playback_error"));
    }
  }, [playingSound, playingIdx, t]);

  // ─── Audio File Handlers ───

  const handlePickAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        multiple: true,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const mediaDir = FileSystem.documentDirectory + "media/";
        const dirInfo = await FileSystem.getInfoAsync(mediaDir);
        if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true });

        const newFiles = [];
        for (const asset of result.assets) {
          const ext = asset.uri.split(".").pop()?.split("?")[0] || "mp3";
          const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const destUri = mediaDir + fileName;
          let finalUri = asset.uri;
          try {
            await FileSystem.copyAsync({ from: asset.uri, to: destUri });
            finalUri = destUri;
          } catch (e) {
            console.warn("[handlePickAudio] copyAsync failed:", e.message, "using original URI");
          }
          newFiles.push({ uri: finalUri, name: asset.name || t("noteCreate.audio_file") });
        }
        ensurePracticeSession(); // 첫 첨부 = 연습 시작
        setAudioFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (e) {
      Alert.alert(t("noteCreate.file_select_error"), t("noteCreate.audio_select_error"));
    }
  }, [t, ensurePracticeSession]);

  const handlePlayAudio = useCallback(async (uri, index) => {
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
      Alert.alert(t("noteCreate.playback_error"), t("noteCreate.audio_playback_error"));
    }
  }, [playingSound, playingIdx, t]);

  const handleRemoveAudio = useCallback((index) => {
    setAudioFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ─── PDF File Handlers ───

  const handlePickPdf = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "application/x-hwp", "application/haansofthwp"],
        multiple: true,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const hwpFiles = result.assets.filter(
          (a) => a.name?.toLowerCase().endsWith(".hwp")
        );
        const pdfs = result.assets.filter(
          (a) => !a.name?.toLowerCase().endsWith(".hwp")
        );

        if (hwpFiles.length > 0) {
          Alert.alert(
            t("noteCreate.hwp_unsupported"),
            t("noteCreate.hwp_unsupported_msg")
          );
        }

        if (pdfs.length > 0) {
          const newFiles = pdfs.map((asset) => ({
            uri: asset.uri,
            name: asset.name || `${t("noteCreate.document")}.pdf`,
          }));
          ensurePracticeSession(); // 첫 첨부 = 연습 시작
          setPdfFiles((prev) => [...prev, ...newFiles]);
        }
      }
    } catch (e) {
      Alert.alert(t("noteCreate.file_select_error"), t("noteCreate.document_select_error"));
    }
  }, [t, ensurePracticeSession]);

  const handleRemovePdf = useCallback((index) => {
    setPdfFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // AI 분석이 도는 중에는 저장을 막는다 — 반쪽 피드백이 노트로 굳어버린다
  const aiBusy = aiLoading || videoAiLoading;

  // Save note
  const savingRef = useRef(false); // 녹음 복사 중 저장 버튼 연타로 노트가 두 번 생기지 않게
  const handleSave = useCallback(async () => {
    if (aiBusy || savingRef.current) return;
    if (!title.trim()) {
      Alert.alert(t("noteCreate.title_required"), t("noteCreate.title_required_msg"));
      return;
    }
    // 글이 없어도 첨부(영상·음성·오디오·문서)나 분석 결과가 있으면 기록으로 남긴다.
    // 전부 비었을 때만 막는다 — 빈 노트는 만들지 않는다.
    if (!content.trim() && !hasAttachments && !hasAiResult) {
      Alert.alert(t("noteCreate.content_required"), t("noteCreate.content_required_msg"));
      return;
    }
    savingRef.current = true;
    try {
      // 녹음(자체 녹음·2인 대사)은 cache/Audio에 남아 OS가 캐시를 비우면 사라진다 — 저장 시 문서 폴더로 옮긴다.
      // 영구 복사가 실패하면 저장을 중단하고 원래 녹음과 초안을 화면에 보존한다.
      let savedVoiceRecordings = voiceRecordings;
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir && voiceRecordings.some((r) => r?.uri?.startsWith(cacheDir))) {
        try {
          const mediaDir = FileSystem.documentDirectory + "media/";
          const dirInfo = await FileSystem.getInfoAsync(mediaDir);
          if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true });
          savedVoiceRecordings = await Promise.all(voiceRecordings.map(async (rec) => {
            if (!rec?.uri?.startsWith(cacheDir)) return rec;
            const ext = rec.uri.split(".").pop()?.split("?")[0] || "m4a";
            const destUri = mediaDir + `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            try {
              await FileSystem.copyAsync({ from: rec.uri, to: destUri });
              return { ...rec, uri: destUri };
            } catch (e) {
              throw new Error("MEDIA_SAVE_FAILED");
            }
          }));
        } catch (e) {
          throw new Error("MEDIA_SAVE_FAILED");
        }
      }
      // 세션 없이 저장되지 않게 — 저장 시점에 없으면 여기서 시작한다. 노트와 완료 이벤트가 같은 세션을 쓴다.
      const practiceSession = ensurePracticeSession();
      const noteData = {
        title: title.trim(),
        content: content.trim(),
        field,
        tags,
        seriesName: seriesName.trim() || undefined,
        aiComment: aiComment || undefined,
        aiScores: aiScores || undefined,
        videoAnalysis: videoAnalysis || undefined,
        // 생성 메타 + 전사 — 품질 추적·학습 데이터 필터·재분석 재료
        aiModel: (aiComment || videoAnalysis) ? lastAiMeta.model || undefined : undefined,
        promptVersion: (aiComment || videoAnalysis) ? lastAiMeta.promptVersion || undefined : undefined,
        transcript: videoAnalysis ? lastAiMeta.transcript || undefined : undefined,
        images: images.length > 0 ? images : undefined,
        voiceRecordings: savedVoiceRecordings.length > 0 ? savedVoiceRecordings : undefined,
        audioFiles: audioFiles.length > 0 ? audioFiles : undefined,
        pdfFiles: pdfFiles.length > 0 ? pdfFiles : undefined,
        // 재연습 체인 — practice_meta 컬럼 적용 후 서버에도 동기화한다
        sceneId: sceneId || undefined,
        parentNoteId: parentNoteId || undefined,
        rootNoteId: rootNoteId || undefined,
        focus: focus || undefined,
        chosenFocus: chosenFocus || undefined,
        focusOptions: focusOptions.length > 0 ? focusOptions : undefined,
        // 이 노트가 어느 연습 세션에서 나왔는지 — 홈 요약·성장 리포트가 이 값으로
        // 노트 없이 끝낸 연습 기록(getPracticeLog)과 중복 집계를 막는다.
        practiceSessionId: practiceSession.sessionId,
      };
      const savedNoteId = await handleSaveNote(noteData);
      hasUnsavedChangesRef.current = false;
      await clearDraft(); // 노트로 남았으니 보관된 초안은 지운다 (복원으로 중복 생성되지 않게)
      trackFunnelEvent("note_saved", i18n.language);
      completePractice(practiceSession, {
        subjectKey: practiceSubjectKey || savedNoteId,
        kind: noteVideos.length > 0 ? "video" : "text",
      });
      savingRef.current = false;
      if (isMountedRef.current) navigation.goBack();
    } catch (e) {
      hasUnsavedChangesRef.current = true;
      safeAlert(t("common.save_failed_title"), t("common.save_failed_msg"));
    } finally {
      savingRef.current = false;
    }
  }, [aiBusy, title, content, field, tags, seriesName, aiComment, aiScores, videoAnalysis, images, voiceRecordings, audioFiles, pdfFiles, noteVideos, hasAttachments, hasAiResult, handleSaveNote, navigation, t, i18n.language, sceneId, parentNoteId, rootNoteId, focus, chosenFocus, focusOptions, practiceSubjectKey, ensurePracticeSession]);

  // Shimmer interpolation
  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1, 0.3],
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Top Bar */}
      <TopBar
        title={t("noteCreate.title")}
        left={
          <TouchableOpacity onPress={handleCancel} activeOpacity={0.7}>
            <Text style={styles.topBarCancel}>{t("common.cancel")}</Text>
          </TouchableOpacity>
        }
        right={
          <TouchableOpacity onPress={handleSave} activeOpacity={0.7} disabled={aiBusy}>
            <Text style={[styles.topBarSave, aiBusy && styles.topBarSaveDisabled]}>{t("common.save")}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 재연습이면 이번 연습의 초점을 고정 표시 */}
        {focus ? (
          <View style={styles.focusBanner}>
            <Text style={[T.small, { color: CLight.pink }]}>
              {t("focus.current")}: {focus}
            </Text>
          </View>
        ) : null}

        {/* Title Input */}
        <TextInput
          style={styles.titleInput}
          placeholder={t("noteCreate.title_placeholder")}
          placeholderTextColor={CLight.gray400}
          value={title}
          onChangeText={handleChangeTitle}
          maxLength={100}
          returnKeyType="next"
        />

        {/* 2인 대사 연습에서 왔을 때 — 녹음 첨부를 권한다 */}
        {sceneId ? (
          <Text style={[T.small, { color: CLight.gray500, marginTop: 10 }]}>{t("focus.duet_hint")}</Text>
        ) : null}

        {/* Content Input */}
        <TextInput
          style={styles.contentInput}
          placeholder={t("noteCreate.content_placeholder")}
          placeholderTextColor={CLight.gray400}
          value={content}
          onChangeText={handleChangeContent}
          multiline
          textAlignVertical="top"
          scrollEnabled={false}
        />

        {/* ─── Media Attachment ─── */}
        <Text style={styles.sectionLabel}>{t("noteCreate.media_attach")}</Text>
        <View style={styles.mediaButtonRow}>
          <TouchableOpacity style={styles.mediaBtn} onPress={handleTakePhoto} activeOpacity={0.7}>
            <Text style={styles.mediaBtnIcon}>📷</Text>
            <Text style={styles.mediaBtnText}>{t("noteCreate.camera")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaBtn} onPress={handlePickMedia} activeOpacity={0.7}>
            <Text style={styles.mediaBtnIcon}>🖼️</Text>
            <Text style={styles.mediaBtnText}>{t("noteCreate.gallery")}</Text>
          </TouchableOpacity>
          {isRecording ? (
            <TouchableOpacity style={[styles.mediaBtn, styles.mediaBtnRecording]} onPress={handleStopRecording} activeOpacity={0.7}>
              <Animated.View style={[styles.recordDot, { opacity: recordBlink }]} />
              <Text style={styles.mediaBtnTextRecording}>{formatDuration(recordingDuration)}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.mediaBtn} onPress={handleStartRecording} activeOpacity={0.7}>
              <Text style={styles.mediaBtnIcon}>🎤</Text>
              <Text style={styles.mediaBtnText}>{t("noteCreate.record")}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.mediaBtn} onPress={handlePickAudio} activeOpacity={0.7}>
            <Text style={styles.mediaBtnIcon}>🎵</Text>
            <Text style={styles.mediaBtnText}>{t("noteCreate.audio")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaBtn} onPress={handlePickPdf} activeOpacity={0.7}>
            <Text style={styles.mediaBtnIcon}>📄</Text>
            <Text style={styles.mediaBtnText}>{t("noteCreate.document")}</Text>
          </TouchableOpacity>
        </View>

        {/* Media Preview Grid */}
        {images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaPreviewScroll}>
            {images.map((item, idx) => (
              <View key={idx} style={styles.mediaThumbnailWrap}>
                <Image source={{ uri: item.thumbnail || item.uri }} style={styles.mediaThumbnail} />
                {item.type === "video" && (
                  <View style={styles.videoOverlay}>
                    <Text style={styles.videoOverlayText}>▶</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.mediaRemoveBtn} onPress={() => handleRemoveMedia(idx)}>
                  <Text style={styles.mediaRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Video AI Analysis — right after media preview */}
        {noteVideos.length > 0 && (
          <>
            {videoAiLoading ? (
              <View style={[styles.aiLoadingContainer, { marginBottom: 14 }]}>
                <View style={{ width: "100%", height: 6, backgroundColor: "#007AFF15", borderRadius: 3, marginBottom: 10 }}>
                  <View style={{ width: `${videoAiProgress.percent || 0}%`, height: 6, backgroundColor: "#007AFF", borderRadius: 3 }} />
                </View>
                <Text style={styles.aiLoadingText}>
                  {videoAiProgress.message || t("noteCreate.preparing")} ({videoAiProgress.percent || 0}%)
                </Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.videoAiButton, { marginTop: 0, marginBottom: 6 }]}
                  onPress={handleVideoAnalyze}
                  activeOpacity={0.8}
                >
                  <Text style={styles.videoAiButtonText}>{t("noteCreate.video_ai_analyze")}</Text>
                </TouchableOpacity>
                <Text style={{ ...T.micro, color: CLight.gray400, textAlign: "center", marginBottom: 14 }}>
                  {t("noteCreate.video_ai_recommend")}
                </Text>
              </>
            )}

            {videoAnalysis ? (
              <View style={[styles.videoAiResultCard, { marginBottom: 14 }]}>
                <View style={styles.videoAiResultHeader}>
                  <Text style={styles.videoAiResultHeaderText}>{t("noteCreate.video_ai_result")}</Text>
                </View>
                <Text style={styles.aiResultContent}>{videoAnalysis}</Text>
              </View>
            ) : null}
          </>
        )}

        {/* Voice Recordings List */}
        {voiceRecordings.length > 0 && (
          <View style={styles.voiceList}>
            {voiceRecordings.map((rec, idx) => (
              <View key={idx} style={styles.voiceItem}>
                <TouchableOpacity style={styles.voicePlayBtn} onPress={() => handlePlayRecording(rec.uri, `voice-${idx}`)}>
                  <Text style={styles.voicePlayIcon}>{playingIdx === `voice-${idx}` ? "⏸" : "▶️"}</Text>
                </TouchableOpacity>
                <Text style={styles.voiceDuration}>{t("noteCreate.voice_label", { index: idx + 1 })} · {formatDuration(rec.duration)}</Text>
                <TouchableOpacity style={styles.voiceRemoveBtn} onPress={() => handleRemoveRecording(idx)}>
                  <Text style={styles.mediaRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Audio Files List */}
        {audioFiles.length > 0 && (
          <View style={styles.voiceList}>
            {audioFiles.map((file, idx) => (
              <View key={idx} style={styles.voiceItem}>
                <TouchableOpacity style={[styles.voicePlayBtn, styles.audioPlayBtn]} onPress={() => handlePlayAudio(file.uri, `audio-${idx}`)}>
                  <Text style={styles.voicePlayIcon}>{playingIdx === `audio-${idx}` ? "⏸" : "▶️"}</Text>
                </TouchableOpacity>
                <Text style={styles.voiceDuration} numberOfLines={1}>🎵 {file.name}</Text>
                <TouchableOpacity style={styles.voiceRemoveBtn} onPress={() => handleRemoveAudio(idx)}>
                  <Text style={styles.mediaRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* PDF Files List */}
        {pdfFiles.length > 0 && (
          <View style={styles.voiceList}>
            {pdfFiles.map((file, idx) => (
              <View key={idx} style={styles.voiceItem}>
                <View style={[styles.voicePlayBtn, styles.pdfIconBtn]}>
                  <Text style={styles.voicePlayIcon}>📄</Text>
                </View>
                <Text style={styles.voiceDuration} numberOfLines={1}>{file.name}</Text>
                <TouchableOpacity style={styles.voiceRemoveBtn} onPress={() => handleRemovePdf(idx)}>
                  <Text style={styles.mediaRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Divider */}
        <View style={styles.divider} />

        {/* Field Selector */}
        <Text style={styles.sectionLabel}>{t("noteCreate.field")}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.fieldScroll}
        >
          {FIELDS.map((f) => {
            const isActive = field === f;
            const color = FIELD_COLORS[f] || CLight.gray500;
            return (
              <TouchableOpacity
                key={f}
                style={[
                  styles.fieldPill,
                  {
                    backgroundColor: isActive ? `${color}18` : CLight.white,
                    borderColor: isActive ? color : CLight.gray200,
                    borderWidth: isActive ? 1.5 : 1,
                  },
                ]}
                onPress={() => setField(f)}
                activeOpacity={0.7}
              >
                <Text style={styles.fieldEmoji}>{FIELD_EMOJIS[f]}</Text>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: isActive ? color : CLight.gray500, fontWeight: isActive ? "600" : "400" },
                  ]}
                >
                  {t("fields." + f)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Tag Input */}
        <Text style={styles.sectionLabel}>{t("noteCreate.tags")}</Text>
        <View style={styles.tagInputRow}>
          <TextInput
            style={styles.tagTextInput}
            placeholder={t("noteCreate.tag_input")}
            placeholderTextColor={CLight.gray400}
            value={tagInput}
            onChangeText={setTagInput}
            onSubmitEditing={handleAddTag}
            returnKeyType="done"
            maxLength={20}
          />
          <TouchableOpacity
            style={[styles.tagAddButton, !tagInput.trim() && styles.tagAddButtonDisabled]}
            onPress={handleAddTag}
            activeOpacity={0.7}
            disabled={!tagInput.trim()}
          >
            <Text
              style={[
                styles.tagAddText,
                !tagInput.trim() && styles.tagAddTextDisabled,
              ]}
            >
              {t("common.add")}
            </Text>
          </TouchableOpacity>
        </View>
        {tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {tags.map((tag, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.tagChip}
                onPress={() => handleRemoveTag(tag)}
                activeOpacity={0.7}
              >
                <Text style={styles.tagChipText}>#{tag}</Text>
                <Text style={styles.tagChipRemove}>×</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Series Name */}
        <Text style={styles.sectionLabel}>{t("noteCreate.series")}</Text>
        <TextInput
          style={styles.seriesInput}
          placeholder={t("noteCreate.series_placeholder")}
          placeholderTextColor={CLight.gray400}
          value={seriesName}
          onChangeText={setSeriesName}
          maxLength={50}
          returnKeyType="done"
        />

        {/* Divider */}
        <View style={styles.divider} />

        {/* AI Analysis Button */}
        {aiLoading ? (
          <View style={styles.aiLoadingContainer}>
            <Animated.View style={[styles.shimmerBar, { opacity: shimmerOpacity }]} />
            <Animated.View
              style={[styles.shimmerBar, styles.shimmerBarShort, { opacity: shimmerOpacity }]}
            />
            <Animated.View
              style={[styles.shimmerBar, styles.shimmerBarMedium, { opacity: shimmerOpacity }]}
            />
            <Text style={styles.aiLoadingText}>{t("noteCreate.ai_analyzing")}</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.aiButton}
            onPress={handleAnalyze}
            activeOpacity={0.8}
          >
            <Text style={styles.aiButtonText}>{t("noteCreate.ai_analyze")}</Text>
          </TouchableOpacity>
        )}

        {/* AI Result — 영상 AI만 돌린 노트에도 고칠 점 칩이 떠야 한다 */}
        {aiComment || (videoAnalysis && focusOptions.length > 0) ? (
          <View style={styles.aiResultCard}>
            {aiComment ? (
              <>
                <View style={styles.aiResultHeader}>
                  <Text style={styles.aiResultHeaderText}>{t("noteCreate.ai_result")}</Text>
                </View>
                <Text style={styles.aiResultContent}>{aiComment}</Text>
              </>
            ) : null}
            <FocusPicker
              title={t("focus.pick_title")}
              options={focusOptions}
              value={chosenFocus}
              onSelect={(v) => {
                setChosenFocus(v);
                if (v) trackFunnelEvent("focus_selected", i18n.language);
              }}
            />
          </View>
        ) : null}

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CLight.bg,
  },

  // Top bar actions
  topBarCancel: {
    ...T.body,
    color: CLight.gray500,
  },
  topBarSave: {
    ...T.bodyBold,
    color: CLight.pink,
  },
  topBarSaveDisabled: {
    color: CLight.gray400,
  },

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },

  focusBanner: {
    backgroundColor: CLight.pinkSoft,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  // Title
  titleInput: {
    ...T.h2,
    color: CLight.gray900,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: CLight.gray200,
  },

  // Content
  contentInput: {
    ...T.body,
    color: CLight.gray900,
    minHeight: 160,
    paddingVertical: 14,
    lineHeight: 26,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: CLight.gray200,
    marginVertical: 16,
  },

  // Section labels
  sectionLabel: {
    ...T.captionBold,
    color: CLight.gray700,
    marginBottom: 10,
    marginTop: 4,
  },

  // Field selector
  fieldScroll: {
    gap: 8,
    paddingBottom: 16,
  },
  fieldPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 5,
  },
  fieldEmoji: {
    fontSize: 15,
  },
  fieldLabel: {
    fontSize: 13,
  },

  // Tag input
  tagInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  tagTextInput: {
    flex: 1,
    ...T.body,
    color: CLight.gray900,
    backgroundColor: CLight.inputBg,
    borderWidth: 1,
    borderColor: CLight.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tagAddButton: {
    backgroundColor: CLight.pink,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tagAddButtonDisabled: {
    backgroundColor: CLight.gray200,
  },
  tagAddText: {
    ...T.captionBold,
    color: CLight.white,
  },
  tagAddTextDisabled: {
    color: CLight.gray400,
  },

  // Tags
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CLight.pinkSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 4,
  },
  tagChipText: {
    ...T.small,
    color: CLight.pink,
    fontWeight: "500",
  },
  tagChipRemove: {
    fontSize: 16,
    color: CLight.pinkLight,
    fontWeight: "600",
    marginLeft: 2,
  },

  // Series
  seriesInput: {
    ...T.body,
    color: CLight.gray900,
    backgroundColor: CLight.inputBg,
    borderWidth: 1,
    borderColor: CLight.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },

  // AI Button
  aiButton: {
    backgroundColor: CLight.pink,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: CLight.pink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  aiButtonText: {
    ...T.title,
    color: CLight.white,
    letterSpacing: 0.3,
  },

  // AI Loading
  aiLoadingContainer: {
    backgroundColor: CLight.white,
    borderRadius: 16,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: CLight.gray200,
  },
  shimmerBar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: CLight.pinkSoft,
    width: "100%",
  },
  shimmerBarShort: {
    width: "65%",
  },
  shimmerBarMedium: {
    width: "80%",
  },
  aiLoadingText: {
    ...T.caption,
    color: CLight.gray400,
    textAlign: "center",
    marginTop: 6,
  },

  // AI Result
  aiResultCard: {
    marginTop: 16,
    backgroundColor: CLight.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CLight.gray200,
    borderLeftWidth: 4,
    borderLeftColor: CLight.pink,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  aiResultHeader: {
    backgroundColor: CLight.pinkSoft,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  aiResultHeaderText: {
    ...T.captionBold,
    color: CLight.pink,
  },
  aiResultContent: {
    ...T.caption,
    color: CLight.gray700,
    padding: 16,
    lineHeight: 22,
  },

  // Video AI Button
  videoAiButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 12,
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  videoAiButtonText: {
    ...T.title,
    color: CLight.white,
    letterSpacing: 0.3,
  },
  videoAiResultCard: {
    marginTop: 16,
    backgroundColor: CLight.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CLight.gray200,
    borderLeftWidth: 4,
    borderLeftColor: "#007AFF",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  videoAiResultHeader: {
    backgroundColor: "#007AFF15",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  videoAiResultHeaderText: {
    ...T.captionBold,
    color: "#007AFF",
  },

  // ─── Media Attachment ───
  mediaButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  mediaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: CLight.white,
    borderWidth: 1,
    borderColor: CLight.gray200,
  },
  mediaBtnRecording: {
    backgroundColor: "#FFF0F0",
    borderColor: CLight.red,
  },
  mediaBtnIcon: {
    fontSize: 16,
  },
  mediaBtnText: {
    ...T.small,
    color: CLight.gray700,
    fontWeight: "500",
  },
  mediaBtnTextRecording: {
    ...T.smallBold,
    color: CLight.red,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: CLight.red,
  },

  // Media Preview
  mediaPreviewScroll: {
    gap: 10,
    paddingBottom: 14,
  },
  mediaThumbnailWrap: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: CLight.gray100,
  },
  mediaThumbnail: {
    width: 80,
    height: 80,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  videoOverlayText: {
    fontSize: 22,
    color: CLight.white,
  },
  mediaRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  mediaRemoveText: {
    fontSize: 12,
    color: CLight.white,
    fontWeight: "700",
  },

  // Voice Recordings
  voiceList: {
    gap: 8,
    marginBottom: 14,
  },
  voiceItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CLight.white,
    borderWidth: 1,
    borderColor: CLight.gray200,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  voicePlayBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: CLight.pinkSoft,
    justifyContent: "center",
    alignItems: "center",
  },
  voicePlayIcon: {
    fontSize: 14,
  },
  voiceDuration: {
    ...T.small,
    color: CLight.gray700,
    flex: 1,
  },
  voiceRemoveBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: CLight.gray200,
    justifyContent: "center",
    alignItems: "center",
  },

  // Audio file play button
  audioPlayBtn: {
    backgroundColor: "#E8F4FD",
  },

  // PDF icon button
  pdfIconBtn: {
    backgroundColor: "#FFF3E0",
  },
});
