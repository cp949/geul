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
  type ReactElement,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
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
import { useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";

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

const colorMenuPropertyLabel = {
  text: "Text color",
  background: "Background color",
} as const;

// useDismissOnOutsideOrEscape allow-list. 트리거 버튼도 포함해야 재클릭이
// "바깥 클릭"으로 먼저 닫히는 레이스 없이 트리거의 onClick 토글만으로
// 재클릭 닫기가 성립한다(block-side-menu.tsx의 BLOCK_MENU_DISMISS_ALLOW_SELECTORS와
// 같은 이유, RD-003-DELTA-01 계획 "배경" 절).
const COLOR_MENU_DISMISS_ALLOW_SELECTORS = [
  "[data-be-color-menu]",
  "[data-be-color-trigger]",
] as const;

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

export const FormattingToolbar = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);
  const [colorMenuState, setColorMenuState] = useState<ColorMenuState | null>(
    null,
  );
  const trackedRange = useRef<Range | null>(null);
  const focusEditor = useFocusEditor(element);

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
      return;
    }

    const range = selection.getRangeAt(0);
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
  }, [editor, element]);

  useEffect(() => {
    const ownerDocument = element?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    ownerDocument?.addEventListener("selectionchange", updateFromSelection);
    ownerDocument?.addEventListener("mouseup", updateFromSelection);
    ownerDocument?.addEventListener("keyup", updateFromSelection);
    ownerWindow?.addEventListener("scroll", updateFromSelection, true);
    ownerWindow?.addEventListener("resize", updateFromSelection);
    updateFromSelection();
    return () => {
      ownerDocument?.removeEventListener(
        "selectionchange",
        updateFromSelection,
      );
      ownerDocument?.removeEventListener("mouseup", updateFromSelection);
      ownerDocument?.removeEventListener("keyup", updateFromSelection);
      ownerWindow?.removeEventListener("scroll", updateFromSelection, true);
      ownerWindow?.removeEventListener("resize", updateFromSelection);
    };
  }, [element, updateFromSelection]);

  const { menuRef, style } = useClampedMenuPosition(
    toolbarState?.left ?? 0,
    toolbarState?.top ?? 0,
    "centerAbove",
  );

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

  const renderColorSwatches = (
    property: "text" | "background",
    colors: TableCellColor[],
  ) => {
    const label = colorMenuPropertyLabel[property];
    return (
      <div className="geul-menu-palette">
        {colors.map((color) => (
          <MenuItemButton
            aria-label={`${label} ${color.name}`}
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
          aria-label={`${label} None`}
          className={colorMenuSwatchClassName}
          onClick={(event) => applyInlineColor(event, property, null)}
        >
          ×
        </MenuItemButton>
      </div>
    );
  };

  if (toolbarState === null) return null;

  return (
    <>
      <div
        aria-label="Formatting"
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
            onMouseDown={(event) => event.preventDefault()}
            value={blockTypeToOptionId(toolbarState.blockSelection.blockType)}
          >
            {getBlockTypeOptionsForSource(
              toolbarState.blockSelection.blockType,
            ).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
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
              disabled={toolbarState.nestingActions?.canIndent !== true}
              icon={indentIcon}
              key="indent"
              label="Indent"
              onClick={() => {
                const blockSelection = toolbarState.blockSelection;
                if (blockSelection === null) return;
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
            />
            <IconButton
              aria-disabled={
                toolbarState.nestingActions?.canOutdent === true
                  ? "false"
                  : "true"
              }
              className="geul-formatting-toolbar__mark-button"
              disabled={toolbarState.nestingActions?.canOutdent !== true}
              icon={outdentIcon}
              key="outdent"
              label="Outdent"
              onClick={() => {
                const blockSelection = toolbarState.blockSelection;
                if (blockSelection === null) return;
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
            />
          </>
        )}
        {toolbarButtons.map(({ mark, label, icon, toggle }) => (
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
        <IconButton
          className="geul-formatting-toolbar__mark-button"
          data-be-color-trigger=""
          icon={textColorIcon}
          key="text-color"
          label="Text color"
          onClick={(event) => handleColorTriggerClick("text", event)}
        />
        <IconButton
          className="geul-formatting-toolbar__mark-button"
          data-be-color-trigger=""
          icon={backgroundColorIcon}
          key="background-color"
          label="Background color"
          onClick={(event) => handleColorTriggerClick("background", event)}
        />
      </div>
      {colorMenuState !== null && (
        <div
          aria-label={colorMenuPropertyLabel[colorMenuState.property]}
          className="geul-menu-panel"
          data-be-color-menu=""
          ref={colorMenuRef}
          role="menu"
          style={colorMenuStyle}
        >
          <p className={colorMenuSectionLabelClassName}>
            {colorMenuPropertyLabel[colorMenuState.property]}
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
};
