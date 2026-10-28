import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Image, Alert, Share, AppState, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePreventRemove } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import * as DocumentPicker from 'expo-document-picker';
import { Video, ResizeMode } from 'expo-av';
import { useApp } from '../context/AppContext';
import { newUuid } from '../services/practiceService';
import { reviewAction, uploadReviewFile, reviewError } from '../services/reviewRoomService';
import { fields, labels, media, anchor as validAnchor, invitation, reviewPrompts, reviewBrief } from '../utils/reviewContract';
import { STUDIO as C } from '../constants/studioTheme';
export default function ReviewRoomScreen({
  route,
  navigation
}) {
  const context = useApp(),
    {
      i18n
    } = useTranslation(),
    account = context.userProfile?.authUserId;
  return <Room key={`${account || 'guest'}:${route.params?.roomId || route.params?.assignmentId || 'mine'}`} account={account} context={context} params={route.params || {}} navigation={navigation} ko={i18n.language.startsWith('ko')} />;
}
function Room({
  account,
  context,
  params,
  navigation,
  ko
}) {
  const say = (a, b) => ko ? a : b;
  const [rooms, setRooms] = useState([]),
    [id, setId] = useState(params.roomId || null),
    [data, setData] = useState(null),
    [versionId, setVersionId] = useState(null),
    [url, setUrl] = useState('');
  const [field, setField] = useState(fields.includes(params.field) ? params.field : 'acting'),
    [title, setTitle] = useState(params.title || ''),
    [body, setBody] = useState(''),
    [file, setFile] = useState(null),
    [consent, setConsent] = useState(false);
  const [reviewRequest, setReviewRequest] = useState(''),
    [changeNote, setChangeNote] = useState(''),
    [commentFilter, setCommentFilter] = useState('all');
  const [comment, setComment] = useState(''),
    [name, setName] = useState(context.userProfile?.name || ''),
    [anchor, setAnchor] = useState({
      kind: 'general'
    }),
    [time, setTime] = useState('0');
  const [imageRatio, setImageRatio] = useState(1);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [visible, setVisible] = useState(true);
  const active = useRef(AppState.currentState === 'active');
  const alive = useRef(true),
    epoch = useRef(0),
    lock = useRef(false),
    controller = useRef(new AbortController()),
    pending = useRef({}),
    player = useRef(null),
    imageSize = useRef({
      width: 1,
      height: 1
    });
  const current = e => alive.current && active.current && epoch.current === e;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current.abort();
      epoch.current++;
    };
  }, []);
  const draft = !!(body || file || comment || reviewRequest || changeNote);
  const confirmDiscard = (hasDraft, action) => {
    if (!hasDraft) return action();
    Alert.alert(say('작성 중인 내용이 있어요', 'Unsent work'), say('이동하면 아직 올리지 않은 내용은 사라져요.', 'Continuing discards unsent work.'), [{
      text: say('계속 작성', 'Keep writing'),
      style: 'cancel'
    }, {
      text: say('이동하기', 'Continue'),
      onPress: action
    }]);
  };
  usePreventRemove(draft, ({
    data: e
  }) => Alert.alert(say('작성 중인 내용이 있어요', 'Unsent work'), say('나가면 아직 올리지 않은 내용은 사라져요.', 'Leaving discards unsent work.'), [{
    text: say('계속 작성', 'Keep writing'),
    style: 'cancel'
  }, {
    text: say('나가기', 'Leave'),
    onPress: () => navigation.dispatch(e.action)
  }]));
  const request = (action, p = {}) => reviewAction(account, action, {
    roomId: id,
    key: params.linkKey,
    ...p
  }, controller.current.signal);
  const load = async (target = id, preferredVersion = null) => {
    if (!account) return;
    const e = epoch.current;
    try {
      const value = await request(target ? 'read' : 'list', target ? {
        roomId: target
      } : {
        assignmentId: params.assignmentId
      });
      if (!current(e)) return;
      if (target) {
        setData(value);
        setVersionId(old => value.versions.some(v => v.id === preferredVersion) ? preferredVersion : value.versions.some(v => v.id === old) ? old : value.versions.at(-1)?.id || null);
      } else setRooms(value);
      setError('');
    } catch (err) {
      if (current(e)) {
        setData(null);
        setUrl('');
        setError(reviewError(err, ko));
      }
    }
  };
  useEffect(() => {
    epoch.current++;
    controller.current.abort();
    controller.current = new AbortController();
    setData(null);
    setUrl('');
    load();
  }, [id, account]);
  useEffect(() => {
    const hide = () => {
      active.current = false;
      epoch.current++;
      controller.current.abort();
      controller.current = new AbortController();
      setVisible(false);
      setData(null);
      setRooms([]);
      setUrl('');
      player.current?.pauseAsync().catch(() => {});
    };
    const show = () => {
      active.current = true;
      setVisible(true);
      load();
    };
    const sub = AppState.addEventListener('change', state => state === 'active' ? show() : hide());
    const blur = navigation.addListener?.('blur', hide),
      focus = navigation.addListener?.('focus', show);
    return () => {
      sub.remove();
      blur?.();
      focus?.();
    };
  }, [id, account]);
  const version = data?.versions.find(v => v.id === versionId);
  const currentComments = data?.comments.filter(c => c.version_id === versionId) || [];
  const openCount = currentComments.filter(c => !c.resolved).length;
  const visibleComments = currentComments.filter(c => commentFilter === 'all' || (commentFilter === 'open' ? !c.resolved : c.resolved));
  const workField = data?.room.field || field;
  useEffect(() => {
    setAnchor({
      kind: 'general'
    });
  }, [versionId]);
  useEffect(() => {
    setUrl('');
    if (!version || version.kind === 'text') return;
    let cancelled = false;
    const e = epoch.current;
    request('media', {
      versionId
    }).then(r => {
      if (!cancelled && current(e)) {
        setUrl(r.url);
        if (version.kind === 'image') Image.getSize(r.url, (w, h) => {
          if (!cancelled && current(e) && w > 0 && h > 0) setImageRatio(w / h);
        }, () => {});
      }
    }).catch(err => {
      if (!cancelled && current(e)) setError(reviewError(err, ko));
    });
    return () => {
      cancelled = true;
    };
  }, [versionId, data]);
  const run = async fn => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const e = epoch.current;
    try {
      await fn(e);
    } catch (err) {
      if (current(e)) setError(reviewError(err, ko));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const key = (kind, value) => {
    const stamp = JSON.stringify(value);
    if (pending.current[kind]?.stamp !== stamp) pending.current[kind] = {
      stamp,
      id: newUuid()
    };
    return pending.current[kind].id;
  };
  const pick = () => run(async e => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['image/jpeg', 'image/png', 'image/webp', 'audio/*', 'video/*'],
      copyToCacheDirectory: true,
      multiple: false
    });
    if (!alive.current || r.canceled) return;
    const f = r.assets[0];
    media(f.mimeType, f.size);
    setFile(f);
    setBody('');
    setConsent(false);
  });
  const publish = () => confirmDiscard(!!comment, () => run(async e => {
    if (!consent) throw Error('CONSENT_REQUIRED');
    const brief = reviewBrief(reviewRequest, changeNote);
    let roomId = id;
    if (!roomId) {
      const r = await request('create', {
        title,
        field,
        assignmentId: params.assignmentId,
        consent: true,
        clientId: key('room', {
          title,
          field,
          assignment: params.assignmentId
        })
      });
      roomId = r.id;
      if (!current(e)) return;
    }
    const payload = {
      ...(file ? media(file.mimeType, file.size) : {
        kind: 'text',
        body
      }),
      ...brief
    };
    const v = await request('reserve', {
      roomId,
      ...payload,
      clientId: key('version', {
        roomId,
        ...payload,
        uri: file?.uri
      })
    });
    if (!current(e)) return;
    if (!v.ready) {
      await uploadReviewFile(account, file, v, controller.current.signal);
      if (!current(e)) return;
      await request('finalize', {
        roomId,
        versionId: v.id
      });
    }
    if (!current(e)) return;
    setBody('');
    setFile(null);
    setConsent(false);
    setComment('');
    setReviewRequest('');
    setChangeNote('');
    pending.current = {};
    setId(roomId);
    await load(roomId, v.id);
  }));
  const send = () => run(async e => {
    const point = validAnchor(anchor, version.kind, version.body);
    await request('comment', {
      versionId,
      body: comment,
      authorName: name,
      anchor: point,
      clientId: key('comment', {
        versionId,
        comment,
        name,
        point
      })
    });
    if (current(e)) {
      setComment('');
      await load();
    }
  });
  const share = () => Alert.alert(say('초대 링크 만들기', 'Create invitation'), say('링크를 받은 사람은 작품과 코멘트를 볼 수 있어요. 기존 초대 링크는 종료됩니다.', 'Anyone with this link can view the work and comments. Previous invitations will end.'), [{
    text: say('취소', 'Cancel'),
    style: 'cancel'
  }, {
    text: say('만들기', 'Create'),
    onPress: () => run(async e => {
      const r = await request('link', {
        consent: true
      });
      if (current(e)) await Share.share({
        message: invitation('https://art-link.kr', id, r.key, ko ? 'ko' : 'en')
      });
    })
  }]);
  const choosePrompt = prompt => {
    const question = prompt.question[ko ? 0 : 1];
    const apply = () => {
      setReviewRequest(question);
      setConsent(false);
    };
    if (reviewRequest.trim() && reviewRequest !== question) {
      Alert.alert(say('질문을 바꿀까요?', 'Replace your question?'), say('작성한 질문을 선택한 예시로 바꿉니다. 이후 자유롭게 수정할 수 있어요.', 'Replace your question with this example. You can edit it afterwards.'), [{
        text: say('유지', 'Keep mine'),
        style: 'cancel'
      }, {
        text: say('바꾸기', 'Replace'),
        onPress: apply
      }]);
    } else apply();
  };
  const button = (test, label, fn, disabled = false, selected) => <TouchableOpacity key={test} testID={test} accessibilityRole="button" disabled={disabled || busy} accessibilityState={{
    disabled: disabled || busy,
    selected
  }} style={[s.button, selected && s.selected, (disabled || busy) && {
    opacity: .5
  }]} onPress={fn}><Text style={s.buttonText}>{label}</Text></TouchableOpacity>;
  const input = (test, value, set, placeholder, max = 2000, multi = false) => <TextInput testID={test} accessibilityLabel={placeholder} style={s.input} value={value} onChangeText={set} placeholder={placeholder} maxLength={max} multiline={multi} editable={!busy} />;
  const form = () => <View style={s.card}>
  <Text style={s.heading}>{id ? say('수정한 작품 올리기', 'Add a revision') : say('작품 하나로 시작하기', 'Start with one work')}</Text>
  {!id && <><View style={s.row}>{fields.map(f => button('review-field-' + f, `${field === f ? '● ' : ''}${labels[f][ko ? 0 : 1]}`, () => {
          setField(f);
          setConsent(false);
        }, !!params.assignmentId))}</View>{input('review-title', title, v => {
        setTitle(v);
        setConsent(false);
      }, say('작품 제목', 'Work title'), 120)}</>}
  {button('review-pick', file ? file.name : say('사진·음원·영상 선택 · 최대 25MB', 'Choose image, audio or video · up to 25 MB'), pick)}
  {file ? button('review-clear-file', say('파일 선택 해제', 'Clear file'), () => {
      setFile(null);
      setConsent(false);
    }) : input('review-body', body, v => {
      setBody(v);
      setConsent(false);
    }, say('글 작품을 직접 붙여넣어도 돼요.', 'Or paste your writing.'), 20000, true)}
  <Text style={s.heading}>{say('어떤 의견이 필요한가요?', 'What feedback would help?')}</Text>
  <Text style={s.small}>{say('질문 예시를 고른 뒤 자유롭게 고쳐도 돼요. 작품을 보는 사람에게 함께 전달됩니다.', 'Choose and edit a prompt. Reviewers will see it alongside this version.')}</Text>
  <View style={s.row}>{(reviewPrompts[workField] || []).map((p, i) => button('review-prompt-' + i, p.label[ko ? 0 : 1], () => choosePrompt(p)))}</View>
  {input('review-request', reviewRequest, v => {
      setReviewRequest(v);
      setConsent(false);
    }, say('보고 싶은 부분 한 가지 · 선택 · 400자', 'One question for your reviewer · optional · 400 characters'), 400, true)}
  <Text style={s.heading}>{data?.versions.length ? say('이번에 바꾼 점', 'What changed in this revision') : say('작품 설명·작업 의도', 'Context and intention')}</Text>
  {input('review-change-note', changeNote, v => {
      setChangeNote(v);
      setConsent(false);
    }, data?.versions.length ? say('어떤 의견을 어떻게 반영했나요? · 선택 · 600자', 'Which feedback did you act on, and how? · optional · 600 characters') : say('작업 의도나 미완성인 부분을 알려주세요. · 선택 · 600자', 'Share your intention or what is still in progress. · optional · 600 characters'), 600, true)}
  <Text style={s.small}>{params.assignmentId || data?.room.assignment_id ? say('제출자와 현재 모임 운영자에게만 작품과 코멘트를 공유합니다.', 'Only the submitter and current group owner can see this work.') : id ? say('이 방의 초대 링크를 받은 사람은 새 버전과 질문·수정 기록도 볼 수 있어요.', 'People with this room’s invitation can see new versions, questions and revision notes too.') : say('처음에는 나만 볼 수 있어요. 초대 링크를 만들어야 다른 사람이 볼 수 있어요.', 'Private until you create an invitation link.')}{say(' AI 분석은 자동 실행되지 않아요.', ' AI analysis does not run automatically.')}</Text>
  <TouchableOpacity testID="review-consent" accessibilityRole="checkbox" accessibilityState={{
      checked: consent
    }} onPress={() => setConsent(!consent)} disabled={busy}><Text style={s.body}>{consent ? '☑' : '☐'} {say('선택한 작품을 위 범위로 저장하는 데 동의합니다.', 'I agree to store this work with the access described above.')}</Text></TouchableOpacity>
  {button('review-publish', say('작품 저장', 'Save work'), publish, !consent || !file && !body.trim() || !id && !title.trim())}
 </View>;
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
  {button('review-back', say('뒤로', 'Back'), () => navigation.goBack())}<Text style={s.eyebrow}>ARTLINK / REVIEW ROOM</Text><Text style={s.title}>{data?.room.title || say('작품에 관한 대화.', 'Conversations about your work.')}</Text>
  {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}{busy && <ActivityIndicator />}
  {!account ? button('review-login', say('로그인하기', 'Sign in'), () => context.setAuthState?.('auth')) : visible && <>
   {button('review-refresh', say('새로고침', 'Refresh'), () => load())}
   {!id && <>{rooms.map(r => <View key={r.id} style={s.card}>{button('room-' + r.id, `${labels[r.field]?.[ko ? 0 : 1] || ''} · ${r.title}${r.author_name ? ' · ' + r.author_name : ''}`, () => confirmDiscard(draft, () => {
              setId(r.id);
              setBody('');
              setFile(null);
              setConsent(false);
              setComment('');
              setReviewRequest('');
              setChangeNote('');
              pending.current = {};
            }))}{r.owner && button('delete-room-' + r.id, r.deleting ? say('삭제 다시 시도', 'Retry deletion') : say('이 작품 삭제', 'Delete this work'), () => Alert.alert(say('작품을 삭제할까요?', 'Delete this room?'), `${r.title}\n${say('모든 버전과 코멘트를 삭제합니다.', 'All versions and comments will be removed.')}`, [{
              text: say('취소', 'Cancel'),
              style: 'cancel'
            }, {
              text: say('삭제', 'Delete'),
              style: 'destructive',
              onPress: () => run(async () => {
                await request('delete', {
                  roomId: r.id,
                  key: null
                });
                await load();
              })
            }]))}</View>)}{form()}</>}
   {data && <><Text style={s.small}>{say('작품 전체 미반영 의견', 'Open feedback across all versions')} {data.comments.filter(c => !c.resolved).length}</Text><View style={s.row}>{data.versions.map((v, i) => button('version-' + v.id, `${versionId === v.id ? '● ' : ''}${say('버전', 'Version')} ${i + 1} · ${say('미반영', 'Open')} ${data.comments.filter(c => c.version_id === v.id && !c.resolved).length}`, () => {
              if (v.id === versionId) return;
              confirmDiscard(!!comment, () => {
                setComment('');
                delete pending.current.comment;
                setVersionId(v.id);
              });
            }))}</View>
    {version && (!!version.review_request || !!version.change_note) && <View style={[s.card, s.brief]}>
      {!!version.review_request && <><Text style={s.heading}>{say('작가가 묻는 것', 'The creator’s question')}</Text><Text style={s.body}>{version.review_request}</Text></>}
      {!!version.change_note && <><Text style={s.heading}>{data.versions[0]?.id === versionId ? say('작품 설명·작업 의도', 'Context and intention') : say('이번에 바꾼 점', 'What changed')}</Text><Text style={s.body}>{version.change_note}</Text></>}
    </View>}
    {version?.kind === 'text' && version.body.split(/\n\s*\n/).map((p, i) => <TouchableOpacity key={i} accessibilityRole="button" onPress={() => setAnchor({
            kind: 'paragraph',
            index: i
          })} style={[s.card, anchor.kind === 'paragraph' && anchor.index === i && s.selected]}><Text style={s.small}>{i + 1}</Text><Text style={s.body}>{p}</Text></TouchableOpacity>)}
    {version?.kind === 'image' && url && <TouchableOpacity accessibilityRole="button" accessibilityLabel={say('그림의 코멘트 위치 선택', 'Select a point on the image')} onLayout={e => imageSize.current = e.nativeEvent.layout} onPress={e => setAnchor({
            kind: 'point',
            x: e.nativeEvent.locationX / imageSize.current.width,
            y: e.nativeEvent.locationY / imageSize.current.height
          })}><Image source={{
              uri: url
            }} style={[s.image, {
              aspectRatio: imageRatio
            }]} resizeMode="contain" />{anchor.kind === 'point' && <View pointerEvents="none" style={{
              position: 'absolute',
              left: `${anchor.x * 100}%`,
              top: `${anchor.y * 100}%`,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: '#E88D61',
              borderWidth: 3,
              borderColor: 'white',
              transform: [{
                translateX: -9
              }, {
                translateY: -9
              }]
            }} />}</TouchableOpacity>}
    {['audio', 'video'].includes(version?.kind) && url && <Video ref={player} source={{
            uri: url
          }} useNativeControls resizeMode={ResizeMode.CONTAIN} style={{
            height: version.kind === 'audio' ? 85 : 240,
            width: '100%'
          }} onError={() => setError(say('재생하지 못했어요. 새로고침 후 다시 시도해주세요.', 'Refresh and try playback again.'))} />}
    {version && <View style={s.card}><Text style={s.heading}>{say('부분별 코멘트', 'Comment on this version')}</Text>
     {['audio', 'video'].includes(version.kind) && <>{input('review-time', time, setTime, say('시작 시간 (초)', 'Start time (seconds)'), 8)}{button('review-anchor-time', say('이 시간에 코멘트', 'Comment at this time'), () => {
                try {
                  setAnchor(validAnchor({
                    kind: 'time',
                    start: Number(time),
                    end: Number(time)
                  }, version.kind));
                } catch (err) {
                  setError(reviewError(err, ko));
                }
              })}</>}
     <Text style={s.small}>{anchor.kind === 'general' ? say('작품 전체', 'Whole work') : anchor.kind === 'time' ? `${anchor.start}s` : anchor.kind === 'paragraph' ? `${say('문단', 'Paragraph')} ${anchor.index + 1}` : `${Math.round(anchor.x * 100)}%, ${Math.round(anchor.y * 100)}%`}</Text>
     {button('review-anchor-reset', say('전체 코멘트로 바꾸기', 'Comment on the whole work'), () => setAnchor({
              kind: 'general'
            }))}
     {input('review-name', name, setName, say('표시할 이름', 'Display name'), 40)}{input('review-comment', comment, setComment, say('구체적으로 어떤 부분이 달라지면 좋을까요?', 'What specifically could change?'), 2000, true)}{button('review-send-comment', say('코멘트 남기기', 'Post comment'), send, !comment.trim() || !name.trim())}
    </View>}
    {version && <View><Text style={s.heading}>{say('이 버전의 의견', 'Feedback on this version')}</Text><View style={s.row}>
      {button('review-filter-all', `${say('전체', 'All')} ${currentComments.length}`, () => setCommentFilter('all'), false, commentFilter === 'all')}
      {button('review-filter-open', `${say('미반영', 'Open')} ${openCount}`, () => setCommentFilter('open'), false, commentFilter === 'open')}
      {button('review-filter-resolved', `${say('반영함', 'Resolved')} ${currentComments.length - openCount}`, () => setCommentFilter('resolved'), false, commentFilter === 'resolved')}
    </View>{!visibleComments.length && <Text style={s.small}>{commentFilter === 'open' ? say('이 버전에 미반영 의견이 없어요.', 'No open feedback on this version.') : commentFilter === 'resolved' ? say('아직 반영한 의견이 없어요.', 'No resolved feedback yet.') : say('아직 의견이 없어요. 초대한 사람의 첫 의견을 기다리고 있어요.', 'No feedback yet. Invite someone to start the conversation.')}</Text>}</View>}
    {visibleComments.map(c => <View key={c.id} style={s.card}><Text style={s.heading}>{c.author_name}{c.resolved ? say(' · 반영함', ' · Resolved') : ''}</Text><Text style={s.small}>{c.anchor.kind === 'time' ? `${c.anchor.start}s` : c.anchor.kind === 'paragraph' ? `${say('문단', 'Paragraph')} ${c.anchor.index + 1}` : c.anchor.kind === 'point' ? `${Math.round(c.anchor.x * 100)}%, ${Math.round(c.anchor.y * 100)}%` : say('전체', 'General')}</Text><Text style={s.body}>{c.body}</Text>{button('anchor-' + c.id, say('코멘트 위치 보기', 'Go to comment'), () => {
              setAnchor(c.anchor);
              if (c.anchor.kind === 'time') player.current?.setPositionAsync(c.anchor.start * 1000).catch(() => {});
            })}{c.can_delete && button('delete-comment-' + c.id, say('코멘트 삭제', 'Delete comment'), () => Alert.alert(say('코멘트를 삭제할까요?', 'Delete this comment?'), '', [{
              text: say('취소', 'Cancel'),
              style: 'cancel'
            }, {
              text: say('삭제', 'Delete'),
              style: 'destructive',
              onPress: () => run(async () => {
                await request('remove_comment', {
                  commentId: c.id
                });
                await load();
              })
            }]))}{data.owner && button('resolve-' + c.id, c.resolved ? say('다시 열기', 'Reopen') : say('반영 완료', 'Mark resolved'), () => run(async () => {
              await request('resolve', {
                commentId: c.id,
                resolved: !c.resolved
              });
              await load();
            }))}</View>)}
    {data.owner && <>{form()}{!data.room.assignment_id && <>{button('review-share', say('웹 초대 링크 만들기', 'Create web invitation'), share)}{button('review-revoke', say('초대 링크 종료', 'End invitation'), () => run(async () => {
                await request('revoke');
                setError(say('초대를 종료했어요. 이미 열린 미디어 주소는 최대 60초간 유효합니다.', 'Invitation ended. Previously issued media URLs expire within 60 seconds.'));
              }))}</>}{button('review-delete', say('이 작품과 코멘트 삭제', 'Delete this room'), () => Alert.alert(say('작품을 삭제할까요?', 'Delete this room?'), say('모든 버전과 코멘트를 삭제합니다.', 'All versions and comments will be removed.'), [{
              text: say('취소', 'Cancel'),
              style: 'cancel'
            }, {
              text: say('삭제', 'Delete'),
              style: 'destructive',
              onPress: () => run(async e => {
                await request('delete');
                if (current(e)) {
                  setId(null);
                  setData(null);
                  setBody('');
                  setFile(null);
                  setReviewRequest('');
                  setChangeNote('');
                }
              })
            }]))}</>}
   </>}
  </>}
 </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({
  brief: {
    borderLeftWidth: 4,
    borderLeftColor: C.positive
  },
  safe: {
    flex: 1,
    backgroundColor: C.background
  },
  page: {
    padding: 20,
    gap: 16,
    paddingBottom: 60
  },
  title: {
    fontSize: 29,
    fontWeight: '800',
    color: C.ink
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    color: C.positive
  },
  heading: {
    fontSize: 17,
    fontWeight: '700',
    color: C.ink
  },
  body: {
    fontSize: 15,
    lineHeight: 24,
    color: C.ink
  },
  small: {
    fontSize: 12,
    lineHeight: 19,
    color: C.muted
  },
  button: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 13,
    backgroundColor: C.paper
  },
  buttonText: {
    fontSize: 14,
    color: C.positive,
    fontWeight: '600'
  },
  card: {
    backgroundColor: C.paper,
    padding: 16,
    borderRadius: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: C.line
  },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    padding: 12,
    borderRadius: 10,
    color: C.ink,
    minHeight: 46
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7
  },
  error: {
    color: '#A02935',
    lineHeight: 22
  },
  selected: {
    borderColor: C.positive,
    borderWidth: 2
  },
  image: {
    width: '100%'
  }
});
