import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import PracticeStarter, { starterPrefill } from '../PracticeStarter';
import starters from '../../data/practice-starters.json';
test.each(Object.keys(starters))('%s hands off the chosen field, specific goal and material intent', field => {
  const onStart = jest.fn();
  const u = render(<PracticeStarter fields={['music']} language="ko" onStart={onStart} />);
  fireEvent.press(u.getByTestId(`starter-field-${field}`));
  fireEvent.press(u.getByTestId('starter-focus-2'));
  fireEvent.press(u.getByTestId('starter-open'));
  expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ field, intent: 'material', content: expect.stringContaining(starters[field].ko.focus[2]) }));
  for(const p of starters[field].ko.prompts) expect(onStart.mock.calls[0][0].content).toContain(p);
});
test('switching fields resets the goal, unsupported languages use readable English', () => {
  const onStart = jest.fn();
  const u = render(<PracticeStarter fields={['music']} language="ja" onStart={onStart} />);
  fireEvent.press(u.getByTestId('starter-focus-2'));
  fireEvent.press(u.getByTestId('starter-field-art'));
  fireEvent.press(u.getByTestId('starter-open'));
  expect(onStart.mock.calls[0][0].content).toContain(starters.art.en.focus[0]);
  expect(starterPrefill('invalid', 'ko')).toBeNull();
  expect(starterPrefill('music', 'ko', -1)).toBeNull();
});
