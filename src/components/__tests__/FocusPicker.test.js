import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import FocusPicker from "../FocusPicker";

describe("FocusPicker — 고칠 점 후보 칩", () => {
  it("후보가 없으면 아무것도 그리지 않는다 (구서버 응답)", () => {
    const { toJSON } = render(<FocusPicker title="고르기" options={[]} />);
    expect(toJSON()).toBeNull();
    expect(render(<FocusPicker title="고르기" options={undefined} />).toJSON()).toBeNull();
  });

  it("후보를 최대 3개까지 보여주고 고르면 그 값을 넘긴다", () => {
    const onSelect = jest.fn();
    const utils = render(
      <FocusPicker title="고르기" options={["가", "나", "다", "라"]} value={null} onSelect={onSelect} />
    );
    expect(utils.getByText("고르기")).toBeTruthy();
    expect(utils.queryByText("라")).toBeNull();

    fireEvent.press(utils.getByText("나"));
    expect(onSelect).toHaveBeenCalledWith("나");
  });

  it("이미 고른 칩을 다시 누르면 선택이 풀린다", () => {
    const onSelect = jest.fn();
    const utils = render(<FocusPicker options={["가", "나"]} value="가" onSelect={onSelect} />);
    fireEvent.press(utils.getByText("✓ 가")); // 선택된 칩엔 체크 표시가 붙는다
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
