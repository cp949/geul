// @vitest-environment jsdom

/**
 * useClipVisibility의 clip 판정과 면제 계약을 검증한다.
 * - 박스 판정: 노드 박스가 스크롤 컨테이너의 보이는 영역 밖이면 숨긴다.
 * - 앵커 판정: `anchor`가 있으면 앵커 점도 영역 안이어야 보인다. `box: false`면 박스는 보지 않는다.
 * - 뷰포트 판정: `viewport: true`면 앵커 점 판정에만 레이아웃 뷰포트를 영역에 더한다(Issue #277).
 *   박스 판정에는 더하지 않는다. 기본값은 `false`다.
 * - 면제: `exempt`이거나 노드 안에 포커스가 있으면 영역 밖이어도 보인다.
 * - 포커스 이탈: 포커스가 보관 노드 밖으로 나가면 렌더를 강제해 다시 판정한다.
 * - iframe 문서에서도 포커스 이탈을 다시 판정한다. 노드 타입 검사는 realm과 무관한 `isNode`를 쓴다.
 * - 노드 사이 포커스 이동은 렌더를 강제하지 않는다.
 * - `collect`가 빈 배열이면 어떤 노드도 건드리지 않는다.
 * - `element`가 `null`이면 판정도 구독도 하지 않는다.
 * - unmount에서 `focusout` 리스너를 해제한다.
 * jsdom은 레이아웃이 없어 `stubRect`로 rect를 주입한다.
 */

import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type ClipTarget,
  useClipVisibility,
} from "../src/use-clip-visibility.js";
import { mountFrameContainer } from "./frame-container.js";
import { makeScrollContainer, stubRect } from "./mount-editor.js";

type ProbeProps = {
  element: HTMLElement | null;
  /** 노드 id별 collect 옵션. 없는 id는 collect에 넣지 않는다. */
  options: Record<string, Omit<ClipTarget, "node">>;
  onRender?: () => void;
};

/**
 * 노드 a·b(각각 버튼 하나)와 바깥 버튼을 그린다. `options`에 든 노드만
 * `collect`가 돌려준다.
 */
const Probe = ({ element, options, onRender }: ProbeProps) => {
  onRender?.();
  const refs = {
    a: useRef<HTMLDivElement>(null),
    b: useRef<HTMLDivElement>(null),
  };
  useClipVisibility(element, () => {
    const targets: ClipTarget[] = [];
    for (const [id, ref] of Object.entries(refs)) {
      const option = options[id];
      if (option === undefined || ref.current === null) continue;
      targets.push({ node: ref.current, ...option });
    }
    return targets;
  });
  return (
    <>
      <div data-testid="a" ref={refs.a}>
        <button data-testid="a-button" type="button" />
      </div>
      <div data-testid="b" ref={refs.b}>
        <button data-testid="b-button" type="button" />
      </div>
      <button data-testid="outside" type="button" />
    </>
  );
};

const INSIDE = { left: 10, top: 10, width: 50, height: 20 };
const OUTSIDE = { left: 10, top: 300, width: 50, height: 20 };

/** 에디터 host를 스크롤 컨테이너로 만들어 body에 붙인다. */
const mountHost = () => {
  const host = document.createElement("div");
  document.body.append(host);
  makeScrollContainer(host);
  return host;
};

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const byId = (container: HTMLElement, id: string) => {
  const node = container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (node === null) throw new Error(`${id} 노드가 없다`);
  return node;
};

describe("useClipVisibility", () => {
  describe("박스 판정", () => {
    it("박스가 영역 안이면 보이고 밖이면 숨긴다", () => {
      const host = mountHost();
      const options = { a: {}, b: {} };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), INSIDE);
      stubRect(byId(container, "b"), OUTSIDE);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
      expect(byId(container, "b").style.visibility).toBe("hidden");
    });

    it("`box: false`면 박스가 영역 밖이어도 숨기지 않는다", () => {
      const host = mountHost();
      const options = { a: { box: false } };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), OUTSIDE);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
    });
  });

  describe("앵커 판정", () => {
    it("박스가 영역 안이어도 앵커 점이 밖이면 숨긴다", () => {
      const host = mountHost();
      const options = { a: { anchor: { left: 20, top: 300 } } };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), INSIDE);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("hidden");
    });

    it("박스와 앵커 점이 모두 안이면 보인다", () => {
      const host = mountHost();
      const options = { a: { anchor: { left: 20, top: 20 } } };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), INSIDE);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
    });

    it("`box: false`와 앵커 점이 안이면 박스가 밖이어도 보인다", () => {
      const host = mountHost();
      const options = { a: { box: false, anchor: { left: 20, top: 20 } } };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), OUTSIDE);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
    });

    it("`box: false`라도 앵커 점이 밖이면 숨긴다", () => {
      const host = mountHost();
      const options = { a: { box: false, anchor: { left: 20, top: 300 } } };
      const { container } = render(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("hidden");
    });
  });

  describe("뷰포트 판정(Issue #277)", () => {
    // 창 스크롤로 오버레이가 뷰포트 밖에 나간 상황이다. 스크롤 컨테이너 조상이 없는
    // host를 쓴다. 영역은 뷰포트 하나뿐이다.
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;
    beforeEach(() => {
      window.innerWidth = 800;
      window.innerHeight = 500;
    });
    afterEach(() => {
      window.innerWidth = originalWidth;
      window.innerHeight = originalHeight;
    });

    const mountPlainHost = () => {
      const host = document.createElement("div");
      document.body.append(host);
      return host;
    };
    const BELOW_VIEWPORT = { left: 10, top: 900, width: 50, height: 20 };

    it("`viewport: true`여도 박스 판정에는 뷰포트를 쓰지 않는다(앵커가 없으면 박스가 뷰포트 밖이어도 보인다)", () => {
      const host = mountPlainHost();
      const options = { a: { viewport: true } };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), BELOW_VIEWPORT);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
    });

    it("`viewport: true`여도 박스가 0×0이면 앵커 점이 뷰포트 안일 때 보인다(jsdom 0×0 rect 회귀)", () => {
      const host = mountPlainHost();
      const options = {
        a: { viewport: true, anchor: { left: 20, top: 20 } },
      };
      const { container } = render(<Probe element={host} options={options} />);

      // stubRect를 걸지 않아 jsdom 기본 rect(전부 0)다.
      expect(byId(container, "a").style.visibility).toBe("");
    });

    it("`viewport: true`와 앵커 점이 뷰포트 밖이면 숨기고 안으로 돌아오면 보인다", () => {
      const host = mountPlainHost();
      const outside = {
        a: { viewport: true, anchor: { left: 20, top: 900 } },
      };
      const inside = {
        a: { viewport: true, anchor: { left: 20, top: 20 } },
      };
      const { container, rerender } = render(
        <Probe element={host} options={outside} />,
      );
      expect(byId(container, "a").style.visibility).toBe("hidden");

      rerender(<Probe element={host} options={inside} />);
      expect(byId(container, "a").style.visibility).toBe("");
    });

    it("`viewport: true`면 박스가 안이어도 앵커 점이 뷰포트 밖이면 숨긴다", () => {
      const host = mountPlainHost();
      const options = {
        a: { viewport: true, anchor: { left: 20, top: 900 } },
      };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), INSIDE);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("hidden");
    });

    it("`viewport: true`와 `box: false`면 앵커 점만 뷰포트로 판정한다", () => {
      const host = mountPlainHost();
      const outside = {
        a: { viewport: true, box: false, anchor: { left: 20, top: 900 } },
      };
      const inside = {
        a: { viewport: true, box: false, anchor: { left: 20, top: 20 } },
      };
      const { container, rerender } = render(
        <Probe element={host} options={outside} />,
      );
      stubRect(byId(container, "a"), BELOW_VIEWPORT);
      rerender(<Probe element={host} options={outside} />);
      expect(byId(container, "a").style.visibility).toBe("hidden");

      rerender(<Probe element={host} options={inside} />);
      expect(byId(container, "a").style.visibility).toBe("");
    });

    it("`viewport`를 주지 않으면 뷰포트 밖이어도 숨기지 않는다", () => {
      const host = mountPlainHost();
      const options = { a: { anchor: { left: 20, top: 900 } } };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), BELOW_VIEWPORT);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
    });

    it("`viewport: false`도 뷰포트 밖에서 숨기지 않는다", () => {
      const host = mountPlainHost();
      const options = { a: { viewport: false } };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), BELOW_VIEWPORT);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
    });

    it("스크롤 컨테이너 안이어도 컨테이너가 뷰포트보다 크면 뷰포트 밖 앵커를 숨긴다", () => {
      const host = mountPlainHost();
      makeScrollContainer(host);
      stubRect(host, { left: 0, top: 0, width: 600, height: 2000 });
      const options = {
        a: { viewport: true, anchor: { left: 20, top: 900 } },
        b: { anchor: { left: 20, top: 900 } },
      };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), INSIDE);
      stubRect(byId(container, "b"), INSIDE);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("hidden");
      expect(byId(container, "b").style.visibility).toBe("");
    });

    it("`exempt`면 뷰포트 밖이어도 보인다", () => {
      const host = mountPlainHost();
      const options = {
        a: { viewport: true, exempt: true, anchor: { left: 20, top: 900 } },
      };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), BELOW_VIEWPORT);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
    });

    it("노드 안 요소에 포커스가 있으면 뷰포트 밖이어도 보인다", () => {
      const host = mountPlainHost();
      const options = {
        a: { viewport: true, anchor: { left: 20, top: 900 } },
        b: { viewport: true, anchor: { left: 20, top: 900 } },
      };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), BELOW_VIEWPORT);
      stubRect(byId(container, "b"), BELOW_VIEWPORT);
      act(() => byId(container, "a-button").focus());
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
      expect(byId(container, "b").style.visibility).toBe("hidden");
    });
  });

  describe("면제", () => {
    it("`exempt`면 영역 밖이어도 보인다", () => {
      const host = mountHost();
      const options = { a: { exempt: true }, b: {} };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), OUTSIDE);
      stubRect(byId(container, "b"), OUTSIDE);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
      expect(byId(container, "b").style.visibility).toBe("hidden");
    });

    it("`exempt`는 앵커 점이 밖이어도 보인다", () => {
      const host = mountHost();
      const options = { a: { exempt: true, anchor: { left: 20, top: 300 } } };
      const { container } = render(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
    });

    it("노드 안 요소에 포커스가 있으면 영역 밖이어도 보인다", () => {
      const host = mountHost();
      const options = { a: { anchor: { left: 20, top: 300 } }, b: {} };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), OUTSIDE);
      stubRect(byId(container, "b"), OUTSIDE);
      act(() => byId(container, "a-button").focus());
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
      expect(byId(container, "b").style.visibility).toBe("hidden");
    });
  });

  describe("포커스 이탈", () => {
    it("다른 window 문서에서 포커스가 이탈하면 다시 판정한다", () => {
      const host = mountFrameContainer();
      const frameDocument = host.ownerDocument;
      makeScrollContainer(host);

      const options = { a: {} };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
        { container: frameDocument.body },
      );
      const overlay = byId(container, "a");
      stubRect(overlay, OUTSIDE);
      act(() => byId(container, "a-button").focus());
      rerender(<Probe element={host} options={options} />);
      expect(overlay.style.visibility).toBe("");

      act(() => byId(container, "outside").focus());

      expect(overlay.style.visibility).toBe("hidden");
    });

    it("포커스가 노드 밖으로 나가면 렌더를 강제해 숨긴다", () => {
      const host = mountHost();
      const options = { a: {} };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), OUTSIDE);
      act(() => byId(container, "a-button").focus());
      rerender(<Probe element={host} options={options} />);
      expect(byId(container, "a").style.visibility).toBe("");

      act(() => byId(container, "outside").focus());

      expect(byId(container, "a").style.visibility).toBe("hidden");
    });

    it("포커스가 어디에도 가지 않고 빠져도(blur) 숨긴다", () => {
      const host = mountHost();
      const options = { a: {} };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), OUTSIDE);
      act(() => byId(container, "a-button").focus());
      rerender(<Probe element={host} options={options} />);

      act(() => byId(container, "a-button").blur());

      expect(byId(container, "a").style.visibility).toBe("hidden");
    });

    it("영역 안으로 돌아오면 다시 보인다", () => {
      const host = mountHost();
      const options = { a: {} };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), OUTSIDE);
      act(() => byId(container, "a-button").focus());
      act(() => byId(container, "outside").focus());
      expect(byId(container, "a").style.visibility).toBe("hidden");

      stubRect(byId(container, "a"), INSIDE);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
    });

    it("보관 노드 사이의 포커스 이동은 렌더를 강제하지 않는다", () => {
      const host = mountHost();
      const options = { a: {}, b: {} };
      const onRender = vi.fn();
      const { container, rerender } = render(
        <Probe element={host} onRender={onRender} options={options} />,
      );
      stubRect(byId(container, "a"), OUTSIDE);
      stubRect(byId(container, "b"), OUTSIDE);
      act(() => byId(container, "a-button").focus());
      rerender(<Probe element={host} onRender={onRender} options={options} />);
      const before = onRender.mock.calls.length;

      act(() => byId(container, "b-button").focus());

      expect(onRender.mock.calls.length).toBe(before);
    });

    it("보관 노드 밖 요소의 포커스 이탈은 렌더를 강제하지 않는다", () => {
      const host = mountHost();
      const options = { a: {} };
      const onRender = vi.fn();
      const { container } = render(
        <Probe element={host} onRender={onRender} options={options} />,
      );
      act(() => byId(container, "outside").focus());
      const before = onRender.mock.calls.length;

      act(() => byId(container, "b-button").focus());

      expect(onRender.mock.calls.length).toBe(before);
    });
  });

  describe("collect가 빈 배열", () => {
    it("어떤 노드도 건드리지 않고 포커스 이탈로 렌더를 강제하지도 않는다", () => {
      const host = mountHost();
      const onRender = vi.fn();
      const { container, rerender } = render(
        <Probe element={host} onRender={onRender} options={{}} />,
      );
      const node = byId(container, "a");
      stubRect(node, OUTSIDE);
      node.style.visibility = "hidden";
      byId(container, "b").style.visibility = "visible";
      rerender(<Probe element={host} onRender={onRender} options={{}} />);
      const before = onRender.mock.calls.length;
      act(() => byId(container, "a-button").focus());
      act(() => byId(container, "outside").focus());

      expect(node.style.visibility).toBe("hidden");
      expect(byId(container, "b").style.visibility).toBe("visible");
      expect(onRender.mock.calls.length).toBe(before);
    });

    it("collect한 노드만 판정하고 나머지는 그대로 둔다", () => {
      const host = mountHost();
      const options = { a: {} };
      const { container, rerender } = render(
        <Probe element={host} options={options} />,
      );
      stubRect(byId(container, "a"), OUTSIDE);
      stubRect(byId(container, "b"), OUTSIDE);
      rerender(<Probe element={host} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("hidden");
      expect(byId(container, "b").style.visibility).toBe("");
    });
  });

  describe("element가 null", () => {
    it("판정하지 않는다", () => {
      const options = { a: { anchor: { left: 20, top: 300 } } };
      const { container } = render(<Probe element={null} options={options} />);

      expect(byId(container, "a").style.visibility).toBe("");
    });
  });

  describe("리스너 수명", () => {
    it("unmount에서 document의 focusout 리스너를 해제한다", () => {
      const host = mountHost();
      const added = vi.spyOn(document, "addEventListener");
      const removed = vi.spyOn(document, "removeEventListener");
      const { unmount } = render(<Probe element={host} options={{ a: {} }} />);
      const registered = added.mock.calls.filter(
        ([type]) => type === "focusout",
      );
      expect(registered).toHaveLength(1);

      unmount();

      const released = removed.mock.calls.filter(
        ([type]) => type === "focusout",
      );
      expect(released).toHaveLength(1);
      expect(released[0]?.[1]).toBe(registered[0]?.[1]);
    });
  });
});
