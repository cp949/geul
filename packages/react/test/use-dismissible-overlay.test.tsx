// @vitest-environment jsdom

/**
 * useDismissibleOverlay의 닫힘 계약을 검증한다.
 * - reason 4종(outside, escape, invalidated, trigger)의 초점 복귀 표.
 * - 문서별 Escape LIFO: 한 번에 가장 나중에 열린 오버레이 하나만 닫는다.
 * - 이미 `preventDefault`된 keydown 건너뛰기, modifier+Escape 닫힘 parity.
 * - `focusOnOpen`의 첫 활성 항목 탐색.
 * - 바깥 pointerdown의 즉시성(ADR 0013)과 `startTransition` 계약(Issue #155).
 * - 공개 전환 전이라 `index.ts`가 module을 내보내지 않는다(RD-006에서 뒤집는다).
 */

import { act, cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { startTransition, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type DismissReason,
  useDismissibleOverlay,
} from "../src/use-dismissible-overlay.js";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, startTransition: vi.fn(actual.startTransition) };
});

afterEach(() => {
  cleanup();
  vi.mocked(startTransition).mockClear();
});

const ALLOW_SELECTORS = ["[data-test-panel]", "[data-test-trigger]"] as const;

type ItemSpec = {
  role: string;
  /** 비활성 표시. `disabled` 또는 `aria-disabled="true"`. */
  disabled?: "disabled" | "aria-disabled";
};

type ProbeProps = {
  open: boolean;
  focusOnOpen?: boolean;
  items?: readonly ItemSpec[];
  onClose: (reason: DismissReason) => void;
  /** 훅이 돌려준 `close`를 테스트로 흘려보낸다. */
  onReady?: (close: (reason: DismissReason) => void) => void;
};

/**
 * 훅을 건 최소 오버레이. 편집기 host(contenteditable 포함), 패널, 트리거,
 * 바깥 대상을 함께 그려 초점 위치를 만들 수 있게 한다.
 * jsdom은 `contentEditable` IDL을 attribute로 반영하지 않고 `div`를 초점
 * 대상으로 치지 않으므로, ref 콜백에서 attribute와 tabindex를 직접 세운다.
 */
const Probe = ({
  open,
  focusOnOpen = false,
  items = [{ role: "menuitem" }],
  onClose,
  onReady,
}: ProbeProps) => {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const close = useDismissibleOverlay({
    open,
    element: host,
    allowSelectors: ALLOW_SELECTORS,
    onClose,
    focusOnOpen,
  });
  onReady?.(close);
  return (
    <div>
      <div data-testid="host" ref={setHost}>
        <div
          data-testid="editable"
          ref={(node) => {
            node?.setAttribute("contenteditable", "true");
            node?.setAttribute("tabindex", "-1");
          }}
        />
      </div>
      <div data-test-panel="" data-testid="panel" tabIndex={-1}>
        {items.map((item, index) => (
          <button
            key={index}
            data-testid={`item-${index}`}
            role={item.role}
            disabled={item.disabled === "disabled"}
            aria-disabled={
              item.disabled === "aria-disabled" ? "true" : undefined
            }
            type="button"
          >
            item {index}
          </button>
        ))}
      </div>
      <button data-test-trigger="" data-testid="trigger" type="button">
        trigger
      </button>
      <button data-testid="outside" type="button">
        outside
      </button>
    </div>
  );
};

/** `testid` 요소를 찾는다. 없으면 테스트가 실패하도록 단언한다. */
const byId = (container: HTMLElement, testId: string): HTMLElement => {
  const node = container.querySelector<HTMLElement>(
    `[data-testid="${testId}"]`,
  );
  expect(node).not.toBeNull();
  return node as HTMLElement;
};

/** 실제 브라우저처럼 bubbles pointerdown을 대상에 쏜다. */
const pointerDown = (target: Element) => {
  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
};

/** 취소 가능한 Escape keydown을 문서로 쏘고 이벤트를 돌려준다. */
const pressEscape = (init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
};

describe("useDismissibleOverlay reason별 초점", () => {
  type Placement = "inside" | "outside";
  type Case = {
    reason: DismissReason;
    placement: Placement;
    /** true면 편집기로 초점이 돌아와야 한다. */
    restores: boolean;
  };
  const cases: readonly Case[] = [
    { reason: "outside", placement: "inside", restores: true },
    { reason: "outside", placement: "outside", restores: false },
    { reason: "escape", placement: "inside", restores: true },
    { reason: "escape", placement: "outside", restores: true },
    { reason: "invalidated", placement: "inside", restores: true },
    { reason: "invalidated", placement: "outside", restores: false },
    { reason: "trigger", placement: "inside", restores: true },
    { reason: "trigger", placement: "outside", restores: true },
  ];

  /**
   * 오버레이를 연 채 초점을 `placement`에 두고, reason에 맞는 입력으로 닫은 뒤
   * 닫힘 호출 시점과 호출 뒤의 `activeElement`를 돌려준다.
   */
  const closeWith = (reason: DismissReason, placement: Placement) => {
    let close: (reason: DismissReason) => void = () => {};
    const activeAtClose: Array<Element | null> = [];
    const onClose = vi.fn(() => {
      activeAtClose.push(document.activeElement);
    });
    const { container } = render(
      <Probe
        open
        onClose={onClose}
        onReady={(next) => {
          close = next;
        }}
      />,
    );
    const focusTarget =
      placement === "inside"
        ? byId(container, "item-0")
        : byId(container, "outside");
    focusTarget.focus();
    expect(document.activeElement).toBe(focusTarget);

    if (reason === "outside") {
      pointerDown(byId(container, "outside"));
    } else if (reason === "escape") {
      pressEscape();
    } else {
      act(() => close(reason));
    }
    return { container, onClose, activeAtClose, focusTarget };
  };

  for (const { reason, placement, restores } of cases) {
    const where = placement === "inside" ? "오버레이 안" : "오버레이 밖";
    const title = restores
      ? `${reason}로 닫을 때 초점이 ${where}이어도 편집기로 돌아온다`
      : `${reason}로 닫을 때 초점이 ${where}이면 옮기지 않는다`;
    it(title, () => {
      const { container, onClose, activeAtClose, focusTarget } = closeWith(
        reason,
        placement,
      );

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledWith(reason);
      const expected = restores ? byId(container, "editable") : focusTarget;
      expect(document.activeElement).toBe(expected);
      // 오버레이가 언마운트되기 전에 초점을 정리해야 `<body>`로 떨어지지 않는다.
      expect(activeAtClose[0]).toBe(expected);
    });
  }

  it("트리거에 초점이 있어도 안으로 보고 바깥 클릭에서 편집기로 돌린다", () => {
    const onClose = vi.fn();
    const { container } = render(<Probe open onClose={onClose} />);
    byId(container, "trigger").focus();

    pointerDown(byId(container, "outside"));

    expect(document.activeElement).toBe(byId(container, "editable"));
  });

  it("허용 셀렉터 안의 pointerdown은 바깥 클릭으로 보지 않는다", () => {
    const onClose = vi.fn();
    const { container } = render(<Probe open onClose={onClose} />);

    pointerDown(byId(container, "trigger"));
    pointerDown(byId(container, "item-0"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("바깥 클릭은 onClose를 startTransition 안에서 동기로 부른다", () => {
    const onClose = vi.fn();
    const { container } = render(<Probe open onClose={onClose} />);

    pointerDown(byId(container, "outside"));

    expect(startTransition).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("바깥 클릭이 아닌 reason은 startTransition을 쓰지 않는다", () => {
    const onClose = vi.fn();
    let close: (reason: DismissReason) => void = () => {};
    render(
      <Probe
        open
        onClose={onClose}
        onReady={(next) => {
          close = next;
        }}
      />,
    );

    pressEscape();
    act(() => close("invalidated"));
    act(() => close("trigger"));

    expect(onClose).toHaveBeenCalledTimes(3);
    expect(startTransition).not.toHaveBeenCalled();
  });

  it("바깥 클릭은 대상의 click을 막지 않는다", () => {
    const onClose = vi.fn();
    const onOutsideClick = vi.fn();
    const { container } = render(<Probe open onClose={onClose} />);
    const outside = byId(container, "outside");
    outside.addEventListener("click", onOutsideClick);

    pointerDown(outside);
    outside.click();

    expect(onClose).toHaveBeenCalledWith("outside");
    expect(onOutsideClick).toHaveBeenCalledTimes(1);
  });

  it("열려 있지 않으면 바깥 클릭과 Escape에 반응하지 않는다", () => {
    const onClose = vi.fn();
    const { container } = render(<Probe open={false} onClose={onClose} />);

    pointerDown(byId(container, "outside"));
    const event = pressEscape();

    expect(onClose).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("닫힌 뒤에는 리스너를 풀어 더 이상 부르지 않는다", () => {
    const onClose = vi.fn();
    const { container, rerender } = render(<Probe open onClose={onClose} />);

    rerender(<Probe open={false} onClose={onClose} />);
    pointerDown(byId(container, "outside"));
    pressEscape();

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("useDismissibleOverlay Escape", () => {
  it("Escape를 처리하며 preventDefault한다", () => {
    const onClose = vi.fn();
    render(<Probe open onClose={onClose} />);

    const event = pressEscape();

    expect(onClose).toHaveBeenCalledWith("escape");
    expect(event.defaultPrevented).toBe(true);
  });

  it("이미 preventDefault된 keydown은 건너뛴다", () => {
    const onClose = vi.fn();
    render(<Probe open onClose={onClose} />);
    // document보다 먼저 bubble하는 body에서 입력 모드 취소를 흉내 낸다.
    const consume = (event: Event) => event.preventDefault();
    document.body.addEventListener("keydown", consume);

    const event = pressEscape();
    document.body.removeEventListener("keydown", consume);

    expect(event.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape가 아닌 키는 무시한다", () => {
    const onClose = vi.fn();
    render(<Probe open onClose={onClose} />);

    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("Ctrl·Alt·Meta·Shift가 눌린 Escape도 닫는다(Issue #227 parity)", () => {
    for (const modifier of [
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { shiftKey: true },
    ]) {
      const onClose = vi.fn();
      const { unmount } = render(<Probe open onClose={onClose} />);

      pressEscape(modifier);

      expect(onClose).toHaveBeenCalledWith("escape");
      unmount();
    }
  });
});

type StackApi = {
  setOpen: (name: string, open: boolean) => void;
  closed: string[];
  rerender: () => void;
};

type StackOverlayProps = {
  name: string;
  host: HTMLElement | null;
  open: boolean;
  onClose: () => void;
};

/** 스택 테스트에서 닫힘 요청을 받은 오버레이 이름. `renderStack`이 비운다. */
let stackLog: string[] = [];

/** 스택 테스트용 오버레이 하나. 이름만 다르고 훅 설정은 같다. */
const StackOverlay = ({ host, open, onClose }: StackOverlayProps) => {
  useDismissibleOverlay({
    open,
    element: host,
    allowSelectors: ALLOW_SELECTORS,
    onClose,
  });
  return null;
};

/**
 * 오버레이 여러 개를 한 호스트 아래 렌더하고 열림 상태를 테스트가 쥐게 한다.
 * `onClose`는 렌더마다 새 함수라, 콜백이 바뀌어도 열린 순서가 유지되는지
 * 함께 드러난다. 닫힘 요청은 해당 오버레이를 닫고 `closed`에 이름을 남긴다.
 */
const StackHarness = ({
  names,
  onReady,
}: {
  names: readonly string[];
  onReady: (api: StackApi) => void;
}) => {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [openByName, setOpenByName] = useState<Record<string, boolean>>({});
  const [, setTick] = useState(0);
  onReady({
    setOpen: (name, open) =>
      setOpenByName((prev) => ({ ...prev, [name]: open })),
    closed: stackLog,
    rerender: () => setTick((tick) => tick + 1),
  });
  return (
    <div ref={setHost}>
      {names.map((name) => (
        <StackOverlay
          key={name}
          name={name}
          host={host}
          open={openByName[name] ?? false}
          onClose={() => {
            stackLog.push(name);
            setOpenByName((prev) => ({ ...prev, [name]: false }));
          }}
        />
      ))}
    </div>
  );
};

/** 스택 하네스를 렌더하고 api를 돌려준다. 기록은 테스트마다 비운다. */
const renderStack = (names: readonly string[]): StackApi => {
  stackLog = [];
  let api: StackApi | null = null;
  render(
    <StackHarness
      names={names}
      onReady={(next) => {
        api = next;
      }}
    />,
  );
  return api as unknown as StackApi;
};

describe("useDismissibleOverlay Escape LIFO", () => {
  it("나중에 열린 오버레이 하나만 닫고 먼저 열린 쪽은 다음 Escape가 닫는다", () => {
    const stack = renderStack(["A", "B"]);
    act(() => stack.setOpen("A", true));
    act(() => stack.setOpen("B", true));

    pressEscape();
    expect(stack.closed).toEqual(["B"]);

    pressEscape();
    expect(stack.closed).toEqual(["B", "A"]);
  });

  it("먼저 열린 쪽이 트리 뒤에 있어도 열린 순서를 따른다", () => {
    const stack = renderStack(["B", "A"]);
    act(() => stack.setOpen("A", true));
    act(() => stack.setOpen("B", true));

    pressEscape();

    expect(stack.closed).toEqual(["B"]);
  });

  it("같은 커밋에서 함께 열리면 effect 순서(트리 순서)로 나중 쪽이 먼저 닫힌다", () => {
    const stack = renderStack(["A", "B"]);
    act(() => {
      stack.setOpen("A", true);
      stack.setOpen("B", true);
    });

    pressEscape();
    expect(stack.closed).toEqual(["B"]);
  });

  it("가운데 오버레이가 먼저 닫혀도 남은 순서를 지킨다", () => {
    const stack = renderStack(["A", "B", "C"]);
    for (const name of ["A", "B", "C"]) act(() => stack.setOpen(name, true));
    act(() => stack.setOpen("B", false));

    pressEscape();
    pressEscape();

    expect(stack.closed).toEqual(["C", "A"]);
  });

  it("다시 렌더돼 onClose가 바뀌어도 열린 순서가 바뀌지 않는다", () => {
    const stack = renderStack(["A", "B"]);
    act(() => stack.setOpen("A", true));
    act(() => stack.setOpen("B", true));
    act(() => stack.rerender());

    pressEscape();

    expect(stack.closed).toEqual(["B"]);
  });
});

describe("useDismissibleOverlay focusOnOpen", () => {
  const roles = ["menuitem", "menuitemcheckbox", "menuitemradio", "option"];
  for (const role of roles) {
    it(`열릴 때 첫 ${role} 항목에 초점을 준다`, () => {
      const onClose = vi.fn();
      const { container, rerender } = render(
        <Probe
          open={false}
          focusOnOpen
          items={[{ role }, { role }]}
          onClose={onClose}
        />,
      );

      rerender(
        <Probe
          open
          focusOnOpen
          items={[{ role }, { role }]}
          onClose={onClose}
        />,
      );

      expect(document.activeElement).toBe(byId(container, "item-0"));
    });
  }

  it("disabled와 aria-disabled 항목을 건너뛰고 첫 활성 항목에 초점을 준다", () => {
    const items: ItemSpec[] = [
      { role: "menuitem", disabled: "disabled" },
      { role: "menuitem", disabled: "aria-disabled" },
      { role: "menuitemcheckbox" },
    ];
    const onClose = vi.fn();
    const { container, rerender } = render(
      <Probe open={false} focusOnOpen items={items} onClose={onClose} />,
    );

    rerender(<Probe open focusOnOpen items={items} onClose={onClose} />);

    expect(document.activeElement).toBe(byId(container, "item-2"));
  });

  it("활성 항목이 없으면 패널에 초점을 준다", () => {
    const items: ItemSpec[] = [{ role: "menuitem", disabled: "aria-disabled" }];
    const onClose = vi.fn();
    const { container, rerender } = render(
      <Probe open={false} focusOnOpen items={items} onClose={onClose} />,
    );

    rerender(<Probe open focusOnOpen items={items} onClose={onClose} />);

    expect(document.activeElement).toBe(byId(container, "panel"));
  });

  it("focusOnOpen이 false면 초점을 옮기지 않는다", () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <Probe open={false} onClose={onClose} />,
    );
    byId(container, "outside").focus();

    rerender(<Probe open onClose={onClose} />);

    expect(document.activeElement).toBe(byId(container, "outside"));
  });

  it("열려 있는 동안 다시 렌더돼도 사용자가 옮긴 초점을 되돌리지 않는다", () => {
    const items: ItemSpec[] = [{ role: "menuitem" }, { role: "menuitem" }];
    const onClose = vi.fn();
    const { container, rerender } = render(
      <Probe open focusOnOpen items={items} onClose={onClose} />,
    );
    byId(container, "item-1").focus();

    rerender(<Probe open focusOnOpen items={items} onClose={onClose} />);

    expect(document.activeElement).toBe(byId(container, "item-1"));
  });
});

describe("useDismissibleOverlay 공개 경계", () => {
  // jsdom 환경에서는 import.meta.url이 file: URL이 아니라 dirname을 쓴다.
  it("index.ts가 module을 아직 내보내지 않는다(공개 전환은 RD-006)", () => {
    const source = readFileSync(
      join(import.meta.dirname, "../src/index.ts"),
      "utf8",
    );

    expect(source).not.toContain("use-dismissible-overlay");
    expect(source).not.toContain("useDismissibleOverlay");
  });
});
