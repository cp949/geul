import type { EditorController } from "@cp949/geul-core";
import {
  Baseline,
  Bold,
  Code,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListChecks,
  ListCollapse,
  ListOrdered,
  PaintBucket,
  Quote,
  SquareCode,
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
  BLOCK_TYPE_OPTIONS,
  blockTypeText,
  blockTypeToOptionId,
  getBlockTypeOptionsForSource,
} from "./block-type-options.js";
import {
  computeFormattingToolbarState,
  type FormattingToolbarState,
} from "./formatting-toolbar-state.js";
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
import { useSelectionRefresh } from "./use-selection-refresh.js";

// FormattingToolbar(formatting-toolbar.tsx)와 같은 정의다 — 버튼 세트가
// 동일하다는 RD-001 결정 그대로다. 모듈 상수로 두는 이유도 같다(재렌더 시
// 아이콘 참조 안정, 스크롤·selectionchange·keyup마다 재렌더되는 툴바에서
// subtree 재렌더 비용을 없앤다).
const toolbarButtons: ReadonlyArray<{
  mark: FormattingToolbarState["activeMarks"][number];
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

const indentIcon = <IndentIncrease {...iconProps} />;
const outdentIcon = <IndentDecrease {...iconProps} />;
const textColorIcon = <Baseline {...iconProps} />;
const backgroundColorIcon = <PaintBucket {...iconProps} />;

// 블록 타입 select를 Text/Heading 1~6로만 줄인다(일반적인 에디터 관례 —
// Quote·Code·목록 4종은 아래 BLOCK_TYPE_ICON_OPTIONS로 뺀다). paragraph와
// heading은 getBlockTypeOptionsForSource의 어떤 source 필터에도 제외되지
// 않으므로(block-type-options.ts 참고 — codeBlock source는 목록만, 목록
// source는 code만 제외) source와 무관한 고정 목록으로 둬도 안전하다.
const TEXT_STYLE_OPTION_IDS = new Set<string>([
  "paragraph",
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "heading-5",
  "heading-6",
]);

const TEXT_STYLE_OPTIONS = BLOCK_TYPE_OPTIONS.filter((option) =>
  TEXT_STYLE_OPTION_IDS.has(option.id),
);

// select 밖으로 뺀 나머지 6개 — BLOCK_TYPE_OPTIONS 선언 순서를 그대로
// 유지해 "Turn into" 메뉴(block-side-menu-menu.tsx)와 순서가 어긋나지
// 않는다.
const BLOCK_TYPE_ICON_OPTIONS = BLOCK_TYPE_OPTIONS.filter(
  (option) => !TEXT_STYLE_OPTION_IDS.has(option.id),
);

type BlockTypeIconId =
  | "quote"
  | "code"
  | "bullet-list"
  | "numbered-list"
  | "check-list"
  | "toggle-list";

// BLOCK_TYPE_ICON_OPTIONS는 위 필터로 항상 이 6개 id로만 구성됨이 보장된다
// — block-type-options.ts의 blockTypeText cast와 같은 근거의 단일 cast다.
const BLOCK_TYPE_ICONS: Record<BlockTypeIconId, ReactElement> = {
  quote: <Quote {...iconProps} />,
  code: <SquareCode {...iconProps} />,
  "bullet-list": <List {...iconProps} />,
  "numbered-list": <ListOrdered {...iconProps} />,
  "check-list": <ListChecks {...iconProps} />,
  "toggle-list": <ListCollapse {...iconProps} />,
};

const colorMenuSectionLabelClassName = "geul-menu-section-label";
const colorMenuSwatchClassName = "geul-menu-swatch";

// formatting-toolbar.tsx의 COLOR_MENU_DISMISS_ALLOW_SELECTORS와 같은 이유
// (트리거 재클릭이 "바깥 클릭"으로 먼저 안 닫히게).
const COLOR_MENU_DISMISS_ALLOW_SELECTORS = [
  "[data-geul-color-menu]",
  "[data-geul-color-trigger]",
] as const;

type ColorMenuState = {
  property: "text" | "background";
  left: number;
  top: number;
};

/**
 * formatting-toolbar.tsx의 restoreEditorSelection과 동일 — WebKit에서
 * 키보드로 활성화한 button click이 편집기의 DOM selection을 잃을 수 있어
 * 마지막으로 관측한 Range를 되돌린다. StaticToolbar는 hide되지 않으므로
 * "마지막 관측 Range"는 한 번 캡처한 값이 아니라 매 refresh tick마다
 * 갱신되는 값이다(아래 updateFromSelection).
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
 * `portalTarget`/`component`는 FormattingToolbar 등 기존 공개 툴바와 동일한
 * override 관례다(`EXT-007`/`UI-013`). `className`은 StaticToolbar 전용
 * 추가분 — geul이 위치 CSS를 강제하지 않으므로(RD-001 "결정") 소비자가
 * `position: sticky` 등을 직접 붙일 훅으로 제공한다. `| undefined`를 명시하는
 * 이유: `exactOptionalPropertyTypes`(tsconfig.base.json) 아래서 CSS Modules
 * import(`noUncheckedIndexedAccess`가 인덱스 시그니처 접근에 `| undefined`를
 * 얹음)를 그대로 넘기는 흔한 소비자 패턴을 받으려면 옵션 생략과 명시적
 * `undefined` 전달을 둘 다 허용해야 한다(showcase 15-static-toolbar 실측,
 * RD-001-DELTA-04).
 */
export type StaticToolbarProps = {
  className?: string | undefined;
  portalTarget?: HTMLElement | null;
  component?: FC<{ editor: EditorController }>;
};

/**
 * 선택 트리거 없이 항상 렌더되는 옵트인 툴바(RD-001-DELTA-03, Issue #184).
 * FormattingToolbar와 커맨드 세트는 같지만 표시 정책이 다르다 — 미디어
 * 블록·표 셀 다중선택·codeBlock에서 FormattingToolbar는 툴바 전체를
 * 숨기거나(미디어·셀) mark 버튼만 뺀다(codeBlock). StaticToolbar는 항상
 * 렌더되므로 세 경우 전부 해당 버튼을 disable로 표시한다 — 숨기지 않는다.
 */
export const StaticToolbar = ({
  className,
  portalTarget = null,
  component: Component,
}: StaticToolbarProps = {}) => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const [state, setState] = useState<FormattingToolbarState>(() =>
    computeFormattingToolbarState(editor),
  );
  const [colorMenuState, setColorMenuState] = useState<ColorMenuState | null>(
    null,
  );
  const trackedRange = useRef<Range | null>(null);
  const focusEditor = useFocusEditor(element);

  const updateFromSelection = useCallback(() => {
    setState(computeFormattingToolbarState(editor));

    // 아래는 오직 WebKit 키보드 클릭 방어용 trackedRange 갱신이다 — 선택이
    // 에디터 밖에 있으면(포커스 이동 등) 갱신하지 않고 마지막 값을 유지한다.
    // 툴바 자체의 표시 여부와는 무관하다(상시 렌더).
    const selection = element?.ownerDocument.getSelection();
    if (
      element === null ||
      selection === undefined ||
      selection === null ||
      selection.rangeCount === 0 ||
      selection.anchorNode === null ||
      selection.focusNode === null ||
      !element.contains(selection.anchorNode) ||
      !element.contains(selection.focusNode)
    ) {
      return;
    }
    trackedRange.current = selection.getRangeAt(0).cloneRange();
  }, [editor, element]);

  useSelectionRefresh({ element, onUpdate: updateFromSelection });

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

  const containerClassName =
    className === undefined
      ? "geul-static-toolbar"
      : `geul-static-toolbar ${className}`;

  // codeBlock·미디어 블록·표 셀 다중선택 전부 mark·색상 버튼이 적용
  // 불가능한 상황이다(FormattingToolbar는 이 셋을 hide로 처리 — 위 컴포넌트
  // 주석 참고). StaticToolbar는 disable로만 표시한다.
  const isCodeBlockSelection =
    state.blockSelection?.blockType.type === "codeBlock";
  const isMarkingDisabled =
    isCodeBlockSelection ||
    state.isMediaBlockSelected ||
    state.isCellRangeSelected;

  if (Component !== undefined) {
    const overridden = (
      <div
        aria-label={dictionary.toolbar.static.ariaLabel}
        className={containerClassName}
        role="toolbar"
      >
        <Component editor={editor} />
      </div>
    );
    return portalTarget === null
      ? overridden
      : createPortal(overridden, portalTarget);
  }

  // select와 블록 타입 아이콘 버튼이 공유하는 파생값 — 둘 다 state.blockSelection
  // 하나에서 나오므로 여기서 한 번만 계산한다(중복 계산 방지, 아래 두
  // 렌더 지점의 aria-pressed/aria-disabled/select value가 항상 일치).
  const activeBlockTypeId =
    state.blockSelection === null
      ? null
      : blockTypeToOptionId(state.blockSelection.blockType);
  const allowedBlockTypeIds =
    state.blockSelection === null
      ? null
      : new Set(
          getBlockTypeOptionsForSource(state.blockSelection.blockType).map(
            (option) => option.id,
          ),
        );

  const content = (
    <>
      <div
        aria-label={dictionary.toolbar.static.ariaLabel}
        className={containerClassName}
        role="toolbar"
      >
        {state.blockSelection !== null && (
          <select
            aria-label="Block type"
            className="geul-formatting-toolbar__select"
            onChange={(event) => {
              const blockSelection = state.blockSelection;
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
              setState(computeFormattingToolbarState(editor));
            }}
            // 현재 블록 타입이 Quote·Code·목록 등 select 밖으로 뺀
            // 타입이면(activeBlockTypeId가 TEXT_STYLE_OPTION_IDS 밖) "Text"
            // 등 잘못된 값을 보여주지 않고 빈 값으로 둔다 — 아래 숨김
            // placeholder <option>이 그 값을 받아준다.
            value={
              activeBlockTypeId !== null &&
              TEXT_STYLE_OPTION_IDS.has(activeBlockTypeId)
                ? activeBlockTypeId
                : ""
            }
          >
            {activeBlockTypeId !== null &&
              !TEXT_STYLE_OPTION_IDS.has(activeBlockTypeId) && (
                <option hidden value="" />
              )}
            {TEXT_STYLE_OPTIONS
              // enabledBlockTypes(mode: "deny")로 끈 타입을 목록에서 숨긴다
              // (Issue #190) — 선례: formatting-toolbar.tsx(RD-001-DELTA-01).
              .filter((option) =>
                editor.isBlockTypeEnabled(option.blockType.type),
              )
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {blockTypeText(dictionary, option.id).label}
                </option>
              ))}
          </select>
        )}
        {state.blockSelection !== null && (
          <>
            {BLOCK_TYPE_ICON_OPTIONS.filter((option) =>
              editor.isBlockTypeEnabled(option.blockType.type),
            ).map((option) => (
              <IconButton
                aria-disabled={
                  allowedBlockTypeIds?.has(option.id) === true
                    ? "false"
                    : "true"
                }
                aria-pressed={activeBlockTypeId === option.id}
                className="geul-formatting-toolbar__mark-button"
                icon={BLOCK_TYPE_ICONS[option.id as BlockTypeIconId]}
                key={option.id}
                label={blockTypeText(dictionary, option.id).label}
                onClick={() => {
                  const blockSelection = state.blockSelection;
                  if (blockSelection === null) return;
                  if (allowedBlockTypeIds?.has(option.id) !== true) return;
                  editor.commands.setBlockType(
                    blockSelection.blockId,
                    option.blockType,
                  );
                  setState(computeFormattingToolbarState(editor));
                }}
              />
            ))}
          </>
        )}
        {state.blockSelection !== null && (
          <>
            <IconButton
              aria-disabled={
                state.nestingActions?.canIndent === true ? "false" : "true"
              }
              className="geul-formatting-toolbar__mark-button"
              icon={indentIcon}
              key="indent"
              label="Indent"
              onClick={() => {
                const blockSelection = state.blockSelection;
                if (blockSelection === null) return;
                if (state.nestingActions?.canIndent !== true) return;
                editor.commands.indentBlock(blockSelection.blockId);
                setState(computeFormattingToolbarState(editor));
              }}
              title={
                state.nestingActions?.canIndent === true
                  ? undefined
                  : dictionary.nesting.indentDisabledReason
              }
            />
            <IconButton
              aria-disabled={
                state.nestingActions?.canOutdent === true ? "false" : "true"
              }
              className="geul-formatting-toolbar__mark-button"
              icon={outdentIcon}
              key="outdent"
              label="Outdent"
              onClick={() => {
                const blockSelection = state.blockSelection;
                if (blockSelection === null) return;
                if (state.nestingActions?.canOutdent !== true) return;
                editor.commands.outdentBlock(blockSelection.blockId);
                setState(computeFormattingToolbarState(editor));
              }}
              title={
                state.nestingActions?.canOutdent === true
                  ? undefined
                  : dictionary.nesting.outdentDisabledReason
              }
            />
          </>
        )}
        {toolbarButtons.map(({ mark, label, icon, toggle }) => (
          <IconButton
            aria-disabled={isMarkingDisabled ? "true" : "false"}
            aria-pressed={state.activeMarks.includes(mark)}
            className="geul-formatting-toolbar__mark-button"
            icon={icon}
            key={mark}
            label={label}
            onClick={(event) => {
              if (isMarkingDisabled) return;
              if (event.detail === 0) {
                restoreEditorSelection(element, trackedRange.current);
              }
              toggle(editor);
              setState(computeFormattingToolbarState(editor));
            }}
          />
        ))}
        <IconButton
          aria-disabled={isMarkingDisabled ? "true" : "false"}
          className="geul-formatting-toolbar__mark-button"
          data-geul-color-trigger=""
          icon={textColorIcon}
          key="text-color"
          label={dictionary.color.textLabel}
          onClick={(event) => {
            if (isMarkingDisabled) return;
            handleColorTriggerClick("text", event);
          }}
        />
        <IconButton
          aria-disabled={isMarkingDisabled ? "true" : "false"}
          className="geul-formatting-toolbar__mark-button"
          data-geul-color-trigger=""
          icon={backgroundColorIcon}
          key="background-color"
          label={dictionary.color.backgroundLabel}
          onClick={(event) => {
            if (isMarkingDisabled) return;
            handleColorTriggerClick("background", event);
          }}
        />
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
