import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import EnglishStudy, { lessonFor } from '../EnglishStudy';
import scenes from '../../data/duet-scenes-en.json';

const scene = scenes.scenes[0];
const setup = (props = {}) => {
  const callbacks = { onListen: jest.fn(), onStop: jest.fn(), onPractice: jest.fn() };
  return { ...render(<EnglishStudy scene={scene} language="ko" canSpeak {...callbacks} {...props} />), ...callbacks };
};
test('all 100 bundled lines have aligned meanings and each scene has useful expressions', () => {
  expect(scenes.scenes).toHaveLength(10);
  for (const scene of scenes.scenes) {
    const lesson = lessonFor(scene);
    expect(lesson.lines).toHaveLength(10);
    for (const line of lesson.lines) expect(line.ko.trim()).toMatch(/[가-힣]/);
    expect(lesson.expressions).toHaveLength(2);
    for (const e of lesson.expressions) { expect(e.ko).toBeTruthy(); expect(e.en).toBeTruthy(); }
  }
});
test('private and changed scene text never receives a mismatched lesson', () => {
  expect(lessonFor({ ...scene, isPrivate: true })).toBeNull();
  expect(lessonFor({ ...scene, lines: [{ r: 0, t: 'different' }, ...scene.lines.slice(1)] })).toBeNull();
});
test('learner reveals meaning, listens repeatedly, hides line, then moves with hints reset', () => {
  const u = setup();
  expect(u.queryByTestId('study-translation')).toBeNull();
  fireEvent.press(u.getByTestId('study-meaning'));
  expect(u.getByText('이거 부엌 식탁에 두고 갔더라.')).toBeTruthy();
  fireEvent.press(u.getByTestId('study-listen')); fireEvent.press(u.getByTestId('study-listen'));
  expect(u.onListen).toHaveBeenCalledTimes(2);
  expect(u.onListen).toHaveBeenLastCalledWith(scene.lines[0].t);
  fireEvent.press(u.getByTestId('study-hide'));
  expect(u.queryByText(scene.lines[0].t)).toBeNull();
  expect(u.queryByTestId('study-translation')).toBeNull();
  fireEvent.press(u.getByTestId('study-next'));
  expect(u.getByText(scene.lines[1].t)).toBeTruthy();
  expect(u.onStop).toHaveBeenCalledTimes(2);
  fireEvent.press(u.getByTestId('study-practice'));
  expect(u.onPractice).toHaveBeenCalledTimes(1);
});
test('navigation is bounded and old binaries can still study without audio', () => {
  const u = setup({ canSpeak: false, language: 'en' });
  expect(u.queryByTestId('study-listen')).toBeNull();
  fireEvent.press(u.getByTestId('study-previous'));
  expect(u.getByText(scene.lines[0].t)).toBeTruthy();
  for(let i=0; i<15; i++) fireEvent.press(u.getByTestId('study-next'));
  expect(u.getByText(scene.lines[9].t)).toBeTruthy();
});
