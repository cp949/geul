import type { BlockTypeDescriptor, EditorController } from "@cp949/geul-core";
import {
  Baseline,
  Bold,
  Code,
  IndentDecrease,
  IndentIncrease,
  Italic,
  PaintBucket,
  Strikethrough,
  Underline,
} from "lucide-react";
import {
  type FC,
  type ReactElement,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  blockTypeText,
  blockTypeToOptionId,
  getBlockTypeOptionsForSource,
} from "./block-type-options.js";
import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { MenuItemButton } from "./menu-item-button.js";
import {
  TABLE_BACKGROUND_COLORS,
  TABLE_TEXT_COLORS,
  type TableCellColor,
} from "./table-cell-colors.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { useRangeDismissSuppression } from "./use-range-dismiss-suppression.js";
import { useSelectionRefresh } from "./use-selection-refresh.js";

type SelectionMark = ReturnType<EditorController["getSelectionMarks"]>[number];

// 아이콘 element를 모듈 레벨 상수로 만들어 두면 매 렌더에서 같은 참조가
// 재사용되어 React가 아이콘 subtree 재렌더를 통째로 건너뛴다. 툴바는 표시 중
// scroll·selectionchange·keyup마다 재렌더되므로 렌더당 아이콘 비용을 없앤다.
const toolbarButtons: ReadonlyArray<{
  mark: SelectionMark;
  label: string;
  icon: ReactElement;
  toggle: (editor: EditorController) => void;
}> = [
  {
    mark: "bold",
    label: "Bold",
    icon: <Bold {...iconProps} />,
    toggle: (editor) => void editor.commands.toggleBold(),
  },
  {
    mark: "italic",
    label: "Italic",
    icon: <Italic {...iconProps} />,
    toggle: (editor) => void editor.commands.toggleItalic(),
  },
  {
    mark: "underline",
    label: "Underline",
    icon: <Underline {...iconProps} />,
    toggle: (editor) => void editor.commands.toggleUnderline(),
  },
  {
    mark: "strike",
    label: "Strikethrough",
    icon: <Strikethrough {...iconProps} />,
    toggle: (editor) => void editor.commands.toggleStrike(),
  },
  {
    mark: "code",
    label: "Inline code",
    icon: <Code {...iconProps} />,
    toggle: (editor) => void editor.commands.toggleCode(),
  },
];

// indentBlock/outdentBlock은 mark가 아니라 1회성 블록 액션이라 위 배열의
// 형태(mark 키, aria-pressed 눌림 상태)에 맞지 않는다 — 별도 아이콘
// 상수·버튼 그룹으로 둔다(DELTA-05). 아이콘 element를 모듈 상수로 두는
// 이유는 toolbarButtons와 동일하다(재렌더 시 참조 안정).
const indentIcon = <IndentIncrease {...iconProps} />;
const outdentIcon = <IndentDecrease {...iconProps} />;

// textColorIcon/backgroundColorIcon도 위와 같은 이유(재렌더 시 참조 안정)로
// 모듈 상수다.
const textColorIcon = <Baseline {...iconProps} />;
const backgroundColorIcon = <PaintBucket {...iconProps} />;

const colorMenuSectionLabelClassName = "geul-menu-section-label";
const colorMenuSwatchClassName = "geul-menu-swatch";

// useDismissOnOutsideOrEscape allow-list. 트리거 버튼도 포함해야 재클릭이
// "바깥 클릭"으로 먼저 닫히는 레이스 없이 트리거의 onClick 토글만으로
// 재클릭 닫기가 성립한다(block-side-menu.tsx의 BLOCK_MENU_DISMISS_ALLOW_SELECTORS와
// 같은 이유, RD-003-DELTA-01 계획 "배경" 절).
const COLOR_MENU_DISMISS_ALLOW_SELECTORS = [
  "[data-geul-color-menu]",
  "[data-geul-color-trigger]",
] as const;

// 툴바 자신도 allow-list에 넣는다 — 안 그러면 Bold 등 내부 버튼 pointerdown이
// "바깥 클릭"으로 잡혀 트리거 클릭보다 먼저 툴바를 지운다(위 색상 팔레트
// allow-list와 같은 이유).
const TOOLBAR_DISMISS_ALLOW_SELECTORS = [".geul-formatting-toolbar"] as const;

type ToolbarState = {
  activeMarks: SelectionMark[];
  blockSelection: { blockId: string; blockType: BlockTypeDescriptor } | null;
  nestingActions: { canIndent: boolean; canOutdent: boolean } | null;
  left: number;
  top: number;
};

type ColorMenuState = {
  property: "text" | "background";
  left: number;
  top: number;
};

/**
 * 서식 툴바가 추적한 자기 에디터 Range를 DOM selection으로 복원한다.
 * 이미 교체된 노드를 가리키는 Range나 다른 에디터의 Range는 적용하지 않는다.
 */
const restoreEditorSelection = (
  element: HTMLElement | null,
  range: Range | null,
) => {
  const selection = element?.ownerDocument.getSelection();
  if (
    element === null ||
    range === null ||
    selection === undefined ||
    selection === null ||
    !element.contains(range.startContainer) ||
    !element.contains(range.endContainer)
  ) {
    return;
  }

  selection.removeAllRanges();
  selection.addRange(range);
};

/**
 * `portalTarget`을 지정하면 `createPortal`로 그 요소 하위에 렌더한다(RD-003
 * DELTA-01). 미지정(기본값 `null`)이면 기존처럼 부모 트리 내부에 그대로
 * 렌더한다 — additive 확장이라 기존 소비자·테스트의 DOM 배치 가정을 깨지
 * 않는다.
 *
 * `component`를 지정하면 위치 계산·표시 판정·dismiss는 이 컴포넌트가 그대로
 * 담당하고 내부 JSX(마크 버튼·블록 타입 select·색상 팔레트)만 `<Component
 * editor={editor} />`로 통째 교체한다(RD-001 DELTA-01, roadmap.md "`component`
 * override payload" 결정). `editor` 하나만 넘기고 activeMarks 등 계산된 로컬
 * state는 넘기지 않는다 — 소비자가 이미 공개된 `editor.getSelectionMarks()`
 * 등으로 직접 조회한다.
 */
export type FormattingToolbarProps = {
  portalTarget?: HTMLElement | null;
  component?: FC<{ editor: EditorController }>;
};

export const FormattingToolbar = ({
  portalTarget = null,
  component: Component,
}: FormattingToolbarProps = {}) => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);
  const [colorMenuState, setColorMenuState] = useState<ColorMenuState | null>(
    null,
  );
  const trackedRange = useRef<Range | null>(null);
  const focusEditor = useFocusEditor(element);
  const dismissSuppression = useRangeDismissSuppression();

  const updateFromSelection = useCallback(() => {
    const selection = element?.ownerDocument.getSelection();
    if (
      element === null ||
      selection === undefined ||
      selection === null ||
      selection.rangeCount === 0 ||
      selection.isCollapsed ||
      selection.anchorNode === null ||
      selection.focusNode === null ||
      !element.contains(selection.anchorNode) ||
      !element.contains(selection.focusNode)
    ) {
      setToolbarState(null);
      // 툴바가 숨는 시점에 팔레트도 같이 닫는다 — 아니면 state는 이 컴포넌트
      // 인스턴스에 그대로 남아, 다음에 새 선택으로 툴바가 다시 뜰 때 이전
      // 세션의 팔레트가 유령처럼 재등장한다.
      setColorMenuState(null);
      // selection이 아예 사라졌다 — 다음에 뭘 선택하든 새 시작이라 억제도
      // 함께 푼다.
      dismissSuppression.clear();
      return;
    }

    const range = selection.getRangeAt(0);
    if (dismissSuppression.isSuppressed(range)) return;
    dismissSuppression.clear();
    trackedRange.current = range.cloneRange();
    const bounds = range.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: 0,
    };
    const blockSelection = editor.getSelectionBlockType();
    setToolbarState({
      activeMarks: editor.getSelectionMarks(),
      blockSelection,
      nestingActions:
        blockSelection === null
          ? null
          : editor.getBlockNestingActionState(blockSelection.blockId),
      left: bounds.left + bounds.width / 2,
      top: bounds.top,
    });
  }, [editor, element, dismissSuppression]);

  useSelectionRefresh({ element, onUpdate: updateFromSelection });

  const { menuRef, style } = useClampedMenuPosition(
    toolbarState?.left ?? 0,
    toolbarState?.top ?? 0,
    "centerAbove",
  );

  // 툴바 자신도 G-UI-001을 따른다(위 색상 팔레트와 같은 훅). 바깥
  // pointerdown은 자연히 selection을 collapse해 updateFromSelection이 이미
  // 닫아주므로 onOutsideDismiss는 방어적 안전망이다 — 초점은 옮기지 않는다.
  // Escape는 돌아갈 selection이 없으니 초점을 편집기로 되돌리고, 같은
  // selection이 재관측돼도 다시 안 열리게 dismissSuppression에 기록한다.
  // colorMenuState가 열려 있는 동안은 active를 꺼서 Escape 한 번이 팔레트만
  // 먼저 닫게 한다(안쪽 오버레이 우선 — 두 리스너가 같은 keydown에 동시
  // 반응하면 팔레트와 툴바가 한 번에 다 닫힌다).
  const dismissToolbar = useCallback(() => {
    dismissSuppression.clear();
    setToolbarState(null);
    setColorMenuState(null);
  }, [dismissSuppression]);
  const closeToolbar = useCallback(() => {
    dismissSuppression.dismiss(trackedRange.current);
    setToolbarState(null);
    setColorMenuState(null);
    focusEditor();
  }, [dismissSuppression, focusEditor]);
  useDismissOnOutsideOrEscape({
    active: toolbarState !== null && colorMenuState === null,
    element,
    allowSelectors: TOOLBAR_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissToolbar,
    onEscapeDismiss: closeToolbar,
  });

  // 색상 팔레트는 G-UI-001을 그대로 따른다 — 바깥 클릭(초점 미이동)과
  // Escape(초점 복구)를 분리하고, 트리거 재클릭도 Escape와 같은 초점 복구
  // 그룹으로 다룬다(closeColorMenu 공유). block-side-menu.tsx의
  // resolveReopenAwareClick/useHandleReopenSuppression은 핸들이 드래그
  // 제스처를 겸할 때만 필요한 인프라라 여기서는 쓰지 않는다 — 트리거를
  // allowSelectors에 포함시키면 바깥 pointerdown이 먼저 팔레트를 지우는
  // 레이스 자체가 생기지 않아 단순 토글로 충분하다(RD-003-DELTA-01 계획).
  const { menuRef: colorMenuRef, style: colorMenuStyle } =
    useClampedMenuPosition(colorMenuState?.left ?? 0, colorMenuState?.top ?? 0);

  const dismissColorMenu = useCallback(() => setColorMenuState(null), []);
  const closeColorMenu = useCallback(() => {
    setColorMenuState(null);
    focusEditor();
  }, [focusEditor]);
  useDismissOnOutsideOrEscape({
    active: colorMenuState !== null,
    element,
    allowSelectors: COLOR_MENU_DISMISS_ALLOW_SELECTORS,
    onOutsideDismiss: dismissColorMenu,
    onEscapeDismiss: closeColorMenu,
  });

  const handleColorTriggerClick = (
    property: "text" | "background",
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (colorMenuState !== null && colorMenuState.property === property) {
      closeColorMenu();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setColorMenuState({ property, left: rect.left, top: rect.bottom + 4 });
  };

  const applyInlineColor = (
    event: ReactMouseEvent<HTMLButtonElement>,
    property: "text" | "background",
    color: string | null,
  ) => {
    // 키보드로 활성화한 click은 WebKit에서 편집기의 DOM selection을 잃을 수
    // 있다 — toolbarButtons의 mark 토글과 같은 방어(위 restoreEditorSelection
    // 참고).
    if (event.detail === 0) {
      restoreEditorSelection(element, trackedRange.current);
    }
    if (property === "text") {
      editor.commands.toggleInlineTextColor(color);
    } else {
      editor.commands.toggleInlineBackgroundColor(color);
    }
    closeColorMenu();
  };

  const colorPropertyLabel = (property: "text" | "background") =>
    property === "text"
      ? dictionary.color.textLabel
      : dictionary.color.backgroundLabel;

  const renderColorSwatches = (
    property: "text" | "background",
    colors: TableCellColor[],
  ) => {
    const label = colorPropertyLabel(property);
    return (
      <div className="geul-menu-palette">
        {colors.map((color) => (
          <MenuItemButton
            aria-label={`${label} ${dictionary.color.names[color.id]}`}
            className={colorMenuSwatchClassName}
            key={color.value}
            onClick={(event) => applyInlineColor(event, property, color.value)}
            style={
              property === "background"
                ? { backgroundColor: color.value }
                : { backgroundColor: "transparent", color: color.value }
            }
          >
            {property === "text" ? "A" : ""}
          </MenuItemButton>
        ))}
        <MenuItemButton
          aria-label={`${label} ${dictionary.color.none}`}
          className={colorMenuSwatchClassName}
          onClick={(event) => applyInlineColor(event, property, null)}
        >
          ×
        </MenuItemButton>
      </div>
    );
  };

  if (toolbarState === null) return null;

  // codeBlock의 schema는 marks: ""라 Bold 등 인라인 서식·링크·색상이 전부
  // 적용 불가하다(code-block-extension.ts, code-block-mark-guard-extension.ts가
  // 같은 이유로 단축키를 막는다) — 블록 타입 select·Indent/Outdent는
  // codeBlock에도 유효하니 그대로 두고, 적용될 수 없는 mark 버튼만 뺀다
  // (Issue #173 QA).
  const isCodeBlockSelection =
    toolbarState.blockSelection?.blockType.type === "codeBlock";

  if (Component !== undefined) {
    const overridden = (
      <div
        aria-label={dictionary.toolbar.formatting.ariaLabel}
        className="geul-formatting-toolbar"
        ref={menuRef}
        role="toolbar"
        style={style}
      >
        <Component editor={editor} />
      </div>
    );
    return portalTarget === null
      ? overridden
      : createPortal(overridden, portalTarget);
  }

  const content = (
    <>
      <div
        aria-label={dictionary.toolbar.formatting.ariaLabel}
        className="geul-formatting-toolbar"
        ref={menuRef}
        role="toolbar"
        style={style}
      >
        {toolbarState.blockSelection !== null && (
          <select
            aria-label="Block type"
            className="geul-formatting-toolbar__select"
            onChange={(event) => {
              const blockSelection = toolbarState.blockSelection;
              if (blockSelection === null) return;
              const options = getBlockTypeOptionsForSource(
                blockSelection.blockType,
              );
              const option = options.find(
                (candidate) => candidate.id === event.currentTarget.value,
              );
              if (option === undefined) return;
              editor.commands.setBlockType(
                blockSelection.blockId,
                option.blockType,
              );
              updateFromSelection();
            }}
            // IconButton 형제들과 달리 onMouseDown={preventDefault}를 두지
            // 않는다 — 네이티브 <select>는 mousedown의 기본 동작이 곧
            // 드롭다운을 여는 것이라(Chromium 실측, QA-087) 막으면 드롭다운
            // 자체가 안 열려 클릭으로 옵션을 고를 수 없다. 그 preventDefault는
            // 애초에 "mousedown이 contenteditable 초점을 훔치지 않는다"는
            // 불변식(icon-button.tsx 참고)을 위한 것인데, 이 select에 실제로
            // 초점이 옮겨가도(document.activeElement가 select로 바뀌어도)
            // 편집기의 window.getSelection()은 collapse되지 않는다(Chromium
            // 실측) — 지킬 불변식이 애초에 깨지지 않으므로 이 select에는
            // preventDefault가 필요 없다.
            value={blockTypeToOptionId(toolbarState.blockSelection.blockType)}
          >
            {getBlockTypeOptionsForSource(
              toolbarState.blockSelection.blockType,
            ).map((option) => (
              <option key={option.id} value={option.id}>
                {blockTypeText(dictionary, option.id).label}
              </option>
            ))}
          </select>
        )}
        {toolbarState.blockSelection !== null && (
          <>
            {/* 표 셀 안에서는 blockSelection이 이미 null이라(기존 동작,
              getSelectionBlockType) 위 블록 타입 select와 같은 게이트를
              재사용하는 것만으로 셀 안 자동 숨김이 성립한다(DELTA-05) —
              별도 코드 불필요. aria-pressed는 쓰지 않는다: 토글 상태가
              없는 1회성 액션 버튼이다. */}
            <IconButton
              aria-disabled={
                toolbarState.nestingActions?.canIndent === true
                  ? "false"
                  : "true"
              }
              className="geul-formatting-toolbar__mark-button"
              icon={indentIcon}
              key="indent"
              label="Indent"
              onClick={() => {
                const blockSelection = toolbarState.blockSelection;
                if (blockSelection === null) return;
                // G-UI-004: aria-disabled는 disabled와 달리 클릭 이벤트를
                // 막지 않는다 — 명시적 가드로 비활성 상태의 클릭을 막는다.
                if (toolbarState.nestingActions?.canIndent !== true) return;
                // Result 실패(COMMAND_NOT_APPLICABLE 등)는 기존 mark
                // 버튼과 같은 방식으로 조용히 버린다 — Tab 키 경로(D9)와
                // 동일선상.
                editor.commands.indentBlock(blockSelection.blockId);
                setToolbarState((current) =>
                  current === null
                    ? null
                    : {
                        ...current,
                        nestingActions: editor.getBlockNestingActionState(
                          blockSelection.blockId,
                        ),
                      },
                );
              }}
              title={
                toolbarState.nestingActions?.canIndent === true
                  ? undefined
                  : dictionary.nesting.indentDisabledReason
              }
            />
            <IconButton
              aria-disabled={
                toolbarState.nestingActions?.canOutdent === true
                  ? "false"
                  : "true"
              }
              className="geul-formatting-toolbar__mark-button"
              icon={outdentIcon}
              key="outdent"
              label="Outdent"
              onClick={() => {
                const blockSelection = toolbarState.blockSelection;
                if (blockSelection === null) return;
                if (toolbarState.nestingActions?.canOutdent !== true) return;
                editor.commands.outdentBlock(blockSelection.blockId);
                setToolbarState((current) =>
                  current === null
                    ? null
                    : {
                        ...current,
                        nestingActions: editor.getBlockNestingActionState(
                          blockSelection.blockId,
                        ),
                      },
                );
              }}
              title={
                toolbarState.nestingActions?.canOutdent === true
                  ? undefined
                  : dictionary.nesting.outdentDisabledReason
              }
            />
          </>
        )}
        {!isCodeBlockSelection &&
          toolbarButtons.map(({ mark, label, icon, toggle }) => (
            <IconButton
              aria-pressed={toolbarState.activeMarks.includes(mark)}
              className="geul-formatting-toolbar__mark-button"
              icon={icon}
              key={mark}
              label={label}
              onClick={(event) => {
                // 키보드로 활성화한 button click은 WebKit에서 편집기의 DOM
                // selection을 잃을 수 있다. 툴바가 표시될 때 자기 에디터에서
                // 추적한 Range만 command 전에 복원한다. 포인터 click(detail > 0)은
                // IconButton의 mousedown 기본 동작 억제 계약을 그대로 사용한다.
                if (event.detail === 0) {
                  restoreEditorSelection(element, trackedRange.current);
                }
                toggle(editor);
                setToolbarState((current) =>
                  current === null
                    ? null
                    : { ...current, activeMarks: editor.getSelectionMarks() },
                );
              }}
            />
          ))}
        {!isCodeBlockSelection && (
          <>
            <IconButton
              className="geul-formatting-toolbar__mark-button"
              data-geul-color-trigger=""
              icon={textColorIcon}
              key="text-color"
              label={dictionary.color.textLabel}
              onClick={(event) => handleColorTriggerClick("text", event)}
            />
            <IconButton
              className="geul-formatting-toolbar__mark-button"
              data-geul-color-trigger=""
              icon={backgroundColorIcon}
              key="background-color"
              label={dictionary.color.backgroundLabel}
              onClick={(event) => handleColorTriggerClick("background", event)}
            />
          </>
        )}
      </div>
      {colorMenuState !== null && (
        <div
          aria-label={colorPropertyLabel(colorMenuState.property)}
          className="geul-menu-panel"
          data-geul-color-menu=""
          ref={colorMenuRef}
          role="menu"
          style={colorMenuStyle}
        >
          <p className={colorMenuSectionLabelClassName}>
            {colorPropertyLabel(colorMenuState.property)}
          </p>
          {renderColorSwatches(
            colorMenuState.property,
            colorMenuState.property === "text"
              ? TABLE_TEXT_COLORS
              : TABLE_BACKGROUND_COLORS,
          )}
        </div>
      )}
    </>
  );

  return portalTarget === null ? content : createPortal(content, portalTarget);
};
