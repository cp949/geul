/**
 * useMirroredState가 state와 ref를 항상 같은 값으로 동기화하고, update
 * 함수의 참조가 재렌더 사이에 안정적인지 확인한다. ref가 어긋나면 이 훅을
 * 쓰는 이벤트 핸들러가 낡은 값을 읽고, update 참조가 안정적이지 않으면
 * 그 핸들러를 쓰는 effect 의존성 배열이 매 렌더 리스너를 다시 붙인다
 * (usePointerDragGesture의 onMove 등).
 */
// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useMirroredState } from "../src/use-mirrored-state.js";

afterEach(cleanup);

type Snapshot = { value: number; ref: number; update: unknown };

type ProbeProps = {
  onCommit: (snapshot: Snapshot) => void;
};

/** useMirroredState를 구동하는 테스트용 컴포넌트 — 매 렌더 현재 value/ref/update를 보고한다. */
const Probe = ({ onCommit }: ProbeProps) => {
  const [value, ref, update] = useMirroredState(0);
  onCommit({ value, ref: ref.current, update });
  return (
    <button onClick={() => update(value + 1)} type="button">
      increment
    </button>
  );
};

describe("useMirroredState", () => {
  it("초기값을 value와 ref.current 양쪽에 반영한다", () => {
    const snapshots: Snapshot[] = [];
    render(<Probe onCommit={(snapshot) => snapshots.push(snapshot)} />);

    expect(snapshots[0]).toMatchObject({ value: 0, ref: 0 });
  });

  it("update를 호출하면 value와 ref.current가 같은 값으로 갱신된다", () => {
    const snapshots: Snapshot[] = [];
    const { getByRole } = render(
      <Probe onCommit={(snapshot) => snapshots.push(snapshot)} />,
    );

    fireEvent.click(getByRole("button"));

    expect(snapshots.at(-1)).toMatchObject({ value: 1, ref: 1 });
  });

  it("update 함수의 참조는 재렌더 사이에 안정적이다", () => {
    const snapshots: Snapshot[] = [];
    const { getByRole } = render(
      <Probe onCommit={(snapshot) => snapshots.push(snapshot)} />,
    );

    fireEvent.click(getByRole("button"));

    expect(snapshots[0]?.update).toBe(snapshots.at(-1)?.update);
  });
});
