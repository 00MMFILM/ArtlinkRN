import React, { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { STUDIO as C } from '../constants/studioTheme';
import { ART_REGIONS, artworkPhotos, validArtRegion } from '../utils/artworkReview';

function ArtworkImage({ image, label, children }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image?.uri]);
  const ratio = image?.width > 0 && image?.height > 0 ? image.width / image.height : 1;
  return <View style={s.frame}>
    {image?.uri && !failed ? <View style={{ width: '100%', aspectRatio: ratio }}>
      <Image accessibilityLabel={label} source={{ uri: image.uri }} resizeMode="contain" style={StyleSheet.absoluteFill} onError={() => setFailed(true)} />
      {children}
    </View> : <Text accessibilityRole="alert" style={s.body}>{label} · —</Text>}
  </View>;
}

export function ArtworkRegionPicker({ images, language, disabled, onChange }) {
  const ko = String(language).startsWith('ko');
  const [selected, setSelected] = useState(0);
  const photos = images.map((item, index) => ({ ...item, originalIndex: index })).filter(item => item.uri && item.type !== 'video').slice(0, 5);
  const image = photos[Math.min(selected, photos.length - 1)];
  if (!image) return null;
  const region = validArtRegion(image.reviewRegion);
  return <View testID="artwork-region-picker" style={s.card}>
    <Text style={s.eyebrow}>{ko ? '작품에서 함께 볼 곳' : 'LOOK CLOSER'}</Text>
    <Text style={s.body}>{ko ? '확인하고 싶은 부분을 눌러주세요. 앞의 사진 5장까지 선택 영역과 함께 분석합니다.' : 'Tap an area to examine. Feedback uses up to the first five photos with your selections.'}</Text>
    <View style={s.row}>{photos.map((photo, index) => <TouchableOpacity key={`${photo.uri}:${index}`} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: image.originalIndex === photo.originalIndex }} style={s.chip} onPress={() => setSelected(index)}><Text style={s.body}>{ko ? '사진' : 'Image'} {index + 1}</Text></TouchableOpacity>)}</View>
    <ArtworkImage image={image} label={ko ? '확인할 작품' : 'Artwork to review'}>
      <View style={s.grid}>{ART_REGIONS.map(([id, kr, en]) => <TouchableOpacity key={id} testID={`art-region-${id}`} accessibilityRole="button" accessibilityLabel={ko ? kr : en} accessibilityState={{ selected: region === id, disabled }} disabled={disabled} style={[s.cell, region === id && s.selectedCell]} onPress={() => onChange(image.originalIndex, region === id ? null : id)}><Text style={s.marker}>{region === id ? '●' : ''}</Text></TouchableOpacity>)}</View>
    </ArtworkImage>
    <Text style={s.small}>{region ? ART_REGIONS.find(([id]) => id === region)[ko ? 1 : 2] : (ko ? '전체 작품' : 'Whole artwork')}</Text>
  </View>;
}

export default function ArtworkCompareCard({ previousNote, note, language, onRetake, disabled = false }) {
  const ko = String(language).startsWith('ko');
  const before = artworkPhotos(previousNote), after = artworkPhotos(note);
  const [indices, setIndices] = useState({ before: 0, after: 0 });
  const [mode, setMode] = useState('both');
  const copy = ko ? { title: '작품의 다음 버전', before: '수정 전', after: '현재 작품', both: '나란히 보기', next: '수정본 남기기', hint: '같은 부분을 비교할 수 있도록 사진을 골라주세요.', missing: '이전 작품 사진이 없어 비교할 수 없어요.' } : { title: 'Your next version', before: 'Before', after: 'Current', both: 'Side by side', next: 'Add a revision', hint: 'Choose photos showing the same part of your work.', missing: 'The previous artwork photo is unavailable.' };
  if (!after.length) return null;
  const panel = (side, photos) => {
    const index = Math.min(indices[side], photos.length - 1);
    return <View key={side} style={s.panel}>
      <Text style={s.heading}>{copy[side]}</Text>
      <ArtworkImage image={photos[index]} label={copy[side]} />
      {photos.length > 1 && <View style={s.row}>{photos.map((photo, i) => <TouchableOpacity key={`${photo.uri}:${i}`} testID={`art-compare-${side}-${i}`} accessibilityRole="button" accessibilityLabel={`${copy[side]} ${i + 1}`} accessibilityState={{ selected: index === i }} style={[s.chip, index === i && s.selected]} onPress={() => setIndices(value => ({ ...value, [side]: i }))}><Text style={s.body}>{i + 1}</Text></TouchableOpacity>)}</View>}
    </View>;
  };
  return <View testID="artwork-compare" style={s.card}>
    <Text style={s.eyebrow}>{ko ? '미술 작업실' : 'ART STUDIO'}</Text>
    <Text style={s.title}>{copy.title}</Text>
    {previousNote && before.length ? <>
      <Text style={s.body}>{copy.hint}</Text>
      <View style={s.row}>{['both', 'before', 'after'].map(value => <TouchableOpacity key={value} testID={`art-view-${value}`} accessibilityRole="button" accessibilityState={{ selected: mode === value }} style={[s.chip, mode === value && s.selected]} onPress={() => setMode(value)}><Text style={s.body}>{copy[value]}</Text></TouchableOpacity>)}</View>
      <View style={s.comparison}>{mode !== 'after' && panel('before', before)}{mode !== 'before' && panel('after', after)}</View>
      {!!(note.focus || previousNote.chosenFocus) && <Text style={s.body}>{ko ? '이번 수정의 초점: ' : 'Revision focus: '}{note.focus || previousNote.chosenFocus}</Text>}
    </> : <Text style={s.body}>{previousNote ? copy.missing : (ko ? '수정한 작품을 새 기록으로 남기면 이 사진과 비교할 수 있어요.' : 'Save a revised work as a new entry to compare it with this image.')}</Text>}
    <TouchableOpacity testID="artwork-add-revision" accessibilityRole="button" disabled={disabled} style={[s.primary, disabled && { opacity: 0.4 }]} onPress={onRetake}><Text style={s.white}>{copy.next} →</Text></TouchableOpacity>
    <Text style={s.small}>{ko ? '기존 작품은 그대로 보관됩니다. AI 피드백은 새 기록에서 요청할 수 있어요.' : 'Your original stays saved. Request AI feedback from the new entry.'}</Text>
  </View>;
}
const s = StyleSheet.create({
  card: { padding: 18, marginVertical: 12, borderWidth: 1, borderColor: C.line, borderRadius: 20, backgroundColor: C.paper, gap: 12 },
  eyebrow: { color: C.positive, fontSize: 12, fontWeight: '700' }, title: { color: C.ink, fontSize: 22, fontWeight: '700' },
  body: { color: C.ink, fontSize: 14, lineHeight: 22 }, small: { color: C.muted, fontSize: 12, lineHeight: 19 }, heading: { color: C.ink, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { padding: 10, minHeight: 44, borderRadius: 12, backgroundColor: C.quiet }, selected: { backgroundColor: C.accentSoft },
  comparison: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, panel: { flex: 1, minWidth: 0, gap: 8 }, frame: { overflow: 'hidden', borderRadius: 10, backgroundColor: C.quiet },
  primary: { minHeight: 48, padding: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#AD194A', borderRadius: 12 }, white: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  grid: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '33.333333%', height: '33.333333%', borderWidth: 0.5, borderColor: '#FFFFFF88', alignItems: 'center', justifyContent: 'center' }, selectedCell: { backgroundColor: '#AD194A55', borderWidth: 2, borderColor: '#AD194A' }, marker: { color: '#FFF', fontSize: 24 },
});
