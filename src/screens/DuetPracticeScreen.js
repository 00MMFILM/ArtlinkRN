// 2인 대사 연습 — 상대역 대사를 쳐주는 연습 상대 (ACT RAW 씬 제공)
// 모드: 큐 연습(무음 기본·음성 토글) / 대본 보기(내 대사 가림). 음성은 expo-speech —
// 네이티브 모듈이라 스토어 빌드에 실려야 켜지고, 구버전 바이너리에선 토글 자체가 숨는다.
// 씬 데이터: 번들 JSON + actraw.kr/duet-scenes.json 원격 갱신 (전부 저작권 만료 고전).
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { CLight, T } from "../constants/theme";
import { useApp } from "../context/AppContext";
import bundledData from "../data/duet-scenes.json";
import { startPractice, completePractice } from "../services/practiceService";
import { trackFunnelEvent } from "../services/mauService";
import i18n from "i18next";

// expo-speech 는 네이티브 모듈 — 구버전 바이너리에 OTA 로 나가도 죽지 않게 가드해서 로드한다.
let Speech = null;
try { Speech = require("expo-speech"); } catch (e) { Speech = null; }
let AudioMode = null;
try { AudioMode = require("expo-av").Audio; } catch (e) { AudioMode = null; }

const REMOTE_URL = "https://actraw.kr/duet-scenes.json";

// 원격 씬 데이터 방어 — roles·lines가 있고 모든 line.r이 roles 범위 안이어야 신뢰한다.
// 하나라도 어긋나면 번들 데이터를 그대로 쓴다 (예: 배역 인덱스가 깨진 대사로 앱이 죽는 사고 방지).
function isValidRemoteData(j) {
  if (!j || !Array.isArray(j.scenes) || j.scenes.length === 0) return false;
  return j.scenes.every((s) => {
    if (!s || !Array.isArray(s.roles) || s.roles.length === 0) return false;
    if (!Array.isArray(s.lines) || s.lines.length === 0) return false;
    return s.lines.every((l) => l && Number.isInteger(l.r) && l.r >= 0 && l.r < s.roles.length);
  });
}

export default function DuetPracticeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { showToast } = useApp();
  const [data, setData] = useState(bundledData);
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

  // force: 음성을 막 켠 순간에는 voiceOn 상태가 아직 반영 전이라 직접 넘긴다
  const speakLine = (text, onDone, force = false) => {
    if (!canSpeak || !(voiceOn || force)) { onDone && onDone(); return; }
    const failed = () => { showToast(t("duet.voice_unavailable"), "error"); onDone && onDone(); };
    try {
      Speech.stop();
      Speech.speak(text.replace(/\([^)]*\)/g, ""), {
        language: "ko-KR", rate,
        onDone: () => onDone && onDone(),
        onError: failed,
      });
    } catch (e) { failed(); }
  };
  // 상대 대사면 읽는다 — "다음"으로 넘어갈 때뿐 아니라 첫 줄·음성을 켠 순간에도
  const speakIfPartner = (n, role, force = false) => {
    const L = lines[n];
    if (L && L.r !== role) speakLine(L.t, null, force);
  };
  const toggleVoice = () => {
    if (voiceOn) { stopSpeak(); setVoiceOn(false); return; }
    setVoiceOn(true);
    // 아이폰 무음 스위치가 켜져 있어도 들리게 (기본은 무음 모드에서 소리가 안 난다)
    try { AudioMode?.setAudioModeAsync?.({ playsInSilentModeIOS: true })?.catch?.(() => {}); } catch (e) {}
    speakIfPartner(idx, myRole, true);
  };
  const stopSpeak = () => { try { canSpeak && Speech.stop(); } catch (e) {} };

  // 원격 갱신 — 실패하거나 데이터가 이상하면 번들 데이터로 동작
  useEffect(() => {
    let alive = true;
    fetch(REMOTE_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j && j.version >= bundledData.version && isValidRemoteData(j)) setData(j);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const scenes = data.scenes || [];
  const lines = scene?.lines || [];
  const line = lines[idx];
  const partnerName = scene ? scene.roles[1 - myRole]?.name : "";

  // 연습 세션 — 모드를 고르면 시작, 마지막 줄에 닿으면 딱 1회 완료 (대사 내용은 보내지 않는다)
  const practiceRef = useRef(null);
  const completedRef = useRef(false);
  const [noteSent, setNoteSent] = useState(false); // "연습 기록 남기기"를 이미 눌렀다 — 같은 씬 세션 안에서 재클릭 방지
  const beginPractice = (s) => {
    completedRef.current = false;
    setNoteSent(false);
    practiceRef.current = startPractice("duet", s?.id, "acting");
  };

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
    if (noteSent) return;
    setNoteSent(true);
    finishPractice(); // 연습은 여기서 끝났다 — 노트를 취소해도 완료가 남는다. 같은 sessionId의 재완료는 practiceService가 1회로 막는다
    trackFunnelEvent("duet_to_note", i18n?.language);
    navigation.navigate("NoteCreate", {
      prefill: {
        title: `${scene.play} 2인 대사`,
        field: "acting",
        seriesName: scene.play,
        sceneId: scene.id,
        sessionId: practiceRef.current?.sessionId,
      },
    });
  };

  // 대본 모드 "연습 끝" — 완료만 되고 화면상 아무 반응이 없던 버그. 토스트 + 뒤로가기로 마무리를 보여준다.
  const finishScript = () => {
    finishPractice();
    showToast(t("duet.finished"), "success");
    navigation.goBack();
  };

  const openScene = (s) => { setScene(s); setMyRole(0); setMode(null); setIdx(0); setRevealed(false); setPeeked({}); };
  const advance = (d) => {
    stopSpeak();
    const n = Math.min(Math.max(idx + d, 0), lines.length - 1);
    setIdx(n); setRevealed(false);
    if (d > 0) speakIfPartner(n, myRole);
    if (d > 0 && n === lines.length - 1) finishPractice();
  };

  useEffect(() => stopSpeak, []); // 화면 이탈 시 음성 정지

  // ---- 헤더 ----
  const Header = ({ title, onBack }) => (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={[T.title, { color: CLight.gray700 }]}>‹ 뒤로</Text>
      </TouchableOpacity>
      <Text style={[T.titleBold, { color: CLight.gray900 }]} numberOfLines={1}>{title}</Text>
      <View style={{ width: 44 }} />
    </View>
  );

  // ================= 씬 목록 =================
  if (!scene) {
    return (
      <View style={[styles.container, { backgroundColor: CLight.bg }]}>
        <Header title="2인 대사 연습" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          <Text style={[T.caption, { color: CLight.gray500, marginBottom: 14 }]}>
            씬을 고르고 내 배역을 정하면, 상대 배역이 대사를 쳐줍니다.{"\n"}전부 저작권 만료 고전 — 연습·시험에 자유롭게 쓸 수 있어요.
          </Text>
          {scenes.map((s) => (
            <TouchableOpacity key={s.id} style={styles.sceneCard} onPress={() => openScene(s)} activeOpacity={0.7}>
              <Text style={[T.titleBold, { color: CLight.gray900 }]}>{s.play}</Text>
              <Text style={[T.small, { color: CLight.pink, marginTop: 2 }]}>
                {s.roles.map((r) => r.name).join(" · ")}
              </Text>
              <Text style={[T.small, { color: CLight.gray500, marginTop: 4 }]} numberOfLines={2}>{s.label}</Text>
              <Text style={[T.micro, { color: CLight.gray400, marginTop: 6 }]}>
                {s.author} · {s.genre} · {s.lines.length}줄
              </Text>
            </TouchableOpacity>
          ))}
          <Text style={[T.micro, { color: CLight.gray400, textAlign: "center", marginVertical: 18 }]}>
            연습 씬 제공 — ACT RAW (actraw.kr)
          </Text>
        </ScrollView>
      </View>
    );
  }

  // ================= 설정 (배역·모드 선택) =================
  if (!mode) {
    return (
      <View style={[styles.container, { backgroundColor: CLight.bg }]}>
        <Header title={scene.play} onBack={() => setScene(null)} />
        <ScrollView contentContainerStyle={styles.listContent}>
          <View style={styles.setupCard}>
            <Text style={[T.smallBold, { color: CLight.gray500, marginBottom: 8 }]}>내 배역</Text>
            <View style={styles.chipRow}>
              {scene.roles.map((r, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.chip, myRole === i && styles.chipOn]}
                  onPress={() => setMyRole(i)}
                >
                  <Text style={[T.bodyBold, { color: myRole === i ? CLight.white : CLight.gray700 }]}>
                    {r.name} <Text style={T.micro}>{r.gender}</Text>
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {scene.point ? (
              <Text style={[T.small, { color: CLight.gray500, marginTop: 12 }]}>연기 포인트 — {scene.point}</Text>
            ) : null}
          </View>

          <TouchableOpacity style={styles.modeCard} onPress={() => { setMode("cue"); setIdx(0); beginPractice(scene); speakIfPartner(0, myRole); }} activeOpacity={0.8}>
            <Text style={[T.titleBold, { color: CLight.gray900 }]}>🎬 큐 연습</Text>
            <Text style={[T.small, { color: CLight.gray500, marginTop: 4 }]}>
              상대 대사가 한 줄씩 나오고, 내 차례에 멈춰요. 내 대사는 가려져서 암기 확인이 됩니다.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modeCard} onPress={() => { setMode("script"); beginPractice(scene); }} activeOpacity={0.8}>
            <Text style={[T.titleBold, { color: CLight.gray900 }]}>📜 대본 보기</Text>
            <Text style={[T.small, { color: CLight.gray500, marginTop: 4 }]}>
              전체 대사를 순서대로 읽어요. 내 대사만 가리고 훑는 것도 가능해요.
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ================= 큐 연습 모드 =================
  if (mode === "cue") {
    const mine = line && line.r === myRole;
    const prev = idx > 0 ? lines[idx - 1] : null;
    return (
      <View style={[styles.container, { backgroundColor: CLight.bg }]}>
        <Header title={`${scene.play} · ${scene.roles[myRole].name} 역`} onBack={() => setMode(null)} />
        <View testID="duet-cue-stage" style={[styles.stageWrap, { paddingBottom: 20 + insets.bottom }]}>
          <Text style={[T.micro, { color: CLight.gray400, letterSpacing: 1 }]}>
            {idx + 1} / {lines.length}
          </Text>
          <ScrollView style={{ flex: 1, marginTop: 10 }} showsVerticalScrollIndicator={false}>
            {prev ? (
              <Text style={[T.small, { color: CLight.gray400, marginBottom: 14 }]}>
                {scene.roles[prev.r].name} — {prev.t}
              </Text>
            ) : null}
            <Text style={[T.smallBold, { color: mine ? CLight.pink : CLight.gray500, letterSpacing: 1 }]}>
              {scene.roles[line.r].name}{mine ? " (나)" : ""}
            </Text>
            {mine && !revealed ? (
              <TouchableOpacity onPress={() => setRevealed(true)} activeOpacity={0.8}>
                <View style={styles.hiddenBox}>
                  <Text style={[T.body, { color: CLight.gray400, textAlign: "center" }]}>
                    내 차례예요. 기억나는 대로 말해보고,{"\n"}탭하면 대사를 확인할 수 있어요.
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <Text style={[T.h3, { color: CLight.gray900, marginTop: 8, lineHeight: 32 }]}>{line.t}</Text>
            )}
            {line.d ? (
              <Text style={[T.small, { color: CLight.gray500, marginTop: 10, fontStyle: "italic" }]}>({line.d})</Text>
            ) : null}
          </ScrollView>
          {canSpeak ? (
            <View style={[styles.chipRow, { paddingTop: 8 }]}>
              <TouchableOpacity style={[styles.chip, voiceOn && styles.chipOn]} onPress={toggleVoice}>
                <Text style={[T.smallBold, { color: voiceOn ? CLight.white : CLight.gray700 }]}>🔊 상대 대사 음성</Text>
              </TouchableOpacity>
              {voiceOn ? [0.8, 1.0, 1.2].map((r) => (
                <TouchableOpacity key={r} style={[styles.chip, rate === r && styles.chipOn]} onPress={() => setRate(r)}>
                  <Text style={[T.smallBold, { color: rate === r ? CLight.white : CLight.gray700 }]}>{r}x</Text>
                </TouchableOpacity>
              )) : null}
            </View>
          ) : null}
          <View style={styles.controls}>
            <TouchableOpacity style={styles.ctlBtn} onPress={() => advance(-1)} disabled={idx === 0}>
              <Text style={[T.bodyBold, { color: idx === 0 ? CLight.gray300 : CLight.gray700 }]}>이전</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.ctlBtn, styles.ctlMain]} onPress={() => advance(1)} disabled={idx >= lines.length - 1}>
              <Text style={[T.bodyBold, { color: CLight.white }]}>
                {idx >= lines.length - 1 ? "끝" : mine && !revealed ? "건너뛰고 다음" : "다음"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ctlBtn} onPress={() => { stopSpeak(); setIdx(0); setRevealed(false); beginPractice(scene); speakIfPartner(0, myRole); }}>
              <Text style={[T.bodyBold, { color: CLight.gray700 }]}>처음부터</Text>
            </TouchableOpacity>
          </View>
          {idx >= lines.length - 1 ? (
            <TouchableOpacity style={styles.noteBtn} onPress={goToNote} activeOpacity={0.85} disabled={noteSent}>
              <Text style={[T.bodyBold, { color: CLight.white }]}>
                {noteSent ? t("duet.note_done") : "연습 기록 남기기"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  // ================= 대본 보기 모드 =================
  return (
    <View style={[styles.container, { backgroundColor: CLight.bg }]}>
      <Header title={`${scene.play} · 대본`} onBack={() => setMode(null)} />
      <View style={styles.scriptTools}>
        <TouchableOpacity
          style={[styles.chip, hideMine && styles.chipOn]}
          onPress={() => { setHideMine(!hideMine); setPeeked({}); }}
        >
          <Text style={[T.smallBold, { color: hideMine ? CLight.white : CLight.gray700 }]}>
            내 대사 가리기 ({scene.roles[myRole].name})
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={[styles.listContent, { paddingBottom: 16 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {lines.map((L, i) => {
          const mine = L.r === myRole;
          const masked = mine && hideMine && !peeked[i];
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={masked ? 0.7 : 1}
              onPress={() => masked && setPeeked({ ...peeked, [i]: true })}
            >
              <View style={[styles.lineRow, mine && styles.lineMine]}>
                <Text style={[T.smallBold, { color: mine ? CLight.pink : CLight.gray500 }]}>
                  {scene.roles[L.r].name}{mine ? " (나)" : ""}
                </Text>
                <Text style={[T.body, { color: masked ? CLight.gray300 : CLight.gray900, marginTop: 2 }]}>
                  {masked ? "● ● ●  (탭해서 확인)" : L.t}
                </Text>
                {L.d && !masked ? (
                  <Text style={[T.micro, { color: CLight.gray400, marginTop: 3, fontStyle: "italic" }]}>({L.d})</Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.noteBtn} onPress={goToNote} activeOpacity={0.85} disabled={noteSent}>
          <Text style={[T.bodyBold, { color: CLight.white }]}>
            {noteSent ? t("duet.note_done") : "연습 기록 남기기"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.finishBtn} onPress={finishScript} activeOpacity={0.85}>
          <Text style={[T.bodyBold, { color: CLight.gray700 }]}>연습 끝</Text>
        </TouchableOpacity>
        <Text style={[T.micro, { color: CLight.gray400, textAlign: "center", marginVertical: 18 }]}>
          연습 씬 제공 — ACT RAW (actraw.kr)
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, backgroundColor: CLight.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: CLight.gray200,
  },
  listContent: { padding: 16 },
  sceneCard: {
    backgroundColor: CLight.surface, borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: CLight.cardBorder,
  },
  setupCard: {
    backgroundColor: CLight.surface, borderRadius: 14, padding: 16, marginBottom: 12,
  },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20,
    backgroundColor: CLight.gray100, borderWidth: 1, borderColor: CLight.gray200,
  },
  chipOn: { backgroundColor: CLight.pink, borderColor: CLight.pink },
  modeCard: {
    backgroundColor: CLight.surface, borderRadius: 14, padding: 18, marginBottom: 10,
    borderWidth: 1, borderColor: CLight.cardBorder,
  },
  stageWrap: { flex: 1, padding: 20 },
  hiddenBox: {
    marginTop: 12, paddingVertical: 34, paddingHorizontal: 16, borderRadius: 14,
    backgroundColor: CLight.gray100, borderWidth: 1, borderColor: CLight.gray200, borderStyle: "dashed",
  },
  controls: { flexDirection: "row", gap: 8, paddingTop: 10 },
  ctlBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center",
    backgroundColor: CLight.gray100,
  },
  ctlMain: { flex: 1.6, backgroundColor: CLight.pink },
  scriptTools: { paddingHorizontal: 16, paddingTop: 12, flexDirection: "row" },
  lineRow: {
    backgroundColor: CLight.surface, borderRadius: 12, padding: 13, marginBottom: 8,
  },
  lineMine: { borderLeftWidth: 3, borderLeftColor: CLight.pink },
  noteBtn: {
    marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: "center",
    backgroundColor: CLight.pink,
  },
  finishBtn: {
    marginTop: 8, paddingVertical: 13, borderRadius: 12, alignItems: "center",
    backgroundColor: CLight.gray100,
  },
});
