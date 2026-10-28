import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { AppState, Alert } from 'react-native';
import ReviewRoomScreen from '../ReviewRoomScreen';
import { useApp } from '../../context/AppContext';
import { reviewAction, uploadReviewFile } from '../../services/reviewRoomService';
import * as Picker from 'expo-document-picker';
import { reviewPrompts } from '../../utils/reviewContract';
import { newUuid } from '../../services/practiceService';
jest.mock('@react-navigation/native', () => ({
  usePreventRemove: jest.fn()
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: {
      language: 'ko'
    }
  })
}));
jest.mock('../../context/AppContext', () => ({
  useApp: jest.fn()
}));
jest.mock('../../services/reviewRoomService', () => ({
  reviewAction: jest.fn(),
  uploadReviewFile: jest.fn(),
  reviewError: e => e.message
}));
jest.mock('../../services/practiceService', () => ({
  newUuid: jest.fn()
}));
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn()
}));
jest.mock('expo-av', () => ({
  Video: () => null,
  ResizeMode: {
    CONTAIN: 'contain'
  }
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({
    children
  }) => children
}));
const listeners = {},
  nav = {
    goBack: jest.fn(),
    dispatch: jest.fn(),
    addListener: jest.fn((k, f) => {
      listeners[k] = f;
      return jest.fn();
    })
  };
let room, context;
jest.spyOn(Alert, 'alert').mockImplementation(() => {});
beforeEach(() => {
  jest.clearAllMocks();
  let nextId = 0;
  newUuid.mockImplementation(() => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`);
  AppState.currentState = 'active';
  context = {
    userProfile: {
      authUserId: 'owner',
      name: 'Artist'
    },
    setAuthState: jest.fn()
  };
  useApp.mockReturnValue(context);
  room = {
    room: {
      id: 'r',
      title: 'My poem',
      field: 'literature',
      assignment_id: null
    },
    owner: true,
    versions: [],
    comments: []
  };
  reviewAction.mockImplementation(async (_u, a, p) => a === 'list' ? [] : a === 'read' ? room : a === 'create' ? {
    id: 'r'
  } : a === 'reserve' ? {
    id: 'v',
    ready: true
  } : {});
});
const screen = (params = {}) => render(<ReviewRoomScreen route={{
  params
}} navigation={nav} />);
test('six fields appear and publishing requires consent', async () => {
  const u = screen();
  await waitFor(() => u.getByTestId('review-publish'));
  for (const f of ['acting', 'music', 'art', 'dance', 'literature', 'film']) expect(u.getByTestId('review-field-' + f)).toBeTruthy();
  expect(u.getByTestId('review-publish').props.accessibilityState.disabled).toBe(true);
});
test('text submission preserves selected field and does not run AI or upload media', async () => {
  const u = screen({
    field: 'literature'
  });
  await waitFor(() => u.getByTestId('review-body'));
  fireEvent.changeText(u.getByTestId('review-title'), 'Poem');
  fireEvent.changeText(u.getByTestId('review-body'), 'First stanza');
  fireEvent.press(u.getByTestId('review-consent'));
  await act(async () => fireEvent.press(u.getByTestId('review-publish')));
  expect(reviewAction.mock.calls.find(c => c[1] === 'create')[2]).toMatchObject({
    field: 'literature',
    title: 'Poem',
    consent: true
  });
  expect(reviewAction.mock.calls.find(c => c[1] === 'reserve')[2]).toMatchObject({
    kind: 'text',
    body: 'First stanza'
  });
  expect(uploadReviewFile).not.toHaveBeenCalled();
});
test('changing the work revokes consent', async () => {
  const u = screen();
  await waitFor(() => u.getByTestId('review-body'));
  fireEvent.changeText(u.getByTestId('review-body'), 'a');
  fireEvent.press(u.getByTestId('review-consent'));
  fireEvent.changeText(u.getByTestId('review-body'), 'b');
  expect(u.getByTestId('review-consent').props.accessibilityState.checked).toBe(false);
});
test('assignment creation locks the field and sends assignment id', async () => {
  const u = screen({
    assignmentId: 'a',
    field: 'dance',
    title: '8 counts'
  });
  await waitFor(() => u.getByTestId('review-body'));
  expect(u.getByTestId('review-field-music').props.accessibilityState.disabled).toBe(true);
  fireEvent.changeText(u.getByTestId('review-body'), 'Movement');
  fireEvent.press(u.getByTestId('review-consent'));
  await act(async () => fireEvent.press(u.getByTestId('review-publish')));
  expect(reviewAction.mock.calls.find(c => c[1] === 'create')[2]).toMatchObject({
    field: 'dance',
    assignmentId: 'a'
  });
});
test('group rooms cannot create an external invitation', async () => {
  room.room.assignment_id = 'a';
  const u = screen({
    roomId: 'r'
  });
  await waitFor(() => u.getByText('My poem'));
  expect(u.queryByTestId('review-share')).toBeNull();
  expect(u.queryByTestId('review-revoke')).toBeNull();
});
test('oversize selected media is rejected before a request', async () => {
  Picker.getDocumentAsync.mockResolvedValue({
    assets: [{
      uri: 'file:///clip',
      name: 'clip.mp4',
      mimeType: 'video/mp4',
      size: 26214401
    }]
  });
  const u = screen();
  await waitFor(() => u.getByTestId('review-pick'));
  await act(async () => fireEvent.press(u.getByTestId('review-pick')));
  expect(u.getByText('INVALID_MEDIA')).toBeTruthy();
  expect(reviewAction.mock.calls.some(c => c[1] === 'reserve')).toBe(false);
});
test('failed submission preserves text and idempotency key', async () => {
  const normal = reviewAction.getMockImplementation();
  reviewAction.mockImplementation(async (...args) => {
    if (args[1] === 'reserve') throw Error('offline');
    return normal(...args);
  });
  const u = screen();
  await waitFor(() => u.getByTestId('review-body'));
  fireEvent.changeText(u.getByTestId('review-title'), 'Work');
  fireEvent.changeText(u.getByTestId('review-body'), 'My draft');
  fireEvent.press(u.getByTestId('review-consent'));
  await act(async () => fireEvent.press(u.getByTestId('review-publish')));
  expect(u.getByTestId('review-body').props.value).toBe('My draft');
  await act(async () => fireEvent.press(u.getByTestId('review-publish')));
  const calls = reviewAction.mock.calls.filter(c => c[1] === 'reserve');
  expect(calls[0][2].clientId).toBe(calls[1][2].clientId);
});
test('blur hides loaded private work', async () => {
  const u = screen({
    roomId: 'r'
  });
  await waitFor(() => u.getByText('My poem'));
  act(() => listeners.blur());
  expect(u.queryByText('My poem')).toBeNull();
});
test('account changes discard private title and drafts', async () => {
  const u = screen({
    roomId: 'r'
  });
  await waitFor(() => u.getByText('My poem'));
  reviewAction.mockRejectedValue(Error('ACCESS_DENIED'));
  useApp.mockReturnValue({
    ...context,
    userProfile: {
      authUserId: 'other'
    }
  });
  u.rerender(<ReviewRoomScreen route={{
    params: {
      roomId: 'r'
    }
  }} navigation={nav} />);
  await waitFor(() => u.getByText('ACCESS_DENIED'));
  expect(u.queryByText('My poem')).toBeNull();
});
test('media submission uploads only after consent then finalizes the same version', async () => {
  Picker.getDocumentAsync.mockResolvedValue({
    assets: [{
      uri: 'file:///piece.wav',
      name: 'piece.wav',
      mimeType: 'audio/wav',
      size: 1024
    }]
  });
  const normal = reviewAction.getMockImplementation();
  reviewAction.mockImplementation(async (...args) => args[1] === 'reserve' ? {
    id: 'v',
    ready: false,
    uploadUrl: 'signed'
  } : normal(...args));
  const u = screen({
    field: 'music'
  });
  await waitFor(() => u.getByTestId('review-pick'));
  fireEvent.changeText(u.getByTestId('review-title'), 'Piece');
  await act(async () => fireEvent.press(u.getByTestId('review-pick')));
  expect(uploadReviewFile).not.toHaveBeenCalled();
  expect(u.getByTestId('review-publish').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(u.getByTestId('review-consent'));
  await act(async () => fireEvent.press(u.getByTestId('review-publish')));
  expect(uploadReviewFile).toHaveBeenCalledTimes(1);
  expect(reviewAction.mock.calls.find(c => c[1] === 'finalize')[2]).toMatchObject({
    roomId: 'r',
    versionId: 'v'
  });
});
test('refresh preserves the paragraph attached to an unsent comment', async () => {
  room.versions = [{
    id: 'v1',
    kind: 'text',
    body: 'First\n\nSecond'
  }];
  const normal = reviewAction.getMockImplementation();
  reviewAction.mockImplementation(async (...args) => args[1] === 'read' ? {
    ...room
  } : normal(...args));
  const u = screen({
    roomId: 'r'
  });
  await waitFor(() => u.getByText('Second'));
  fireEvent.press(u.getByText('Second'));
  fireEvent.changeText(u.getByTestId('review-comment'), 'Keep this paragraph');
  await act(async () => fireEvent.press(u.getByTestId('review-refresh')));
  await act(async () => fireEvent.press(u.getByTestId('review-send-comment')));
  expect(reviewAction.mock.calls.find(c => c[1] === 'comment')[2]).toMatchObject({
    versionId: 'v1',
    anchor: {
      kind: 'paragraph',
      index: 1
    }
  });
});
test('switching versions requires confirmation before discarding a comment', async () => {
  room.versions = [{
    id: 'v1',
    kind: 'text',
    body: 'Older work'
  }, {
    id: 'v2',
    kind: 'text',
    body: 'Newer work'
  }];
  const u = screen({
    roomId: 'r'
  });
  await waitFor(() => u.getByText('Newer work'));
  fireEvent.changeText(u.getByTestId('review-comment'), 'For the newer version');
  fireEvent.press(u.getByTestId('version-v1'));
  expect(u.getByTestId('review-comment').props.value).toBe('For the newer version');
  expect(u.getByText('Newer work')).toBeTruthy();
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  act(() => Alert.alert.mock.calls[0][2][1].onPress());
  expect(u.getByText('Older work')).toBeTruthy();
  expect(u.getByTestId('review-comment').props.value).toBe('');
});
test('opening another room does not silently discard a new work', async () => {
  const normal = reviewAction.getMockImplementation();
  reviewAction.mockImplementation(async (...args) => args[1] === 'list' ? [room.room] : normal(...args));
  const u = screen();
  await waitFor(() => u.getByTestId('room-r'));
  fireEvent.changeText(u.getByTestId('review-body'), 'Unsent work');
  fireEvent.press(u.getByTestId('room-r'));
  expect(u.getByTestId('review-body').props.value).toBe('Unsent work');
  expect(reviewAction.mock.calls.some(c => c[1] === 'read')).toBe(false);
  await act(async () => Alert.alert.mock.calls[0][2][1].onPress());
  expect(u.getByText('My poem')).toBeTruthy();
  expect(u.getByTestId('review-body').props.value).toBe('');
});
test('a successfully saved revision is opened immediately', async () => {
  room.versions = [{
    id: 'v1',
    kind: 'text',
    body: 'Old draft'
  }];
  const normal = reviewAction.getMockImplementation();
  reviewAction.mockImplementation(async (...args) => {
    if (args[1] === 'reserve') {
      room = {
        ...room,
        versions: [...room.versions, {
          id: 'v2',
          kind: 'text',
          body: args[2].body
        }]
      };
      return {
        id: 'v2',
        ready: true
      };
    }
    return normal(...args);
  });
  const u = screen({
    roomId: 'r'
  });
  await waitFor(() => u.getByText('Old draft'));
  fireEvent.changeText(u.getByTestId('review-body'), 'Saved revision');
  fireEvent.press(u.getByTestId('review-consent'));
  await act(async () => fireEvent.press(u.getByTestId('review-publish')));
  expect(u.getByText('Saved revision')).toBeTruthy();
  expect(u.queryByText('Old draft')).toBeNull();
});
test('an interrupted deletion can be retried from the list without reading the room', async () => {
  const normal = reviewAction.getMockImplementation();
  reviewAction.mockImplementation(async (...args) => args[1] === 'list' ? [{
    ...room.room,
    owner: true,
    deleting: true
  }] : normal(...args));
  const u = screen();
  await waitFor(() => u.getByTestId('delete-room-r'));
  fireEvent.changeText(u.getByTestId('review-body'), 'Another unsent work');
  fireEvent.press(u.getByTestId('delete-room-r'));
  expect(reviewAction.mock.calls.some(c => c[1] === 'delete')).toBe(false);
  await act(async () => Alert.alert.mock.calls[0][2][1].onPress());
  expect(reviewAction.mock.calls.find(c => c[1] === 'delete')[2]).toMatchObject({
    roomId: 'r',
    key: null
  });
  expect(reviewAction.mock.calls.some(c => c[1] === 'read')).toBe(false);
  expect(u.getByTestId('review-body').props.value).toBe('Another unsent work');
});
test('group owner cannot delete another member’s room from the assignment list', async () => {
  const normal = reviewAction.getMockImplementation();
  reviewAction.mockImplementation(async (...args) => args[1] === 'list' ? [{
    ...room.room,
    owner: false
  }] : normal(...args));
  const u = screen({
    assignmentId: 'a',
    field: 'dance'
  });
  await waitFor(() => u.getByTestId('room-r'));
  expect(u.queryByTestId('delete-room-r')).toBeNull();
});
test.each(['acting', 'music', 'art', 'dance', 'literature', 'film'])('%s has editable field-specific feedback questions', async field => {
  const u = screen({
    field
  });
  await waitFor(() => u.getByTestId('review-prompt-0'));
  expect(u.getByText(reviewPrompts[field][0].label[0])).toBeTruthy();
  fireEvent.press(u.getByTestId('review-prompt-0'));
  expect(u.getByTestId('review-request').props.value).toBe(reviewPrompts[field][0].question[0]);
  fireEvent.changeText(u.getByTestId('review-request'), 'My specific question');
  expect(u.getByTestId('review-request').props.value).toBe('My specific question');
});
test('question and revision context are saved with the version and shown to its viewer', async () => {
  const normal = reviewAction.getMockImplementation();
  reviewAction.mockImplementation(async (...args) => {
    if (args[1] === 'reserve') {
      room = {
        ...room,
        versions: [{
          id: 'v',
          kind: 'text',
          body: args[2].body,
          review_request: args[2].reviewRequest,
          change_note: args[2].changeNote
        }]
      };
      return {
        id: 'v',
        ready: true
      };
    }
    return normal(...args);
  });
  const u = screen({
    field: 'film'
  });
  await waitFor(() => u.getByTestId('review-request'));
  fireEvent.changeText(u.getByTestId('review-title'), 'Scene');
  fireEvent.changeText(u.getByTestId('review-body'), 'Scene outline');
  fireEvent.changeText(u.getByTestId('review-request'), ' Is the ending clear? ');
  fireEvent.changeText(u.getByTestId('review-change-note'), ' Shortened the final beat. ');
  fireEvent.press(u.getByTestId('review-consent'));
  await act(async () => fireEvent.press(u.getByTestId('review-publish')));
  expect(reviewAction.mock.calls.find(c => c[1] === 'reserve')[2]).toMatchObject({
    reviewRequest: 'Is the ending clear?',
    changeNote: 'Shortened the final beat.'
  });
  expect(u.getByText('Is the ending clear?')).toBeTruthy();
  expect(u.getByText('Shortened the final beat.')).toBeTruthy();
  expect(u.getByTestId('review-request').props.value).toBe('');
});
test('failed save preserves question and note, and editing either revokes consent', async () => {
  const normal = reviewAction.getMockImplementation();
  reviewAction.mockImplementation(async (...args) => args[1] === 'reserve' ? Promise.reject(Error('offline')) : normal(...args));
  const u = screen();
  await waitFor(() => u.getByTestId('review-body'));
  fireEvent.changeText(u.getByTestId('review-title'), 'Work');
  fireEvent.changeText(u.getByTestId('review-body'), 'Draft');
  fireEvent.changeText(u.getByTestId('review-request'), 'Question');
  fireEvent.changeText(u.getByTestId('review-change-note'), 'Context');
  fireEvent.press(u.getByTestId('review-consent'));
  await act(async () => fireEvent.press(u.getByTestId('review-publish')));
  expect(u.getByTestId('review-request').props.value).toBe('Question');
  expect(u.getByTestId('review-change-note').props.value).toBe('Context');
  await act(async () => fireEvent.press(u.getByTestId('review-publish')));
  const retries = reviewAction.mock.calls.filter(c => c[1] === 'reserve');
  expect(retries[0][2].clientId).toBe(retries[1][2].clientId);
  fireEvent.changeText(u.getByTestId('review-change-note'), 'Different context');
  expect(u.getByTestId('review-consent').props.accessibilityState.checked).toBe(false);
  fireEvent.press(u.getByTestId('review-consent'));
  await act(async () => fireEvent.press(u.getByTestId('review-publish')));
  expect(reviewAction.mock.calls.filter(c => c[1] === 'reserve')[2][2].clientId).not.toBe(retries[0][2].clientId);
});
test('open and resolved filters stay version-specific and counts include older work', async () => {
  room.versions = [{
    id: 'v1',
    kind: 'text',
    body: 'Older'
  }, {
    id: 'v2',
    kind: 'text',
    body: 'Current'
  }];
  room.comments = [{
    id: 'c1',
    version_id: 'v1',
    author_name: 'A',
    body: 'Older open note',
    anchor: {
      kind: 'general'
    },
    resolved: false
  }, {
    id: 'c2',
    version_id: 'v2',
    author_name: 'B',
    body: 'Current open note',
    anchor: {
      kind: 'general'
    },
    resolved: false
  }, {
    id: 'c3',
    version_id: 'v2',
    author_name: 'C',
    body: 'Already resolved',
    anchor: {
      kind: 'general'
    },
    resolved: true
  }];
  const u = screen({
    roomId: 'r'
  });
  await waitFor(() => u.getByText('Current open note'));
  fireEvent.press(u.getByTestId('review-filter-open'));
  expect(u.getByText('Current open note')).toBeTruthy();
  expect(u.queryByText('Already resolved')).toBeNull();
  expect(u.queryByText('Older open note')).toBeNull();
  expect(u.getByTestId('review-filter-open').props.accessibilityState.selected).toBe(true);
  expect(u.getByText('버전 1 · 미반영 1')).toBeTruthy();
  fireEvent.press(u.getByTestId('version-v1'));
  expect(u.getByText('Older open note')).toBeTruthy();
  fireEvent.press(u.getByTestId('review-filter-resolved'));
  expect(u.getByText('아직 반영한 의견이 없어요.')).toBeTruthy();
});
test('changing a selected prompt never overwrites a custom question without confirmation', async () => {
  const u = screen({
    field: 'art'
  });
  await waitFor(() => u.getByTestId('review-request'));
  fireEvent.changeText(u.getByTestId('review-request'), 'My own question');
  fireEvent.press(u.getByTestId('review-prompt-0'));
  expect(u.getByTestId('review-request').props.value).toBe('My own question');
  act(() => Alert.alert.mock.calls[0][2][1].onPress());
  expect(u.getByTestId('review-request').props.value).toBe(reviewPrompts.art[0].question[0]);
});
