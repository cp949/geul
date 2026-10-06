import { useCallback, useEffect, useRef, useState } from "react";

import { EmojiGrid } from "./emoji-grid.js";
import { EMOJI_OPTIONS, type EmojiOption } from "./emoji-picker-options.js";
import { findElementByAttribute } from "./find-by-attribute.js";
import { useFixedPlacement } from "./fixed-placement.js";
import { isHiddenBlockElement } from "./hidden-block.js";
import { readPageRect } from "./table-handle-geometry.js";
import { useClipVisibility } from "./use-clip-visibility.js";
import { useDismissibleOverlay } from "./use-dismissible-overlay.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { usePointerHoverTarget } from "./use-pointer-hover-target.js";
import { useSelectionRefresh } from "./use-selection-refresh.js";

// media-handle-overlays.tsx와 같은 이유로 자기 트리거 버튼은 hover 판정에서
// 제외한다 — 포인터가 트리거로 이동하는 순간 hover가 풀리면 클릭 전에
// 버튼이 사라진다.
const CALLOUT_ICON_HOVER_IGNORE_SELECTORS = [
  "[data-geul-callout-icon-trigger]",
] as const;
// useDismissibleOverlay allow-list — 트리거 버튼과 그리드 팝업 자신은
// "바깥 클릭"으로 치지 않는다.
const CALLOUT_ICON_DISMISS_ALLOW_SELECTORS = [
  "[data-geul-callout-icon-trigger]",
  ".geul-emoji-picker",
] as const;

// 열림 상태는 blockId만 보관한다. 위치는 useFixedPlacement가 렌더마다 DOM에서
// 읽는다(Issue #234) — rect를 값으로 보관하면 스크롤에서 callout과 떨어진다.
type PickerState = { blockId: string };

// blockId는 blockContainer(data-geul-block-id)가 소유하지만, 위치 계산의
// 앵커는 실제 시각 요소인 콘텐츠 노드([data-geul-callout], 카드 패딩·
// 배경을 가진 요소) 자신이어야 한다(media-handle-overlays.tsx의
// findMediaVisualElement와 동일 근거 — 래퍼가 아니라 실제 렌더 요소).
const findCalloutVisualElement = (
  element: HTMLElement,
  blockId: string,
): HTMLElement | null => {
  const container = findElementByAttribute(
    element,
    null,
    "data-geul-block-id",
    blockId,
  );
  return (
    container?.querySelector<HTMLElement>("[data-geul-callout]") ?? container
  );
};

/**
 * callout 아이콘 클릭 교체 UI(Issue #209 RD-004 DELTA-02). 이 저장소는
 * 에디터 콘텐츠에 React NodeView를 쓴 적이 없다(전부 vanilla DOM) —
 * media-handle-overlays.tsx와 같은 패턴(hover 감지 → readPageRect 실측
 * 위치 → position: absolute 오버레이)으로 core의 ProductionCalloutExtension
 * (RD-002, 이미 DONE)을 건드리지 않고 처리한다. 트리거 버튼은 callout
 * 자신의 좌상단(아이콘이 ::before로 그려지는 자리, _callout.scss)에 투명
 * 클릭 영역만 얹는다 — 아이콘 시각 표시 자체는 CSS가 그대로 담당한다.
 *
 * EmojiPicker(`:` 트리거, 블록 텍스트 치환)와 달리 이 컴포넌트는 EmojiGrid를
 * 그대로 재사용하되 클릭 트리거+`setCalloutIcon(blockId, icon)` 호출로
 * 대체한다(2026-09-19 사용자 결정, RD-004.md "결정" 참고).
 *
 * EmojiPicker와 달리 `index.ts`에 공개 export하지 않는다 —
 * `slash-menu.tsx`가 자동 마운트하므로 소비자가 중복 마운트하면 오버레이가
 * 두 벌 겹친다(MediaHandleOverlays/TableHandles와 같은 관례).
 */
export const CalloutIconPicker = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null);
  const [pickerState, setPickerState] = useState<PickerState | null>(null);
  const { menuRef, style } = useFixedPlacement({
    open: pickerState !== null,
    element,
    // 앵커는 hover 요소가 아니라 열린 blockId의 callout이다. hoverElement는
    // 포인터 이동으로 바뀐다. 오프셋(+0, callout 하단에 붙는다)은 여기서만 정한다.
    readAnchor: () => {
      if (pickerState === null || element === null) return null;
      const anchor = findCalloutVisualElement(element, pickerState.blockId);
      if (anchor === null) return null;
      // 접힌 toggle이 가린 callout은 rect가 0x0이다. 닫힘은 아래 effect가 맡고,
      // 그 사이 선택기가 그 좌표로 옮겨 가지 않게 마지막 좌표를 유지한다
      // (Issue #280).
      if (isHiddenBlockElement(anchor)) return null;
      const rect = anchor.getBoundingClientRect();
      return { left: rect.left, top: rect.bottom };
    },
  });
  const focusEditor = useFocusEditor(element);

  const handleHoverCandidateChange = useCallback(
    (candidate: HTMLElement | null) => {
      // candidate는 usePointerHoverTarget의 entitySelector([data-geul-callout])
      // 로 찾은 콘텐츠 노드 자신이다 — quote/paragraph와 같은 nestable
      // content node라 안정 id는 candidate가 아니라 그 부모 blockContainer
      // (data-geul-block-id)가 소유한다(media처럼 컨테이너 없이 직결되는
      // atom이 아니다). closest로 자기 자신부터 조상까지 찾는다.
      const blockId =
        candidate
          ?.closest<HTMLElement>("[data-geul-block-id]")
          ?.getAttribute("data-geul-block-id") ?? null;
      setHoverBlockId(blockId);
    },
    [],
  );

  usePointerHoverTarget({
    element,
    ignoreSelectors: CALLOUT_ICON_HOVER_IGNORE_SELECTORS,
    entitySelector: "[data-geul-callout]",
    onCandidateChange: handleHoverCandidateChange,
  });

  // 트리거는 page 좌표 absolute라 안쪽 스크롤 컨테이너가 스크롤돼도 제자리에
  // 남는다(Issue #235). scroll(capture)·resize에서 렌더해 readPageRect로 다시
  // 읽는다. 트리거가 그려지는 hover 동안만 구독한다.
  const [, setTick] = useState(0);
  const refresh = useCallback(() => setTick((tick) => tick + 1), []);
  useSelectionRefresh({
    element,
    onUpdate: refresh,
    enabled: hoverBlockId !== null,
  });

  // 접힌 toggle이 가린 callout은 트리거를 그리지 않는다. rect가 0x0이라 트리거가
  // 화면 구석에 뜬다. 재평가는 위 `useSelectionRefresh`가 맡는다(Issue #280).
  const foundHoverElement =
    hoverBlockId === null || element === null
      ? null
      : findCalloutVisualElement(element, hoverBlockId);
  const hoverElement =
    foundHoverElement !== null && isHiddenBlockElement(foundHoverElement)
      ? null
      : foundHoverElement;
  const overlayRect = hoverElement === null ? null : readPageRect(hoverElement);

  // 트리거는 안쪽 스크롤 컨테이너 바깥에 그려져 컨테이너가 잘라내지 못한다.
  // 보이는 영역 밖이면 visibility로 숨긴다(G-UI-003). 선택기가 열린 callout의
  // 트리거는 숨기지 않는다 — 숨은 요소는 초점을 잃는다. 트리거 자신에 포커스가
  // 있어도 숨기지 않는다. 다른 callout로 hover가 옮겨 간 트리거는 박스로
  // 판정한다. 렌더마다 돈다. style prop에 visibility를 두지 않는다.
  const triggerRef = useRef<HTMLButtonElement>(null);
  useClipVisibility(element, () => {
    const node = triggerRef.current;
    if (node === null) return [];
    return [
      {
        node,
        exempt: pickerState !== null && pickerState.blockId === hoverBlockId,
      },
    ];
  });

  const closePicker = useCallback(() => setPickerState(null), []);

  const close = useDismissibleOverlay({
    open: pickerState !== null,
    element,
    allowSelectors: CALLOUT_ICON_DISMISS_ALLOW_SELECTORS,
    onClose: closePicker,
  });

  // 대상 callout이 접힘에 가려지면 선택기를 닫는다. 보이지 않는 callout에
  // setCalloutIcon이 나가지 않게 한다(Issue #280, block-side-menu.tsx와 같은
  // 규칙). listener는 틱만 올리고 판정은 커밋 뒤 effect가 한다. 닫힌 뒤에는
  // 다시 펼쳐도 열리지 않는다.
  const openBlockId = pickerState?.blockId ?? null;
  const [documentTick, setDocumentTick] = useState(0);
  useEffect(() => {
    if (openBlockId === null) return;
    return editor.subscribe(() => setDocumentTick((tick) => tick + 1));
  }, [editor, openBlockId]);
  useEffect(() => {
    if (openBlockId === null || element === null) return;
    const openBlockElement = findElementByAttribute(
      element,
      null,
      "data-geul-block-id",
      openBlockId,
    );
    if (openBlockElement === null || !isHiddenBlockElement(openBlockElement)) {
      return;
    }
    close("invalidated");
    // documentTick은 값을 읽지 않는 재실행 트리거다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentTick, openBlockId]);

  const openPicker = () => {
    if (hoverElement === null || hoverBlockId === null) return;
    setPickerState({ blockId: hoverBlockId });
  };

  const selectIcon = (item: EmojiOption) => {
    if (pickerState === null) return;
    editor.commands.setCalloutIcon(pickerState.blockId, item.char);
    setPickerState(null);
    focusEditor();
  };

  return (
    <>
      {overlayRect !== null && hoverBlockId !== null && (
        <button
          aria-label="Change callout icon"
          className="geul-callout-icon-trigger"
          data-geul-callout-icon-trigger=""
          onClick={openPicker}
          ref={triggerRef}
          style={{ left: overlayRect.left, top: overlayRect.top }}
          type="button"
        />
      )}
      {pickerState !== null && (
        <EmojiGrid
          ariaLabel="Callout icon picker"
          emptyMessage="No matches"
          highlightedIndex={-1}
          items={EMOJI_OPTIONS}
          menuRef={menuRef}
          onSelect={selectIcon}
          style={style}
        />
      )}
    </>
  );
};
