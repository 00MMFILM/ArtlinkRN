import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
  SafeAreaView,
  Image,
  Dimensions,
} from "react-native";
import { Audio, Video, ResizeMode } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";
import { getRelatedNotes } from "../services/analyticsService";
import { analyzeNote, analyzeVideoFrames } from "../services/aiService";
import { submitTrainingData, submitAnonymousMetadata } from "../services/dataCollectionService";
import { incrementDailyAICount, shouldShowInterstitial, showInterstitialAd, showRewardedAd } from "../services/adService";
import { formatDate, timeAgo } from "../utils/helpers";
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
  } = useApp();

  const note = useMemo(
    () => savedNotes.find((n) => n.id === noteId),
    [savedNotes, noteId]
  );

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
  const [videoAiLoading, setVideoAiLoading] = useState(false);
  const [videoAiProgress, setVideoAiProgress] = useState({ phase: "", percent: 0, message: "" });

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

  const relatedNotes = useMemo(() => {
    if (!note) return [];
    return getRelatedNotes(note, savedNotes);
  }, [note, savedNotes]);

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
      const result = await analyzeNote(
        note.field,
        note.content,
        savedNotes,
        note,
        userProfile
      );
      const analysis = result.analysis || result;
      const scores = result.scores || null;
      handleUpdateNote({ ...note, aiComment: analysis, aiScores: scores });
      showToast(t("noteDetail.ai_complete"), "success");

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
                    aiFeedback: result,
                    noteTitle: note.title,
                  }).catch(() => {});
                },
              },
            ]
          );
        }, 500);
      }
    } catch (e) {
      showToast(t("noteDetail.ai_failed"), "error");
    } finally {
      setAiLoading(false);
    }
  }, [note, savedNotes, userProfile, handleUpdateNote, showToast, dataConsent, dataConsentAsked, handleSetDataConsent, handleDataConsentAsked, isKoreanLocale, t]);

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
        (progress) => setVideoAiProgress(progress)
      );
      handleUpdateNote({ ...note, videoAnalysis: result });
      showToast(t("noteDetail.video_ai_complete"), "success");
    } catch (e) {
      showToast(t("noteDetail.video_ai_failed"), "error");
    } finally {
      setVideoAiLoading(false);
      setVideoAiProgress({ phase: "", percent: 0, message: "" });
    }
  }, [note, noteVideos, userProfile, handleUpdateNote, showToast, t]);

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
        {/* Text AI Analysis */}
        {aiLoading ? (
          <View style={styles.aiLoadingContainer}>
            <ActivityIndicator size="large" color={CLight.pink} />
            <Text style={[T.caption, { color: CLight.gray500, marginTop: 16 }]}>
              {t("noteDetail.ai_analyzing")}
            </Text>
          </View>
        ) : note.aiComment ? (
          <View style={styles.aiCard}>
            <View style={styles.aiCardHeader}>
              <Text style={styles.aiIcon}>{"\uD83E\uDD16"}</Text>
              <Text style={[T.captionBold, { color: CLight.pink }]}>{t("noteDetail.ai_result")}</Text>
            </View>
            <View style={styles.aiDivider} />
            <Text style={[T.body, { color: CLight.gray900 }]}>{note.aiComment}</Text>
            <TouchableOpacity style={styles.reAnalyzeBtn} onPress={handleRequestAI}>
              <Text style={[T.smallBold, { color: CLight.pink }]}>{t("noteDetail.ai_reanalyze")}</Text>
            </TouchableOpacity>
            <View style={styles.aiFeedbackRow}>
              <Text style={[T.small, { color: CLight.gray500 }]}>{t("noteDetail.ai_feedback_question")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity style={styles.aiFeedbackBtn} onPress={() => {
                  fetch("https://artlink-server.vercel.app/api/report", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "ai_feedback", rating: "good", noteField: note.field, noteId: note.id, sentAt: new Date().toISOString() }),
                  }).catch(() => {});
                  showToast(t("noteDetail.ai_feedback_thanks"), "success");
                }}>
                  <Text style={{ fontSize: 18 }}>{"\uD83D\uDC4D"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.aiFeedbackBtn} onPress={() => {
                  Alert.prompt(t("noteDetail.ai_feedback_prompt"), t("noteDetail.ai_feedback_ask"), (text) => {
                    if (!text?.trim()) return;
                    fetch("https://artlink-server.vercel.app/api/report", {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ type: "ai_feedback", rating: "bad", comment: text.trim(), noteField: note.field, noteId: note.id, sentAt: new Date().toISOString() }),
                    }).catch(() => {});
                    showToast(t("noteDetail.ai_feedback_sent"), "success");
                  }, "plain-text", "", t("noteDetail.ai_feedback_submit"));
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
  reAnalyzeBtn: {
    marginTop: 16,
    alignSelf: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: CLight.pinkSoft,
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
});
