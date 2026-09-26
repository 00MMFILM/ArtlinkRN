// 목표 마감일을 비워두면 하드코딩된 과거 날짜(2026-06-30)로 저장되던 문제.
// 오늘 기준 +30일(기기 로컬 날짜, YYYY-MM-DD)로 기본값을 계산해야 한다.
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { Alert } from "react-native";
import GoalsScreen from "../GoalsScreen";
import { useApp } from "../../context/AppContext";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: "ko" } }),
}));
jest.mock("../../context/AppContext", () => ({ useApp: jest.fn() }));
jest.mock("react-native-safe-area-context", () => {
  const RN = require("react-native");
  return { SafeAreaView: RN.View };
});
jest.mock("../../components/TopBar", () => {
  const React = require("react");
  const RN = require("react-native");
  return ({ left, right }) => React.createElement(RN.View, null, left, right);
});

const navigation = { goBack: jest.fn() };

const expectedDefaultDeadline = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

describe("GoalsScreen — 목표 마감일 기본값", () => {
  it("마감일을 비워두고 저장하면 오늘 기준 +30일로 저장된다", () => {
    const handleUpdateGoals = jest.fn();
    useApp.mockReturnValue({ goals: [], handleUpdateGoals });
    const utils = render(<GoalsScreen navigation={navigation} />);

    fireEvent.press(utils.getByText("goals.add"));
    fireEvent.changeText(utils.getByPlaceholderText("goals.goal_placeholder"), "목표 제목");
    fireEvent.press(utils.getByText("common.add"));

    expect(handleUpdateGoals).toHaveBeenCalledTimes(1);
    const [newGoal] = handleUpdateGoals.mock.calls[0][0];
    expect(newGoal.deadline).toBe(expectedDefaultDeadline());
    // 과거 하드코딩 날짜로 저장되면 안 된다
    expect(newGoal.deadline).not.toBe("2026-06-30");
  });

  it("달력에 있는 날짜를 직접 입력하면 그 값을 그대로 쓴다", () => {
    const handleUpdateGoals = jest.fn();
    useApp.mockReturnValue({ goals: [], handleUpdateGoals });
    const utils = render(<GoalsScreen navigation={navigation} />);

    fireEvent.press(utils.getByText("goals.add"));
    fireEvent.changeText(utils.getByPlaceholderText("goals.goal_placeholder"), "목표 제목");
    fireEvent.changeText(utils.getByPlaceholderText("goals.deadline_placeholder"), "2027-01-01");
    fireEvent.press(utils.getByText("common.add"));

    const [newGoal] = handleUpdateGoals.mock.calls[0][0];
    expect(newGoal.deadline).toBe("2027-01-01");
  });

  // 예전엔 아무 문자열이나 그대로 저장돼서 목록에 "D-NaN"이 떴다 (1.11.8에서 저장 차단)
  it.each(["2026-06-31", "2026-02-29", "2026/01/01", "다음 달까지"])(
    "달력에 없는 마감일(%s)은 저장을 막고 오류를 띄운다",
    (bad) => {
      const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
      const handleUpdateGoals = jest.fn();
      useApp.mockReturnValue({ goals: [], handleUpdateGoals });
      const utils = render(<GoalsScreen navigation={navigation} />);

      fireEvent.press(utils.getByText("goals.add"));
      fireEvent.changeText(utils.getByPlaceholderText("goals.goal_placeholder"), "목표 제목");
      fireEvent.changeText(utils.getByPlaceholderText("goals.deadline_placeholder"), bad);
      fireEvent.press(utils.getByText("common.add"));

      expect(handleUpdateGoals).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith("common.error", "deadline.invalid");
      alertSpy.mockRestore();
    }
  );
});
