// @vitest-environment jsdom

/**
 * useFocusEditor: element 안에서 contenteditable 요소를 찾아 포커스를
 * 돌려주는 함수를 반환하는지, element가 null이거나 대상이 없을 때도
 * 안전한지, element가 바뀌지 않는 한 매 렌더마다 같은 함수 참조를
 * 돌려주는지(참조 안정성) 확인한다.
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useFocusEditor } from "../src/use-focus-editor.js";

afterEach(cleanup);

type ProbeProps = {
  /** 훅이 매 렌더마다 반환한 focusEditor 함수를 테스트로 흘려보낸다. */
  onRender: (focusEditor: () => void) => void;
  /** false면 컨테이너를 훅에 넘기지 않아 element === null 상태를 재현한다. */
  attachElement?: boolean;
  /** false면 컨테이너 안에 contenteditable 자식을 두지 않는다. */
  withEditable?: boolean;
};

/**
 * useFocusEditor를 구동하는 테스트용 컨테이너. jsdom은 React의 contentEditable
 * prop이 세우는 IDL을 attribute로 반영하지 않으므로(table-selection-toolbar.test.tsx와
 * 같은 이유), ref 콜백에서 contenteditable attribute를 직접 세운다. "rerender"
 * 버튼은 container를 바꾸지 않고 강제로 재렌더링해 참조 안정성을 검증하는 데 쓴다.
 */
const Probe = ({
  onRender,
  attachElement = true,
  withEditable = true,
}: ProbeProps) => {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [, forceRerender] = useState(0);
  const focusEditor = useFocusEditor(attachElement ? container : null);
  onRender(focusEditor);
  return (
    <div>
      <div data-testid="container" ref={setContainer}>
        {withEditable ? (
          <div
            data-testid="editable"
            ref={(node) => node?.setAttribute("contenteditable", "true")}
          />
        ) : null}
      </div>
      <button data-testid="outside" type="button">
        outside
      </button>
      <button
        data-testid="rerender"
        type="button"
        onClick={() => forceRerender((count) => count + 1)}
      >
        rerender
      </button>
    </div>
  );
};

describe("useFocusEditor", () => {
  it("반환한 함수를 호출하면 element 안의 contenteditable 요소로 포커스를 되돌린다", () => {
    const renders: Array<() => void> = [];
    const { getByTestId } = render(
      <Probe onRender={(fn) => renders.push(fn)} />,
    );
    getByTestId("outside").focus();
    expect(document.activeElement).toBe(getByTestId("outside"));

    renders.at(-1)?.();

    expect(document.activeElement).toBe(getByTestId("editable"));
  });

  it("element가 null이면 아무 것도 하지 않는다", () => {
    const renders: Array<() => void> = [];
    render(<Probe onRender={(fn) => renders.push(fn)} attachElement={false} />);

    expect(() => renders.at(-1)?.()).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });

  it("element 안에 contenteditable 요소가 없으면 아무 것도 하지 않는다", () => {
    const renders: Array<() => void> = [];
    const { getByTestId } = render(
      <Probe onRender={(fn) => renders.push(fn)} withEditable={false} />,
    );
    getByTestId("outside").focus();

    expect(() => renders.at(-1)?.()).not.toThrow();
    expect(document.activeElement).toBe(getByTestId("outside"));
  });

  it("element가 바뀌지 않으면 재렌더링에도 같은 함수 참조를 반환한다", () => {
    const renders: Array<() => void> = [];
    const { getByTestId } = render(
      <Probe onRender={(fn) => renders.push(fn)} />,
    );

    fireEvent.click(getByTestId("rerender"));

    expect(renders.length).toBeGreaterThanOrEqual(2);
    expect(renders.at(-1)).toBe(renders.at(-2));
  });
});
