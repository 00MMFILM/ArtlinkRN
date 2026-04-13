import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeStorageGet, safeStorageSet, STORAGE_KEYS } from "../utils/storage";
import { supabase } from "../services/supabaseClient";
import i18n from "i18next";
import { computeArtistProfile } from "../services/analyticsService";
import { ensureDeviceUser } from "../services/communityService";
import { upsertArtistProfile, deleteArtistProfile, uploadProfilePhotos } from "../services/profileService";
import { syncSingleNote, syncNotesToServer, fetchNotesFromServer, mergeNotes, deleteNoteFromServer } from "../services/notesSyncService";
import { trackAppOpen } from "../services/mauService";

const AppContext = createContext();

const DEFAULT_FIELD_ORDER = ["acting", "music", "art", "dance", "literature", "film"];

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
  const isKoreanLocale = language === "ko";

  const artistProfile = useMemo(
    () => computeArtistProfile(savedNotes, userProfile),
    [savedNotes, userProfile]
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
      const [notes, profile, dm, g, sub, fb, guide, pItems, pSummary, mPosts, eula, blocked, reported, consent, consentAsked, aiDisclosure] = await Promise.all([
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
        safeStorageGet(STORAGE_KEYS.EULA_ACCEPTED),
        safeStorageGet(STORAGE_KEYS.BLOCKED_USERS),
        safeStorageGet(STORAGE_KEYS.REPORTED_CONTENT),
        safeStorageGet(STORAGE_KEYS.DATA_CONSENT),
        safeStorageGet(STORAGE_KEYS.DATA_CONSENT_ASKED),
        safeStorageGet(STORAGE_KEYS.AI_DISCLOSURE_ACCEPTED),
      ]);
      if (notes) setSavedNotes(notes);
      if (profile) {
        setUserProfile(profile);
        if (profile.authUserId) {
          // Auth 유저 → 세션 유효할 때만 진입
          const { data: { session } } = await supabase.auth.getSession();
          setAuthState(session ? "app" : "auth");
        } else {
          // 기존 유저 (Auth 미연동) → 바로 앱 진입 허용
          setAuthState("app");
        }
      }

      if (g) setGoals(g);
      // subscription removed
      if (fb) setFeedbacks(fb);
      if (!guide) setShowBetaGuide(true);
      if (pItems) setPortfolioItems(pItems);
      if (pSummary) setPortfolioSummary(pSummary);
      if (mPosts) setMatchingPosts(mPosts);
      if (eula) setEulaAccepted(eula);
      if (blocked) setBlockedUsers(blocked);
      if (reported) setReportedContent(reported);
      if (consent) setDataConsent(consent);
      if (consentAsked) setDataConsentAsked(consentAsked);
      if (aiDisclosure) setAiDisclosureAccepted(aiDisclosure);
      setStorageReady(true);
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
        trackAppOpen(language, userProfile.userType);
        // Check cached userId first
        const cachedUserId = await safeStorageGet(STORAGE_KEYS.DEVICE_USER_ID);
        if (cachedUserId) {
          setDeviceUserId(cachedUserId);
          return;
        }
        const userId = await ensureDeviceUser(deviceId, userProfile.name, userProfile.fields?.[0], userProfile.authUserId);
        setDeviceUserId(userId);
        await safeStorageSet(STORAGE_KEYS.DEVICE_USER_ID, userId);
      } catch (_) {
        // Silent fail — community features will use demo fallback
      }
    })();
  }, [storageReady, authState]);

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
        const merged = mergeNotes(savedNotes, serverRows);
        setSavedNotes(merged);
        // 로컬에만 있던 노트를 서버에도 push
        syncNotesToServer(userProfile.authUserId, merged).catch(() => {});
      } catch (_) {
        // Silent fail — 로컬 데이터 유지
      }
    })();
  }, [storageReady, authState, userProfile.authUserId]);

  // Sync profile + stats to Supabase when profilePublic is enabled
  useEffect(() => {
    if (!deviceUserId || !userProfile.profilePublic) return;
    const profileWithStats = {
      ...userProfile,
      score: artistProfile.overallScore || 0,
      notesCount: savedNotes.length,
      streakDays: artistProfile.streak || 0,
    };
    upsertArtistProfile(deviceUserId, profileWithStats).catch(() => {});

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

  // ─── Note CRUD ───
  const handleSaveNote = useCallback((noteData) => {
    const now = new Date().toISOString();
    const newNote = { id: Date.now(), createdAt: now, updatedAt: now, starred: false, ...noteData };
    setSavedNotes((prev) => [newNote, ...prev]);
    showToast(i18n.t("toast.note_saved"), "success");
    if (userProfile.authUserId) {
      syncSingleNote(userProfile.authUserId, newNote).catch(() => {});
    }
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

  const handleUpdateNote = useCallback((updatedNote) => {
    const withTimestamp = { ...updatedNote, updatedAt: new Date().toISOString() };
    setSavedNotes((prev) => prev.map((n) => (n.id === updatedNote.id ? withTimestamp : n)));
    showToast(i18n.t("toast.note_updated"), "edit");
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
  }, [showToast]);

  const handleUpdateMatchingPost = useCallback((updatedPost) => {
    setMatchingPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
    showToast(i18n.t("toast.matching_updated"), "edit");
  }, [showToast]);

  const handleDeleteMatchingPost = useCallback((postId) => {
    setMatchingPosts((prev) => prev.filter((p) => p.id !== postId));
    showToast(i18n.t("toast.matching_deleted"), "delete");
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
    }
    setAuthState("app");
  }, []);


  // ─── EULA ───
  const handleAcceptEula = useCallback(() => {
    setEulaAccepted(true);
    safeStorageSet(STORAGE_KEYS.EULA_ACCEPTED, true);
  }, []);

  // ─── Data Consent ───
  const handleSetDataConsent = useCallback((value) => {
    setDataConsent(value);
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
      await fetch("https://artlink-server.vercel.app/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    setAuthState("auth");
  }, []);

  const value = useMemo(() => ({
    savedNotes, userProfile, goals, feedbacks,
    showBetaGuide, fieldOrder, storageReady, toast, authState, artistProfile,
    portfolioItems, portfolioSummary, matchingPosts,
    eulaAccepted, blockedUsers, reportedContent, deviceUserId,
    dataConsent, dataConsentAsked, aiDisclosureAccepted, language, isKoreanLocale,
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
    showBetaGuide, fieldOrder, storageReady, toast, authState, artistProfile,
    portfolioItems, portfolioSummary, matchingPosts,
    eulaAccepted, blockedUsers, reportedContent, deviceUserId,
    dataConsent, dataConsentAsked, aiDisclosureAccepted, language, isKoreanLocale,
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
