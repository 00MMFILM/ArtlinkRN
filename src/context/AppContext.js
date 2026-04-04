import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { safeStorageGet, safeStorageSet, STORAGE_KEYS } from "../utils/storage";
import { supabase } from "../services/supabaseClient";
import { computeArtistProfile } from "../services/analyticsService";
import { ensureDeviceUser } from "../services/communityService";
import { upsertArtistProfile, deleteArtistProfile, uploadProfilePhotos } from "../services/profileService";

const AppContext = createContext();

const DEFAULT_FIELD_ORDER = ["acting", "music", "art", "dance", "literature", "film"];

export function AppProvider({ children }) {
  const [savedNotes, setSavedNotes] = useState([]);
  const [userProfile, setUserProfile] = useState({
    name: "무아", userType: "", fields: [], roleModels: [], interests: [],
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
      const [notes, profile, dm, g, sub, fb, guide, pItems, pSummary, mPosts, eula, blocked, reported, consent, consentAsked] = await Promise.all([
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
      setStorageReady(true);
    })();
  }, []);

  // Listen for Supabase auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
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
    const newNote = { id: Date.now(), createdAt: new Date().toISOString(), starred: false, ...noteData };
    setSavedNotes((prev) => [newNote, ...prev]);
    showToast("노트가 저장되었습니다!", "success");
  }, [showToast]);

  const handleDeleteNote = useCallback((noteId) => {
    setSavedNotes((prev) => prev.filter((n) => n.id !== noteId));
    showToast("노트가 삭제되었습니다", "delete");
  }, [showToast]);

  const handleToggleStar = useCallback((noteId) => {
    setSavedNotes((prev) => {
      const note = prev.find((n) => n.id === noteId);
      if (note) showToast(note.starred ? "즐겨찾기 해제" : "즐겨찾기에 추가!", note.starred ? "unstar" : "star");
      return prev.map((n) => (n.id === noteId ? { ...n, starred: !n.starred } : n));
    });
  }, [showToast]);

  const handleUpdateNote = useCallback((updatedNote) => {
    setSavedNotes((prev) => prev.map((n) => (n.id === updatedNote.id ? updatedNote : n)));
    showToast("노트가 수정되었습니다", "edit");
  }, [showToast]);

  const handleUpdateGoals = useCallback((newGoals) => {
    setGoals(newGoals);
    safeStorageSet(STORAGE_KEYS.GOALS, newGoals);
  }, []);


  const handleSubmitFeedback = useCallback((feedback) => {
    const updated = [feedback, ...feedbacks];
    setFeedbacks(updated);
    safeStorageSet(STORAGE_KEYS.FEEDBACKS, updated);
    notifyServer({ type: "feedback", content: feedback, userName: userProfile.name, email: userProfile.email, sentAt: new Date().toISOString() });
    showToast("피드백이 전송되었습니다!", "success");
  }, [feedbacks, showToast, notifyServer, userProfile]);

  const handleDismissGuide = useCallback(() => {
    setShowBetaGuide(false);
    safeStorageSet(STORAGE_KEYS.BETA_GUIDE, true);
  }, []);

  // ─── Matching Post CRUD ───
  const handleAddMatchingPost = useCallback((postData) => {
    const newPost = { id: Date.now(), source: "user", createdAt: new Date().toISOString(), ...postData };
    setMatchingPosts((prev) => [newPost, ...prev]);
    showToast("매칭 글이 등록되었습니다!", "success");
  }, [showToast]);

  const handleUpdateMatchingPost = useCallback((updatedPost) => {
    setMatchingPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
    showToast("매칭 글이 수정되었습니다", "edit");
  }, [showToast]);

  const handleDeleteMatchingPost = useCallback((postId) => {
    setMatchingPosts((prev) => prev.filter((p) => p.id !== postId));
    showToast("매칭 글이 삭제되었습니다", "delete");
  }, [showToast]);

  // ─── Portfolio CRUD ───
  const handleAddPortfolioItem = useCallback((itemData) => {
    const newItem = { id: Date.now(), createdAt: new Date().toISOString(), ...itemData };
    setPortfolioItems((prev) => [newItem, ...prev]);
    showToast("포트폴리오에 추가되었습니다!", "success");
  }, [showToast]);

  const handleDeletePortfolioItem = useCallback((itemId) => {
    setPortfolioItems((prev) => prev.filter((item) => item.id !== itemId));
    showToast("포트폴리오 항목이 삭제되었습니다", "delete");
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
      return updated;
    });
    showToast("프로필이 업데이트되었습니다!", "success");
  }, [showToast]);

  const handleAuth = useCallback(async (profileData) => {
    if (profileData && profileData.name) {
      const { data: { user } } = await supabase.auth.getUser();
      let finalProfile;
      if (profileData._mergeExisting) {
        // 로그인 시: 기존 프로필 유지, 이메일/authUserId만 갱신
        const { _mergeExisting, ...loginData } = profileData;
        const existing = await safeStorageGet(STORAGE_KEYS.PROFILE);
        finalProfile = { ...(existing || {}), ...loginData, authUserId: user?.id };
      } else {
        // 회원가입 시: 전체 프로필 저장
        finalProfile = { ...profileData, authUserId: user?.id };
      }
      setUserProfile(finalProfile);
      safeStorageSet(STORAGE_KEYS.PROFILE, finalProfile);
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
    showToast("사용자가 차단되었습니다", "success");
  }, [showToast, notifyServer]);

  const handleUnblockUser = useCallback((userName) => {
    setBlockedUsers((prev) => {
      const updated = prev.filter((u) => u !== userName);
      safeStorageSet(STORAGE_KEYS.BLOCKED_USERS, updated);
      return updated;
    });
    showToast("차단이 해제되었습니다", "success");
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
    showToast("신고가 접수되었습니다. 24시간 이내에 조치됩니다.", "success");
  }, [showToast, notifyServer]);

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
    dataConsent, dataConsentAsked,
    showToast, hideToast,
    handleSaveNote, handleDeleteNote, handleToggleStar, handleUpdateNote,
    handleUpdateGoals, handleSubmitFeedback,
    handleDismissGuide, handleFieldOrderChange, handleAuth,
    handleAddPortfolioItem, handleDeletePortfolioItem, handleUpdatePortfolioSummary,
    handleAddMatchingPost, handleUpdateMatchingPost, handleDeleteMatchingPost,
    handleUpdateProfile, handleDeleteAccount, setUserProfile, setAuthState,
    handleAcceptEula, handleSetDataConsent, handleDataConsentAsked,
    handleBlockUser, handleUnblockUser, handleReportContent,
  }), [
    savedNotes, userProfile, goals, feedbacks,
    showBetaGuide, fieldOrder, storageReady, toast, authState, artistProfile,
    portfolioItems, portfolioSummary, matchingPosts,
    eulaAccepted, blockedUsers, reportedContent, deviceUserId,
    dataConsent, dataConsentAsked,
    showToast, hideToast,
    handleSaveNote, handleDeleteNote, handleToggleStar, handleUpdateNote,
    handleUpdateGoals, handleSubmitFeedback,
    handleDismissGuide, handleFieldOrderChange, handleAuth,
    handleAddPortfolioItem, handleDeletePortfolioItem, handleUpdatePortfolioSummary,
    handleAddMatchingPost, handleUpdateMatchingPost, handleDeleteMatchingPost,
    handleUpdateProfile, handleDeleteAccount,
    handleAcceptEula, handleSetDataConsent, handleDataConsentAsked,
    handleBlockUser, handleUnblockUser, handleReportContent,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
