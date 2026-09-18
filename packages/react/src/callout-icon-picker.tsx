import { useCallback, useState } from "react";

import { EmojiGrid } from "./emoji-grid.js";
import { EMOJI_OPTIONS, type EmojiOption } from "./emoji-picker-options.js";
import { findElementByAttribute } from "./find-by-attribute.js";
import { readPageRect } from "./table-handle-geometry.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { usePointerHoverTarget } from "./use-pointer-hover-target.js";

// media-handle-overlays.tsx와 같은 이유로 자기 트리거 버튼은 hover 판정에서
// 제외한다 — 포인터가 트리거로 이동하는 순간 hover가 풀리면 클릭 전에
// 버튼이 사라진다.
const CALLOUT_ICON_HOVER_IGNORE_SELECTORS = [
  "[data-geul-callout-icon-trigger]",
] as const;
// useDismissOnOutsideOrEscape allow-list — 트리거 버튼과 그리드 팝업 자신은
// "바깥 클릭"으로 치지 않는다.
const CALLOUT_ICON_DISMISS_ALLOW_SELECTORS = [
  "[data-geul-callout-icon-trigger]",
  ".geul-emoji-picker",
] as const;

type PickerState = { blockId: string; left: number; top: number };

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
  const { menuRef, style } = useClampedMenuPosition(
    pickerState?.left ?? 0,
    pickerState?.top ?? 0,
  );
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

  // blockId는 blockContainer(data-geul-block-id)가 소유하지만, 위치 계산의
  // 앵커는 실제 시각 요소인 콘텐츠 노드([data-geul-callout], 카드 패딩·
  // 배경을 가진 요소) 자신이어야 한다(media-handle-overlays.tsx의
  // findMediaVisualElement와 동일 근거 — 래퍼가 아니라 실제 렌더 요소).
  const hoverBlockContainer =
    hoverBlockId === null || element === null
      ? null
      : findElementByAttribute(
          element,
          null,
          "data-geul-block-id",
          hoverBlockId,
        );
  const hoverElement =
    hoverBlockContainer?.querySelector<HTMLElement>("[data-geul-callout]") ??
    hoverBlockContainer;
  const overlayRect = hoverElement === null ? null : readPageRect(hoverElement);

  const closePicker = useCallback(() => setPickerState(null), []);
  const closePickerAndFocus = useCallback(() => {
    setPickerState(null);
    focusEditor();
  }, [focusEditor]);

  useDismissOnOutsideOrEscape({
    active: pickerState !== null,
    element,
    allowSelectors: CALLOUT_ICON_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: closePicker,
    onEscapeDismiss: closePickerAndFocus,
  });

  const openPicker = () => {
    if (hoverElement === null || hoverBlockId === null) return;
    // 팝업은 useClampedMenuPosition을 통해 viewport-relative(position: fixed)
    // 좌표를 기대한다 — overlayRect(page-relative, absolute 트리거 버튼용)를
    // 그대로 넘기면 스크롤된 문서에서 엉뚱한 위치에 뜬다(media-handle-
    // overlays.tsx의 handleHandleClick과 동일 근거). 클릭 시점에
    // getBoundingClientRect()를 별도로 다시 읽는다.
    const rect = hoverElement.getBoundingClientRect();
    setPickerState({
      blockId: hoverBlockId,
      left: rect.left,
      top: rect.bottom,
    });
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
