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
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_LABELS, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";
import { getRelatedNotes } from "../services/analyticsService";
import { analyzeNote, analyzeVideoFrames } from "../services/aiService";
import { submitTrainingData } from "../services/dataCollectionService";
import { formatDate, timeAgo } from "../utils/helpers";

const TABS = [
  { key: "content", label: "\uB0B4\uC6A9" },
  { key: "ai", label: "AI \uBD84\uC11D" },
  { key: "related", label: "\uAD00\uB828 \uB178\uD2B8" },
];

export default function NoteDetailScreen({ route, navigation }) {
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
  } = useApp();

  const note = useMemo(
    () => savedNotes.find((n) => n.id === noteId),
    [savedNotes, noteId]
  );

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
  const fieldLabel = FIELD_LABELS[note?.field] || "\uAE30\uD0C0";
  const fieldColor = FIELD_COLORS[note?.field] || CLight.gray500;

  // ─── Handlers ───

  const handleBack = useCallback(() => {
    if (isEditing) {
      Alert.alert("\uD3B8\uC9D1 \uCDE8\uC18C", "\uD3B8\uC9D1 \uC911\uC778 \uB0B4\uC6A9\uC744 \uBC84\uB9AC\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?", [
        { text: "\uACC4\uC18D \uD3B8\uC9D1", style: "cancel" },
        {
          text: "\uBC84\uB9AC\uAE30",
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
  }, [isEditing, note, navigation]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      "\uB178\uD2B8 \uC0AD\uC81C",
      "\uC774 \uB178\uD2B8\uB97C \uC815\uB9D0 \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?\n\uC0AD\uC81C\uB41C \uB178\uD2B8\uB294 \uBCF5\uAD6C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
      [
        { text: "\uCDE8\uC18C", style: "cancel" },
        {
          text: "\uC0AD\uC81C",
          style: "destructive",
          onPress: () => {
            handleDeleteNote(noteId);
            navigation.goBack();
          },
        },
      ]
    );
  }, [noteId, handleDeleteNote, navigation]);

  const handleSaveEdit = useCallback(() => {
    if (!editTitle.trim()) {
      showToast("\uC81C\uBAA9\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694", "error");
      return;
    }
    handleUpdateNote({ ...note, title: editTitle.trim(), content: editContent.trim() });
    setIsEditing(false);
  }, [editTitle, editContent, note, handleUpdateNote, showToast]);

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

  const handleRequestAI = useCallback(async () => {
    if (!note) return;
    setAiLoading(true);
    try {
      const result = await analyzeNote(
        note.field,
        note.content,
        savedNotes,
        note,
        userProfile
      );
      handleUpdateNote({ ...note, aiComment: result });
      showToast("AI \uBD84\uC11D\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4!", "success");

      // Submit training data if consented
      if (dataConsent) {
        submitTrainingData({
          field: note.field,
          noteContent: note.content,
          aiFeedback: result,
          noteTitle: note.title,
        }).catch(() => {});
      }

      // Show 1-time consent popup for existing users
      if (!dataConsentAsked) {
        setTimeout(() => {
          Alert.alert(
            "AI 품질 개선에 참여하시겠어요?",
            "연습 노트와 AI 피드백을 익명으로 수집하여 피드백 품질을 개선합니다. 개인정보는 포함되지 않습니다.",
            [
              {
                text: "나중에",
                style: "cancel",
                onPress: () => handleDataConsentAsked(),
              },
              {
                text: "참여하기",
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
      showToast("AI \uBD84\uC11D \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4", "error");
    } finally {
      setAiLoading(false);
    }
  }, [note, savedNotes, userProfile, handleUpdateNote, showToast, dataConsent, dataConsentAsked, handleSetDataConsent, handleDataConsentAsked]);

  const handleRequestVideoAI = useCallback(async () => {
    if (!note || noteVideos.length === 0) return;
    setVideoAiLoading(true);
    setVideoAiProgress({ phase: "extracting", percent: 0, message: "준비 중..." });
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
      showToast("영상 AI 분석이 완료되었습니다!", "success");
    } catch (e) {
      showToast("영상 AI 분석에 실패했습니다", "error");
    } finally {
      setVideoAiLoading(false);
      setVideoAiProgress({ phase: "", percent: 0, message: "" });
    }
  }, [note, noteVideos, userProfile, handleUpdateNote, showToast]);

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
            {"\uB178\uD2B8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4"}
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={[T.bodyBold, { color: CLight.pink }]}>{"\uB3CC\uC544\uAC00\uAE30"}</Text>
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
                <Text style={[T.captionBold, { color: CLight.gray500 }]}>{"\uCDE8\uC18C"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveEdit} style={styles.saveBtn}>
                <Text style={[T.captionBold, { color: CLight.white }]}>{"\uC800\uC7A5"}</Text>
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
              placeholder={"\uC81C\uBAA9\uC744 \uC785\uB825\uD558\uC138\uC694"}
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
            placeholder={"\uB178\uD2B8 \uB0B4\uC6A9\uC744 \uC785\uB825\uD558\uC138\uC694..."}
            placeholderTextColor={CLight.gray300}
            multiline
            textAlignVertical="top"
          />
        ) : (
          <View style={styles.contentCard}>
            <Text style={[T.body, { color: CLight.gray900 }]}>
              {note.content || "\uB0B4\uC6A9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
            </Text>
          </View>
        )}

        {/* Attached Media */}
        {noteImages.length > 0 && (
          <View style={styles.mediaSection}>
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
              첨부 미디어 ({noteImages.length})
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
              음성 녹음 ({noteVoices.length})
            </Text>
            {noteVoices.map((rec, idx) => (
              <View key={idx} style={styles.detailVoiceItem}>
                <TouchableOpacity style={styles.detailVoicePlayBtn} onPress={() => handlePlayVoice(rec.uri, `voice-${idx}`)}>
                  <Text style={{ fontSize: 16 }}>{playingIdx === `voice-${idx}` ? "⏸" : "▶️"}</Text>
                </TouchableOpacity>
                <Text style={[T.small, { color: CLight.gray700, flex: 1 }]}>
                  음성 {idx + 1} · {formatDuration(rec.duration)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Audio Files */}
        {noteAudioFiles.length > 0 && (
          <View style={styles.mediaSection}>
            <Text style={[T.captionBold, { color: CLight.gray700, marginBottom: 10 }]}>
              오디오 파일 ({noteAudioFiles.length})
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
              첨부 문서 ({notePdfFiles.length})
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
    const videoProgressText = videoAiProgress.message || "영상 분석 준비 중...";
    const videoPercent = videoAiProgress.percent || 0;

    return (
      <View style={styles.tabContent}>
        {/* Text AI Analysis */}
        {aiLoading ? (
          <View style={styles.aiLoadingContainer}>
            <ActivityIndicator size="large" color={CLight.pink} />
            <Text style={[T.caption, { color: CLight.gray500, marginTop: 16 }]}>
              {"AI가 노트를 분석하고 있습니다..."}
            </Text>
          </View>
        ) : note.aiComment ? (
          <View style={styles.aiCard}>
            <View style={styles.aiCardHeader}>
              <Text style={styles.aiIcon}>{"\uD83E\uDD16"}</Text>
              <Text style={[T.captionBold, { color: CLight.pink }]}>{"AI 분석 결과"}</Text>
            </View>
            <View style={styles.aiDivider} />
            <Text style={[T.body, { color: CLight.gray900 }]}>{note.aiComment}</Text>
            <TouchableOpacity style={styles.reAnalyzeBtn} onPress={handleRequestAI}>
              <Text style={[T.smallBold, { color: CLight.pink }]}>{"\uD83D\uDD04 재분석 요청"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.aiEmptyContainer}>
            <Text style={styles.aiEmptyIcon}>{"\uD83E\uDDE0"}</Text>
            <Text style={[T.title, { color: CLight.gray900, marginTop: 12, textAlign: "center" }]}>
              {"AI 분석이 아직 없습니다"}
            </Text>
            <Text
              style={[
                T.caption,
                { color: CLight.gray500, marginTop: 6, textAlign: "center", paddingHorizontal: 20 },
              ]}
            >
              {"AI가 노트를 분석하여 개인화된 피드백을 제공합니다"}
            </Text>
            <TouchableOpacity style={styles.requestAIBtn} onPress={handleRequestAI}>
              <Text style={[T.bodyBold, { color: CLight.white }]}>{"\uD83E\uDD16 AI 분석 요청하기"}</Text>
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
                  <Text style={[T.captionBold, { color: "#007AFF" }]}>{"영상 AI 분석 결과"}</Text>
                </View>
                <View style={styles.aiDivider} />
                <Text style={[T.body, { color: CLight.gray900 }]}>{note.videoAnalysis}</Text>
                <TouchableOpacity style={styles.videoReAnalyzeBtn} onPress={handleRequestVideoAI}>
                  <Text style={[T.smallBold, { color: "#007AFF" }]}>{"🔄 영상 재분석 요청"}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.videoAiBtn} onPress={handleRequestVideoAI}>
                <Text style={[T.bodyBold, { color: CLight.white }]}>{"🎥 영상 AI 분석 요청하기"}</Text>
              </TouchableOpacity>
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
              {"\uAD00\uB828 \uB178\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4"}
            </Text>
            <Text style={[T.caption, { color: CLight.gray500, marginTop: 6, textAlign: "center" }]}>
              {"\uBE44\uC2B7\uD55C \uBD84\uC57C\uB098 \uD0DC\uADF8\uC758 \uB178\uD2B8\uAC00 \uC313\uC774\uBA74 \uC5EC\uAE30\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4"}
            </Text>
          </View>
        ) : (
          relatedNotes.map(({ note: rNote, score }) => {
            const rFieldColor = FIELD_COLORS[rNote.field] || CLight.gray500;
            const rFieldEmoji = FIELD_EMOJIS[rNote.field] || "\uD83D\uDCDD";
            const rFieldLabel = FIELD_LABELS[rNote.field] || "\uAE30\uD0C0";
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
                      {score >= 5 ? "\uB192\uC740 \uAD00\uB828" : score >= 3 ? "\uAD00\uB828" : "\uC57D\uD55C \uAD00\uB828"}
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
