import { startTransition, useCallback, useEffect, useRef } from "react";

import { useFocusEditor } from "./use-focus-editor.js";

/**
 * 해제형 오버레이가 닫히는 이유. 이유마다 초점 규칙이 다르다(Issue #233).
 *
 * | reason        | 초점                                                  |
 * | ------------- | ----------------------------------------------------- |
 * | `outside`     | 초점이 오버레이 안이었으면 편집기로, 밖이면 그대로 둔다 |
 * | `escape`      | 편집기로 돌린다                                       |
 * | `invalidated` | `outside`와 같다                                      |
 * | `trigger`     | 편집기로 돌린다                                       |
 */
export type DismissReason = "outside" | "escape" | "invalidated" | "trigger";

type UseDismissibleOverlayOptions = {
  /** false면 리스너도 스택 항목도 두지 않는다. 열림 상태는 호출부가 소유한다. */
  open: boolean;
  /**
   * 편집기 host. `useFocusEditor(element)`에 넘기는 값과 같다. 이 문서의
   * `ownerDocument`에 리스너를 걸고, 초점 복귀 대상 contenteditable을 찾는다.
   */
  element: HTMLElement | null;
  /**
   * 오버레이 자신의 표면(패널, 트리거 등). pointerdown 대상이나 초점이 이
   * 셀렉터 중 하나에 `closest()`로 걸리면 "오버레이 안"으로 본다. 호출부의
   * 모듈 스코프 상수로 넘긴다.
   * `focusOnOpen`을 쓰면 패널 셀렉터를 맨 앞에 둔다. 활성 항목이 없을 때 첫
   * 셀렉터의 표면에 초점을 주므로, 트리거가 앞이면 초점이 트리거에 남는다.
   * 중첩된 자식 오버레이가 이 오버레이 밖에 그려지면 자식 셀렉터도 넣는다.
   * 넣지 않으면 자식 안의 클릭이 이 오버레이의 바깥 클릭이 된다.
   */
  allowSelectors: readonly string[];
  /**
   * 닫는다. 열림 상태 갱신은 호출부 책임이다. 초점 복귀는 이 호출 전에 끝나
   * 있다. `outside`일 때만 `startTransition` 안에서 부른다.
   */
  onClose: (reason: DismissReason) => void;
  /** true면 열릴 때 첫 활성 항목에 초점을 준다. 키보드로 열린 경우에만 true로 넘긴다. */
  focusOnOpen?: boolean;
};

/**
 * `focusOnOpen`이 찾는 항목. 비활성은 `disabled`와 `aria-disabled="true"`로
 * 표시되므로 둘 다 뺀다(G-UI-004). 표 그립 메뉴는 항목이 전부
 * `menuitemcheckbox`다.
 */
const ACTIVE_ITEM_SELECTOR = [
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
]
  .map((role) => `[role="${role}"]:not([disabled]):not([aria-disabled="true"])`)
  .join(", ");

type StackEntry = object;

/**
 * 문서별 Escape 스택. 앞이 먼저 열린 오버레이이고 맨 뒤가 가장 나중에 열린
 * 오버레이다. Escape는 맨 뒤 하나만 닫는다.
 * 키는 `element.ownerDocument`다. 현행 리스너와 같고 한 문서의 여러 편집기가
 * 하나의 스택을 공유한다.
 */
const escapeStackByDocument = new WeakMap<Document, StackEntry[]>();

const pushEntry = (ownerDocument: Document, entry: StackEntry): void => {
  const stack = escapeStackByDocument.get(ownerDocument);
  if (stack === undefined) {
    escapeStackByDocument.set(ownerDocument, [entry]);
  } else {
    stack.push(entry);
  }
};

const removeEntry = (ownerDocument: Document, entry: StackEntry): void => {
  const stack = escapeStackByDocument.get(ownerDocument);
  if (stack === undefined) return;
  const index = stack.indexOf(entry);
  if (index !== -1) stack.splice(index, 1);
  if (stack.length === 0) escapeStackByDocument.delete(ownerDocument);
};

const isTopEntry = (ownerDocument: Document, entry: StackEntry): boolean => {
  const stack = escapeStackByDocument.get(ownerDocument);
  return stack !== undefined && stack[stack.length - 1] === entry;
};

const matchesAny = (node: Element, selectors: readonly string[]): boolean =>
  selectors.some((selector) => node.closest(selector) !== null);

/** allow 셀렉터에 걸리는 요소를 문서 순서가 아닌 셀렉터 순서로 모은다. */
const findSurfaces = (
  ownerDocument: Document,
  selectors: readonly string[],
): HTMLElement[] =>
  selectors.flatMap((selector) =>
    Array.from(ownerDocument.querySelectorAll<HTMLElement>(selector)),
  );

/**
 * 열릴 때 첫 활성 항목에 초점을 준다. 항목이 없으면 첫 표면(패널)에 준다.
 * 패널에 `tabIndex`가 없으면 후자는 효과가 없다.
 * 오버레이가 portal로 `element` 밖에 그려질 수 있어 문서 전체에서 찾는다.
 * 같은 셀렉터의 오버레이가 한 문서에 둘 이상 열려 있으면 문서 순서상 첫 표면을
 * 고른다. 편집기 둘이 같은 종류의 메뉴를 동시에 열 때만 어긋난다.
 */
const focusFirstItem = (
  ownerDocument: Document,
  selectors: readonly string[],
): void => {
  const surfaces = findSurfaces(ownerDocument, selectors);
  for (const surface of surfaces) {
    const item = surface.querySelector<HTMLElement>(ACTIVE_ITEM_SELECTOR);
    if (item !== null) {
      item.focus({ preventScroll: true });
      return;
    }
  }
  surfaces[0]?.focus({ preventScroll: true });
};

/**
 * 해제형 오버레이(메뉴, 툴바, 팝업)의 닫힘 규칙을 한곳에 모은다(Issue #233).
 *
 * 소유하는 것:
 * - 바깥 pointerdown과 Escape 리스너.
 * - reason별 초점 복귀(`DismissReason` 표).
 * - 문서별 Escape LIFO. 한 번에 가장 나중에 열린 오버레이 하나만 닫는다.
 * - `focusOnOpen`의 첫 항목 초점.
 *
 * 소유하지 않는 것: 열림 상태와 payload, 재오픈 억제, 배치.
 *
 * 반환하는 `close(reason)`은 호출부가 직접 닫을 때 쓴다. 대상 삭제로 닫으면
 * `"invalidated"`, 트리거 재클릭이면 `"trigger"`를 넘긴다.
 *
 * 바깥 클릭은 오버레이마다 독립이다. LIFO는 Escape에만 적용한다.
 * `defaultPrevented`인 keydown은 건너뛴다. 오버레이 안의 모드 취소(입력창
 * Escape)가 `handleMenuKeyDown`으로 먼저 소비하면 오버레이는 닫히지 않는다.
 * IME 조합 중 Escape도 건너뛴다. `handleMenuKeyDown`이 조합 중 키를 소비하지
 * 않으므로 여기서 막지 않으면 입력 모드가 있는 오버레이가 조합 취소로 닫힌다.
 * modifier가 눌린 Escape도 닫는다(Issue #227).
 *
 * `onClose`·`allowSelectors`는 ref로 읽는다. effect 의존이 바뀌면 스택 항목이
 * 맨 위로 다시 올라가 열린 순서가 깨지기 때문이다.
 *
 * G-TST-001: 이 module로 만든 Escape 닫기 e2e는 `--workers` 병렬로도 반복해
 * selectionchange 재오픈 레이스가 없는지 확인한다.
 */
export const useDismissibleOverlay = ({
  open,
  element,
  allowSelectors,
  onClose,
  focusOnOpen = false,
}: UseDismissibleOverlayOptions): ((reason: DismissReason) => void) => {
  const focusEditor = useFocusEditor(element);

  const latest = useRef({ allowSelectors, onClose });
  latest.current = { allowSelectors, onClose };

  const close = useCallback(
    (reason: DismissReason) => {
      const { allowSelectors: selectors, onClose: notify } = latest.current;
      const activeElement = element?.ownerDocument.activeElement ?? null;
      const focusWasInside =
        activeElement !== null && matchesAny(activeElement, selectors);
      // 초점 정리는 동기로 한다. 오버레이가 언마운트된 뒤에는 초점이 이미
      // `<body>`로 떨어져 안/밖을 판정할 수 없다.
      if (reason === "escape" || reason === "trigger" || focusWasInside) {
        focusEditor();
      }
      if (reason === "outside") {
        // 바깥 클릭이 만든 커밋이 같은 물리적 클릭의 mouseup/click hit-test를
        // 바꾸지 않게 낮은 우선순위로 미룬다(Issue #155, ADR 0013).
        // `onClose` 호출 자체는 동기다.
        startTransition(() => notify(reason));
      } else {
        notify(reason);
      }
    },
    [element, focusEditor],
  );

  useEffect(() => {
    if (!open || element === null) return;
    const ownerDocument = element.ownerDocument;
    const entry: StackEntry = {};
    pushEntry(ownerDocument, entry);

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (matchesAny(target, latest.current.allowSelectors)) return;
      close("outside");
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      // 조합 취소용 Escape다. handleMenuKeyDown과 같은 기준으로 건너뛴다.
      if (event.isComposing) return;
      if (!isTopEntry(ownerDocument, entry)) return;
      event.preventDefault();
      close("escape");
    };

    ownerDocument.addEventListener("pointerdown", handlePointerDown);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
      removeEntry(ownerDocument, entry);
    };
  }, [open, element, close]);

  useEffect(() => {
    if (!open || !focusOnOpen || element === null) return;
    focusFirstItem(element.ownerDocument, latest.current.allowSelectors);
  }, [open, focusOnOpen, element]);

  return close;
};
