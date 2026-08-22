// @vitest-environment jsdom
/**
 * 공용 provider 조립 헬퍼 `fake-editor-provider.tsx`의 **타입 계약**을 고정한다.
 *
 * 그 모듈의 존재 이유는 `as unknown as EditorController` 이중 캐스트를 한 곳에
 * 가두는 것이고, 그 캐스트를 감싸는 대가로 파라미터 타입이 헐거워지면 안 된다는
 * 것이 헤더가 소유한 주장이다. 헐거워지는 방향(무제약 제네릭, `unknown`)은
 * 컴파일을 통과하므로 런타임 테스트로는 잡히지 않는다 — `pnpm --filter
 * @cp949/geul-react typecheck`가 `tsconfig.test.json`으로 이 디렉터리를 덮는다는
 * 점을 이용해 `@ts-expect-error`를 게이트로 쓴다. 타입을 넓히면 그 지시자들이
 * `TS2578: Unused '@ts-expect-error' directive`로 typecheck를 무너뜨린다.
 *
 * 반대 방향(타입을 좁히는 변경)은 아래 "통과" 테스트가 잡는다. 헤더는 이전
 * 형태(`ReturnType<typeof fakeController>`)가 거절하던 두 가지를 이제 의도적으로
 * 통과시킨다고 적는데, 그 주장을 아무것도 지지 않으면 나중에 조용히 좁혀진다.
 * 여기서 통과한다는 사실 자체를 고정해 좁히는 변경이 의도적임을 드러나게 한다.
 *
 * 런타임 동작(외부 컨트롤러를 mount/unmount만 하고 destroy하지 않는다 등)은
 * `editor-content.test.tsx`가 덮으므로 여기서 되풀이하지 않는다. 이 파일이 보는
 * 런타임 사실은 하나다 — `withProvider`는 컨트롤러를 검사하지 않고 `editor`
 * prop으로 그대로 넘긴다. 그래서 아래 거절 케이스도 런타임에서는 전부 정상으로
 * 보이고, 타입이 유일한 게이트다.
 */
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { EditorProvider } from "../src/index.js";
import { withProvider } from "./fake-editor-provider.js";

/**
 * 만들어진 요소가 `EditorProvider`이고 넘긴 값을 손대지 않은 채 `editor` prop에
 * 실었는지 본다. 거절 케이스에서도 이 단언이 성립한다는 것이 "런타임은 아무것도
 * 검사하지 않는다"의 증거다.
 */
const expectPassedThrough = (element: ReactElement, controller: unknown) => {
  expect(element.type).toBe(EditorProvider);
  expect((element.props as { editor: unknown }).editor).toBe(controller);
};

/** 오용 감지 최소 형태를 정확히 채운 fake. 저장소 fake 다섯의 공통분모다. */
const minimalFake = () => ({
  mount: vi.fn(),
  unmount: vi.fn(),
  destroy: vi.fn(),
  commands: { setText: vi.fn() },
});

describe("FakeEditorController가 거절하는 것", () => {
  it("팩토리를 호출하지 않고 함수 자체를 넘기는 것을 거절한다", () => {
    // @ts-expect-error 팩토리 함수 자체는 컨트롤러가 아니다
    const element = withProvider(minimalFake, null);

    expectPassedThrough(element, minimalFake);
  });

  it("빈 객체를 거절한다", () => {
    const controller = {};

    // @ts-expect-error mount·unmount·destroy·commands가 하나도 없다
    const element = withProvider(controller, null);

    expectPassedThrough(element, controller);
  });

  it("commands가 없는 fake를 거절한다", () => {
    const controller = {
      mount: vi.fn(),
      unmount: vi.fn(),
      destroy: vi.fn(),
    };

    // @ts-expect-error commands가 없다
    const element = withProvider(controller, null);

    expectPassedThrough(element, controller);
  });

  it("commands가 원시값인 fake를 거절한다", () => {
    const controller = {
      mount: vi.fn(),
      unmount: vi.fn(),
      destroy: vi.fn(),
      commands: "setText",
    };

    // @ts-expect-error commands가 객체가 아니라 문자열이다
    const element = withProvider(controller, null);

    expectPassedThrough(element, controller);
  });

  it("destroy가 없는 fake를 거절한다", () => {
    const controller = {
      mount: vi.fn(),
      unmount: vi.fn(),
      commands: { setText: vi.fn() },
    };

    // @ts-expect-error destroy가 없다
    const element = withProvider(controller, null);

    expectPassedThrough(element, controller);
  });
});

describe("FakeEditorController가 통과시키는 것", () => {
  it("최소 형태를 정확히 채운 fake를 통과시킨다", () => {
    const controller = minimalFake();

    const element = withProvider(controller, null);

    expectPassedThrough(element, controller);
  });

  /**
   * 아래 둘은 이전 형태(`ReturnType<typeof fakeController>`)가 거절하던 것이고,
   * 지금 통과하는 것은 의도한 넓힘이다(`fake-editor-provider.tsx` 헤더). 이
   * 테스트가 지면 타입이 좁아졌다는 뜻이므로 헤더의 그 서술도 함께 고친다.
   */
  it("commands가 빈 객체인 fake를 통과시킨다", () => {
    const controller = {
      mount: vi.fn(),
      unmount: vi.fn(),
      destroy: vi.fn(),
      commands: {},
    };

    const element = withProvider(controller, null);

    expectPassedThrough(element, controller);
  });

  it("선택 조회 API가 하나도 없는 fake를 통과시킨다", () => {
    const controller = {
      mount: vi.fn(),
      unmount: vi.fn(),
      destroy: vi.fn(),
      getDocument: vi.fn(),
      replaceDocument: vi.fn(),
      commands: { setText: vi.fn(), undo: vi.fn() },
    };

    const element = withProvider(controller, null);

    expect("getSelectionMarks" in controller).toBe(false);
    expect("getSelectionLink" in controller).toBe(false);
    expect("getSelectionBlockType" in controller).toBe(false);
    expectPassedThrough(element, controller);
  });
});
