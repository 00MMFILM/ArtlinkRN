import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Video, ResizeMode } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";
import { CLight, T } from "../constants/theme";
import { focusSummary, changeSummary } from "../services/aiService";
import { parseTimeMarks } from "../utils/repractice";
import { trackFunnelEvent } from "../services/mauService";

const firstVideo = (note) => (note?.images || []).find((item) => item.type === "video");
const ignorePlaybackError = (operation) => {
  try { Promise.resolve(operation?.()).catch(() => {}); } catch (_) {}
};

// Only the selected take owns a mounted player. Switching takes pauses the old
// player before mounting the next; leaving the tab/screen also unloads it.
export default function RetakeCompareCard({ previousNote, note, visible = true, onRetake }) {
  const { t } = useTranslation();
  const previous = firstVideo(previousNote);
  const current = firstVideo(note);
  const videos = useMemo(() => ({ previous, current }), [previous, current]);
  const [available, setAvailable] = useState({});
  const [failed, setFailed] = useState({});
  const [durations, setDurations] = useState({});
  const [activeSide, setActiveSide] = useState(null);
  const [playing, setPlaying] = useState(false);
  const player = useRef(null);
  const intent = useRef({ token: 0, side: null, position: null, playing: false });
  const mounted = useRef(true);
  const viewed = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setAvailable({});
    setFailed({});
    for (const side of ["previous", "current"]) {
      const uri = videos[side]?.uri;
      Promise.resolve().then(async () => {
        if (!uri) return false;
        if (!uri.startsWith("file:")) return true;
        try { return !!(await FileSystem.getInfoAsync(uri)).exists; }
        catch (_) { return false; }
      }).then((exists) => {
        if (!cancelled) setAvailable((value) => ({ ...value, [side]: exists }));
      });
    }
    return () => { cancelled = true; };
  }, [videos]);

  useEffect(() => {
    if (visible && viewed.current !== note.id) {
      viewed.current = note.id;
      trackFunnelEvent("compare_viewed");
    }
    if (!visible) {
      intent.current = { token: intent.current.token + 1, side: null, playing: false };
      ignorePlaybackError(() => player.current?.pauseAsync());
      ignorePlaybackError(() => player.current?.unloadAsync());
      setActiveSide(null);
      setPlaying(false);
    }
  }, [visible, note.id]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      intent.current.token += 1;
      ignorePlaybackError(() => player.current?.pauseAsync());
      ignorePlaybackError(() => player.current?.unloadAsync());
    };
  }, []);

  const playbackFailed = useCallback((side) => {
    if (!mounted.current) return;
    setFailed((value) => ({ ...value, [side]: true }));
    setPlaying(false);
  }, []);

  const activate = useCallback(async (side, position = null) => {
    if (!visible || !available[side]) return;
    const token = intent.current.token + 1;
    const nextPlaying = position != null || activeSide !== side || !playing;
    intent.current = { token, side, position, playing: nextPlaying };
    try {
      const existing = player.current;
      // This await also ensures that fast alternating taps cannot play both takes.
      if (existing) { try { await existing.pauseAsync(); } catch (_) {} }
      if (!mounted.current || intent.current.token !== token) return;
      if (activeSide === side && existing) {
        if (position != null) await existing.setPositionAsync(position);
        if (!mounted.current || intent.current.token !== token) return;
        if (nextPlaying) await existing.playAsync();
        if (mounted.current && intent.current.token === token) setPlaying(nextPlaying);
      } else {
        player.current = null;
        setPlaying(nextPlaying);
        setActiveSide(side);
      }
    } catch (_) { playbackFailed(side); }
  }, [visible, available, activeSide, playing, playbackFailed]);

  const onLoad = async (side, status) => {
    const request = { ...intent.current };
    const loaded = player.current;
    if (!loaded || request.side !== side || !visible) return;
    if (status.durationMillis) setDurations((value) => ({ ...value, [side]: status.durationMillis }));
    try {
      if (request.position != null) {
        const position = status.durationMillis ? Math.min(request.position, status.durationMillis) : request.position;
        await loaded.setPositionAsync(position);
      }
      if (mounted.current && intent.current.token === request.token && request.playing) await loaded.playAsync();
    } catch (_) { playbackFailed(side); }
  };

  const previousText = previousNote.videoAnalysis || previousNote.aiComment || "";
  const currentText = note.videoAnalysis || "";
  const previousFeedback = focusSummary(previousText, 400);
  const change = changeSummary(currentText, 400);

  const renderVideo = (side, feedback) => {
    const video = videos[side];
    const label = t(`retake.${side === "previous" ? "previous_video" : "current_video"}`);
    const timeMarks = parseTimeMarks(feedback, durations[side] || video?.duration);
    const selected = activeSide === side && visible && !failed[side];
    return (
      <View style={styles.take} key={side}>
        <Text style={[T.captionBold, styles.title]}>{label}</Text>
        {selected ? (
          <Video
            key={`${side}:${video.uri}`}
            ref={(instance) => { if (instance) player.current = instance; }}
            testID={`retake-video-${side}`}
            source={{ uri: video.uri }}
            style={styles.video}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            onLoad={(status) => onLoad(side, status)}
            onError={() => playbackFailed(side)}
            onPlaybackStatusUpdate={(status) => {
              if (!status.isLoaded) { if (status.error) playbackFailed(side); return; }
              if (intent.current.side === side) setPlaying(status.isPlaying);
              if (status.durationMillis) setDurations((value) => value[side] === status.durationMillis ? value : { ...value, [side]: status.durationMillis });
            }}
          />
        ) : null}
        {failed[side] || available[side] === false ? (
          <Text accessibilityRole="alert" style={[T.small, styles.muted]}>
            {t(failed[side] ? "retake.playback_failed" : "retake.video_unavailable")}
          </Text>
        ) : (
          <TouchableOpacity
            testID={`retake-play-${side}`}
            accessibilityRole="button"
            accessibilityLabel={`${t(selected && playing ? "retake.pause" : "retake.play")} · ${label}`}
            disabled={!available[side]}
            style={styles.playButton}
            onPress={() => activate(side)}
          >
            <Text style={[T.smallBold, styles.accent]}>{t(selected && playing ? "retake.pause" : "retake.play")}</Text>
          </TouchableOpacity>
        )}
        {available[side] && !failed[side] && timeMarks.length ? (
          <View style={styles.timeMarks}>
            {timeMarks.map(({ label: mark, positionMs }) => (
              <TouchableOpacity
                key={positionMs}
                testID={`retake-seek-${side}-${positionMs}`}
                accessibilityRole="button"
                accessibilityLabel={`${label} · ${mark}`}
                style={styles.timeChip}
                onPress={() => activate(side, positionMs)}
              >
                <Text style={[T.smallBold, styles.accent]}>{mark}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.card} testID="retake-compare-card">
      <Text style={[T.titleBold, styles.title]}>{t("retake.compare_title")}</Text>
      <Text style={[T.smallBold, styles.accent, { marginTop: 12 }]}>{t("retake.focus_label")}</Text>
      <Text style={[T.body, styles.title]}>{note.focus || previousNote.chosenFocus || t("retake.feedback_unavailable")}</Text>
      {renderVideo("previous", previousText)}
      {renderVideo("current", currentText)}
      <View style={styles.feedback}>
        <Text style={[T.captionBold, styles.title]}>{t("retake.previous_feedback")}</Text>
        <Text style={[T.small, styles.muted]}>{previousFeedback || t("retake.feedback_unavailable")}</Text>
      </View>
      <View style={styles.feedback}>
        <Text style={[T.captionBold, styles.title]}>{t("retake.current_change")}</Text>
        <Text style={[T.small, styles.muted]}>{change || t("retake.change_unavailable")}</Text>
      </View>
      {onRetake && (note.chosenFocus || note.focus) ? (
        <TouchableOpacity accessibilityRole="button" style={styles.retakeButton} onPress={onRetake}>
          <Text style={[T.smallBold, { color: CLight.white }]}>{t("retake.again")}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: CLight.surface, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: CLight.cardBorder },
  title: { color: CLight.gray900 },
  muted: { color: CLight.gray700, marginTop: 6 },
  accent: { color: CLight.pink },
  take: { marginTop: 16 },
  video: { width: "100%", height: 190, marginTop: 8, backgroundColor: "#111", borderRadius: 10 },
  playButton: { marginTop: 8, alignSelf: "flex-start", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9, backgroundColor: CLight.pinkSoft },
  timeMarks: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  timeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: CLight.pinkSoft },
  feedback: { marginTop: 16 },
  retakeButton: { marginTop: 18, padding: 13, borderRadius: 12, backgroundColor: CLight.pink, alignItems: "center" },
});
