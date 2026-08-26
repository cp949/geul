// @vitest-environment jsdom

/**
 * IconButton: icon-only 버튼의 공통 계약(aria-label/title 파생, type 고정,
 * mousedown이 contenteditable 초점을 훔치지 않는 계약)을 검증한다.
 *
 * jsdom은 브라우저가 실제로 하는 "mousedown이 대상에 초점을 옮기는" 기본
 * 동작을 구현하지 않는다(실측 확인 — activeElement로는 이 계약을 RED로
 * 잡을 수 없다). 대신 실제 Event 계약인 event.defaultPrevented(fireEvent가
 * 돌려주는 dispatchEvent 반환값: preventDefault가 호출되면 false)로
 * preventDefault 호출 자체를 관찰한다. 실제 브라우저에서 초점이 정말
 * 옮겨지지 않는지는 e2e의 몫이다(G-UI-002와 같은 이유).
 */

import { Bold } from "lucide-react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IconButton } from "../src/icon-button.js";

afterEach(cleanup);

describe("IconButton", () => {
  it("onMouseDown을 넘기지 않아도 mousedown의 기본 동작(초점 이동)을 막는다", () => {
    render(<IconButton className="x" icon={<Bold />} label="Bold" />);

    const notCanceled = fireEvent.mouseDown(screen.getByRole("button"));

    expect(notCanceled).toBe(false);
  });

  it("소비자가 onMouseDown을 넘기면 preventDefault 뒤에 그대로 위임한다", () => {
    const onMouseDown = vi.fn();
    render(
      <IconButton
        className="x"
        icon={<Bold />}
        label="Bold"
        onMouseDown={onMouseDown}
      />,
    );

    const notCanceled = fireEvent.mouseDown(screen.getByRole("button"));

    expect(notCanceled).toBe(false);
    expect(onMouseDown).toHaveBeenCalledTimes(1);
  });

  it("label에서 aria-label과 title을 함께 파생한다", () => {
    render(<IconButton className="x" icon={<Bold />} label="Bold" />);

    const button = screen.getByRole("button", { name: "Bold" });

    expect(button.getAttribute("title")).toBe("Bold");
    expect(button.getAttribute("type")).toBe("button");
  });
});
