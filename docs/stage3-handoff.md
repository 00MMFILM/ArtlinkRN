# 3단계 인계 (Codex 검토용, 2026-09-18)

목표 흐름: 연습하기 → AI 피드백 받기 → 고칠 점 하나 선택하기 → 다시 연습하기.
대상: 한국어 연기 입시·오디션 사용자. 다른 분야 기능, 가입 전 체험, 2단계 가입, 공유 카드, 알림, 마일리지, 구독은 건드리지 않았다.

## 커밋 상태
| 저장소 | 커밋 | 상태 |
|---|---|---|
| ArtlinkRN | 2ba8473 | 로컬 커밋, 미푸시, 빌드·제출 안 함 |
| artlink-server | b7422af | 로컬 커밋, 미푸시 = 미배포 |
| bium-studio (ACT RAW) | git 아님, `tools/build-seo.mjs` 수정 + 백업 `.bak-2026-09-17` | 빌드만, 미배포 |

## 변경 파일과 이유
### 서버 (artlink-server)
- `api/ai-analyze.js`, `api/analyze-video.js`: 요청에 `wantFocus:true`가 있을 때만 숨김 줄 `[[FOCUS]] a | b | c`를 `[[SCORES]]` 앞에 출력. 구버전 앱은 이 값을 보내지 않으므로 응답이 바뀌지 않는다. `focus`(이번 초점), `previous{focus,summary≤400,scores}`를 받아 비교 단락 생성(프리미엄 3~4문장, 무료 1문장). 근거 규칙: 전사·영상이 있으면 그 구간 인용, 글뿐이면 "기록에 적힌 내용 기준" 명시, 실력 단정·합격 가능성 언급 금지, 점수는 "연습 활동 지표". PROMPT_VERSION 2026-09-17.1.
- `api/practice.js` + `vercel.json` 리라이트 `/practice`: 앱 있으면 `artlink://practice?...`, 없으면 스토어.
- `api/track-event.js`: 화이트리스트에 `deeplink_actraw|bium|external`, `focus_selected`, `repractice_started`, `duet_to_note` (이전엔 버려지고 있었다).
- `scripts/test-focus-prompt.js`, `scripts/test-practice-bridge.js`: 테스트.

### 앱 (ArtlinkRN)
- `aiService.js`: `parseFocus`, `focusSummary`, `buildPreviousContext`, 요청에 `wantFocus`·`focus`·`previous`.
- `components/FocusPicker.js`(신규), `NoteCreateScreen.js`, `NoteDetailScreen.js`: 후보 칩, 고른 초점 저장, "이 포인트로 다시 연습"(parentNoteId·rootNoteId 체인), 지난 연습 카드.
- `DuetPracticeScreen.js`: "연습 기록 남기기", 대본 모드 "연습 끝"(2단계에서 비어 있던 완료 신호).
- `AppContext.js`: 둘러보기 1회 누른 기기는 다음 실행부터 홈(`artlink-guest-entered`), `handleUpdateNote`에 `silent` 옵션.
- `HomeScreen.js` + i18n 10개 언어: 한국어·연기 첫 카드 문구, `focus.*` 12키.
- `noteDraft.js`, `notesSyncService.js`: 체인 필드·후보를 초안 왕복과 서버 병합에서 보존.

### ACT RAW
- `tools/build-seo.mjs`: 독백 1,353쪽 본문 바로 아래 "아트링크에서 연습하기" 버튼. 저작권 비공개 1,057편은 본문을 넘기지 않고 제목만. GA `promo_click: artlink_practice`.

## 검증 결과 — 테스트
- 앱 Jest: 22개 묶음 254건 전부 통과.
- 서버 테스트 스크립트 전부 통과(게이팅: `wantFocus` 없으면 FOCUS 지시가 프롬프트에 없음).
- 실제 API로 만든 서버 응답(텍스트·영상)을 앱 파서에 넣어 확인: FOCUS와 SCORES 사이 빈 줄, 후보 안의 따옴표 모두 정상 처리, 본문에 `[[` 잔류 없음.
- ACT RAW 빌드 산출물 1,353쪽 버튼 위치·링크 전수 검사 이상 0.
- 소네트 독립 리뷰 1회: 버그 2건(마커 없는 응답에서 본문 `[[` 이후 소실, 초안 왕복 시 후보·선택 소실)과 부작용 1건(칩 선택마다 수정 토스트) 지적 → 수정하고 회귀 테스트 3건 추가.

## 검증 결과 — 실제 화면
- **확인하지 못했다.** 로컬 영상 생성 작업이 메모리를 쓰고 있어 에뮬레이터를 같이 띄울 수 없었다. 확인할 화면: 2인 대사 → 기록 남기기, 후보 칩 표시·선택, 재연습 노트 열림과 상단 초점, 지난 연습 카드, 게스트 재실행 시 홈 직행, 한국어 홈 첫 카드.
- 프로덕션에서 `/practice` 페이지, 새 프롬프트의 실응답도 미배포라 미확인.

## 남은 문제·후속
- `focus`·`parentNoteId`·`sceneId`·`focusOptions`는 기기 로컬에만 저장. `user_notes` 컬럼 추가는 미디어 타기기 백업과 묶어 후속.
- 앱 알림함 연결, 미디어 백업은 별도 계획.
- 비교는 직전 1건만. 추세 그래프 없음.
- 9/19 판정 시 `practice_repeat_7d`는 앱 버전별로 나눠 볼 것(1.11.3부터 계측).
- 승인 필요 순서: ① 서버 푸시(=배포) ② 에뮬레이터 실화면 확인 ③ 앱 1.11.4 빌드·제출 ④ ACT RAW 배포(서버 `/practice`가 먼저 살아 있어야 함).
