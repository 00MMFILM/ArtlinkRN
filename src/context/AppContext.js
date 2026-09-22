import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeStorageGet, safeStorageSet, STORAGE_KEYS } from "../utils/storage";
import { supabase } from "../services/supabaseClient";
import i18n from "i18next";
import { computeArtistProfile } from "../services/analyticsService";
import { ensureDeviceUser } from "../services/communityService";
import { upsertArtistProfile, deleteArtistProfile, uploadProfilePhotos, mergeServerStats } from "../services/profileService";
import { syncSingleNote, syncNotesToServer, fetchNotesFromServer, mergeNotes, deleteNoteFromServer } from "../services/notesSyncService";
import { trackAppOpen, trackFunnelEvent } from "../services/mauService";
import { createMatchingPost, deleteMatchingPost } from "../services/matchingService";
import { SERVER_URL, getApiHeaders, setApiDeviceId, setDataConsentCache } from "../services/apiConfig";
import { getPracticeLog } from "../services/practiceService";
import { applyPracticeActivityStats } from "../utils/practiceStats";
import { fetchPremiumStatus, EMPTY_PREMIUM, shouldApplyServerPremium, PREMIUM_OPTIMISTIC_MS } from "../services/premiumService";
import { migrateCachedRecordings } from "../services/recordingMigration";

const AppContext = createContext();

const DEFAULT_FIELD_ORDER = ["acting", "music", "art", "dance", "literature", "film"];

// 둘러보기(게스트)로 한 번 들어온 기기는 다음 실행부터 가입 화면을 다시 보지 않는다.
// 로그아웃하면 지워서 가입 화면으로 돌아가게 한다.
export const GUEST_ENTERED_KEY = "artlink-guest-entered";

/**
 * 앱 시작 시 진입 상태 결정 (테스트 가능하도록 순수 함수로 분리)
 * - 프로필 있음 + auth 연동: 세션이 있어야 진입
 * - 프로필 있음 + 구 유저: 바로 진입
 * - 프로필 없음: 둘러보기 이력이 있으면 진입, 없으면 가입 화면
 */
export function resolveInitialAuthState({ profile, hasSession, guestEntered }) {
  if (profile) {
    if (profile.authUserId) return hasSession ? "app" : "auth";
    return "app";
  }
  return guestEntered ? "app" : "auth";
}

export function AppProvider({ children }) {
  const [savedNotes, setSavedNotes] = useState([]);
  const [userProfile, setUserProfile] = useState({
    name: "", userType: "", fields: [], roleModels: [], interests: [],
    gender: "", birthDate: "", height: null, weight: null,
    heightPrivate: false, weightPrivate: false,
    specialties: [], school: "", career: [], bio: "",
    location: "", agency: "",
  });

  const [goals, setGoals] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [showBetaGuide, setShowBetaGuide] = useState(false);
  const [portfolioItems, setPortfolioItems] = useState([]);
  const [portfolioSummary, setPortfolioSummary] = useState(null);
  const [matchingPosts, setMatchingPosts] = useState([]);
  const [matchingDeletedIds, setMatchingDeletedIds] = useState([]);
  const [fieldOrder, setFieldOrder] = useState(DEFAULT_FIELD_ORDER);
  const [storageReady, setStorageReady] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" });
  const [authState, setAuthState] = useState("auth"); // "auth" | "app"
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [reportedContent, setReportedContent] = useState([]);
  const [deviceUserId, setDeviceUserId] = useState(null);
  const [dataConsent, setDataConsent] = useState(false);
  const [dataConsentAsked, setDataConsentAsked] = useState(false);
  const [aiDisclosureAccepted, setAiDisclosureAccepted] = useState(false);
  const [language, setLanguage] = useState(i18n.language || "ko");
  // 프리미엄 상태 — 화면(왕관 배지·구독 화면·한도 안내)이 읽는 유일한 정본
  const [premium, setPremium] = useState(EMPTY_PREMIUM);
  const isKoreanLocale = language === "ko";

  // 기기 연습 기록(2인 대사 등 노트 없이 끝낸 연습) — 연속·이번 주·월별을 홈·성장 리포트와 같은
  // 합산 기준으로 맞추려고 여기 한 곳에서 읽는다. 앱 시작·포그라운드 복귀·노트 변경 때 다시 읽는다.
  const [practiceLog, setPracticeLog] = useState([]);
  const reloadPracticeLog = useCallback(() => {
    getPracticeLog()
      .then((log) => {
        // 내용이 같으면 상태를 바꾸지 않는다 — 불필요한 프로필 재계산·서버 재전송 방지
        setPracticeLog((prev) => (JSON.stringify(prev) === JSON.stringify(log) ? prev : log));
      })
      .catch(() => {});
  }, []);
  useEffect(() => { reloadPracticeLog(); }, [savedNotes, reloadPracticeLog]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") reloadPracticeLog();
    });
    return () => sub?.remove?.();
  }, [reloadPracticeLog]);

  const artistProfile = useMemo(
    () => applyPracticeActivityStats(computeArtistProfile(savedNotes, userProfile), savedNotes, practiceLog),
    [savedNotes, userProfile, practiceLog]
  );

  // B2B 대시보드(서버 계산값)와 앱 화면 표시 점수가 어긋나는 문제 방지용:
  // profile-sync 응답의 정답 score/mileage/level을 받아 여기 저장한다.
  const [serverStats, setServerStats] = useState(null);

  // 화면에는 서버 값이 있으면 그것으로 덮되(overallScore/mileage/level만),
  // radarValues·streak 등 나머지는 항상 로컬 계산값을 유지한다.
  const displayProfile = useMemo(
    () => mergeServerStats(artistProfile, serverStats),
    [artistProfile, serverStats]
  );

  const showToast = useCallback((message, type = "success") => {
    setToast({ visible: true, message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  // Load all persisted data on mount
  useEffect(() => {
    (async () => {
      const [notes, profile, dm, g, sub, fb, guide, pItems, pSummary, mPosts, mDeleted, eula, blocked, reported, consent, consentAsked, aiDisclosure] = await Promise.all([
        safeStorageGet(STORAGE_KEYS.NOTES),
        safeStorageGet(STORAGE_KEYS.PROFILE),
        safeStorageGet(STORAGE_KEYS.DARK_MODE),
        safeStorageGet(STORAGE_KEYS.GOALS),
        Promise.resolve(null), // subscription removed
        safeStorageGet(STORAGE_KEYS.FEEDBACKS),
        safeStorageGet(STORAGE_KEYS.BETA_GUIDE),
        safeStorageGet(STORAGE_KEYS.PORTFOLIO_ITEMS),
        safeStorageGet(STORAGE_KEYS.PORTFOLIO_SUMMARY),
        safeStorageGet(STORAGE_KEYS.MATCHING_POSTS),
        safeStorageGet(STORAGE_KEYS.MATCHING_DELETED),
        safeStorageGet(STORAGE_KEYS.EULA_ACCEPTED),
        safeStorageGet(STORAGE_KEYS.BLOCKED_USERS),
        safeStorageGet(STORAGE_KEYS.REPORTED_CONTENT),
        safeStorageGet(STORAGE_KEYS.DATA_CONSENT),
        safeStorageGet(STORAGE_KEYS.DATA_CONSENT_ASKED),
        safeStorageGet(STORAGE_KEYS.AI_DISCLOSURE_ACCEPTED),
      ]);
      if (notes) setSavedNotes(notes);
      let hasSession = false;
      if (profile?.authUserId) {
        const { data: { session } } = await supabase.auth.getSession();
        hasSession = !!session;
      }
      if (profile) setUserProfile(profile);
      // 읽기 실패해도 앱 시작이 멈추지 않게 (실패 = 둘러보기 이력 없음)
      const guestEntered = await AsyncStorage.getItem(GUEST_ENTERED_KEY)
        .then((v) => v === "true")
        .catch(() => false);
      setAuthState(resolveInitialAuthState({ profile, hasSession, guestEntered }));

      if (g) setGoals(g);
      // subscription removed
      if (fb) setFeedbacks(fb);
      if (!guide) setShowBetaGuide(true);
      if (pItems) setPortfolioItems(pItems);
      if (pSummary) setPortfolioSummary(pSummary);
      if (mPosts) setMatchingPosts(mPosts);
      if (mDeleted) setMatchingDeletedIds(mDeleted);
      if (eula) setEulaAccepted(eula);
      if (blocked) setBlockedUsers(blocked);
      if (reported) setReportedContent(reported);
      if (consent) { setDataConsent(consent); setDataConsentCache(consent); }
      if (consentAsked) setDataConsentAsked(consentAsked);
      if (aiDisclosure) setAiDisclosureAccepted(aiDisclosure);
      setStorageReady(true);

      // MAU: 앱 실행 즉시 기록 (가입 전 이탈 사용자도 포함)
      trackAppOpen(i18n.language, profile?.userType);
      // 퍼널: 프로필이 아직 없는 새 기기의 첫 실행
      if (!profile) trackFunnelEvent("new_open", i18n.language);
    })();
  }, []);

  // Listen for Supabase auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // 로그아웃 시 로컬 프로필 초기화
        setUserProfile({ name: "", userType: "", fields: [], roleModels: [], interests: [], gender: "", birthDate: "", height: null, weight: null, heightPrivate: false, weightPrivate: false, specialties: [], school: "", career: [], bio: "", location: "", agency: "" });
        safeStorageSet(STORAGE_KEYS.PROFILE, null);
        safeStorageSet(STORAGE_KEYS.DEVICE_USER_ID, null);
        setDeviceUserId(null);
        setPremium(EMPTY_PREMIUM);
        // 로그아웃한 사용자는 다시 가입/로그인 화면을 보게 한다 (게스트 재진입 키 제거)
        AsyncStorage.removeItem(GUEST_ENTERED_KEY).catch(() => {});
        setAuthState("auth");
      } else if (event === "PASSWORD_RECOVERY") {
        // 비밀번호 재설정 링크로 앱 진입 시 → 로그인 화면으로
        setAuthState("auth");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Register device user with Supabase
  useEffect(() => {
    if (!storageReady || authState !== "app") return;
    (async () => {
      try {
        let deviceId = await safeStorageGet(STORAGE_KEYS.DEVICE_ID);
        if (!deviceId) {
          deviceId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
          await safeStorageSet(STORAGE_KEYS.DEVICE_ID, deviceId);
        }
        setApiDeviceId(deviceId); // 게스트 체험 판정용 — API 헤더에 X-Device-Id로 실림
        // 익명 모드(authUserId 없음): 캐시된 userId+토큰이 둘 다 있으면 재사용
        // 인증 모드(authUserId 있음): 캐시 무시하고 항상 재호출하여 auth 연결 보장
        const cachedUserId = await safeStorageGet(STORAGE_KEYS.DEVICE_USER_ID);
        const cachedToken = await safeStorageGet(STORAGE_KEYS.PROFILE_TOKEN);
        if (cachedUserId && cachedToken && !userProfile.authUserId) {
          setDeviceUserId(cachedUserId);
          return;
        }
        // 서버 등록 → userId + 소유권 토큰 발급/갱신
        const { userId, profileToken } = await ensureDeviceUser(
          deviceId, userProfile.name, userProfile.fields?.[0], userProfile.authUserId
        );
        setDeviceUserId(userId);
        await safeStorageSet(STORAGE_KEYS.DEVICE_USER_ID, userId);
        if (profileToken) await safeStorageSet(STORAGE_KEYS.PROFILE_TOKEN, profileToken);
        if (userId) trackFunnelEvent("profile_registered", language);
      } catch (_) {
        // Silent fail — community features will use demo fallback
      }
    })();
  }, [storageReady, authState, userProfile.authUserId]);

  // Pull notes from server on login (merge with local)
  useEffect(() => {
    if (!storageReady || authState !== "app" || !userProfile.authUserId) return;
    (async () => {
      try {
        const serverRows = await fetchNotesFromServer(userProfile.authUserId);
        if (serverRows.length === 0) {
          // 서버에 노트 없음 → 로컬 전체를 push
          if (savedNotes.length > 0) {
            syncNotesToServer(userProfile.authUserId, savedNotes).catch(() => {});
          }
          return;
        }
        // fetch 대기 중 새로 저장된 노트가 유실되지 않도록 최신 상태(prev) 기준으로 병합
        setSavedNotes((prev) => {
          const merged = mergeNotes(prev, serverRows);
          // 로컬에만 있던 노트를 서버에도 push (local_id 기준 upsert라 중복 호출도 안전)
          syncNotesToServer(userProfile.authUserId, merged).catch(() => {});
          return merged;
        });
      } catch (_) {
        // Silent fail — 로컬 데이터 유지
      }
    })();
  }, [storageReady, authState, userProfile.authUserId]);

  // ─── 프리미엄 상태 ───
  // 서버(premium_members)가 정본. 실패하면 이전 값을 유지한다(화면 깜빡임 방지).
  const premiumOptimisticUntilRef = useRef(0);
  const refreshPremium = useCallback(async () => {
    if (!userProfile.authUserId) {
      setPremium(EMPTY_PREMIUM); // 로그아웃·게스트는 프리미엄 없음
      return;
    }
    const next = await fetchPremiumStatus();
    // 결제 직후 3분은 서버의 false(웹훅 지연)로 낙관적 활성 상태를 되돌리지 않는다(2026-09-17 리뷰 지적)
    if (shouldApplyServerPremium(next, premiumOptimisticUntilRef.current)) setPremium(next);
  }, [userProfile.authUserId]);

  // 결제·복원 성공 직후 즉시 활성 표시 — 서버 웹훅 반영까지 수 초~수십 초 걸린다.
  // 다음 refreshPremium에서 서버 값(kind/plan/since 포함)으로 교체된다.
  const markPremiumActive = useCallback((info = {}) => {
    premiumOptimisticUntilRef.current = Date.now() + PREMIUM_OPTIMISTIC_MS;
    setPremium((prev) => ({ ...prev, ...info, active: true, source: "purchase" }));
  }, []);

  // 앱 진입 + 백그라운드 복귀 시 갱신
  useEffect(() => {
    if (!storageReady || authState !== "app") return;
    refreshPremium();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") refreshPremium();
    });
    return () => sub.remove();
  }, [storageReady, authState, refreshPremium]);

  // Sync profile + stats to Supabase when profilePublic is enabled
  useEffect(() => {
    if (!deviceUserId || !userProfile.profilePublic) return;
    const profileWithStats = {
      ...userProfile,
      score: artistProfile.overallScore || 0,
      notesCount: savedNotes.length,
      streakDays: artistProfile.streak || 0,
      mileage: artistProfile.mileage || 0,
    };
    upsertArtistProfile(deviceUserId, profileWithStats)
      .then((res) => {
        if (res && res.ok) {
          setServerStats({ score: res.score, mileage: res.mileage, level: res.level });
        }
      })
      .catch(() => {});

    // Upload pending local photos
    const pendingUris = (userProfile.pendingPhotoUris || []);
    if (pendingUris.length > 0) {
      uploadProfilePhotos(deviceUserId, pendingUris)
        .then((urls) => {
          setUserProfile((prev) => {
            const existing = (prev.photos || []).filter((p) => !p.startsWith("file://"));
            const updated = { ...prev, photos: [...existing, ...urls], pendingPhotoUris: undefined, photoUrl: urls[0] || prev.photoUrl };
            safeStorageSet(STORAGE_KEYS.PROFILE, updated);
            return updated;
          });
        })
        .catch(() => {});
    }
  }, [deviceUserId, userProfile, artistProfile, savedNotes.length]);

  // 1.11.6 이전 녹음(캐시 폴더)을 앱 시작 후 한 번 문서 폴더로 옮긴다 — 캐시가 비워지면 녹음이 사라지던 문제
  const recordingsMigratedRef = useRef(false);
  useEffect(() => {
    if (!storageReady || recordingsMigratedRef.current) return;
    recordingsMigratedRef.current = true;
    migrateCachedRecordings(savedNotes)
      .then((next) => {
        if (!next) return;
        const byId = new Map(next.map((n) => [n.id, n.voiceRecordings]));
        // 이관하는 사이 사용자가 노트를 고쳤을 수 있으니 녹음 필드만 바꿔 끼운다
        setSavedNotes((prev) => prev.map((n) => (byId.has(n.id) && n.voiceRecordings ? { ...n, voiceRecordings: byId.get(n.id) } : n)));
      })
      .catch(() => {});
  }, [storageReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist notes
  useEffect(() => {
    if (!storageReady) return;
    safeStorageSet(STORAGE_KEYS.NOTES, savedNotes);
  }, [savedNotes, storageReady]);

  // Persist portfolio items
  useEffect(() => {
    if (!storageReady) return;
    safeStorageSet(STORAGE_KEYS.PORTFOLIO_ITEMS, portfolioItems);
  }, [portfolioItems, storageReady]);

  // Persist matching posts
  useEffect(() => {
    if (!storageReady) return;
    safeStorageSet(STORAGE_KEYS.MATCHING_POSTS, matchingPosts);
  }, [matchingPosts, storageReady]);

  // Persist matching post 삭제 툼스톤 (서버 병합 시 되살아남 방지)
  useEffect(() => {
    if (!storageReady) return;
    safeStorageSet(STORAGE_KEYS.MATCHING_DELETED, matchingDeletedIds);
  }, [matchingDeletedIds, storageReady]);

  // ─── Note CRUD ───
  const handleSaveNote = useCallback((noteData) => {
    const now = new Date().toISOString();
    const newNote = { id: Date.now(), createdAt: now, updatedAt: now, starred: false, ...noteData };
    setSavedNotes((prev) => [newNote, ...prev]);
    showToast(i18n.t("toast.note_saved"), "success");
    if (userProfile.authUserId) {
      syncSingleNote(userProfile.authUserId, newNote).catch(() => {});
    }
    return newNote.id; // 저장된 노트 id — 연습 측정의 subjectKey로 쓴다
  }, [showToast, userProfile.authUserId]);

  const handleDeleteNote = useCallback((noteId) => {
    setSavedNotes((prev) => prev.filter((n) => n.id !== noteId));
    showToast(i18n.t("toast.note_deleted"), "delete");
    if (userProfile.authUserId) {
      deleteNoteFromServer(userProfile.authUserId, noteId).catch(() => {});
    }
  }, [showToast, userProfile.authUserId]);

  const handleToggleStar = useCallback((noteId) => {
    setSavedNotes((prev) => {
      const note = prev.find((n) => n.id === noteId);
      if (note) showToast(note.starred ? i18n.t("toast.star_removed") : i18n.t("toast.star_added"), note.starred ? "unstar" : "star");
      const updated = prev.map((n) => (n.id === noteId ? { ...n, starred: !n.starred, updatedAt: new Date().toISOString() } : n));
      if (userProfile.authUserId) {
        const toggled = updated.find((n) => n.id === noteId);
        if (toggled) syncSingleNote(userProfile.authUserId, toggled).catch(() => {});
      }
      return updated;
    });
  }, [showToast, userProfile.authUserId]);

  const handleUpdateNote = useCallback((updatedNote, { silent = false } = {}) => {
    const withTimestamp = { ...updatedNote, updatedAt: new Date().toISOString() };
    setSavedNotes((prev) => prev.map((n) => (n.id === updatedNote.id ? withTimestamp : n)));
    if (!silent) showToast(i18n.t("toast.note_updated"), "edit");
    if (userProfile.authUserId) {
      syncSingleNote(userProfile.authUserId, withTimestamp).catch(() => {});
    }
  }, [showToast, userProfile.authUserId]);

  const handleUpdateGoals = useCallback((newGoals) => {
    setGoals(newGoals);
    safeStorageSet(STORAGE_KEYS.GOALS, newGoals);
  }, []);


  const handleSubmitFeedback = useCallback((feedback) => {
    const updated = [feedback, ...feedbacks];
    setFeedbacks(updated);
    safeStorageSet(STORAGE_KEYS.FEEDBACKS, updated);
    notifyServer({ type: "feedback", content: feedback, userName: userProfile.name, email: userProfile.email, sentAt: new Date().toISOString() });
    showToast(i18n.t("toast.feedback_sent"), "success");
  }, [feedbacks, showToast, notifyServer, userProfile]);

  const handleDismissGuide = useCallback(() => {
    setShowBetaGuide(false);
    safeStorageSet(STORAGE_KEYS.BETA_GUIDE, true);
  }, []);

  // ─── Matching Post CRUD ───
  const handleAddMatchingPost = useCallback((postData) => {
    const newPost = { id: Date.now(), source: "user", createdAt: new Date().toISOString(), ...postData };
    setMatchingPosts((prev) => [newPost, ...prev]);
    showToast(i18n.t("toast.matching_added"), "success");
    // 서버 저장(다른 사용자에게 노출)은 부가 경로 — 실패해도 로컬 저장은 그대로 유지
    try {
      createMatchingPost({
        ...postData,
        localId: newPost.id,
        userId: deviceUserId,
        authUserId: userProfile.authUserId,
        authorName: userProfile.name,
        authorField: userProfile.fields?.[0],
      }).catch(() => {});
    } catch (_) {
      // Silent fail — 로컬 공고는 이미 저장됨
    }
  }, [showToast, deviceUserId, userProfile.authUserId, userProfile.name, userProfile.fields]);

  const handleUpdateMatchingPost = useCallback((updatedPost) => {
    setMatchingPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
    showToast(i18n.t("toast.matching_updated"), "edit");
  }, [showToast]);

  const handleDeleteMatchingPost = useCallback((postId) => {
    setMatchingPosts((prev) => prev.filter((p) => p.id !== postId));
    // 툼스톤: 서버 삭제가 실패해도(익명 공고·네트워크) 병합 시 다시 나타나지 않게 최대 200개 유지
    setMatchingDeletedIds((prev) => [postId, ...prev.filter((id) => id !== postId)].slice(0, 200));
    showToast(i18n.t("toast.matching_deleted"), "delete");
    deleteMatchingPost(postId).catch(() => {});
  }, [showToast]);

  // ─── Portfolio CRUD ───
  const handleAddPortfolioItem = useCallback((itemData) => {
    const newItem = { id: Date.now(), createdAt: new Date().toISOString(), ...itemData };
    setPortfolioItems((prev) => [newItem, ...prev]);
    showToast(i18n.t("toast.portfolio_added"), "success");
  }, [showToast]);

  const handleDeletePortfolioItem = useCallback((itemId) => {
    setPortfolioItems((prev) => prev.filter((item) => item.id !== itemId));
    showToast(i18n.t("toast.portfolio_deleted"), "delete");
  }, [showToast]);

  const handleUpdatePortfolioSummary = useCallback((summary) => {
    setPortfolioSummary(summary);
    safeStorageSet(STORAGE_KEYS.PORTFOLIO_SUMMARY, summary);
  }, []);

  const handleFieldOrderChange = useCallback((newOrder) => {
    setFieldOrder(newOrder);
    safeStorageSet("artlink-field-order", newOrder);
  }, []);

  const handleUpdateProfile = useCallback((partial) => {
    setUserProfile((prev) => {
      const updated = { ...prev, ...partial };
      safeStorageSet(STORAGE_KEYS.PROFILE, updated);
      // 이름 변경 시 Supabase user_metadata에도 저장 (재로그인 시 복원용)
      if (partial.name && prev.authUserId) {
        supabase.auth.updateUser({ data: { name: partial.name } }).catch(() => {});
      }
      return updated;
    });
    showToast(i18n.t("toast.profile_updated"), "success");
  }, [showToast]);

  const handleChangeLanguage = useCallback(async (langCode) => {
    setLanguage(langCode);
    await i18n.changeLanguage(langCode);
    await safeStorageSet(STORAGE_KEYS.LANGUAGE, langCode);
  }, []);

  const handleAuth = useCallback(async (profileData) => {
    if (profileData) {
      const { data: { user } } = await supabase.auth.getUser();
      let finalProfile;
      if (profileData._mergeExisting) {
        // 로그인 시: 기존 프로필 유지, 이메일/authUserId만 갱신
        const { _mergeExisting, ...loginData } = profileData;
        const existing = await safeStorageGet(STORAGE_KEYS.PROFILE);
        if (existing && existing.authUserId && user?.id && existing.authUserId !== user.id) {
          // 다른 유저의 프로필이 남아있음 → 서버에서 프로필 복원 시도
          const name = user.user_metadata?.name || loginData.email?.split("@")[0] || "";
          finalProfile = { name, ...loginData, authUserId: user.id };
        } else {
          // 기존 로컬 프로필 유지, loginData로 이메일만 갱신 (이름 덮어쓰기 방지)
          finalProfile = { ...(existing || {}), ...loginData, authUserId: user?.id };
          // 이름이 없으면 user_metadata에서 복원
          if (!finalProfile.name && user?.user_metadata?.name) {
            finalProfile.name = user.user_metadata.name;
          }
          if (!finalProfile.name) {
            finalProfile.name = loginData.email?.split("@")[0] || "";
          }
        }
      } else {
        // 회원가입 시: 전체 프로필 저장
        finalProfile = { ...profileData, authUserId: user?.id };
      }
      setUserProfile(finalProfile);
      safeStorageSet(STORAGE_KEYS.PROFILE, finalProfile);
      // 기존 deviceUserId 캐시 초기화 (새 auth user에 맞게 재등록)
      safeStorageSet(STORAGE_KEYS.DEVICE_USER_ID, null);
      setDeviceUserId(null);
    } else {
      // 둘러보기 — 이 기기는 다음 실행부터 바로 홈으로 (가입 화면 반복 노출 제거)
      AsyncStorage.setItem(GUEST_ENTERED_KEY, "true").catch(() => {});
    }
    setAuthState("app");
  }, []);


  // ─── EULA ───
  const handleAcceptEula = useCallback(() => {
    setEulaAccepted(true);
    safeStorageSet(STORAGE_KEYS.EULA_ACCEPTED, true);
    trackFunnelEvent("eula_accepted", language);
  }, [language]);

  // ─── Data Consent ───
  const handleSetDataConsent = useCallback((value) => {
    setDataConsent(value);
    setDataConsentCache(value);
    safeStorageSet(STORAGE_KEYS.DATA_CONSENT, value);
  }, []);

  const handleDataConsentAsked = useCallback(() => {
    setDataConsentAsked(true);
    safeStorageSet(STORAGE_KEYS.DATA_CONSENT_ASKED, true);
  }, []);

  // ─── AI Disclosure ───
  const handleAcceptAIDisclosure = useCallback(() => {
    setAiDisclosureAccepted(true);
    safeStorageSet(STORAGE_KEYS.AI_DISCLOSURE_ACCEPTED, true);
  }, []);

  // ─── Server report notification ───
  const notifyServer = useCallback(async (reportData) => {
    try {
      await fetch(`${SERVER_URL}/api/report`, {
        method: "POST",
        headers: getApiHeaders(),
        body: JSON.stringify(reportData),
      });
    } catch (_) {
      // Silent fail — local record preserved as backup
    }
  }, []);

  // ─── Block & Report ───
  const handleBlockUser = useCallback((userName) => {
    setBlockedUsers((prev) => {
      if (prev.includes(userName)) return prev;
      const updated = [...prev, userName];
      safeStorageSet(STORAGE_KEYS.BLOCKED_USERS, updated);
      return updated;
    });
    // Notify developer of the block (Apple Guideline 1.2 requirement)
    notifyServer({ type: "block_user", blockedUser: userName, reportedAt: new Date().toISOString() });
    showToast(i18n.t("toast.user_blocked"), "success");
  }, [showToast, notifyServer]);

  const handleUnblockUser = useCallback((userName) => {
    setBlockedUsers((prev) => {
      const updated = prev.filter((u) => u !== userName);
      safeStorageSet(STORAGE_KEYS.BLOCKED_USERS, updated);
      return updated;
    });
    showToast(i18n.t("toast.user_unblocked"), "success");
  }, [showToast]);

  const handleReportContent = useCallback((report) => {
    const newReport = { ...report, reportedAt: new Date().toISOString() };
    setReportedContent((prev) => {
      const updated = [newReport, ...prev];
      safeStorageSet(STORAGE_KEYS.REPORTED_CONTENT, updated);
      return updated;
    });
    // Send report to server so developer can act within 24 hours (Apple Guideline 1.2)
    notifyServer({ type: "content_report", ...newReport });
    showToast(i18n.t("toast.report_submitted"), "success");
  }, [showToast, notifyServer]);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setAuthState("auth");
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    await supabase.auth.signOut();
    await AsyncStorage.clear();
    setSavedNotes([]);
    setUserProfile({ name: "", userType: "", fields: [], roleModels: [], interests: [], gender: "", birthDate: "", height: null, weight: null, heightPrivate: false, weightPrivate: false, specialties: [], school: "", career: [], bio: "", location: "", agency: "" });
    setGoals([]);
    setFeedbacks([]);
    setPortfolioItems([]);
    setPortfolioSummary(null);
    setMatchingPosts([]);
    setMatchingDeletedIds([]);
    setAuthState("auth");
  }, []);

  const value = useMemo(() => ({
    savedNotes, userProfile, goals, feedbacks,
    showBetaGuide, fieldOrder, storageReady, toast, authState, artistProfile: displayProfile,
    portfolioItems, portfolioSummary, matchingPosts, matchingDeletedIds,
    eulaAccepted, blockedUsers, reportedContent, deviceUserId,
    dataConsent, dataConsentAsked, aiDisclosureAccepted, language, isKoreanLocale,
    premium, refreshPremium, markPremiumActive,
    showToast, hideToast,
    handleSaveNote, handleDeleteNote, handleToggleStar, handleUpdateNote,
    handleUpdateGoals, handleSubmitFeedback,
    handleDismissGuide, handleFieldOrderChange, handleAuth, handleChangeLanguage,
    handleAddPortfolioItem, handleDeletePortfolioItem, handleUpdatePortfolioSummary,
    handleAddMatchingPost, handleUpdateMatchingPost, handleDeleteMatchingPost,
    handleUpdateProfile, handleLogout, handleDeleteAccount, setUserProfile, setAuthState,
    handleAcceptEula, handleSetDataConsent, handleDataConsentAsked, handleAcceptAIDisclosure,
    handleBlockUser, handleUnblockUser, handleReportContent,
  }), [
    savedNotes, userProfile, goals, feedbacks,
    showBetaGuide, fieldOrder, storageReady, toast, authState, displayProfile,
    portfolioItems, portfolioSummary, matchingPosts, matchingDeletedIds,
    eulaAccepted, blockedUsers, reportedContent, deviceUserId,
    dataConsent, dataConsentAsked, aiDisclosureAccepted, language, isKoreanLocale,
    premium, refreshPremium, markPremiumActive,
    showToast, hideToast,
    handleSaveNote, handleDeleteNote, handleToggleStar, handleUpdateNote,
    handleUpdateGoals, handleSubmitFeedback,
    handleDismissGuide, handleFieldOrderChange, handleAuth, handleChangeLanguage,
    handleAddPortfolioItem, handleDeletePortfolioItem, handleUpdatePortfolioSummary,
    handleAddMatchingPost, handleUpdateMatchingPost, handleDeleteMatchingPost,
    handleUpdateProfile, handleLogout, handleDeleteAccount,
    handleAcceptEula, handleSetDataConsent, handleDataConsentAsked, handleAcceptAIDisclosure,
    handleBlockUser, handleUnblockUser, handleReportContent,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
