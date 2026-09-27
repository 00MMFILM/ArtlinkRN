// 2인 대사 연습 — 상대역 대사를 쳐주는 연습 상대 (ACT RAW 씬 제공)
// 모드: 큐 연습(무음 기본·음성 토글) / 대본 보기(내 대사 가림). 음성은 expo-speech —
// 네이티브 모듈이라 스토어 빌드에 실려야 켜지고, 구버전 바이너리에선 토글 자체가 숨는다.
// Korean ACT RAW scenes + bundled original English scenes; rights are shown per scene.
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  AppState,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreventRemove } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { CLight, T } from "../constants/theme";
import { useApp } from "../context/AppContext";
import { STUDIO } from "../constants/studioTheme";
import { mergeDuetScenes, isValidRemoteData, sceneLanguage, voiceLanguage, rehearsalLanguage, parsePrivateScript, sceneDescription, sceneRightsKey, SCRIPT_LIMITS, rehearsalContextFor } from "../utils/duetStudio";
import { startPractice, completePractice, abandonPractice } from "../services/practiceService";
import { trackFunnelEvent } from "../services/mauService";
import { loadVoiceManifest, voiceUrlFor } from "../services/duetVoice";
import { preserveMediaFile } from "../services/persistentMedia";
import i18n from "i18next";

// expo-speech 는 네이티브 모듈 — 구버전 바이너리에 OTA 로 나가도 죽지 않게 가드해서 로드한다.
let Speech = null;
try { Speech = require("expo-speech"); } catch (e) { Speech = null; }
let AudioMode = null;
try { AudioMode = require("expo-av").Audio; } catch (e) { AudioMode = null; }
const canPlayFile = !!(AudioMode && AudioMode.Sound && AudioMode.Sound.createAsync);
const canRecord = !!(AudioMode && AudioMode.Recording && AudioMode.Recording.createAsync && AudioMode.requestPermissionsAsync);
const noop = () => {};

// 성우 음성 파일 — 멈추고 메모리에서 내린다 (실패는 무시)
const releaseSound = (s) => {
  Promise.resolve()
    .then(() => s.stopAsync && s.stopAsync())
    .catch(noop)
    .then(() => s.unloadAsync && s.unloadAsync())
    .catch(noop);
};
// 느린 네트워크에서 선로드 안 된 줄(음성 켠 순간·첫 줄·처음부터)이 무한정 무음이 되지 않게 3초 타임아웃 —
// 넘기면 null(호출부가 TTS로 대체)을 주고, 늦게 도착한 Sound는 못 쓰니 바로 내린다(누수 방지).
const LOAD_TIMEOUT_MS = 3000;
const loadSound = (url) => {
  let timedOut = false;
  let timer;
  const createP = AudioMode.Sound.createAsync({ uri: url }, { shouldPlay: false })
    .then((r) => (r && r.sound) || null)
    .catch(() => null);
  createP.then((s) => { if (timedOut && s) releaseSound(s); });
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { timedOut = true; resolve(null); }, LOAD_TIMEOUT_MS);
  });
  return Promise.race([createP.then((s) => { clearTimeout(timer); return s; }), timeout]);
};
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

const REMOTE_URL = "https://actraw.kr/duet-scenes.json";

export default function DuetPracticeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t: translate } = useTranslation();
  const { showToast, userProfile } = useApp();
  const [feedbackLanguage, setFeedbackLanguage] = useState(() => rehearsalLanguage(i18n.language));
  const [scriptLanguage, setScriptLanguage] = useState(() => rehearsalLanguage(i18n.language));
  const [englishVoice, setEnglishVoice] = useState("en-US");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedScript, setPastedScript] = useState("");
  const [pasteError, setPasteError] = useState(null);
  const [pastePreview, setPastePreview] = useState(null);
  const [scenes, setScenes] = useState(() => mergeDuetScenes());
  const t = (key, options) => translate(key, { ...options, lng: feedbackLanguage });
  const ds = (key, options) => t(`duetStudio.${key}`, options);
  const accountRef = useRef(userProfile?.authUserId || null);
  accountRef.current = userProfile?.authUserId || null;
  const visibleScenes = useMemo(() => scenes.filter((item) => sceneLanguage(item) === scriptLanguage), [scenes, scriptLanguage]);
  const [scene, setScene] = useState(null);
  const [myRole, setMyRole] = useState(0);
  const [mode, setMode] = useState(null); // null=설정, 'cue', 'script'
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [hideMine, setHideMine] = useState(true);
  const [peeked, setPeeked] = useState({}); // 대본 모드에서 개별로 연 내 대사
  const [voiceOn, setVoiceOn] = useState(false); // 기본 무음 — 낭독 톤이라 원하는 사람만 켠다
  const [rate, setRate] = useState(1.0);
  const canSpeak = !!(Speech && Speech.speak);

  // 재생 상태는 전부 ref — 비동기 로드가 끝났을 때 옛 클로저가 아니라 지금 상태를 본다
  const soundRef = useRef(null);        // 지금 재생 중인 성우 음성
  const playTokenRef = useRef(0);       // 줄 넘김·음성 끔·이탈마다 +1 → 늦게 도착한 로드는 버린다
  const preloadRef = useRef(null);      // 다음 상대 대사 선로드 { url, promise } (최대 1개)
  const voiceUsedRef = useRef(false);   // 지금 보관 중인 녹음이 상대 음성 켜진 채로 진행된 적 있는지 — 노트 안내문 문구에 씀
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const mountedRef = useRef(true);
  const [voiceReady, setVoiceReady] = useState(false); // manifest 도착 → 선로드 다시 계산

  const discardPreload = () => {
    const p = preloadRef.current;
    preloadRef.current = null;
    if (p) p.promise.then((s) => s && releaseSound(s));
  };

  const speakTTS = (text, onDone) => {
    if (!canSpeak) { onDone && onDone(); return; }
    const failed = () => { showToast(t("duet.voice_unavailable"), "error"); onDone && onDone(); };
    try {
      Speech.stop();
      Speech.speak(text.replace(/\([^)]*\)/g, ""), {
        language: voiceLanguage(scene, englishVoice), rate: rateRef.current,
        onDone: () => onDone && onDone(),
        onError: failed,
      });
    } catch (e) { failed(); }
  };

  // 성우 음성 파일 재생 — 로드·재생이 실패하면 조용히 기기 TTS로 대체
  const playFile = (url, text, onDone) => {
    stopSpeak();
    const token = playTokenRef.current;
    const pre = preloadRef.current;
    let p;
    if (pre && pre.url === url) { preloadRef.current = null; p = pre.promise; } else p = loadSound(url);
    p.then(async (sound) => {
      if (!sound) throw new Error("load");
      if (token !== playTokenRef.current) { releaseSound(sound); return; }
      soundRef.current = sound;
      try {
        await sound.setRateAsync(rateRef.current, true); // 피치 보정
        if (token !== playTokenRef.current) return; // 그 사이 멈춤 — stopSpeak가 이미 내렸다
        if (sound.setOnPlaybackStatusUpdate) {
          sound.setOnPlaybackStatusUpdate((st) => {
            if (!st || !st.didJustFinish) return;
            if (soundRef.current === sound) { soundRef.current = null; releaseSound(sound); }
            onDone && onDone();
          });
        }
        await sound.playAsync();
      } catch (e) {
        if (soundRef.current === sound) { soundRef.current = null; releaseSound(sound); }
        throw e;
      }
    }).catch(() => { if (token === playTokenRef.current) speakTTS(text, onDone); });
  };

  // force: 음성을 막 켠 순간에는 voiceOn 상태가 아직 반영 전이라 직접 넘긴다
  const speakLine = (text, onDone, force = false, url = null) => {
    if (!(voiceOn || force)) { onDone && onDone(); return; }
    if (url && canPlayFile) { playFile(url, text, onDone); return; }
    speakTTS(text, onDone);
  };
  // 상대 대사면 읽는다 — "다음"으로 넘어갈 때뿐 아니라 첫 줄·음성을 켠 순간에도
  const speakIfPartner = (n, role, force = false) => {
    const L = lines[n];
    if (L && L.r !== role) speakLine(L.t, null, force, (sceneLanguage(scene) === "ko" && !scene?.isPrivate ? voiceUrlFor(scene?.id, n, L.t) : null));
  };
  const toggleVoice = () => {
    if (voiceOn) { stopSpeak(); setVoiceOn(false); return; }
    setVoiceOn(true);
    // 아이폰 무음 스위치가 켜져 있어도 들리게 (기본은 무음 모드에서 소리가 안 난다).
    // 녹음 중이면 녹음 허용을 유지해야 한다 — 빠진 값은 기본값(false)으로 덮여 녹음이 끊긴다
    const audioMode = recordingRef.current
      ? { allowsRecordingIOS: true, playsInSilentModeIOS: true }
      : { playsInSilentModeIOS: true };
    try { AudioMode?.setAudioModeAsync?.(audioMode)?.catch?.(() => {}); } catch (e) {}
    speakIfPartner(idx, myRole, true);
  };
  // ref만 쓴다 — 언마운트 cleanup(첫 렌더 클로저)에서 불러도 안전
  const stopSpeak = () => {
    playTokenRef.current += 1;
    const s = soundRef.current;
    soundRef.current = null;
    if (s) releaseSound(s);
    try { canSpeak && Speech.stop(); } catch (e) {}
  };

  // ---- 연습하면서 녹음 ----
  const recordingRef = useRef(null);
  const recordingsRef = useRef([]); // 보관한 녹음 [{ uri, duration(초) }]
  const recStartRef = useRef(0);
  const recTimerRef = useRef(null);
  const recBusyRef = useRef(false);
  const recordingStartRef = useRef(null);
  const recordingStartTokenRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [recordedCount, setRecordedCount] = useState(0);
  const [recordingPreparing, setRecordingPreparing] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);

  // 녹음 중에 상대 음성이 켜져 있던 적이 한 번이라도 있으면 표시 — 순서(먼저 켬/녹음 중 켬) 상관없이 잡는다
  useEffect(() => {
    if (recording && voiceOn) voiceUsedRef.current = true;
  }, [recording, voiceOn]);

  const cancelRecordingStart = () => { recordingStartTokenRef.current += 1; };
  const startRecording = () => {
    if (!canRecord || recBusyRef.current || recordingRef.current || stoppingRef.current || noteTransferRef.current) return;
    recBusyRef.current = true;
    const owner = accountRef.current;
    const token = ++recordingStartTokenRef.current;
    const isCurrent = () => mountedRef.current && owner === accountRef.current && token === recordingStartTokenRef.current;
    setRecordingPreparing(true);
    recordingStartRef.current = (async () => {
      try {
        const perm = await AudioMode.requestPermissionsAsync();
        if (!isCurrent()) return;
        if (!perm || !perm.granted) { showToast(t("duet.record_permission"), "error"); return; }
        await AudioMode.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
        if (!isCurrent()) return;
        const { recording: rec } = await AudioMode.Recording.createAsync(AudioMode.RecordingOptionsPresets.HIGH_QUALITY);
        if (!isCurrent()) { // 준비 중 모드/화면을 나갔다 — 늦게 만들어진 녹음도 정리한다.
          await rec.stopAndUnloadAsync().catch(noop);
          return;
        }
        recordingRef.current = rec;
        recStartRef.current = Date.now();
        if (noteSent) beginPractice(scene); // 이전 노트를 남긴 뒤 새로 녹음하면 다시 저장할 수 있어야 한다.
        setRecElapsed(0);
        setRecording(true);
        recTimerRef.current = setInterval(() => {
          setRecElapsed(Math.floor((Date.now() - recStartRef.current) / 1000));
        }, 1000);
      } catch (e) {
        if (isCurrent()) showToast(t("duet.record_failed"), "error");
        try { await AudioMode.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }); } catch (e2) {}
      } finally {
        if (!isCurrent()) {
          try { await AudioMode.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }); } catch (e) {}
        }
        // Keep the start lock until a cancelled recorder and its audio mode are fully released.
        recBusyRef.current = false;
        if (mountedRef.current) setRecordingPreparing(false);
      }
    })();
    return recordingStartRef.current;
  };

  // keep=false면 멈추고 파일을 보관하지 않는다 (화면 이탈·씬 변경)
  // 멈추는 중에 또 불리면(토글 연타·기록 버튼) 같은 작업을 기다린다
  const stoppingRef = useRef(null);
  const stopRecording = (keep = true) => {
    if (stoppingRef.current) return stoppingRef.current;
    const rec = recordingRef.current;
    if (!rec) return Promise.resolve();
    const elapsed = Math.round((Date.now() - recStartRef.current) / 1000);
    stoppingRef.current = (async () => {
      let succeeded = true;
      try {
        const st = await rec.stopAndUnloadAsync();
        const uri = rec.getURI && rec.getURI();
        if (keep && !uri) throw new Error("RECORDING_FILE_MISSING");
        const duration = st && st.durationMillis ? Math.round(st.durationMillis / 1000) : elapsed;
        if (keep && uri) recordingsRef.current = [...recordingsRef.current, { uri, duration }];
      } catch (e) {
        succeeded = false;
        if (mountedRef.current) showToast(t("duet.record_save_failed"), "error");
      } finally {
        recordingRef.current = null;
        stoppingRef.current = null;
        clearInterval(recTimerRef.current);
        recTimerRef.current = null;
        if (mountedRef.current) { setRecording(false); setRecordedCount(recordingsRef.current.length); }
        try { await AudioMode.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }); } catch (e) {}
      }
      return succeeded;
    })();
    return stoppingRef.current;
  };
  const discardRecordings = () => {
    cancelRecordingStart();
    recordingsRef.current = [];
    if (mountedRef.current) setRecordedCount(0);
    voiceUsedRef.current = false;
    stopRecording(false).then(() => { recordingsRef.current = []; });
  };

  const recordChip = () => (canRecord ? (
    <TouchableOpacity
      style={[styles.chip, recording && styles.chipOn]}
      disabled={recordingPreparing || noteTransferRef.current}
      accessibilityRole="button"
      onPress={() => (recording ? stopRecording(true) : startRecording())}
    >
      <Text style={[T.smallBold, { color: recording ? CLight.white : CLight.gray700 }]}>
        {recordingPreparing ? ds("recordPreparing") : recording ? `⏹ ${t("duet.record_stop")} ${mmss(recElapsed)}` : `🎙 ${t("duet.record_start")}`}
      </Text>
    </TouchableOpacity>
  ) : null);

  // 원격 갱신 — 실패하거나 데이터가 이상하면 번들 데이터로 동작
  useEffect(() => {
    let alive = true;
    fetch(REMOTE_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && isValidRemoteData(j)) setScenes(mergeDuetScenes(j));
      })
      .catch(() => {});
    // 성우 음성 목록 — 실패해도 TTS로 동작, 다음 화면 진입 때 다시 받는다
    loadVoiceManifest().then((m) => { if (alive && m) setVoiceReady(true); });
    return () => { alive = false; };
  }, []);

  const lines = scene?.lines || [];
  const line = lines[idx];

  // 연습 세션 — 모드를 고르면 시작, 마지막 줄에 닿으면 딱 1회 완료 (대사 내용은 보내지 않는다)
  const practiceRef = useRef(null);
  const completedRef = useRef(false);
  const [noteSent, setNoteSent] = useState(false); // "연습 기록 남기기"를 이미 눌렀다 — 같은 씬 세션 안에서 재클릭 방지
  const noteTransferRef = useRef(false);
  const leavePromptRef = useRef(false);
  const beginPractice = (s) => {
    abandonPractice(practiceRef.current); // 앞 장면을 끝내지 않고 새로 골랐으면 그건 이탈이다
    completedRef.current = false;
    setNoteSent(false);
    practiceRef.current = startPractice("duet", s?.id, "acting");
  };

  // 끝내지 않고 화면을 떠나면 이탈 1건 (끝낸 세션은 이미 닫혀 중복되지 않는다)
  useEffect(() => () => abandonPractice(practiceRef.current), []);

  // 연습을 끝냈다는 신호 — 큐 모드 마지막 줄, 대본 모드의 "연습 끝" 버튼이 공유한다 (중복 완료 방지)
  const finishPractice = () => {
    if (practiceRef.current && !completedRef.current) {
      completedRef.current = true;
      completePractice(practiceRef.current);
    }
  };

  // 방금 연습한 장면을 기록으로 — 노트 작성 화면이 장면 제목·연기·시리즈·sceneId로 채워져 열린다.
  // 노트 화면은 같은 sessionId를 이어받는다 — 별도 세션을 새로 시작하지 않아 연습 1회가 2회로 세이지 않는다.
  const goToNote = () => {
    if (noteSent || noteTransferRef.current) return;
    // 권한/녹음 준비가 아직 끝나지 않았으면 빈 노트로 이동하지 않는다.
    if (recBusyRef.current) { showToast(t("duet.record_save_failed"), "error"); return; }
    noteTransferRef.current = true;
    const s = scene;
    const owner = accountRef.current;
    const roleName = s.roles[myRole]?.name;
    const prefill = {
      title: ds("noteTitle", { play: s.play }),
      field: "acting",
      seriesName: s.play,
      sceneId: s.id,
      sessionId: practiceRef.current?.sessionId,
      scriptLanguage: sceneLanguage(s),
      feedbackLanguage,
      rehearsalContext: rehearsalContextFor(s, myRole, feedbackLanguage),
    };
    const go = (recs) => {
      if (!mountedRef.current || owner !== accountRef.current) { noteTransferRef.current = false; return; }
      if (recs.length > 0) {
        prefill.voiceRecordings = recs;
        // AI가 상대역(앱 음성)을 사용자 연기로 착각하지 않게 — 실제로 음성이 켜져 있던 적 있을 때만 그 문장을 붙인다
        let hint = t("duet.record_note_hint", { play: s.play, role: roleName });
        if (voiceUsedRef.current) hint += ` ${t("duet.record_note_hint_voice")}`;
        prefill.content = hint;
      }
      stopSpeak();
      discardPreload();
      finishPractice();
      trackFunnelEvent("duet_to_note", i18n?.language);
      navigation.navigate("NoteCreate", { prefill });
      // 노트 화면으로 넘긴 뒤에만 소유권을 넘긴다. 복사 실패 시 이 화면에서 재시도할 수 있다.
      recordingsRef.current = [];
      setRecordedCount(0);
      voiceUsedRef.current = false;
      setNoteSent(true);
      noteTransferRef.current = false;
    };
    if (!recordingRef.current && !stoppingRef.current && recordingsRef.current.length === 0) {
      go([]);
      return;
    }
    (async () => {
      try {
        if ((recordingRef.current || stoppingRef.current) && await stopRecording(true) === false) return;
        const kept = await Promise.all(recordingsRef.current.map(async (rec) => ({
          ...rec,
          uri: await preserveMediaFile(rec.uri, "m4a"),
        })));
        if (mountedRef.current) go(kept);
      } catch (e) {
        if (mountedRef.current) showToast(t("duet.record_save_failed"), "error");
      } finally {
        noteTransferRef.current = false;
      }
    })();
  };

  const hasPendingRecordings = () => !!(recordingRef.current || stoppingRef.current || recBusyRef.current || recordingsRef.current.length);
  const requestLeave = (leave) => {
    if (noteTransferRef.current) return;
    if (!hasPendingRecordings()) { leave(); return; }
    if (leavePromptRef.current) return;
    leavePromptRef.current = true;
    Alert.alert(t("duet.record_leave_title"), t("duet.record_leave_msg"), [
      { text: t("duet.record_keep_practicing"), style: "cancel", onPress: () => { leavePromptRef.current = false; } },
      { text: t("duet.record_save_note"), onPress: () => { leavePromptRef.current = false; goToNote(); } },
      { text: t("duet.record_discard"), style: "destructive", onPress: async () => {
        leavePromptRef.current = false;
        noteTransferRef.current = true;
        cancelRecordingStart();
        await recordingStartRef.current;
        await stopRecording(false);
        recordingsRef.current = [];
        voiceUsedRef.current = false;
        noteTransferRef.current = false;
        leave();
      } },
    ], { cancelable: false });
  };

  // native-stack의 뒤로 제스처까지 보호한다. 재개할 때는 hook이 준 원래 action을 사용한다.
  usePreventRemove(recordingPreparing || hasPendingRecordings() || noteTransferRef.current, ({ data }) => {
    requestLeave(() => navigation.dispatch(data.action));
  });

  // 대본 모드 "연습 끝" — 완료만 되고 화면상 아무 반응이 없던 버그. 토스트 + 뒤로가기로 마무리를 보여준다.
  const finishScript = () => {
    requestLeave(() => {
      finishPractice();
      showToast(t("duet.finished"), "success");
      navigation.goBack();
    });
  };

  const openScene = (s) => { stopSpeak(); discardPreload(); discardRecordings(); setScene(s); setMyRole(0); setMode(null); setIdx(0); setRevealed(false); setPeeked({}); };
  // 모드에서 나가기(설정으로) — 소리는 멈추고, 녹음은 멈춰서 보관한다(같은 씬)
  const leaveMode = () => { cancelRecordingStart(); stopSpeak(); stopRecording(true); setMode(null); };
  // 씬 목록으로 — 다른 씬의 녹음이 섞이지 않게 버린다
  const leaveScene = () => requestLeave(() => { stopSpeak(); discardRecordings(); setScene(null); });
  const advance = (d) => {
    stopSpeak();
    const n = Math.min(Math.max(idx + d, 0), lines.length - 1);
    setIdx(n); setRevealed(false);
    if (d > 0) speakIfPartner(n, myRole);
    if (d > 0 && n === lines.length - 1) finishPractice();
  };

  // 다음 상대 대사 파일 선로드 (최대 1개) — 큐 모드·음성 켬일 때만, 아니면 내린다
  useEffect(() => {
    if (!(mode === "cue" && voiceOn && canPlayFile && scene)) { discardPreload(); return; }
    let m = idx + 1;
    while (m < lines.length && lines[m].r === myRole) m++;
    const L = lines[m];
    const url = L && sceneLanguage(scene) === "ko" && !scene.isPrivate ? voiceUrlFor(scene.id, m, L.t) : null;
    if (preloadRef.current && preloadRef.current.url === url) return;
    discardPreload();
    if (url) preloadRef.current = { url, promise: loadSound(url) };
  }, [mode, voiceOn, scene, idx, myRole, voiceReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // 화면 이탈 — 음성 정지·선로드 해제, 녹음은 멈추고 버린다 (전부 ref 기반이라 첫 렌더 클로저로 안전)
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopSpeak();
      discardPreload();
      discardRecordings();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigation can keep this screen mounted behind notes; silence playback there too.
  useEffect(() => navigation.addListener?.("blur", () => {
    cancelRecordingStart();
    stopSpeak();
    discardPreload();
    if (!noteTransferRef.current) stopRecording(true);
  }), [navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the app ends the take: keep what was recorded, never keep recording in the background.
  // "inactive" also fires for the first permission dialog, so only "background" cancels a pending start.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") cancelRecordingStart();
      if ((state === "background" || state === "inactive") && recordingRef.current && !noteTransferRef.current) stopRecording(true);
    });
    return () => sub?.remove?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const previousAccountRef = useRef(accountRef.current);
  useEffect(() => {
    if (previousAccountRef.current === accountRef.current) return;
    previousAccountRef.current = accountRef.current;
    cancelRecordingStart();
    stopSpeak();
    discardPreload();
    abandonPractice(practiceRef.current);
    practiceRef.current = null;
    setScene(null);
    setMode(null);
    setPastedScript("");
    setPasteOpen(false);
    setPastePreview(null);
    setPasteError(null);
    recordingsRef.current = [];
    voiceUsedRef.current = false;
    setRecordedCount(0);
    stopRecording(false).then(() => {
      recordingsRef.current = [];
      if (mountedRef.current) setRecordedCount(0);
    });
  }, [userProfile?.authUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  const Header = ({ title, onBack }) => (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Text style={styles.backText}>{ds("back")}</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={{ width: 52 }} />
    </View>
  );
  const LanguageRow = ({ kind, value, onChange }) => (
    <View style={styles.languageRow}>
      <Text style={styles.languageLabel}>{ds(kind)}</Text>
      <View style={styles.segment}>
        {["ko", "en"].map((language) => (
          <TouchableOpacity key={language} testID={`duet-${kind}-${language}`} accessibilityRole="button" accessibilityState={{ selected: value === language }} style={[styles.segmentItem, value === language && styles.segmentSelected]} onPress={() => onChange(language)}>
            <Text style={[styles.segmentText, value === language && styles.segmentTextSelected]}>{ds(language === "ko" ? "korean" : "english")}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
  const Rights = ({ item }) => <Text style={styles.rights}>{ds(sceneRightsKey(item))}</Text>;
  const VoiceControls = () => (
    <View style={styles.tools}>
      {canSpeak && <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: voiceOn }} style={[styles.chip, voiceOn && styles.chipOn]} onPress={toggleVoice}>
        <Text style={[styles.chipText, voiceOn && styles.chipTextOn]}>{ds("partnerVoice")}</Text>
      </TouchableOpacity>}
      {recordChip()}
      {canSpeak && voiceOn && [0.8, 1.0, 1.2].map((speed) => <TouchableOpacity key={speed} accessibilityRole="button" accessibilityLabel={`${speed}x`} accessibilityState={{ selected: rate === speed }} style={[styles.chip, rate === speed && styles.chipOn]} onPress={() => { setRate(speed); soundRef.current?.setRateAsync?.(speed, true)?.catch?.(noop); }}>
        <Text style={[styles.chipText, rate === speed && styles.chipTextOn]}>{speed}x</Text>
      </TouchableOpacity>)}
    </View>
  );
  const RecordStatus = () => recordedCount > 0 && <Text style={styles.recordStatus}>{ds("recorded", { count: recordedCount })}</Text>;
  const NoteButton = () => <View>
    <TouchableOpacity accessibilityRole="button" style={[styles.noteBtn, noteSent && { opacity: 0.5 }]} onPress={goToNote} activeOpacity={0.85} disabled={noteSent || recordingPreparing}>
      <Text style={styles.primaryText}>{noteSent ? t("duet.note_done") : ds("note")}</Text>
    </TouchableOpacity>
    <Text style={styles.noteHint}>{ds("readyNote")}</Text>
  </View>;
  const closePaste = () => { setPasteOpen(false); setPastedScript(""); setPastePreview(null); setPasteError(null); };
  const checkPaste = () => {
    const result = parsePrivateScript(pastedScript, scriptLanguage);
    if (result.error) { setPasteError(result); setPastePreview(null); return; }
    setPasteError(null);
    setPastePreview(result.scene);
  };

  if (!scene) return (
    <View style={styles.container}>
      <Header title={ds("title")} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={[styles.eyebrow, { color: "#FFA8C3" }]}>{ds("eyebrow")}</Text>
          <Text style={styles.heroTitle}>{ds("intro")}</Text>
          <Text style={styles.heroBody}>{ds("introBody")}</Text>

        </View>
        <View style={styles.preferences}>
          <LanguageRow kind="scriptLanguage" value={scriptLanguage} onChange={(language) => { setScriptLanguage(language); setPastePreview(null); }} />
          <LanguageRow kind="feedbackLanguage" value={feedbackLanguage} onChange={setFeedbackLanguage} />
          <Text style={styles.noteHint}>{ds("languageHint")}</Text>
        </View>
        <View style={styles.pasteCard}>
          {pasteOpen && <><Text style={styles.cardTitle}>{ds("pasteTitle")}</Text><Text style={styles.body}>{ds("pasteBody")}</Text></>}
          {!pasteOpen ? <TouchableOpacity testID="duet-paste-open" accessibilityRole="button" style={styles.pasteEntry} onPress={() => setPasteOpen(true)}><Text style={styles.outlineText}>{ds("pasteOpen")}  +</Text></TouchableOpacity> : <>
            <Text style={styles.noteHint}>{ds("pasteFormat")}</Text>
            <TextInput testID="duet-paste-input" accessibilityLabel={ds("pasteTitle")} value={pastedScript} onChangeText={(value) => { setPastedScript(value); setPastePreview(null); setPasteError(null); }} multiline autoCorrect={false} maxLength={SCRIPT_LIMITS.characters + 1} textAlignVertical="top" placeholder={ds("pastePlaceholder")} placeholderTextColor={STUDIO.muted} style={styles.pasteInput} />
            <Text style={styles.counter}>{pastedScript.length.toLocaleString()} / 12,000</Text>
            {pasteError && <Text accessibilityRole="alert" style={styles.error}>{ds(pasteError.error, { line: pasteError.line })}</Text>}
            {pastePreview ? <View testID="duet-paste-preview" style={styles.preview}>
              <Text style={styles.cardTitle}>{ds("confirmTitle")}</Text>
              <Text style={styles.body}>{ds("confirmBody", { roles: pastePreview.roles.map((role) => role.name).join(" · "), count: pastePreview.lines.length })}</Text>
              {pastePreview.lines.slice(0, 4).map((item, index) => <Text key={index} style={styles.previewLine} numberOfLines={2}>{pastePreview.roles[item.r].name}: {item.t}</Text>)}
              <TouchableOpacity accessibilityRole="button" testID="duet-paste-confirm" style={styles.noteBtn} onPress={() => { const item = pastePreview; closePaste(); openScene(item); }}><Text style={styles.primaryText}>{ds("confirmUse")}</Text></TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" style={styles.textButton} onPress={() => setPastePreview(null)}><Text style={styles.outlineText}>{ds("edit")}</Text></TouchableOpacity>
            </View> : <TouchableOpacity accessibilityRole="button" testID="duet-paste-check" style={styles.noteBtn} onPress={checkPaste}><Text style={styles.primaryText}>{ds("pasteVerify")}</Text></TouchableOpacity>}
            <Text style={styles.noteHint}>{ds("pastePrivacy")}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.textButton} onPress={closePaste}><Text style={styles.body}>{ds("pasteCancel")}</Text></TouchableOpacity>
          </>}
        </View>
        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{ds("scenes")}</Text><Text style={styles.caption}>{ds("sceneCount", { count: visibleScenes.length })}</Text></View>
        {visibleScenes.map((item, index) => <TouchableOpacity accessibilityRole="button" key={item.id} testID={`duet-scene-${item.id}`} style={styles.sceneCard} onPress={() => openScene(item)} activeOpacity={0.75}>
          <View style={styles.cardTop}><Text style={styles.sceneNumber}>{String(index + 1).padStart(2, "0")}</Text><Text style={styles.cardBadge}>{item.rights?.type === "artlink-original" ? ds("original") : "ACT RAW"}</Text><Text style={styles.caption}>{ds("lines", { count: item.lines.length })}</Text></View>
          <Text style={styles.sceneTitle}>{item.play}</Text>
          <Text style={styles.roleNames}>{item.roles.map((role) => role.name).join("  /  ")}</Text>
          <Text style={styles.body} numberOfLines={2}>{sceneDescription(item, feedbackLanguage, "label")}</Text>
          <View style={styles.cardBottom}><Text style={styles.caption}>{item.author}</Text><Text style={styles.arrow}>↗</Text></View>
        </TouchableOpacity>)}
        {!visibleScenes.length && <Text style={styles.body}>{ds("noScenes")}</Text>}
      </ScrollView>
    </View>
  );

  if (!mode) return (
    <View style={styles.container}>
      <Header title={scene.play} onBack={leaveScene} />
      <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        <View style={styles.setupCard}>
          <Text style={styles.eyebrow}>{scene.isPrivate ? ds("privateLabel") : sceneLanguage(scene) === "en" ? ds("original") : "ACT RAW"}</Text>
          <Text style={styles.setupTitle}>{scene.play}</Text>
          {sceneDescription(scene, feedbackLanguage, "label") ? <><Text style={styles.label}>{ds("situation")}</Text><Text style={styles.body}>{sceneDescription(scene, feedbackLanguage, "label")}</Text></> : null}
          <Text style={[styles.label, { marginTop: 22 }]}>{ds("myRole")}</Text>
          <View style={styles.roleRow}>{scene.roles.map((role, index) => <TouchableOpacity key={index} accessibilityRole="button" accessibilityState={{ selected: myRole === index }} testID={`duet-role-${index}`} style={[styles.roleCard, myRole === index && styles.roleSelected]} onPress={() => { if (index !== myRole) requestLeave(() => { discardRecordings(); setMyRole(index); }); }}><Text style={[styles.roleName, myRole === index && { color: STUDIO.accent }]}>{role.name}</Text><Text style={styles.roleLetter}>{String.fromCharCode(65 + index)}{myRole === index ? "  ✓" : ""}</Text></TouchableOpacity>)}</View>
          {sceneDescription(scene, feedbackLanguage, "point") ? <View style={styles.objective}><Text style={[styles.label, { color: STUDIO.positive }]}>{ds("objective")}</Text><Text style={styles.body}>{sceneDescription(scene, feedbackLanguage, "point")}</Text></View> : null}
          {feedbackLanguage === "en" && sceneLanguage(scene) === "ko" && !scene.isPrivate && <Text style={styles.noteHint}>{ds("englishDescriptionNotice")}</Text>}
        </View>
        <View style={styles.preferences}>
          <LanguageRow kind="feedbackLanguage" value={feedbackLanguage} onChange={setFeedbackLanguage} />
          {sceneLanguage(scene) === "en" && <View style={styles.voicePreference}><Text style={styles.label}>{ds("voiceLabel")}</Text><View style={styles.tools}>{["en-US", "en-GB"].map((voice) => <TouchableOpacity key={voice} accessibilityRole="button" accessibilityState={{ selected: englishVoice === voice }} testID={`duet-voice-${voice}`} style={[styles.chip, englishVoice === voice && styles.chipOn]} onPress={() => { stopSpeak(); setEnglishVoice(voice); }}><Text style={[styles.chipText, englishVoice === voice && styles.chipTextOn]}>{ds(voice === "en-US" ? "voiceUS" : "voiceUK")}</Text></TouchableOpacity>)}</View></View>}
          <Text style={styles.noteHint}>{ds("voiceHint")}</Text>
          <RecordStatus />
        </View>
        <TouchableOpacity accessibilityRole="button" testID="duet-start-cue" style={[styles.modeCard, styles.cueCard]} onPress={() => { setMode("cue"); setIdx(0); beginPractice(scene); speakIfPartner(0, myRole); }} activeOpacity={0.8}><Text style={styles.modeTitle}>{ds("cue")}</Text><Text style={styles.modeBody}>{ds("cueBody")}</Text><Text style={styles.modeArrow}>→</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" testID="duet-start-script" style={styles.modeCard} onPress={() => { setMode("script"); beginPractice(scene); }} activeOpacity={0.8}><Text style={styles.cardTitle}>{ds("script")}</Text><Text style={styles.body}>{ds("scriptBody")}</Text></TouchableOpacity>
        <Text style={styles.source}>{ds("source")} · {scene.isPrivate ? ds("privateLabel") : scene.source}</Text>
        <Rights item={scene} />
      </ScrollView>
    </View>
  );

  if (mode === "cue") {
    const mine = line && line.r === myRole;
    const prev = idx > 0 ? lines[idx - 1] : null;
    return <View style={styles.container}>
      <Header title={ds("cueHeader", { play: scene.play, role: scene.roles[myRole].name })} onBack={leaveMode} />
      <View testID="duet-cue-stage" style={[styles.stageWrap, { paddingBottom: 20 + insets.bottom }]}>
        <View style={styles.progressRow}><Text style={styles.eyebrow}>{ds("cue")}</Text><Text style={styles.caption}>{ds("progress", { current: idx + 1, total: lines.length })}</Text></View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${((idx + 1) / lines.length) * 100}%` }]} /></View>
        <ScrollView style={styles.stageScroll} showsVerticalScrollIndicator={false}>
          {prev && <Text style={styles.previousLine}>{scene.roles[prev.r].name} — {prev.t}</Text>}
          <View style={[styles.currentLine, mine && styles.myCurrentLine]}>
            <Text style={[styles.currentRole, mine && { color: STUDIO.accent }]}>{scene.roles[line.r].name}{mine ? ds("mine") : ""}</Text>
            {mine && !revealed ? <TouchableOpacity accessibilityRole="button" testID="duet-reveal" style={styles.hiddenBox} onPress={() => setRevealed(true)}><Text style={styles.hiddenText}>{ds("hidden")}</Text></TouchableOpacity> : <Text style={styles.dialogue}>{line.t}</Text>}
            {line.d && <Text style={styles.direction}>({line.d})</Text>}
          </View>
        </ScrollView>
        <VoiceControls /><RecordStatus />
        <View style={styles.controls}>
          <TouchableOpacity accessibilityRole="button" style={styles.ctlBtn} onPress={() => advance(-1)} disabled={idx === 0}><Text style={[styles.controlText, idx === 0 && { opacity: 0.35 }]}>{ds("previous")}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" testID="duet-next" style={[styles.ctlBtn, styles.ctlMain]} onPress={() => advance(1)} disabled={idx >= lines.length - 1}><Text style={styles.primaryText}>{idx >= lines.length - 1 ? ds("end") : mine && !revealed ? ds("skipNext") : ds("next")}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={styles.ctlBtn} onPress={() => { stopSpeak(); setIdx(0); setRevealed(false); beginPractice(scene); speakIfPartner(0, myRole); }}><Text style={styles.controlText}>{ds("restart")}</Text></TouchableOpacity>
        </View>
        {idx >= lines.length - 1 && <NoteButton />}
      </View>
    </View>;
  }

  return <View style={styles.container}>
    <Header title={ds("scriptHeader", { play: scene.play })} onBack={leaveMode} />
    <View style={styles.scriptTools}><TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: hideMine }} style={[styles.chip, hideMine && styles.chipOn]} onPress={() => { setHideMine(!hideMine); setPeeked({}); }}><Text style={[styles.chipText, hideMine && styles.chipTextOn]}>{ds("hideLines", { role: scene.roles[myRole].name })}</Text></TouchableOpacity>{recordChip()}<RecordStatus /></View>
    <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]} showsVerticalScrollIndicator={false}>
      {lines.map((item, index) => {
        const mine = item.r === myRole;
        const masked = mine && hideMine && !peeked[index];
        return <TouchableOpacity key={index} accessibilityRole={masked ? "button" : undefined} activeOpacity={masked ? 0.7 : 1} onPress={() => masked && setPeeked({ ...peeked, [index]: true })} style={[styles.lineRow, mine && styles.lineMine]}>
          <Text style={[styles.currentRole, mine && { color: STUDIO.accent }]}>{scene.roles[item.r].name}{mine ? ds("mine") : ""}</Text>
          <Text style={[styles.scriptLine, masked && { color: STUDIO.muted }]}>{masked ? ds("masked") : item.t}</Text>
          {item.d && !masked && <Text style={styles.direction}>({item.d})</Text>}
        </TouchableOpacity>;
      })}
      <NoteButton />
      <TouchableOpacity accessibilityRole="button" style={styles.finishBtn} onPress={finishScript}><Text style={styles.controlText}>{ds("finish")}</Text></TouchableOpacity>
      <Rights item={scene} />
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: STUDIO.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 12, backgroundColor: STUDIO.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: STUDIO.line },
  backButton: { minWidth: 52, minHeight: 44, justifyContent: "center" }, backText: { fontSize: 16, color: STUDIO.ink }, headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: STUDIO.ink },
  listContent: { padding: 20 }, hero: { backgroundColor: STUDIO.ink, borderRadius: 22, padding: 20, marginBottom: 14 }, eyebrow: { color: STUDIO.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.8 }, heroTitle: { color: "#FFFFFF", fontSize: 25, lineHeight: 33, fontWeight: "700", marginTop: 10, letterSpacing: -0.6 }, heroBody: { color: "#DBDFEA", fontSize: 13, lineHeight: 20, marginTop: 9 }, heroRule: { height: 1, backgroundColor: "#47495A", marginVertical: 22 }, heroFooter: { color: "#D8CCCB", fontSize: 9, letterSpacing: 0.7, lineHeight: 15 },
  preferences: { backgroundColor: STUDIO.paper, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: STUDIO.line, marginBottom: 18 }, languageRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }, languageLabel: { width: 104, color: STUDIO.ink, fontSize: 12, lineHeight: 18, fontWeight: "700" }, label: { color: STUDIO.ink, fontSize: 12, fontWeight: "700", marginBottom: 9 }, segment: { flex: 1, minWidth: 154, flexDirection: "row", backgroundColor: STUDIO.quiet, padding: 4, borderRadius: 12 }, segmentItem: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 9 }, segmentSelected: { backgroundColor: STUDIO.paper }, segmentText: { color: STUDIO.muted, fontSize: 13, fontWeight: "600" }, segmentTextSelected: { color: STUDIO.ink, fontWeight: "800" }, noteHint: { fontSize: 11, lineHeight: 17, color: STUDIO.muted, marginTop: 7 },
  pasteEntry: { minHeight: 46, justifyContent: "center" }, pasteCard: { backgroundColor: STUDIO.accentSoft, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 8, marginBottom: 20, borderWidth: 1, borderColor: "#F1D7E0" }, cardTitle: { color: STUDIO.ink, fontSize: 17, lineHeight: 23, fontWeight: "700" }, body: { fontSize: 13, lineHeight: 21, color: STUDIO.muted, marginTop: 5 }, outlineButton: { alignSelf: "flex-start", paddingVertical: 12, marginTop: 6, minHeight: 44 }, outlineText: { color: STUDIO.accent, fontSize: 13, fontWeight: "700" }, pasteInput: { minHeight: 180, maxHeight: 300, backgroundColor: STUDIO.paper, padding: 14, color: STUDIO.ink, fontSize: 14, lineHeight: 21, borderRadius: 12, borderWidth: 1, borderColor: STUDIO.line, marginTop: 14 }, counter: { fontSize: 10, textAlign: "right", color: STUDIO.muted, marginTop: 5 }, error: { fontSize: 12, lineHeight: 19, color: "#9E1732", marginTop: 9 }, preview: { marginTop: 14, backgroundColor: STUDIO.paper, padding: 14, borderRadius: 12 }, previewLine: { color: STUDIO.ink, fontSize: 12, lineHeight: 19, marginTop: 8 }, textButton: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 6 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }, sectionTitle: { color: STUDIO.ink, fontSize: 20, fontWeight: "700", letterSpacing: -0.4 }, caption: { color: STUDIO.muted, fontSize: 10, lineHeight: 16 }, sceneCard: { backgroundColor: STUDIO.paper, borderRadius: 20, borderWidth: 1, borderColor: STUDIO.line, padding: 20, marginBottom: 12 }, cardTop: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 14 }, sceneNumber: { color: STUDIO.accent, fontSize: 12, fontWeight: "800" }, cardBadge: { flex: 1, color: STUDIO.muted, fontSize: 9, letterSpacing: 1, fontWeight: "700" }, sceneTitle: { fontSize: 22, lineHeight: 29, color: STUDIO.ink, fontWeight: "700", letterSpacing: -0.3 }, roleNames: { fontSize: 11, fontWeight: "600", color: STUDIO.accent, marginTop: 8, marginBottom: 9 }, cardBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: STUDIO.line, paddingTop: 12, marginTop: 15 }, arrow: { color: STUDIO.ink, fontSize: 23 },
  setupCard: { backgroundColor: STUDIO.paper, borderWidth: 1, borderColor: STUDIO.line, padding: 22, borderRadius: 22, marginBottom: 18 }, setupTitle: { fontSize: 29, lineHeight: 37, fontWeight: "700", color: STUDIO.ink, marginVertical: 18 }, roleRow: { flexDirection: "row", gap: 10 }, roleCard: { flex: 1, minHeight: 84, borderRadius: 14, padding: 14, backgroundColor: STUDIO.background, borderWidth: 1, borderColor: STUDIO.line, justifyContent: "space-between" }, roleSelected: { borderColor: STUDIO.accent, backgroundColor: STUDIO.accentSoft }, roleName: { fontSize: 17, fontWeight: "700", color: STUDIO.ink }, roleLetter: { fontSize: 10, fontWeight: "700", color: STUDIO.muted, marginTop: 8 }, objective: { backgroundColor: STUDIO.positiveSoft, padding: 15, borderRadius: 14, marginTop: 20 }, voicePreference: { marginTop: 6 }, modeCard: { backgroundColor: STUDIO.paper, borderWidth: 1, borderColor: STUDIO.line, padding: 22, borderRadius: 18, marginBottom: 12 }, cueCard: { backgroundColor: STUDIO.ink, borderColor: STUDIO.ink }, modeTitle: { fontSize: 19, fontWeight: "700", color: "#FFFFFF" }, modeBody: { fontSize: 13, lineHeight: 21, color: "#D5D9E2", marginTop: 10, paddingRight: 20 }, modeArrow: { fontSize: 26, color: "#FFFFFF", marginTop: 12 }, source: { fontSize: 10, lineHeight: 16, color: STUDIO.muted, marginTop: 10 }, rights: { fontSize: 10, lineHeight: 17, color: STUDIO.muted, marginTop: 12, marginBottom: 8 },
  tools: { flexDirection: "row", gap: 8, flexWrap: "wrap", paddingTop: 6 }, chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" }, chip: { paddingVertical: 12, paddingHorizontal: 13, minHeight: 44, borderRadius: 12, backgroundColor: STUDIO.paper, borderWidth: 1, borderColor: STUDIO.line, justifyContent: "center" }, chipOn: { backgroundColor: STUDIO.accent, borderColor: STUDIO.accent }, chipText: { fontSize: 12, fontWeight: "700", color: STUDIO.ink }, chipTextOn: { color: "#FFFFFF" }, recordStatus: { fontSize: 11, lineHeight: 17, color: STUDIO.positive, marginTop: 8 },
  stageWrap: { flex: 1, padding: 20 }, progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, progressTrack: { height: 3, backgroundColor: STUDIO.line, marginTop: 12, borderRadius: 2 }, progressFill: { height: 3, backgroundColor: STUDIO.accent, borderRadius: 2 }, stageScroll: { flex: 1, marginTop: 20 }, previousLine: { fontSize: 13, lineHeight: 21, color: STUDIO.muted, marginBottom: 20 }, currentLine: { padding: 20, borderRadius: 18, backgroundColor: STUDIO.paper, borderWidth: 1, borderColor: STUDIO.line }, myCurrentLine: { borderColor: "#EED1DC" }, currentRole: { fontSize: 11, fontWeight: "800", color: STUDIO.muted, letterSpacing: 0.8 }, dialogue: { fontSize: 25, lineHeight: 36, color: STUDIO.ink, fontWeight: "500", marginTop: 20 }, hiddenBox: { marginTop: 18, paddingVertical: 28, paddingHorizontal: 12, borderRadius: 12, backgroundColor: STUDIO.accentSoft, borderWidth: 1, borderColor: "#ECC5D3", borderStyle: "dashed" }, hiddenText: { fontSize: 14, lineHeight: 23, color: STUDIO.muted, textAlign: "center" }, direction: { fontSize: 12, lineHeight: 19, color: STUDIO.muted, fontStyle: "italic", marginTop: 12 }, controls: { flexDirection: "row", gap: 7, paddingTop: 12 }, ctlBtn: { flex: 1, minHeight: 48, paddingVertical: 13, paddingHorizontal: 6, borderRadius: 12, justifyContent: "center", alignItems: "center", backgroundColor: STUDIO.quiet }, ctlMain: { flex: 1.6, backgroundColor: STUDIO.ink }, controlText: { fontSize: 12, fontWeight: "700", color: STUDIO.ink }, primaryText: { fontSize: 13, lineHeight: 19, fontWeight: "700", color: "#FFFFFF", textAlign: "center" }, noteBtn: { marginTop: 12, minHeight: 50, paddingVertical: 15, paddingHorizontal: 12, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: STUDIO.accent }, finishBtn: { marginTop: 8, minHeight: 48, paddingVertical: 13, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: STUDIO.quiet }, scriptTools: { paddingHorizontal: 20, paddingTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 }, lineRow: { backgroundColor: STUDIO.paper, borderRadius: 14, padding: 18, marginBottom: 10, borderWidth: 1, borderColor: STUDIO.line }, lineMine: { borderLeftWidth: 3, borderLeftColor: STUDIO.accent }, scriptLine: { fontSize: 17, lineHeight: 27, color: STUDIO.ink, marginTop: 9 },
});
