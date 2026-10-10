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
  AppState,
  Linking,
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
import { buildRepracticePrefill } from "../utils/repractice";
import { sanitizeStudioMetadata } from "../utils/studioMetadata";
import { getStorageScope } from "../utils/accountStorage";
import { hasAskedReminder, markReminderAsked, scheduleDailyPracticeReminder } from "../services/reminderService";
import { trackFunnelEvent } from "../services/mauService";
import { saveDraft, clearDraft, hasDraftContent } from "../services/noteDraft";
import { startPractice, resumePractice, completePractice, abandonPractice, aiFeedbackDone } from "../services/practiceService";
import TopBar from "../components/TopBar";
import FocusPicker from "../components/FocusPicker";
import StandardSpeechPractice from "../components/StandardSpeechPractice";
import StudioContextCard from "../components/StudioContextCard";
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
  const { handleSaveNote, savedNotes, userProfile, aiDisclosureAccepted, handleAcceptAIDisclosure, isKoreanLocale, setAuthState, premium, usage, refreshPremium } = useApp();

  // AI 버튼 옆 남은 횟수 — 한도에 부딪히고 나서야 알게 되던 문제(2026-09 한도 정직화).
  // 게스트는 기존 체험 문구를 그대로 쓴다(서버가 usage를 안 준다).
  const quotaCaption = usage?.text
    ? t(premium?.active ? "quota.remaining_premium" : "quota.remaining_free", {
        left: usage.text.left,
        max: usage.text.max,
      })
    : null;

  const accountRef = useRef(userProfile?.authUserId || null);
  accountRef.current = userProfile?.authUserId || null;
  const captureOwner = () => ({ scope: getStorageScope(), account: accountRef.current });
  const ownerIsCurrent = (owner) => isMountedRef.current && owner.scope === getStorageScope() && owner.account === accountRef.current;
  const videoWorkRef = useRef(false);
  const textWorkRef = useRef(false);
  const mediaWorkRef = useRef(false);
  const mediaRevisionRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const videoQuota = usage?.video;
  const videoQuotaCaption = videoQuota ? t(premium?.active ? "retake.video_month_remaining" : "retake.video_trial_remaining", { left: videoQuota.left, max: videoQuota.max }) : null;
  const videoQuotaEmpty = Number.isFinite(videoQuota?.left) && videoQuota.left <= 0;

  // 초안 보관용 — 렌더마다 최신 상태를 담아두고, 인증 화면으로 떠날 때 그대로 저장한다
  const draftStateRef = useRef({});

  // 인증 화면으로 가면 NoteCreate가 언마운트된다 → 초안을 확실히 보관한 뒤에만 전환
  const goToAuthWithDraft = useCallback(async () => {
    const owner = captureOwner();
    // 보관할 내용이 없으면 그냥 이동 (잃을 것이 없다)
    if (!hasDraftContent(draftStateRef.current)) {
      setAuthState("auth");
      return;
    }
    const ok = await saveDraft(draftStateRef.current);
    if (!ownerIsCurrent(owner)) return;
    if (!ok) {
      Alert.alert(t("noteCreate.draft_keep_failed"), t("noteCreate.draft_keep_failed_msg"));
      return;
    }
    practiceRef.current = null; // 초안을 들고 가는 이동은 이탈이 아니다 — 돌아와 같은 세션으로 이어 쓴다
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
    } else if (premium?.active && premium.source === "purchase") {
      // 앱은 스토어 영수증으로 프리미엄인데 서버는 아직 무료 한도를 적용 중 — 복구 안내를 준다
      safeAlert(t("premium_recovery.pending_title"), t("premium_recovery.pending_msg"), [
        { text: t("premium.quota_cta"), onPress: () => navigation.navigate("Subscription") },
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
  }, [userProfile?.authUserId, premium?.active, premium?.source, goToAuthWithDraft, navigation, t, safeAlert]);

  // 딥링크 프리필 (artlink://practice — 비움스튜디오 대본 등)
  const [prefill, setPrefill] = useState(route?.params?.prefill || null);
  // Derive only from the accepted prefill: cancelling a replacement must keep
  // the current script language, role, and application context unchanged.
  const [speechLineIndex, setSpeechLineIndex] = useState(prefill?.speechLineIndex || 0);
  const speechPracticeRef = useRef(null);
  const studioMetadata = useMemo(() => sanitizeStudioMetadata({ ...prefill, speechLineIndex }), [prefill, speechLineIndex]);
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
    () => (parentNoteId ? savedNotes.find((n) => String(n.id) === String(parentNoteId)) || null : null),
    [savedNotes, parentNoteId]
  );
  const videoPreviousContext = useMemo(() => buildPreviousContext(parentNote ? { ...parentNote, aiComment: parentNote.videoAnalysis || parentNote.aiComment, aiScores: parentNote.videoAnalysis ? undefined : parentNote.aiScores } : null), [parentNote]);
  const isVideoRetake = !!parentNoteId && (!!parentNote?.videoAnalysis || parentNote?.images?.some((item) => item.type === "video"));
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
  const videoMetaRef = useRef({ model: prefill?.aiModel, promptVersion: prefill?.promptVersion, transcript: prefill?.transcript });
  const [videoAiLoading, setVideoAiLoading] = useState(false);
  const [videoAiProgress, setVideoAiProgress] = useState({ phase: "", percent: 0, message: "" });
  const hasUnsavedChangesRef = useRef(false);

  // Media state
  const [images, setImages] = useState(Array.isArray(prefill?.images) ? prefill.images : []); // [{ uri, type, width, height }]
  const [voiceRecordings, setVoiceRecordings] = useState(Array.isArray(prefill?.voiceRecordings) ? prefill.voiceRecordings : []); // [{ uri, duration }]
  const [audioFiles, setAudioFiles] = useState(Array.isArray(prefill?.audioFiles) ? prefill.audioFiles : []); // [{ uri, name, duration }]
  const [pdfFiles, setPdfFiles] = useState(Array.isArray(prefill?.pdfFiles) ? prefill.pdfFiles : []); // [{ uri, name }]

  const applyPrefill = useCallback((p) => {
    if (videoWorkRef.current || textWorkRef.current || mediaWorkRef.current || savingRef.current) return;
    abandonPractice(practiceRef.current);
    practiceRef.current = null;
    mediaRevisionRef.current += 1;
    speechPracticeRef.current?.stop();
    setSpeechLineIndex(p.speechLineIndex || 0);
    setPrefill(p);
    setTitle(p.title || "");
    setContent(p.content || "");
    setField(p.field && FIELDS.includes(p.field) ? p.field : FIELDS[0]);
    setTags(Array.isArray(p.tags) ? p.tags : []);
    setSeriesName(p.seriesName || "");
    setAiComment(p.aiComment || "");
    aiCommentRef.current = p.aiComment || "";
    setAiScores(p.aiScores || null);
    setVideoAnalysis(p.videoAnalysis || "");
    videoMetaRef.current = { model: p.aiModel, promptVersion: p.promptVersion, transcript: p.transcript };
    setFocusOptions(Array.isArray(p.focusOptions) ? p.focusOptions : []);
    setChosenFocus(p.chosenFocus || null);
    setImages(Array.isArray(p.images) ? p.images : []);
    setVoiceRecordings(Array.isArray(p.voiceRecordings) ? p.voiceRecordings : []);
    setAudioFiles(Array.isArray(p.audioFiles) ? p.audioFiles : []);
    setPdfFiles(Array.isArray(p.pdfFiles) ? p.pdfFiles : []);
    titleEditedRef.current = !!p.title;
    hasUnsavedChangesRef.current = false;
    savedNoteRef.current = false;
  }, []);

  // 화면이 이미 떠 있는 상태에서 새 딥링크/복원 prefill이 오면 params만 갱신됨 → 반영.
  // 단, 이미 쓰고 있던 내용이 있으면 말없이 덮어쓰지 않고 먼저 물어본다.
  const appliedPrefillRef = useRef(route?.params?.prefill || null);
  useEffect(() => {
    const p = route?.params?.prefill;
    if (!p || p === appliedPrefillRef.current) return; // 마운트 때 쓴 최초 prefill은 이미 반영됨
    if (videoWorkRef.current || textWorkRef.current || mediaWorkRef.current || savingRef.current) return;
    const owner = captureOwner();
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
        { text: t("common.confirm"), onPress: () => { if (ownerIsCurrent(owner)) applyPrefill(p); } },
      ]
    );
  }, [route?.params?.prefill, aiLoading, videoAiLoading, mediaBusy, saving]); // eslint-disable-line react-hooks/exhaustive-deps
  const [isRecording, setIsRecording] = useState(false);
  const [speechRecordingBusy, setSpeechRecordingBusy] = useState(false);
  const recordingBusyRef = useRef(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const permissionPromptRef = useRef(false);
  const foregroundWaitRef = useRef(null);
  const recordingStartTokenRef = useRef(0); // bumped to cancel a start that is still waiting on permission/prepare
  const [playingSound, setPlayingSound] = useState(null);
  const [playingIdx, setPlayingIdx] = useState(null);
  // 언마운트 cleanup은 []로 걸려 있어 최초 렌더의 playingSound(null)만 본다 →
  // ref로 최신 재생 객체를 따라가야 화면을 나갈 때 소리가 실제로 멈춘다.
  const playingSoundRef = useRef(null);
  const playbackGenerationRef = useRef(0);
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
      playbackGenerationRef.current += 1;
      recordingStartTokenRef.current += 1;
      foregroundWaitRef.current?.(false);
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
  const keptSessionId = prefill?.sessionId || null;
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

  // 저장 없이 화면을 떠나면 이탈 1건. 저장한 세션은 completePractice가 이미 닫았고,
  // 초안으로 돌아와 이어받으면(resumePractice) 다시 열려 완료로 집계된다.
  useEffect(() => () => abandonPractice(practiceRef.current), []);

  draftStateRef.current = { ...studioMetadata, title, content, field, tags, seriesName, aiComment, aiScores, videoAnalysis, aiModel: videoMetaRef.current.model, promptVersion: videoMetaRef.current.promptVersion, transcript: videoMetaRef.current.transcript, images, voiceRecordings, audioFiles, pdfFiles, sessionId: practiceRef.current?.sessionId, sceneId, parentNoteId, rootNoteId, focus, chosenFocus, focusOptions };

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
            onPress: () => { hasUnsavedChangesRef.current = false; clearDraft(); navigation.dispatch(e.data.action); },
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
    if (textWorkRef.current || videoWorkRef.current || mediaWorkRef.current || savingRef.current) return;
    const owner = captureOwner();
    textWorkRef.current = true;
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
      if (!ownerIsCurrent(owner)) return;
      // 스트리밍: 도착하는 대로 실시간 표시 (체감 대기 감소)
      const result = await analyzeNote(
        field, content, savedNotes,
        { ...studioMetadata, title, field, images, voiceRecordings, audioFiles, pdfFiles },
        userProfile,
        (partial) => { if (ownerIsCurrent(owner)) setAiComment(partial); },
        { ...studioMetadata, focus, previous: buildPreviousContext(parentNote) }
      );
      if (!ownerIsCurrent(owner)) return; // 계정이나 화면이 바뀌면 결과를 반영하지 않는다
      setAiComment(result.analysis || result);
      if (result.scores) setAiScores(result.scores);
      // When both analyses exist, the visible video result owns the retake focus.
      if (!videoAnalysis) {
        const newOptions = result.focusOptions || [];
        setFocusOptions(newOptions);
        setChosenFocus((prev) => (prev && newOptions.includes(prev) ? prev : null));
      }
      trackFunnelEvent("ai_feedback_done", i18n.language);
      aiFeedbackDone(practiceRef.current, "text");
      maybeOfferReminder();
    } catch (e) {
      if (!ownerIsCurrent(owner)) return;
      // 스트리밍 도중 실패 시 잘린 부분 텍스트가 남지 않도록 실패 이전 값으로 복원
      setAiComment(previousComment);
      if (e?.message === "AI_QUOTA") promptQuotaExceeded("text", { max: e.quotaMax, used: e.quotaUsed });
      else safeAlert(t("noteCreate.ai_failed"), t(e?.message === "AI_AUDIO_INCOMPLETE" ? "common.audio_analysis_failed" : "noteCreate.ai_failed_msg"));
    } finally {
      textWorkRef.current = false;
      if (ownerIsCurrent(owner)) { setAiLoading(false); refreshPremium?.(); }
    }
  }, [videoAnalysis, content, field, savedNotes, title, images, voiceRecordings, audioFiles, pdfFiles, userProfile, isKoreanLocale, premium?.active, t, i18n.language, promptQuotaExceeded, focus, parentNote, safeAlert, refreshPremium, studioMetadata]);

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
    if (textWorkRef.current || videoWorkRef.current || mediaWorkRef.current || savingRef.current) return;
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
    const owner = captureOwner();
    if (!aiDisclosureAccepted) {
      Alert.alert(
        t("aiDisclosure.title"),
        t("aiDisclosure.message"),
        [
          { text: t("aiDisclosure.cancel"), style: "cancel" },
          { text: t("aiDisclosure.accept"), onPress: () => { if (ownerIsCurrent(owner)) { handleAcceptAIDisclosure(); runAnalyze(); } } },
        ]
      );
      return;
    }
    runAnalyze();
  }, [content, voiceRecordings, audioFiles, pdfFiles, images, aiDisclosureAccepted, handleAcceptAIDisclosure, runAnalyze, t, ensurePracticeSession]);

  // Video AI Analysis — one attached take, one explicit request. A failed retry keeps the last result.
  const noteVideos = images.filter((i) => i.type === "video");
  const startVideoAnalysisRef = useRef(null);
  const runVideoAnalyzeFlow = useCallback(async () => {
    if (videoWorkRef.current || mediaWorkRef.current || savingRef.current || textWorkRef.current) return;
    if (videoQuotaEmpty) { promptQuotaExceeded("video", { max: videoQuota?.max }); return; }
    if (noteVideos.length === 0) {
      safeAlert(t("noteCreate.video_required"), t("noteCreate.video_required_msg"));
      return;
    }
    const video = noteVideos[0];
    if (Number.isFinite(video.duration) && video.duration > 300000) {
      safeAlert(t("noteCreate.video_too_long"), t("noteCreate.video_too_long_msg"));
      return;
    }
    const owner = captureOwner();
    const revision = mediaRevisionRef.current;
    videoWorkRef.current = true;
    setVideoAiLoading(true);
    setVideoAiProgress({ phase: "extracting", percent: 0, message: t("noteCreate.preparing") });
    try {
      const info = await FileSystem.getInfoAsync(video.uri, { size: true });
      if (!ownerIsCurrent(owner)) return;
      if (info.exists === false) {
        safeAlert(t("noteCreate.video_required"), t("retake.video_missing"));
        return;
      }
      if ((info.size || 0) > 100 * 1024 * 1024) {
        safeAlert(t("noteCreate.video_too_large"), t("noteCreate.video_too_large_msg", { size: Math.round(info.size / 1024 / 1024) }));
        return;
      }
      if (!isKoreanLocale && !premium?.active) {
        const rewarded = await showRewardedAd();
        if (!ownerIsCurrent(owner)) return;
        if (!rewarded) { safeAlert(t("common.error"), t("ads.rewarded_required")); return; }
      }
      const result = await analyzeVideoFrames(
        field, content, title, [video], userProfile,
        (progress) => { if (ownerIsCurrent(owner)) setVideoAiProgress(progress); },
        { ...studioMetadata, focus, previous: videoPreviousContext }
      );
      if (!ownerIsCurrent(owner)) return;
      setVideoAnalysis(result);
      videoMetaRef.current = { ...lastAiMeta };
      const newOptions = lastAiMeta.focusOptions || [];
      setFocusOptions(newOptions);
      setChosenFocus((prev) => prev && newOptions.includes(prev) ? prev : null);
      aiFeedbackDone(practiceRef.current, "video");
      trackFunnelEvent("ai_feedback_done", i18n.language);
      if (parentNoteId) trackFunnelEvent("retake_analysis_done", i18n.language);
    } catch (e) {
      if (!ownerIsCurrent(owner)) return;
      if (e?.videoAiReason === "QUOTA") {
        promptQuotaExceeded("video", { max: e.quotaMax, used: e.quotaUsed });
      } else {
        safeAlert(t("noteCreate.ai_failed"), t("common.video_ai_retry_msg"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("common.retry"), onPress: () => { if (ownerIsCurrent(owner) && revision === mediaRevisionRef.current) startVideoAnalysisRef.current?.(); } },
        ]);
      }
    } finally {
      videoWorkRef.current = false;
      if (ownerIsCurrent(owner)) {
        setVideoAiLoading(false);
        setVideoAiProgress({ phase: "", percent: 0, message: "" });
        refreshPremium?.();
      }
    }
  }, [noteVideos, aiLoading, videoQuotaEmpty, videoQuota?.max, field, content, title, userProfile, isKoreanLocale, premium?.active, t, promptQuotaExceeded, focus, videoPreviousContext, parentNoteId, safeAlert, refreshPremium, i18n.language, studioMetadata]);

  const handleVideoAnalyze = useCallback(() => {
    if (videoWorkRef.current || mediaWorkRef.current || savingRef.current || textWorkRef.current) return;
    ensurePracticeSession();
    const owner = captureOwner();
    const revision = mediaRevisionRef.current;
    const request = () => {
      if (!ownerIsCurrent(owner) || revision !== mediaRevisionRef.current) return;
      if (!aiDisclosureAccepted) {
        safeAlert(t("aiDisclosure.title"), t("aiDisclosure.message"), [
          { text: t("aiDisclosure.cancel"), style: "cancel" },
          { text: t("aiDisclosure.accept"), onPress: () => { if (ownerIsCurrent(owner) && revision === mediaRevisionRef.current) { handleAcceptAIDisclosure(); runVideoAnalyzeFlow(); } } },
        ]);
      } else runVideoAnalyzeFlow();
    };
    if (videoAnalysis) {
      safeAlert(t("retake.reanalyze_title"), t("retake.reanalyze_message"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("retake.reanalyze_confirm"), onPress: request },
      ]);
    } else request();
  }, [aiLoading, videoAnalysis, aiDisclosureAccepted, handleAcceptAIDisclosure, runVideoAnalyzeFlow, t, ensurePracticeSession, safeAlert]);

  useEffect(() => { startVideoAnalysisRef.current = handleVideoAnalyze; }, [handleVideoAnalyze]);

  // ─── Media Handlers ───

  const pickMedia = useCallback(async (source, videoOnly = false) => {
    if (mediaWorkRef.current || videoWorkRef.current || savingRef.current || textWorkRef.current) return;
    const owner = captureOwner();
    mediaWorkRef.current = true;
    setMediaBusy(true);
    try {
      const { status } = source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!ownerIsCurrent(owner)) return;
      if (status !== "granted") {
        safeAlert(t("common.permission_required"), t(source === "camera" ? "common.camera_permission" : "common.gallery_permission"));
        return;
      }
      if (source === "camera" && videoOnly) {
        const audio = await Audio.requestPermissionsAsync();
        if (!ownerIsCurrent(owner)) return;
        if (audio.status !== "granted") { safeAlert(t("common.permission_required"), t("common.mic_permission")); return; }
      }
      const options = { mediaTypes: videoOnly ? ["videos"] : source === "camera" ? ["images"] : ["images", "videos"], quality: 0.8, allowsMultipleSelection: false, videoMaxDuration: 300, videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality };
      const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (!ownerIsCurrent(owner) || result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const isVideo = asset.type === "video";
      if (videoOnly && !isVideo) return;
      if (isVideo && Number.isFinite(asset.duration) && asset.duration > 300000) {
        safeAlert(t("noteCreate.video_too_long"), t("noteCreate.video_too_long_msg"));
        return;
      }
      if (isVideo && images.some((image) => image.type === "video")) {
        const replace = await new Promise((resolve) => {
          safeAlert(t("retake.replace_video_title"), t("retake.replace_video_message"), [
            { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
            { text: t("retake.replace_video_confirm"), onPress: () => resolve(true) },
          ], { cancelable: true, onDismiss: () => resolve(false) });
        });
        if (!ownerIsCurrent(owner) || !replace) return;
      }
      const mediaDir = FileSystem.documentDirectory + "media/";
      const dirInfo = await FileSystem.getInfoAsync(mediaDir);
      if (!ownerIsCurrent(owner)) return;
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(mediaDir, { intermediates: true });
      const ext = asset.uri.split(".").pop()?.split("?")[0] || (isVideo ? "mov" : "jpg");
      const destUri = mediaDir + `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      // Do not silently keep a cache URI which may disappear before the next session.
      await FileSystem.copyAsync({ from: asset.uri, to: destUri });
      if (!ownerIsCurrent(owner)) return;
      let thumbnail = null;
      if (isVideo) {
        try { thumbnail = (await VideoThumbnails.getThumbnailAsync(destUri, { time: 0 })).uri; } catch {}
      }
      if (!ownerIsCurrent(owner)) return;
      const item = { uri: destUri, type: isVideo ? "video" : "image", width: asset.width, height: asset.height, duration: asset.duration, thumbnail };
      ensurePracticeSession();
      if (isVideo) {
        mediaRevisionRef.current += 1;
        // AI only analyzes the first video. Replacing it must invalidate the old attribution.
        setImages((prev) => [...prev.filter((image) => image.type !== "video"), item]);
        setVideoAnalysis("");
        videoMetaRef.current = {};
        setFocusOptions([]);
        setChosenFocus(null);
        if (parentNoteId) trackFunnelEvent("retake_capture_added", i18n.language);
      } else setImages((prev) => [...prev, item]);
    } catch {
      if (ownerIsCurrent(owner)) safeAlert(t("noteCreate.file_select_error"), t("retake.media_failed"));
    } finally {
      mediaWorkRef.current = false;
      if (ownerIsCurrent(owner)) setMediaBusy(false);
    }
  }, [images, aiLoading, ensurePracticeSession, parentNoteId, i18n.language, t, safeAlert]);
  const handleTakePhoto = useCallback(() => pickMedia("camera"), [pickMedia]);
  const handleTakeVideo = useCallback(() => pickMedia("camera", true), [pickMedia]);
  const handlePickMedia = useCallback(() => pickMedia("gallery"), [pickMedia]);
  const handlePickVideo = useCallback(() => pickMedia("gallery", true), [pickMedia]);

  const handleRemoveMedia = useCallback((index) => {
    if (videoWorkRef.current || mediaWorkRef.current || savingRef.current || textWorkRef.current) return;
    if (images[index]?.type === "video") { mediaRevisionRef.current += 1; setVideoAnalysis(""); videoMetaRef.current = {}; setFocusOptions([]); setChosenFocus(null); }
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, [images, aiLoading]);

  const handleStartRecording = useCallback(async () => {
    if (recordingBusyRef.current || recordingRef.current || appStateRef.current !== "active") return;
    const owner = captureOwner();
    recordingBusyRef.current = true;
    playbackGenerationRef.current += 1;
    setSpeechRecordingBusy(true);
    const token = ++recordingStartTokenRef.current;
    const cancelled = () => token !== recordingStartTokenRef.current || !ownerIsCurrent(owner);
    const canRecord = () => !cancelled() && appStateRef.current === "active";
    // Android permission activities may resolve before onHostResume. Wait briefly,
    // but never start a recording if the user stays outside the app.
    const waitForForeground = () => {
      if (cancelled()) return Promise.resolve(false);
      if (appStateRef.current === "active") return Promise.resolve(true);
      return new Promise((resolve) => {
        const finish = (active) => {
          clearTimeout(timer);
          if (foregroundWaitRef.current === finish) foregroundWaitRef.current = null;
          resolve(active && canRecord());
        };
        const timer = setTimeout(() => finish(false), 1000);
        foregroundWaitRef.current = finish;
      });
    };
    let recording = null;
    // The app went to the background (or the screen closed) mid-start: release the recorder instead of recording unseen.
    const releaseCancelled = async () => {
      try { if (recording) await recording.stopAndUnloadAsync(); } catch (e) {}
      try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch (e) {}
    };
    try {
      if (speechPracticeRef.current) await speechPracticeRef.current.stop();
      if (!canRecord()) return;
      if (playingSoundRef.current) {
        await playingSoundRef.current.unloadAsync();
        if (!canRecord()) return;
        playingSoundRef.current = null; setPlayingSound(null); setPlayingIdx(null);
      }
      let permission = await Audio.getPermissionsAsync();
      if (!canRecord()) return;
      if (permission.status !== "granted" && permission.canAskAgain !== false) {
        permissionPromptRef.current = true;
        try { permission = await Audio.requestPermissionsAsync(); }
        finally { permissionPromptRef.current = false; }
        if (!(await waitForForeground()) || !canRecord()) return;
      }
      if (permission.status !== "granted") {
        if (permission.canAskAgain === false) {
          Alert.alert(t("common.permission_required"), t("common.mic_permission"), [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("common.open_settings"), onPress: async () => {
              if (!canRecord()) return;
              try { await Linking.openSettings(); }
              catch (_) { if (canRecord()) safeAlert(t("common.error"), t("common.mic_permission")); }
            } },
          ]);
        } else Alert.alert(t("common.permission_required"), t("common.mic_permission"));
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      if (!canRecord()) { await releaseCancelled(); return; }
      recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      if (!canRecord()) { await releaseCancelled(); return; }
      await recording.startAsync();
      if (!canRecord()) { await releaseCancelled(); return; }
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (e) {
      if (!canRecord()) { await releaseCancelled(); return; }
      await releaseCancelled();
      if (!canRecord()) return;
      Alert.alert(t("noteCreate.recording_error"), t("noteCreate.recording_error_msg"));
    } finally {
      permissionPromptRef.current = false;
      recordingBusyRef.current = false;
      if (isMountedRef.current) setSpeechRecordingBusy(false);
    }
  }, [t]);

  const handleStopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingBusyRef.current = true; setSpeechRecordingBusy(true);
    recordingRef.current = null; // a second stop (inactive → background) must not attach the take twice
    try {
      clearInterval(recordingTimerRef.current);
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      const finalDuration = recordingDuration;
      setIsRecording(false);
      if (uri) {
        ensurePracticeSession(); // 녹음 첨부 = 연습 시작
        setVoiceRecordings((prev) => [...prev, { uri, duration: finalDuration }]);
      }
    } catch (e) {
      setIsRecording(false);
    } finally { recordingBusyRef.current = false; setSpeechRecordingBusy(false); }
  }, [recordingDuration, ensurePracticeSession]);

  // Leaving the app ends the take: keep what was recorded, never keep recording in the background.
  // Android's permission activity may emit background; exempt only the actual
  // permission request, then require a bounded return to active before recording.
  const stopRecordingRef = useRef(handleStopRecording);
  stopRecordingRef.current = handleStopRecording;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      appStateRef.current = state;
      if (state === "active") foregroundWaitRef.current?.(true);
      if (state === "background" && !permissionPromptRef.current) {
        recordingStartTokenRef.current += 1;
        foregroundWaitRef.current?.(false);
      }
      if ((state === "background" || state === "inactive") && recordingRef.current) stopRecordingRef.current();
    });
    return () => sub?.remove?.();
  }, []);

  useEffect(() => {
    if (studioMetadata.practiceMode !== "standard_speech") return;
    return navigation.addListener?.("blur", () => {
      playbackGenerationRef.current += 1;
      recordingStartTokenRef.current += 1;
      foregroundWaitRef.current?.(false);
      if (recordingRef.current) stopRecordingRef.current();
      playingSoundRef.current?.unloadAsync?.().catch?.(() => {});
      playingSoundRef.current = null;
      setPlayingSound(null); setPlayingIdx(null);
    });
  }, [navigation, studioMetadata.practiceMode]);

  const handleRemoveRecording = useCallback((index) => {
    setVoiceRecordings((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handlePlayRecording = useCallback(async (uri, index) => {
    if (recordingRef.current || recordingBusyRef.current) return;
    const generation = ++playbackGenerationRef.current;
    const owner = accountRef.current;
    const stale = () => generation !== playbackGenerationRef.current || owner !== accountRef.current || !!recordingRef.current || recordingBusyRef.current;
    await speechPracticeRef.current?.stop();
    if (stale()) return;
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
      if (stale()) { await sound.unloadAsync(); return; }
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
    if (recordingRef.current || recordingBusyRef.current) return;
    const generation = ++playbackGenerationRef.current;
    const owner = accountRef.current;
    const stale = () => generation !== playbackGenerationRef.current || owner !== accountRef.current || !!recordingRef.current || recordingBusyRef.current;
    await speechPracticeRef.current?.stop();
    if (stale()) return;
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
      if (stale()) { await sound.unloadAsync(); return; }
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
  const aiBusy = aiLoading || videoAiLoading || mediaBusy;

  // Save note
  const savedNoteRef = useRef(false);
  const savingRef = useRef(false); // 녹음 복사 중 저장 버튼 연타로 노트가 두 번 생기지 않게
  const handleSave = useCallback(async (destination = "default") => {
    if (recordingRef.current || recordingBusyRef.current) return;
    if (savedNoteRef.current || aiBusy || textWorkRef.current || videoWorkRef.current || mediaWorkRef.current || savingRef.current) return;
    if (destination === "retake" && (!videoAnalysis || !chosenFocus)) return;
    const owner = captureOwner();
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
    setSaving(true);
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
      if (!ownerIsCurrent(owner)) return;
      // 세션 없이 저장되지 않게 — 저장 시점에 없으면 여기서 시작한다. 노트와 완료 이벤트가 같은 세션을 쓴다.
      const practiceSession = ensurePracticeSession();
      const noteData = {
        ...studioMetadata,
        title: title.trim(),
        content: content.trim(),
        field,
        tags,
        seriesName: seriesName.trim() || undefined,
        aiComment: aiComment || undefined,
        aiScores: aiScores || undefined,
        videoAnalysis: videoAnalysis || undefined,
        // 생성 메타 + 전사 — 품질 추적·학습 데이터 필터·재분석 재료
        aiModel: videoAnalysis ? videoMetaRef.current.model || undefined : aiComment ? lastAiMeta.model || undefined : undefined,
        promptVersion: videoAnalysis ? videoMetaRef.current.promptVersion || undefined : aiComment ? lastAiMeta.promptVersion || undefined : undefined,
        transcript: videoAnalysis ? videoMetaRef.current.transcript || undefined : undefined,
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
      if (!ownerIsCurrent(owner)) return;
      savedNoteRef.current = true;
      hasUnsavedChangesRef.current = false;
      await clearDraft(); // 노트로 남았으니 보관된 초안은 지운다 (복원으로 중복 생성되지 않게)
      if (!ownerIsCurrent(owner)) return;
      trackFunnelEvent("note_saved", i18n.language);
      completePractice(practiceSession, {
        subjectKey: practiceSubjectKey || savedNoteId,
        kind: noteVideos.length > 0 ? "video" : "text",
      });
      savingRef.current = false;
      if (destination === "retake") {
        trackFunnelEvent("repractice_started", i18n.language);
        navigation.replace("NoteCreate", { prefill: buildRepracticePrefill({ ...noteData, id: savedNoteId }) });
      } else if (videoAnalysis) {
        navigation.replace("NoteDetail", { noteId: savedNoteId, initialTab: "ai" });
      } else navigation.goBack();
    } catch (e) {
      if (!ownerIsCurrent(owner)) return;
      hasUnsavedChangesRef.current = true;
      safeAlert(t("common.save_failed_title"), t("common.save_failed_msg"));
    } finally {
      savingRef.current = false;
      if (ownerIsCurrent(owner)) setSaving(false);
    }
  }, [aiBusy, title, content, field, tags, seriesName, aiComment, aiScores, videoAnalysis, images, voiceRecordings, audioFiles, pdfFiles, noteVideos, hasAttachments, hasAiResult, handleSaveNote, navigation, t, i18n.language, sceneId, parentNoteId, rootNoteId, focus, chosenFocus, focusOptions, practiceSubjectKey, ensurePracticeSession, studioMetadata]);

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
          <TouchableOpacity onPress={() => handleSave()} activeOpacity={0.7} disabled={aiBusy || saving || isRecording || speechRecordingBusy}>
            <Text style={[styles.topBarSave, (aiBusy || isRecording || speechRecordingBusy) && styles.topBarSaveDisabled]}>{t("common.save")}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <StudioContextCard note={studioMetadata} />
        {studioMetadata.practiceMode === "standard_speech" && <StandardSpeechPractice
          ref={speechPracticeRef} content={content} language={i18n.language} lineIndex={speechLineIndex} onLineChange={setSpeechLineIndex}
          recording={isRecording} busy={aiBusy || saving || speechRecordingBusy} takes={voiceRecordings} owner={userProfile?.authUserId || "guest"} navigation={navigation}
          onRecord={handleStartRecording} onStop={handleStopRecording} onPlay={handlePlayRecording}
          beforeListen={async () => { playbackGenerationRef.current += 1; if (playingSoundRef.current) { await playingSoundRef.current.unloadAsync(); playingSoundRef.current = null; setPlayingSound(null); setPlayingIdx(null); } }}
        />}
        {isVideoRetake ? (
          <View style={styles.focusBanner}>
            <Text style={[T.bodyBold, { color: CLight.pink }]}>{t("retake.current_focus", { focus: focus || "" })}</Text>
            {videoPreviousContext?.summary ? <Text style={[T.small, { marginTop: 8 }]}>{t("retake.previous_feedback")}: {videoPreviousContext.summary}</Text> : null}
            {videoQuotaCaption ? <Text style={[T.small, { marginTop: 8 }]}>{videoQuotaCaption}</Text> : null}
            {videoQuotaEmpty ? (
              <View>
                <Text style={T.small}>{t("retake.quota_empty")}</Text>
                <TouchableOpacity onPress={() => promptQuotaExceeded("video", { max: videoQuota?.max })}><Text style={styles.retakeLink}>{t(premium?.active ? "retake.quota_details" : "premium.quota_cta")}</Text></TouchableOpacity>
              </View>
            ) : null}
            {!userProfile?.authUserId ? (
              <View>
                <Text style={[T.small, { marginTop: 8 }]}>{t("retake.guest_quota")}</Text>
                <TouchableOpacity onPress={goToAuthWithDraft}><Text style={styles.retakeLink}>{t("premium.guest_trial_cta")}</Text></TouchableOpacity>
              </View>
            ) : null}
            <TouchableOpacity style={styles.videoAiButton} onPress={handleTakeVideo} disabled={aiBusy || saving}><Text style={styles.videoAiButtonText}>{t("retake.capture_now")}</Text></TouchableOpacity>
            <TouchableOpacity onPress={handlePickVideo} disabled={aiBusy || saving}><Text style={styles.retakeLink}>{t("retake.pick_gallery")}</Text></TouchableOpacity>
          </View>
        ) : focus ? <View style={styles.focusBanner}><Text style={T.small}>{t("focus.current")}: {focus}</Text></View> : null}

        {/* 홈의 "이미 연습한 영상·녹음이 있어요"로 들어왔다 — 빈 양식 대신 올릴 곳부터 보여준다.
            (1.11.9 실화면: 안내 없는 빈 노트가 열리고, AI 분석을 누르면 "내용을 먼저 작성"이라고만 했다) */}
        {prefill?.intent === "material" && !hasAttachments ? (
          <View style={styles.materialCard}>
            <Text style={[T.title, { color: CLight.gray900 }]}>{t("noteCreate.material_title")}</Text>
            <Text style={[T.small, { color: CLight.gray500, marginTop: 4 }]}>{t("noteCreate.material_desc")}</Text>
            <TouchableOpacity style={styles.materialBtn} onPress={handlePickVideo} disabled={aiBusy || saving} activeOpacity={0.8}>
              <Text style={styles.materialBtnText}>{t("noteCreate.material_pick_video")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.materialBtn, styles.materialBtnAlt]} onPress={handlePickAudio} disabled={aiBusy || saving} activeOpacity={0.8}>
              <Text style={[styles.materialBtnText, { color: CLight.pink }]}>{t("noteCreate.material_pick_audio")}</Text>
            </TouchableOpacity>
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
                <TouchableOpacity style={styles.mediaRemoveBtn} disabled={aiBusy || saving} onPress={() => handleRemoveMedia(idx)}>
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
            ) : !videoAnalysis ? (
              <>
                <TouchableOpacity
                  disabled={saving || aiLoading}
                  style={[styles.videoAiButton, { marginTop: 0, marginBottom: 6 }]}
                  onPress={handleVideoAnalyze}
                  activeOpacity={0.8}
                >
                  <Text style={styles.videoAiButtonText}>{t(parentNoteId ? "retake.analyze_improvement" : "noteCreate.video_ai_analyze")}</Text>
                </TouchableOpacity>
                <Text style={{ ...T.micro, color: CLight.gray400, textAlign: "center", marginBottom: 14 }}>
                  {videoQuotaCaption || t("noteCreate.video_ai_recommend")}
                </Text>
              </>
            ) : (
              <TouchableOpacity onPress={handleVideoAnalyze} disabled={saving || aiBusy}><Text style={styles.retakeLink}>{t("retake.reanalyze_link")}</Text></TouchableOpacity>
            )}

            {videoAnalysis ? (
              <View style={[styles.videoAiResultCard, { marginBottom: 14 }]}>
                <View style={styles.videoAiResultHeader}>
                  <Text style={styles.videoAiResultHeaderText}>{t("noteCreate.video_ai_result")}</Text>
                </View>
                <Text style={styles.aiResultContent}>{videoAnalysis}</Text>
                <FocusPicker title={t("focus.pick_title")} options={focusOptions} value={chosenFocus} onSelect={(v) => { if (saving || aiBusy) return; setChosenFocus(v); if (v) trackFunnelEvent("focus_selected", i18n.language); }} />
                {parentNoteId ? <TouchableOpacity style={styles.videoAiButton} disabled={saving || aiBusy} onPress={() => handleSave("compare")}><Text style={styles.videoAiButtonText}>{t("retake.save_compare")}</Text></TouchableOpacity> : null}
                {chosenFocus ? <TouchableOpacity style={styles.videoAiButton} disabled={saving || aiBusy} onPress={() => handleSave("retake")}><Text style={styles.videoAiButtonText}>{t(parentNoteId ? "retake.capture_again" : "retake.fix_and_retake")}</Text></TouchableOpacity> : null}
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
          <>
            <TouchableOpacity
              style={styles.aiButton}
              onPress={handleAnalyze}
              activeOpacity={0.8}
            >
              <Text style={styles.aiButtonText}>{t("noteCreate.ai_analyze")}</Text>
            </TouchableOpacity>
            {quotaCaption ? (
              <Text style={[T.micro, { color: CLight.gray400, textAlign: "center", marginTop: 8 }]}>
                {quotaCaption}
              </Text>
            ) : null}
          </>
        )}

        {/* AI Result — 영상 AI만 돌린 노트에도 고칠 점 칩이 떠야 한다 */}
        {aiComment ? (
          <View style={styles.aiResultCard}>
            {aiComment ? (
              <>
                <View style={styles.aiResultHeader}>
                  <Text style={styles.aiResultHeaderText}>{t("noteCreate.ai_result")}</Text>
                </View>
                <Text style={styles.aiResultContent}>{aiComment}</Text>
              </>
            ) : null}
            {!videoAnalysis ? <FocusPicker
              title={t("focus.pick_title")}
              options={focusOptions}
              value={chosenFocus}
              onSelect={(v) => {
                setChosenFocus(v);
                if (v) trackFunnelEvent("focus_selected", i18n.language);
              }}
            /> : null}
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

  retakeLink: { ...T.small, color: CLight.pink, textAlign: "center", marginVertical: 10, paddingVertical: 6 },
  focusBanner: {
    backgroundColor: CLight.pinkSoft,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  // Title
  materialCard: { backgroundColor: CLight.surface, borderRadius: 16, padding: 18, marginBottom: 18 },
  materialBtn: { height: 48, borderRadius: 12, backgroundColor: CLight.pink, alignItems: "center", justifyContent: "center", marginTop: 12 },
  materialBtnAlt: { backgroundColor: CLight.surface, borderWidth: 1, borderColor: CLight.pink },
  materialBtnText: { fontSize: 15, fontWeight: "700", color: CLight.white },
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
