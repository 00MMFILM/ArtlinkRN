import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Alert, Clipboard, Linking } from "react-native";
import MatchingPostDetailScreen from "../MatchingPostDetailScreen";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key) => key }),
}));
jest.mock("../../context/AppContext", () => ({
  useApp: () => ({ handleBlockUser: jest.fn(), handleReportContent: jest.fn() }),
}));

const post = {
  id: "posting-1", source: "ai", sourcePlatform: "필름메이커스",
  sourceUrl: "https://example.org/post/1", title: "배우 모집", field: "acting",
  description: "배우를 모집합니다.", tab: "프로젝트", deadline: "2099-01-01",
};
const screen = (extra = {}) => render(
  <MatchingPostDetailScreen route={{ params: { post: { ...post, ...extra } } }} navigation={{ goBack: jest.fn() }} />
);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
  jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  jest.spyOn(Clipboard, "setString").mockImplementation(() => {});
});

it("uses the source hostname when a publisher label is missing", () => {
  expect(screen({ sourcePlatform: null }).getByText("example.org")).toBeTruthy();
});
afterEach(() => jest.restoreAllMocks());

it("shows the actual source and contact before opening another app, and copies a crawled email", () => {
  const view = screen({ contact: "cast@example.org" });
  expect(view.getByText("필름메이커스")).toBeTruthy();
  expect(view.getByText("cast@example.org").props.selectable).toBe(true);
  fireEvent.press(view.getByText("matchingDetail.copy_contact"));
  expect(Clipboard.setString).toHaveBeenCalledWith("cast@example.org");
  expect(Linking.openURL).not.toHaveBeenCalled();
});

it("uses a crawled email for the main action while preserving a separate original link", async () => {
  const view = screen({ contact: "cast+film@example.org" });
  fireEvent.press(view.getByText("matchingDetail.send_email"));
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith("mailto:cast%2Bfilm@example.org"));
  fireEvent.press(view.getByText("matchingDetail.view_original"));
  expect(Linking.openURL).toHaveBeenLastCalledWith(post.sourceUrl);
});

it("opens a form containing an email query as HTTPS, not mailto", () => {
  const contact = "https://example.org/apply?email=cast@example.org";
  const view = screen({ source: "user", contact });
  fireEvent.press(view.getByText("matchingDetail.open_form"));
  expect(Linking.openURL).toHaveBeenCalledWith(contact);
});

it("opens a domestic phone number without spaces or hyphens", () => {
  const view = screen({ source: "user", contact: "010-1234 5678" });
  fireEvent.press(view.getByText("matchingDetail.call"));
  expect(Linking.openURL).toHaveBeenCalledWith("tel:01012345678");
});

it("keeps mixed instructions visible and copyable without guessing a recipient", () => {
  const contact = "문의: ask@example.org / 지원은 원문 확인";
  const view = screen({ contact });
  expect(view.queryByText("matchingDetail.send_email")).toBeNull();
  fireEvent.press(view.getByText("matchingDetail.copy_contact"));
  expect(Clipboard.setString).toHaveBeenCalledWith(contact);
  fireEvent.press(view.getByText("matchingDetail.check_source"));
  expect(Linking.openURL).toHaveBeenCalledWith(post.sourceUrl);
});

it("provides copy fallback when the email app cannot open", async () => {
  Linking.openURL.mockRejectedValueOnce(new Error("no handler"));
  const view = screen({ contact: "cast@example.org" });
  fireEvent.press(view.getByText("matchingDetail.send_email"));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  const buttons = Alert.alert.mock.calls[0][2];
  buttons.find((button) => button.text === "matchingDetail.copy_contact").onPress();
  expect(Clipboard.setString).toHaveBeenCalledWith("cast@example.org");
});

it("reports clipboard failure without claiming success", () => {
  Clipboard.setString.mockImplementationOnce(() => { throw new Error("clipboard"); });
  const view = screen({ contact: "cast@example.org" });
  fireEvent.press(view.getByText("matchingDetail.copy_contact"));
  expect(Alert.alert).toHaveBeenCalledWith("common.error", "matchingDetail.copy_error");
});

it("falls back to the original when contact is absent", () => {
  const view = screen();
  fireEvent.press(view.getByTestId("matching-primary-action"));
  expect(Linking.openURL).toHaveBeenCalledWith(post.sourceUrl);
  expect(Alert.alert).not.toHaveBeenCalled();
});

it("shows an unavailable state with no active action when neither route exists", () => {
  const view = screen({ sourceUrl: "javascript:alert(1)", contact: null });
  expect(view.getByTestId("matching-primary-action")).toBeDisabled();
  fireEvent.press(view.getByTestId("matching-primary-action"));
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

it.each([{ deadline: "2020-01-01" }, { status: "closed" }, { status: "deleted" }])(
  "stops direct application for a closed post (%j) while keeping its original available", (extra) => {
    const view = screen({ contact: "cast@example.org", ...extra });
    expect(view.getByText("matchingDetail.closed_notice")).toBeTruthy();
    expect(view.queryByText("matchingDetail.send_email")).toBeNull();
    expect(view.queryByText("matchingDetail.copy_contact")).toBeNull();
    fireEvent.press(view.getByText("matchingDetail.check_source"));
    expect(Linking.openURL).toHaveBeenCalledWith(post.sourceUrl);
  }
);

it("keeps today's post open until the end of the Korean calendar day", () => {
  jest.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-26T14:59:59Z"));
  const view = screen({ deadline: "2026-09-26", contact: "cast@example.org" });
  expect(view.getByText("matchingDetail.deadline_today")).toBeTruthy();
  fireEvent.press(view.getByText("matchingDetail.send_email"));
  expect(Linking.openURL).toHaveBeenCalledWith("mailto:cast@example.org");
});

it("does not execute mailto queries, custom schemes, or URL credentials", () => {
  const view = screen({ contact: "cast@example.org?bcc=other@example.org", sourceUrl: "https://user:password@example.org/" });
  expect(view.queryByText("matchingDetail.send_email")).toBeNull();
  expect(view.getByTestId("matching-primary-action")).toBeDisabled();
  expect(Linking.openURL).not.toHaveBeenCalled();
});
