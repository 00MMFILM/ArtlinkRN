// Short, original scenes. A quick entry never starts the microphone or AI itself.
export function quickPracticeScene(language = 'ko') {
  const ko = String(language).startsWith('ko');
  return {
    id: ko ? 'artlink-first-ko' : 'artlink-first-en', language: ko ? 'ko' : 'en',
    play: ko ? '가기 전에' : 'Before You Go', author: 'ArtLink', source: 'ArtLink original',
    rights: { type: 'artlink-original' },
    label: ko ? '친구가 떠나려 합니다. 조금 더 함께 있고 싶지만 붙잡는다는 티는 내고 싶지 않습니다.' : 'Your friend is leaving. You want them to stay, without admitting it.',
    point: ko ? '상대의 말을 들은 뒤, 붙잡고 싶은 마음으로 같은 대사를 두 번 다르게 말해보세요.' : 'Listen to your partner. Try two different ways to ask them to stay.',
    roles: [{ name: ko ? '나' : 'You' }, { name: ko ? '친구' : 'Friend' }],
    lines: ko ? [
      { r: 1, t: '나 이제 가야겠다.' }, { r: 0, t: '벌써? 차 아직 남았는데.' },
      { r: 1, t: '내일 아침 일찍 일어나야 해.' }, { r: 0, t: '알아. 잠깐이면 돼.' },
      { r: 1, t: '할 말 있어?' }, { r: 0, t: '그냥, 오늘은 조금만 더 있다 가.' },
    ] : [
      { r: 1, t: 'I should get going.' }, { r: 0, t: 'Already? You still have some tea.' },
      { r: 1, t: 'I have an early start tomorrow.' }, { r: 0, t: 'I know. Just a minute.' },
      { r: 1, t: 'Is there something you want to say?' }, { r: 0, t: 'Just stay a little longer. Please.' },
    ],
  };
}
