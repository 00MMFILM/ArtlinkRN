import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeStorageGet, safeStorageSet, strictStorageGet, STORAGE_KEYS } from "../utils/storage";
import { accountScope, getStorageScope, isGuestScope, guestStorageScope, initializeAccountStorage, setStorageScope, transferGuestData, hasUnassignedLegacyData, clearAccountStorage, claimUnassignedLegacyData } from "../utils/accountStorage";
import { readNoteState, mutateNoteState } from "../services/noteStore";
import { supabase } from "../services/supabaseClient";
import i18n from "i18next";
import { computeArtistProfile } from "../services/analyticsService";
import { ensureDeviceUser } from "../services/communityService";
import { upsertArtistProfile, deleteArtistProfile, uploadProfilePhotos, mergeServerStats, syncProfileVisibility, nextVisibilityStamp, adoptServerVisibility } from "../services/profileService";
import { requestAccountDelete } from "../services/accountDeleteService";
import { syncAccountNotes } from "../services/notesSyncService";
import { trackAppOpen, trackFunnelEvent } from "../services/mauService";
import { createMatchingPost, deleteMatchingPost } from "../services/matchingService";
import { SERVER_URL, getApiHeaders, setApiDeviceId, setDataConsentCache } from "../services/apiConfig";
import { getPracticeLog } from "../services/practiceService";
import { applyPracticeActivityStats } from "../utils/practiceStats";
import { fetchPremiumStatus, EMPTY_PREMIUM, shouldApplyServerPremium, PREMIUM_OPTIMISTIC_MS } from "../services/premiumService";
import { migrateCachedRecordings } from "../services/recordingMigration";

const AppContext = createContext();

const EMPTY_PROFILE = { name: "", userType: "", fields: [], roleModels: [], interests: [], gender: "", birthDate: "", height: null, weight: null, heightPrivate: false, weightPrivate: false, specialties: [], school: "", career: [], bio: "", location: "", agency: "" };
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
  const renderedScope = getStorageScope();
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
  const [legacyRecordsPending, setLegacyRecordsPending] = useState(false);
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
    const scope = getStorageScope();
    getPracticeLog()
      .then((log) => {
        if (scope !== getStorageScope()) return;
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

  const accountGenerationRef = useRef(0);
  const bootstrapRef = useRef(null);
  const ensureStorageInitialized = useCallback(() => {
    if (!bootstrapRef.current) {
      bootstrapRef.current = initializeAccountStorage().catch((error) => {
        bootstrapRef.current = null; // A later sign-in can retry a failed disk read/write.
        throw error;
      });
    }
    return bootstrapRef.current;
  }, []);
  const profileRef = useRef(userProfile);
  profileRef.current = userProfile;
  const syncNotesRef = useRef(() => {});

  const clearVisibleAccount = useCallback(() => {
    setSavedNotes([]); setUserProfile(EMPTY_PROFILE); setGoals([]); setFeedbacks([]);
    setPortfolioItems([]); setPortfolioSummary(null); setMatchingPosts([]); setMatchingDeletedIds([]);
    setBlockedUsers([]); setReportedContent([]); setDeviceUserId(null); setPremium(EMPTY_PREMIUM);
    setServerStats(null); setPracticeLog([]); setDataConsent(false); setDataConsentCache(false);
    setDataConsentAsked(false); setAiDisclosureAccepted(false); setEulaAccepted(false);
    premiumOptimisticUntilRef.current = 0;
  }, []);

  const hydrateAccount = useCallback(async (scope, generation) => {
    const keys = ["PROFILE", "GOALS", "FEEDBACKS", "PORTFOLIO_ITEMS", "PORTFOLIO_SUMMARY", "MATCHING_POSTS", "MATCHING_DELETED", "BLOCKED_USERS", "REPORTED_CONTENT", "DATA_CONSENT", "DATA_CONSENT_ASKED", "AI_DISCLOSURE_ACCEPTED", "EULA_ACCEPTED"];
    const [noteState, values, legacyPending] = await Promise.all([
      readNoteState(scope), Promise.all(keys.map((key) => strictStorageGet(STORAGE_KEYS[key], scope))), hasUnassignedLegacyData(),
    ]);
    if (generation !== accountGenerationRef.current || scope !== getStorageScope()) return null;
    const [profile, g, fb, items, summary, posts, deleted, blocked, reported, consent, asked, disclosure, eula] = values;
    setLegacyRecordsPending(legacyPending);
    setSavedNotes(noteState.notes); setUserProfile(profile || EMPTY_PROFILE); setGoals(g || []); setFeedbacks(fb || []);
    setPortfolioItems(items || []); setPortfolioSummary(summary || null); setMatchingPosts(posts || []); setMatchingDeletedIds(deleted || []);
    setBlockedUsers(blocked || []); setReportedContent(reported || []); setDataConsent(!!consent); setDataConsentCache(!!consent);
    setDataConsentAsked(!!asked); setAiDisclosureAccepted(!!disclosure); setEulaAccepted(!!eula);
    const log = await getPracticeLog();
    if (generation !== accountGenerationRef.current) return null;
    setPracticeLog(log);
    setStorageReady(true);
    return profile || EMPTY_PROFILE;
  }, []);

  // The scope is selected before reading any account-owned data. Legacy storage
  // is copied once, never automatically attributed to a different signed-in user.
  useEffect(() => {
    const generation = ++accountGenerationRef.current;
    (async () => {
      try {
        let scope = await ensureStorageInitialized();
        const isCurrent = () => generation === accountGenerationRef.current;
        if (!isCurrent()) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!isCurrent()) return;
        if (session?.user?.id) scope = await setStorageScope(accountScope(session.user.id), { isCurrent });
        else if (!isGuestScope(scope)) scope = await setStorageScope(await guestStorageScope(), { isCurrent });
        if (!isCurrent() || !scope) return;
        const profile = await hydrateAccount(scope, generation);
        if (!profile || generation !== accountGenerationRef.current) return;
        const guestEntered = await AsyncStorage.getItem(GUEST_ENTERED_KEY).then((v) => v === "true").catch(() => false);
        setAuthState(resolveInitialAuthState({ profile: profile === EMPTY_PROFILE ? null : profile, hasSession: !!session, guestEntered }));
        const guide = await safeStorageGet(STORAGE_KEYS.BETA_GUIDE);
        if (!guide) setShowBetaGuide(true);
        trackAppOpen(i18n.language, profile?.userType);
        if (!profile.name) trackFunnelEvent("new_open", i18n.language);
      } catch (_) {
        // Leave the previous durable account data intact; no empty snapshot is saved.
        if (generation === accountGenerationRef.current) { setStorageReady(false); setAuthState("auth"); }
      }
    })();
    return () => { accountGenerationRef.current += 1; };
  }, [hydrateAccount, ensureStorageInitialized]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        const generation = ++accountGenerationRef.current;
        setStorageReady(false); clearVisibleAccount(); setAuthState("auth");
        AsyncStorage.removeItem(GUEST_ENTERED_KEY).catch(() => {});
        (async () => {
          await ensureStorageInitialized();
          const scope = await guestStorageScope();
          const isCurrent = () => generation === accountGenerationRef.current;
          if (!isCurrent()) return;
          await setStorageScope(scope, { isCurrent });
          if (!isCurrent()) return;
          await hydrateAccount(scope, generation);
        })().catch(() => {});
      } else if (event === "PASSWORD_RECOVERY") setAuthState("auth");
    });
    return () => subscription.unsubscribe();
  }, [clearVisibleAccount, hydrateAccount, ensureStorageInitialized]);

  // Register device user with Supabase
  useEffect(() => {
    if (!storageReady || authState !== "app") return;
    const generation = accountGenerationRef.current;
    const scope = getStorageScope();
    let cancelled = false;
    const isCurrent = () => !cancelled && generation === accountGenerationRef.current;
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
        if (!isCurrent()) return;
        if (cachedUserId && cachedToken && !userProfile.authUserId) {
          setDeviceUserId(cachedUserId);
          return;
        }
        // 서버 등록 → userId + 소유권 토큰 발급/갱신
        const { userId, profileToken } = await ensureDeviceUser(
          userProfile.authUserId ? deviceId : `${deviceId}:${scope || "guest"}`, userProfile.name, userProfile.fields?.[0], userProfile.authUserId
        );
        if (!isCurrent()) return;
        setDeviceUserId(userId);
        await safeStorageSet(STORAGE_KEYS.DEVICE_USER_ID, userId, scope);
        if (profileToken) await safeStorageSet(STORAGE_KEYS.PROFILE_TOKEN, profileToken, scope);
        if (userId) trackFunnelEvent("profile_registered", language);
      } catch (_) {
        // Silent fail — community features will use demo fallback
      }
    })();
    return () => { cancelled = true; };
  }, [storageReady, authState, userProfile.authUserId]);

  // Serialize sync and retry failures on foreground/reconnect polling. Every
  // result remains bound to the account that initiated it.
  useEffect(() => {
    if (!storageReady || authState !== "app" || !userProfile.authUserId) {
      syncNotesRef.current = () => {};
      return;
    }
    const generation = accountGenerationRef.current;
    const scope = getStorageScope();
    let cancelled = false, retryTimer = null;
    const isCurrent = () => !cancelled && generation === accountGenerationRef.current && scope === getStorageScope();
    const run = () => {
      clearTimeout(retryTimer);
      if (!isCurrent()) return;
      syncAccountNotes({ authUserId: userProfile.authUserId, scope, isCurrent, onChange: setSavedNotes })
        .catch(() => { if (isCurrent()) retryTimer = setTimeout(run, 30000); });
    };
    syncNotesRef.current = run;
    run();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") run(); });
    return () => { cancelled = true; clearTimeout(retryTimer); subscription?.remove?.(); syncNotesRef.current = () => {}; };
  }, [storageReady, authState, userProfile.authUserId]);

  // ─── 프리미엄 상태 ───
  // 서버(premium_members)가 정본. 실패하면 이전 값을 유지한다(화면 깜빡임 방지).
  const premiumOptimisticUntilRef = useRef(0);
  const refreshPremium = useCallback(async () => {
    if (!userProfile.authUserId) {
      setPremium(EMPTY_PREMIUM); // 로그아웃·게스트는 프리미엄 없음
      return;
    }
    const generation = accountGenerationRef.current;
    const next = await fetchPremiumStatus();
    if (generation !== accountGenerationRef.current) return;
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
    if (!storageReady || !deviceUserId || !userProfile.profilePublic) return;
    const generation = accountGenerationRef.current;
    const scope = getStorageScope();
    const snapshot = userProfile;
    let cancelled = false;
    const isCurrent = () => !cancelled && generation === accountGenerationRef.current && profileRef.current === snapshot;
    const profileWithStats = {
      ...userProfile,
      score: artistProfile.overallScore || 0,
      notesCount: savedNotes.length,
      streakDays: artistProfile.streak || 0,
      mileage: artistProfile.mileage || 0,
    };
    upsertArtistProfile(deviceUserId, profileWithStats)
      .then(async (res) => {
        if (!isCurrent() || !res || !res.ok) return;
        setServerStats({ score: res.score, mileage: res.mileage, level: res.level });
        // 다른 기기에서 공개를 껐다면 서버가 그 사실을 함께 돌려준다 — 이 기기도 따라간다.
        const adopted = adoptServerVisibility(snapshot, res);
        if (adopted) {
          const updated = { ...snapshot, ...adopted, visibilityPending: false };
          const saved = await safeStorageSet(STORAGE_KEYS.PROFILE, updated, scope);
          if (saved && isCurrent()) setUserProfile(updated);
        }
      })
      .catch(() => {});

    // Upload pending local photos
    const pendingUris = (userProfile.pendingPhotoUris || []);
    if (pendingUris.length > 0) {
      uploadProfilePhotos(deviceUserId, pendingUris, snapshot.photos || [], snapshot)
        .then((urls) => {
          if (!isCurrent()) return;
          const replacements = new Map(pendingUris.map((uri, i) => [uri, urls[i]]));
          const photos = (snapshot.photos || []).map((uri) => replacements.get(uri) || uri);
          const updated = { ...snapshot, photos, pendingPhotoUris: undefined, photoUrl: photos[0] || null };
          safeStorageSet(STORAGE_KEYS.PROFILE, updated, scope).then((ok) => {
            if (ok && isCurrent()) setUserProfile(updated);
          });
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [storageReady, deviceUserId, userProfile, artistProfile, savedNotes.length]);

  // Turning the profile off must reach the server, not just stop uploading. The pending
  // flag is stored with the profile, so a failure is retried on foreground and on the
  // next app launch until the server confirms it.
  useEffect(() => {
    if (!storageReady || !deviceUserId || !userProfile.visibilityPending) return;
    const generation = accountGenerationRef.current;
    const scope = getStorageScope();
    const snapshot = userProfile;
    let cancelled = false;
    const isCurrent = () => !cancelled && generation === accountGenerationRef.current && profileRef.current === snapshot;
    const run = () => {
      if (!isCurrent()) return;
      syncProfileVisibility(deviceUserId, snapshot)
        .then(async (res) => {
          if (!isCurrent()) return;
          const updated = { ...snapshot, visibilityPending: false, ...adoptServerVisibility(snapshot, res) };
          const saved = await safeStorageSet(STORAGE_KEYS.PROFILE, updated, scope);
          if (saved && isCurrent()) setUserProfile(updated);
        })
        .catch(() => {});
    };
    run();
    const sub = AppState.addEventListener("change", (next) => { if (next === "active") run(); });
    return () => { cancelled = true; sub?.remove?.(); };
  }, [storageReady, deviceUserId, userProfile]);

  // Migrate cache recordings within their owner's namespace. A late migration
  // must not rewrite another account's notes or overwrite newer note edits.
  const recordingsMigratedRef = useRef(new Set());
  useEffect(() => {
    if (!storageReady) return;
    const scope = getStorageScope(), generation = accountGenerationRef.current;
    if (recordingsMigratedRef.current.has(scope)) return;
    recordingsMigratedRef.current.add(scope);
    migrateCachedRecordings(savedNotes).then(async (next) => {
      if (!next || generation !== accountGenerationRef.current) return;
      const byId = new Map(next.map((n) => [n.id, n.voiceRecordings]));
      const stored = await mutateNoteState(scope, (current) => ({ ...current, notes: current.notes.map((n) =>
        byId.has(n.id) && n.voiceRecordings ? { ...n, voiceRecordings: byId.get(n.id) } : n) }));
      if (generation === accountGenerationRef.current) setSavedNotes(stored.notes);
    }).catch(() => {});
  }, [storageReady, userProfile.authUserId]);

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

  // ─── Note CRUD: durable local commit before success UI or navigation ───
  const commitNotes = useCallback(async (mutation) => {
    if (!storageReady || renderedScope !== getStorageScope()) throw new Error("ACCOUNT_NOT_READY");
    const scope = getStorageScope(), generation = accountGenerationRef.current;
    const state = await mutateNoteState(scope, mutation);
    if (generation !== accountGenerationRef.current) throw new Error("ACCOUNT_CHANGED");
    setSavedNotes(state.notes);
    syncNotesRef.current();
    return state;
  }, [storageReady, renderedScope]);

  const handleSaveNote = useCallback(async (noteData) => {
    const now = new Date().toISOString();
    const newNote = { id: Date.now(), createdAt: now, updatedAt: now, starred: false, ...noteData };
    await commitNotes((state) => {
      while (state.notes.some((n) => n.id === newNote.id) || state.tombstones[newNote.id]) newNote.id += 1;
      return { ...state, notes: [newNote, ...state.notes] };
    });
    showToast(i18n.t("toast.note_saved"), "success");
    return newNote.id;
  }, [commitNotes, showToast]);

  const handleDeleteNote = useCallback(async (noteId) => {
    await commitNotes((state) => ({
      notes: state.notes.filter((n) => n.id !== noteId),
      tombstones: { ...state.tombstones, [noteId]: { deletedAt: new Date().toISOString(), synced: false } },
    }));
    showToast(i18n.t("toast.note_deleted"), "delete");
  }, [commitNotes, showToast]);

  const handleToggleStar = useCallback(async (noteId) => {
    try {
      await commitNotes((state) => ({ ...state, notes: state.notes.map((n) => n.id === noteId ?
        { ...n, starred: !n.starred, updatedAt: new Date().toISOString() } : n) }));
    } catch (_) { showToast(i18n.t("common.error"), "error"); }
  }, [commitNotes, showToast]);

  const handleUpdateNote = useCallback(async (updatedNote, { silent = false } = {}) => {
    await commitNotes((state) => {
      if (state.tombstones[updatedNote.id] || !state.notes.some((n) => n.id === updatedNote.id)) throw new Error("NOTE_NOT_FOUND");
      return { ...state, notes: state.notes.map((n) => n.id === updatedNote.id ?
        { ...updatedNote, updatedAt: new Date().toISOString() } : n) };
    });
    if (!silent) showToast(i18n.t("toast.note_updated"), "edit");
  }, [commitNotes, showToast]);

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
    if (!storageReady || renderedScope !== getStorageScope()) throw new Error("ACCOUNT_CHANGED");
    const newItem = { id: Date.now(), createdAt: new Date().toISOString(), ...itemData };
    setPortfolioItems((prev) => [newItem, ...prev]);
    showToast(i18n.t("toast.portfolio_added"), "success");
  }, [storageReady, renderedScope, showToast]);

  const handleDeletePortfolioItem = useCallback((itemId) => {
    setPortfolioItems((prev) => prev.filter((item) => item.id !== itemId));
    showToast(i18n.t("toast.portfolio_deleted"), "delete");
  }, [showToast]);

  const handleUpdatePortfolioSummary = useCallback((summary) => {
    if (!storageReady || renderedScope !== getStorageScope()) throw new Error("ACCOUNT_CHANGED");
    setPortfolioSummary(summary);
    safeStorageSet(STORAGE_KEYS.PORTFOLIO_SUMMARY, summary, renderedScope);
  }, [storageReady, renderedScope]);

  const handleFieldOrderChange = useCallback((newOrder) => {
    setFieldOrder(newOrder);
    safeStorageSet("artlink-field-order", newOrder);
  }, []);

  const handleUpdateProfile = useCallback(async (partial) => {
    if (!storageReady || renderedScope !== getStorageScope()) throw new Error("ACCOUNT_NOT_READY");
    const scope = getStorageScope(), generation = accountGenerationRef.current;
    const previous = profileRef.current;
    const updated = { ...previous, ...partial };
    // Every toggle gets a newer stamp and stays pending until the server accepts it.
    if ("profilePublic" in partial && !!partial.profilePublic !== !!previous.profilePublic) {
      updated.visibilityUpdatedAt = nextVisibilityStamp(previous.visibilityUpdatedAt);
      updated.visibilityPending = true;
    }
    if (!await safeStorageSet(STORAGE_KEYS.PROFILE, updated, scope)) throw new Error("LOCAL_STORAGE_WRITE_FAILED");
    if (generation !== accountGenerationRef.current) throw new Error("ACCOUNT_CHANGED");
    setUserProfile(updated);
    if (partial.name && previous.authUserId) supabase.auth.updateUser({ data: { name: partial.name } }).catch(() => {});
    showToast(i18n.t("toast.profile_updated"), "success");
  }, [storageReady, renderedScope, showToast]);

  const handleChangeLanguage = useCallback(async (langCode) => {
    setLanguage(langCode);
    await i18n.changeLanguage(langCode);
    await safeStorageSet(STORAGE_KEYS.LANGUAGE, langCode);
  }, []);

  const handleAuth = useCallback(async (profileData) => {
    const generation = ++accountGenerationRef.current;
    setStorageReady(false); clearVisibleAccount();
    try {
      await ensureStorageInitialized();
      const isCurrent = () => generation === accountGenerationRef.current;
      if (!isCurrent()) return;
      const previousScope = getStorageScope();
      if (profileData) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) throw new Error("AUTH_REQUIRED");
        if (!isCurrent()) return;
        const scope = accountScope(user.id);
        if (isGuestScope(previousScope)) await transferGuestData(previousScope, scope);
        if (generation !== accountGenerationRef.current) return;
        await setStorageScope(scope, { isCurrent });
        if (!isCurrent()) return;
        const existing = await strictStorageGet(STORAGE_KEYS.PROFILE, scope);
        const { _mergeExisting, ...loginData } = profileData;
        const finalProfile = { ...(existing || {}), ...loginData, authUserId: user.id };
        if (_mergeExisting) finalProfile.name = existing?.name || user.user_metadata?.name || loginData.email?.split("@")[0] || "";
        if (!await safeStorageSet(STORAGE_KEYS.PROFILE, finalProfile, scope)) throw new Error("LOCAL_STORAGE_WRITE_FAILED");
        await hydrateAccount(scope, generation);
      } else {
        const scope = await guestStorageScope();
        await setStorageScope(scope, { isCurrent });
        if (!isCurrent()) return;
        await hydrateAccount(scope, generation);
        if (!isCurrent()) return;
        await AsyncStorage.setItem(GUEST_ENTERED_KEY, "true");
      }
      if (generation === accountGenerationRef.current) setAuthState("app");
    } catch (error) {
      if (generation === accountGenerationRef.current) { setStorageReady(false); setAuthState("auth"); }
      throw error;
    }
  }, [clearVisibleAccount, hydrateAccount, ensureStorageInitialized]);

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

  // Local data is erased only after the server reports a complete deletion. On any
  // failure the session and the data stay, so the user can retry from the same screen.
  const handleDeleteAccount = useCallback(async () => {
    const scope = getStorageScope();
    if (!userProfile.authUserId || !scope?.startsWith("account:")) throw new Error("ACCOUNT_DELETION_REQUIRES_LOGIN");
    const result = await requestAccountDelete();
    await clearAccountStorage(scope);
    await supabase.auth.signOut();
    return result;
  }, [userProfile.authUserId]);

  // Device-local recovery of the owner-unknown legacy snapshot, only on explicit
  // confirmation. Nothing is pulled from the server and the original is kept.
  const handleClaimLegacyRecords = useCallback(async () => {
    const scope = getStorageScope();
    if (!userProfile.authUserId || !scope?.startsWith("account:")) throw new Error("ACCOUNT_LOGIN_REQUIRED");
    await claimUnassignedLegacyData(scope);
    await hydrateAccount(scope, accountGenerationRef.current);
  }, [userProfile.authUserId, hydrateAccount]);

  const value = useMemo(() => ({
    savedNotes, userProfile, goals, feedbacks,
    showBetaGuide, fieldOrder, storageReady, legacyRecordsPending, toast, authState, artistProfile: displayProfile,
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
    handleUpdateProfile, handleLogout, handleDeleteAccount, handleClaimLegacyRecords, setUserProfile, setAuthState,
    handleAcceptEula, handleSetDataConsent, handleDataConsentAsked, handleAcceptAIDisclosure,
    handleBlockUser, handleUnblockUser, handleReportContent,
  }), [
    savedNotes, userProfile, goals, feedbacks,
    showBetaGuide, fieldOrder, storageReady, legacyRecordsPending, toast, authState, displayProfile,
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
    handleUpdateProfile, handleLogout, handleDeleteAccount, handleClaimLegacyRecords,
    handleAcceptEula, handleSetDataConsent, handleDataConsentAsked, handleAcceptAIDisclosure,
    handleBlockUser, handleUnblockUser, handleReportContent,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
