import React, { useState, useCallback, useRef, useEffect } from "react";
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
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Audio } from "expo-av";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as FileSystem from "expo-file-system/legacy";
import { useApp } from "../context/AppContext";
import { CLight, T, FIELD_EMOJIS, FIELD_COLORS } from "../constants/theme";
import { analyzeNote, analyzeVideoFrames } from "../services/aiService";
import { FIELDS } from "../utils/helpers";
import TopBar from "../components/TopBar";
import { useTranslation } from "react-i18next";

export default function NoteCreateScreen({ navigation }) {
  const { t } = useTranslation();
  const { handleSaveNote, savedNotes, userProfile, aiDisclosureAccepted, handleAcceptAIDisclosure } = useApp();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [field, setField] = useState(FIELDS[0]);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [aiComment, setAiComment] = useState("");
  const [aiScores, setAiScores] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [videoAnalysis, setVideoAnalysis] = useState("");
  const [videoAiLoading, setVideoAiLoading] = useState(false);
  const [videoAiProgress, setVideoAiProgress] = useState({ phase: "", percent: 0, message: "" });
  const hasUnsavedChangesRef = useRef(false);

  // Media state
  const [images, setImages] = useState([]); // [{ uri, type, width, height }]
  const [voiceRecordings, setVoiceRecordings] = useState([]); // [{ uri, duration }]
  const [audioFiles, setAudioFiles] = useState([]); // [{ uri, name, duration }]
  const [pdfFiles, setPdfFiles] = useState([]); // [{ uri, name }]
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const [playingSound, setPlayingSound] = useState(null);
  const [playingIdx, setPlayingIdx] = useState(null);

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
      if (playingSound) playingSound.unloadAsync();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  // Track unsaved changes
  useEffect(() => {
    if (title || content || tags.length > 0 || seriesName || aiComment || videoAnalysis || images.length > 0 || voiceRecordings.length > 0 || audioFiles.length > 0 || pdfFiles.length > 0) {
      hasUnsavedChangesRef.current = true;
    }
  }, [title, content, tags, seriesName, aiComment, videoAnalysis, images, voiceRecordings, audioFiles, pdfFiles]);

  // Handle back with unsaved changes warning
  const handleCancel = useCallback(() => {
    if (hasUnsavedChangesRef.current) {
      Alert.alert(
        t("common.discard_title"),
        t("common.discard_message"),
        [
          { text: t("common.keep_editing"), style: "cancel" },
          { text: t("common.leave"), style: "destructive", onPress: () => { hasUnsavedChangesRef.current = false; navigation.goBack(); } },
        ]
      );
    } else {
      navigation.goBack();
    }
  }, [navigation, t]);

  // Intercept hardware back / navigation gesture
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e) => {
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
            onPress: () => navigation.dispatch(e.data.action),
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
    try {
      const result = await analyzeNote(field, content, savedNotes, { title, field, images, voiceRecordings, audioFiles, pdfFiles }, userProfile);
      setAiComment(result.analysis || result);
      if (result.scores) setAiScores(result.scores);
    } catch (e) {
      Alert.alert(t("noteCreate.ai_failed"), t("noteCreate.ai_failed_msg"));
    } finally {
      setAiLoading(false);
    }
  }, [content, field, savedNotes, title, images, voiceRecordings, audioFiles, pdfFiles, userProfile, t]);

  const handleAnalyze = useCallback(async () => {
    if (!content.trim()) {
      Alert.alert(t("noteCreate.ai_content_required"), t("noteCreate.ai_content_required_msg"));
      return;
    }
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
  }, [content, aiDisclosureAccepted, handleAcceptAIDisclosure, runAnalyze, t]);

  // Video AI Analysis
  const noteVideos = images.filter((i) => i.type === "video");

  const handleVideoAnalyze = useCallback(async () => {
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
    startVideoAnalysis();
  }, [noteVideos, field, content, title, userProfile, t]);

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
        (progress) => setVideoAiProgress(progress)
      );
      setVideoAnalysis(result);
    } catch (e) {
      Alert.alert(t("noteCreate.ai_failed"), t("noteCreate.ai_failed_msg"));
    } finally {
      setVideoAiLoading(false);
      setVideoAiProgress({ phase: "", percent: 0, message: "" });
    }
  }, [noteVideos, field, content, title, userProfile, t]);

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
      try {
        await FileSystem.copyAsync({ from: asset.uri, to: destUri });
        setImages((prev) => [...prev, { uri: destUri, type: "image", width: asset.width, height: asset.height }]);
      } catch {
        setImages((prev) => [...prev, { uri: asset.uri, type: "image", width: asset.width, height: asset.height }]);
      }
    }
  }, []);

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
      setImages((prev) => [...prev, ...newItems]);
    }
  }, []);

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
        setVoiceRecordings((prev) => [...prev, { uri, duration: finalDuration }]);
      }
    } catch (e) {
      setIsRecording(false);
    }
  }, [recordingDuration]);

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
        setAudioFiles((prev) => [...prev, ...newFiles]);
      }
    } catch (e) {
      Alert.alert(t("noteCreate.file_select_error"), t("noteCreate.audio_select_error"));
    }
  }, [t]);

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
          setPdfFiles((prev) => [...prev, ...newFiles]);
        }
      }
    } catch (e) {
      Alert.alert(t("noteCreate.file_select_error"), t("noteCreate.document_select_error"));
    }
  }, [t]);

  const handleRemovePdf = useCallback((index) => {
    setPdfFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Save note
  const handleSave = useCallback(() => {
    if (!title.trim()) {
      Alert.alert(t("noteCreate.title_required"), t("noteCreate.title_required_msg"));
      return;
    }
    if (!content.trim()) {
      Alert.alert(t("noteCreate.content_required"), t("noteCreate.content_required_msg"));
      return;
    }
    const noteData = {
      title: title.trim(),
      content: content.trim(),
      field,
      tags,
      seriesName: seriesName.trim() || undefined,
      aiComment: aiComment || undefined,
      aiScores: aiScores || undefined,
      videoAnalysis: videoAnalysis || undefined,
      images: images.length > 0 ? images : undefined,
      voiceRecordings: voiceRecordings.length > 0 ? voiceRecordings : undefined,
      audioFiles: audioFiles.length > 0 ? audioFiles : undefined,
      pdfFiles: pdfFiles.length > 0 ? pdfFiles : undefined,
    };
    hasUnsavedChangesRef.current = false;
    handleSaveNote(noteData);
    navigation.goBack();
  }, [title, content, field, tags, seriesName, aiComment, aiScores, videoAnalysis, images, voiceRecordings, audioFiles, pdfFiles, handleSaveNote, navigation, t]);

  // Shimmer interpolation
  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 1, 0.3],
  });

  return (
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
          <TouchableOpacity onPress={handleSave} activeOpacity={0.7}>
            <Text style={styles.topBarSave}>{t("common.save")}</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title Input */}
        <TextInput
          style={styles.titleInput}
          placeholder={t("noteCreate.title_placeholder")}
          placeholderTextColor={CLight.gray400}
          value={title}
          onChangeText={setTitle}
          maxLength={100}
          returnKeyType="next"
        />

        {/* Content Input */}
        <TextInput
          style={styles.contentInput}
          placeholder={t("noteCreate.content_placeholder")}
          placeholderTextColor={CLight.gray400}
          value={content}
          onChangeText={setContent}
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

        {/* AI Result */}
        {aiComment ? (
          <View style={styles.aiResultCard}>
            <View style={styles.aiResultHeader}>
              <Text style={styles.aiResultHeaderText}>{t("noteCreate.ai_result")}</Text>
            </View>
            <Text style={styles.aiResultContent}>{aiComment}</Text>
          </View>
        ) : null}

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
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

  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
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
