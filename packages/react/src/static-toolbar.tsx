import type {
  EditorController,
  InlineFormattingCommands,
} from "@cp949/geul-core";
import {
  Baseline,
  Bold,
  ChevronDown,
  Code,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Lightbulb,
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
  type FocusEvent as ReactFocusEvent,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  type BlockTypeOption,
  BLOCK_TYPE_OPTIONS,
  blockTypeText,
  blockTypeToOptionId,
  getBlockTypeOptionsForSource,
} from "./block-type-options.js";
import {
  computeFormattingToolbarState,
  type FormattingToolbarState,
} from "./formatting-toolbar-state.js";
import { IconButton, preserveFocusOnMouseDown } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { MenuItemButton } from "./menu-item-button.js";
import {
  BLOCK_TYPE_MENU_SELECTOR,
  StaticToolbarBlockTypeMenu,
} from "./static-toolbar-block-type-menu.js";
import { useStaticToolbarState } from "./static-toolbar-state.js";
import {
  TABLE_BACKGROUND_COLORS,
  TABLE_TEXT_COLORS,
  type TableCellColor,
} from "./table-cell-colors.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useExclusiveOverlay } from "./use-exclusive-overlay.js";
import { useFocusEditor } from "./use-focus-editor.js";

/**
 * 접힌 캐럿 명령을 먼저 부르고, `COMMAND_NOT_APPLICABLE`이면 기존 선택 영역
 * 명령으로 넘어간다(RD-002 결정).
 * - 이 코드는 범위 선택, `code` 배제, 색 없음 해제를 덮는다.
 * - 기존 명령이 그 경우를 이어받는다.
 * - `CODE_BLOCK_MARK_NOT_ALLOWED`와 `INVALID_COLOR`는 넘기지 않는다. 기존 명령도 같은 이유로 거절한다.
 */
const toggleCaretFirst = (
  caretResult: ReturnType<
    InlineFormattingCommands["commands"]["toggleCaretMark"]
  >,
  selectionCommand: () => unknown,
) => {
  if (!caretResult.ok && caretResult.error.code === "COMMAND_NOT_APPLICABLE") {
    selectionCommand();
  }
};

// FormattingToolbar(formatting-toolbar.tsx)와 같은 정의다 — 버튼 세트가
// 동일하다는 RD-001 결정 그대로다. 모듈 상수로 두는 이유도 같다(재렌더 시
// 아이콘 참조 안정, 스크롤·selectionchange·keyup마다 재렌더되는 툴바에서
// subtree 재렌더 비용을 없앤다).
const toolbarButtons: ReadonlyArray<{
  mark: FormattingToolbarState["activeMarks"][number];
  label: string;
  icon: ReactElement;
  toggle: (editor: InlineFormattingCommands) => void;
}> = [
  {
    mark: "bold",
    label: "Bold",
    icon: <Bold {...iconProps} />,
    toggle: (editor) =>
      toggleCaretFirst(editor.commands.toggleCaretMark("bold"), () =>
        editor.commands.toggleBold(),
      ),
  },
  {
    mark: "italic",
    label: "Italic",
    icon: <Italic {...iconProps} />,
    toggle: (editor) =>
      toggleCaretFirst(editor.commands.toggleCaretMark("italic"), () =>
        editor.commands.toggleItalic(),
      ),
  },
  {
    mark: "underline",
    label: "Underline",
    icon: <Underline {...iconProps} />,
    toggle: (editor) =>
      toggleCaretFirst(editor.commands.toggleCaretMark("underline"), () =>
        editor.commands.toggleUnderline(),
      ),
  },
  {
    mark: "strike",
    label: "Strikethrough",
    icon: <Strikethrough {...iconProps} />,
    toggle: (editor) =>
      toggleCaretFirst(editor.commands.toggleCaretMark("strike"), () =>
        editor.commands.toggleStrike(),
      ),
  },
  {
    mark: "code",
    label: "Inline code",
    icon: <Code {...iconProps} />,
    toggle: (editor) =>
      toggleCaretFirst(editor.commands.toggleCaretMark("code"), () =>
        editor.commands.toggleCode(),
      ),
  },
];

const indentIcon = <IndentIncrease {...iconProps} />;
const outdentIcon = <IndentDecrease {...iconProps} />;
const textColorIcon = <Baseline {...iconProps} />;
const backgroundColorIcon = <PaintBucket {...iconProps} />;

// 블록 타입 메뉴를 Text/Heading 1~6로만 줄인다(일반적인 에디터 관례 —
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

// 블록 타입 메뉴 밖으로 뺀 나머지 7개 — BLOCK_TYPE_OPTIONS 선언 순서를 그대로
// 유지해 "Turn into" 메뉴(block-side-menu-menu.tsx)와 순서가 어긋나지
// 않는다.
const BLOCK_TYPE_ICON_OPTIONS = BLOCK_TYPE_OPTIONS.filter(
  (option) => !TEXT_STYLE_OPTION_IDS.has(option.id),
);

type BlockTypeIconId =
  | "quote"
  | "callout"
  | "code"
  | "bullet-list"
  | "numbered-list"
  | "check-list"
  | "toggle-list";

// BLOCK_TYPE_ICON_OPTIONS는 위 필터로 항상 이 7개 id로만 구성됨이 보장된다
// — block-type-options.ts의 blockTypeText cast와 같은 근거의 단일 cast다.
const BLOCK_TYPE_ICONS: Record<BlockTypeIconId, ReactElement> = {
  quote: <Quote {...iconProps} />,
  // callout 기본 아이콘이 💡라 같은 의미의 Lightbulb를 쓴다.
  callout: <Lightbulb {...iconProps} />,
  code: <SquareCode {...iconProps} />,
  "bullet-list": <List {...iconProps} />,
  "numbered-list": <ListOrdered {...iconProps} />,
  "check-list": <ListChecks {...iconProps} />,
  "toggle-list": <ListCollapse {...iconProps} />,
};

// mark·블록·색상 버튼이 공유하는 클래스. FormattingToolbar의 클래스를
// 빌려 쓰지 않는다(RD-003 조건 11).
const buttonClassName = "geul-static-toolbar__button";

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

type BlockTypeMenuState = {
  left: number;
  top: number;
  // 키보드로 연 메뉴만 옵션으로 포커스를 옮긴다(RD-003 결정).
  focusSelected: boolean;
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
  const { state, trackedRange } = useStaticToolbarState(editor, element);
  // 블록 컨트롤(트리거, 아이콘 버튼 7종, Indent/Outdent)은 항상 렌더하고
  // 대상 블록이 없으면 disable로 표시한다. 세 군데의 표시와 가드가 이 값
  // 하나를 공유한다.
  const isBlockControlsDisabled = state.blockSelection === null;
  const [colorMenuState, setColorMenuState] = useState<ColorMenuState | null>(
    null,
  );
  const [blockTypeMenuState, setBlockTypeMenuState] =
    useState<BlockTypeMenuState | null>(null);
  const blockTypeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  // roving tabindex의 Tab 정지점. 포커스가 간 컨트롤을 따라간다.
  const [rovingIndex, setRovingIndex] = useState(0);
  const focusEditor = useFocusEditor(element);

  // 메뉴가 열린 채 대상 블록이 사라지면 상태까지 비운다. 렌더 조건만 막으면
  // 대상이 돌아왔을 때 닫힌 메뉴가 되살아난다. 초점이 메뉴 안에 있었으면
  // 편집기로 돌린다(G-UI-001 자동 닫힘). 메뉴를 렌더에서 먼저 빼면 초점이
  // `<body>`로 떨어진 뒤라 판정할 수 없으므로, 메뉴는 이 effect가 닫을 때까지
  // 그대로 렌더한다. layout effect라 그려지기 전에 닫힌다.
  useLayoutEffect(() => {
    if (!isBlockControlsDisabled) return;
    const activeElement = element?.ownerDocument.activeElement ?? null;
    const focusWasInMenu =
      activeElement instanceof Element &&
      activeElement.closest(BLOCK_TYPE_MENU_SELECTOR) !== null;
    setBlockTypeMenuState(null);
    if (focusWasInMenu) focusEditor();
  }, [element, focusEditor, isBlockControlsDisabled]);

  const { menuRef: colorMenuRef, style: colorMenuStyle } =
    useClampedMenuPosition(colorMenuState?.left ?? 0, colorMenuState?.top ?? 0);

  const dismissColorMenu = useCallback(() => setColorMenuState(null), []);
  const dismissBlockTypeMenu = useCallback(
    () => setBlockTypeMenuState(null),
    [],
  );
  // 색상 메뉴와 블록 타입 메뉴는 동시에 열리지 않는다. 각 `onClose`는
  // 멱등이라 이미 닫힌 메뉴에 불려도 해롭지 않다.
  const overlay = useExclusiveOverlay({
    color: { onClose: dismissColorMenu },
    blockType: { onClose: dismissBlockTypeMenu },
  });
  const closeBlockTypeMenu = useCallback(() => {
    setBlockTypeMenuState(null);
    focusEditor();
  }, [focusEditor]);
  // Tab은 편집기가 아니라 트리거로 돌아간다. 키보드 사용자가 툴바 안에서
  // 위치를 잃지 않게 한다.
  const closeBlockTypeMenuToTrigger = useCallback(() => {
    setBlockTypeMenuState(null);
    blockTypeTriggerRef.current?.focus({ preventScroll: true });
  }, []);
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

  // 툴바 직계 컨트롤. 메뉴(listbox, 색상)는 툴바 밖 형제라 포함되지 않는다.
  const toolbarControls = () =>
    Array.from(toolbarRef.current?.children ?? []).filter(
      (child): child is HTMLButtonElement => child instanceof HTMLButtonElement,
    );

  // `event.target`은 이벤트가 걸린 요소(div)로 좁혀 추론되므로 비교 대상을
  // `EventTarget`으로 넓혀 받는다.
  const indexOfControl = (controls: HTMLButtonElement[], target: EventTarget) =>
    controls.findIndex((control) => control === target);

  const handleToolbarFocus = (event: ReactFocusEvent<HTMLDivElement>) => {
    const index = indexOfControl(toolbarControls(), event.target);
    if (index >= 0) setRovingIndex(index);
  };

  // 화살표 순환·Home/End 이동과 Escape(spec §5). ArrowUp/ArrowDown은 트리거의
  // 메뉴 열기 핸들러가 소유하므로 건드리지 않는다. 수식 키가 있으면 브라우저·
  // 보조기술 단축키와 겹치지 않도록 물러난다.
  const handleToolbarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    if (event.key === "Escape") {
      focusEditor();
      return;
    }
    const controls = toolbarControls();
    const current = indexOfControl(controls, event.target);
    if (current < 0) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (current + 1) % controls.length;
        break;
      case "ArrowLeft":
        next = (current - 1 + controls.length) % controls.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = controls.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    controls[next]?.focus({ preventScroll: true });
  };

  const handleColorTriggerClick = (
    property: "text" | "background",
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (colorMenuState !== null && colorMenuState.property === property) {
      closeColorMenu();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    overlay.open("color");
    setColorMenuState({ property, left: rect.left, top: rect.bottom + 4 });
  };

  const openBlockTypeMenu = (
    trigger: HTMLButtonElement,
    focusSelected: boolean,
  ) => {
    const rect = trigger.getBoundingClientRect();
    overlay.open("blockType");
    setBlockTypeMenuState({
      left: rect.left,
      top: rect.bottom + 4,
      focusSelected,
    });
  };

  // `event.detail === 0`이면 키보드 활성화(Enter·Space)다. 마우스로 열면
  // 편집기 포커스를 유지하고, 키보드로 열면 화살표 이동을 위해 메뉴 안으로
  // 포커스를 옮긴다.
  const handleBlockTypeTriggerClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (isBlockControlsDisabled) return;
    if (blockTypeMenuState !== null) {
      closeBlockTypeMenu();
      return;
    }
    openBlockTypeMenu(event.currentTarget, event.detail === 0);
  };

  const handleBlockTypeTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (isBlockControlsDisabled) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (blockTypeMenuState === null) {
      openBlockTypeMenu(event.currentTarget, true);
    }
  };

  // 클릭 시점의 현재 블록을 다시 읽는다. 메뉴가 열려 있는 동안 선택이
  // 옮겨 갔을 수 있어 렌더 시점 상태를 믿지 않는다.
  const confirmBlockType = (option: BlockTypeOption) => {
    const { blockSelection } = computeFormattingToolbarState(editor);
    if (blockSelection !== null) {
      const allowed = getBlockTypeOptionsForSource(
        blockSelection.blockType,
      ).find((candidate) => candidate.id === option.id);
      if (allowed !== undefined) {
        editor.commands.setBlockType(blockSelection.blockId, option.blockType);
      }
    }
    closeBlockTypeMenu();
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
      toggleCaretFirst(editor.commands.toggleCaretTextColor(color), () =>
        editor.commands.toggleInlineTextColor(color),
      );
    } else {
      toggleCaretFirst(editor.commands.toggleCaretBackgroundColor(color), () =>
        editor.commands.toggleInlineBackgroundColor(color),
      );
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

  // 블록 타입 트리거·메뉴와 아이콘 버튼이 공유하는 파생값 — 모두
  // state.blockSelection 하나에서 나오므로 여기서 한 번만 계산한다(중복 계산
  // 방지, 렌더 지점의 aria-pressed/aria-disabled/aria-selected가 항상 일치).
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

  // enabledBlockTypes(mode: "deny")로 끈 타입은 목록에서 뺀다(Issue #190,
  // 선례: formatting-toolbar.tsx).
  const blockTypeMenuOptions = TEXT_STYLE_OPTIONS.filter((option) =>
    editor.isBlockTypeEnabled(option.blockType.type),
  );

  const blockControlsDisabledReason = isBlockControlsDisabled
    ? dictionary.toolbar.static.blockControlsDisabledReason
    : undefined;

  // 컨트롤 17개의 `tabIndex`를 JSX 순서대로 매긴다. 컨트롤 수는 selection에
  // 따라 바뀌지 않으므로 인덱스가 안정적이다(RD-003-DELTA-02).
  let controlOrder = 0;
  const rovingTabIndex = () => (controlOrder++ === rovingIndex ? 0 : -1);

  const content = (
    <>
      <div
        aria-label={dictionary.toolbar.static.ariaLabel}
        className={containerClassName}
        onFocus={handleToolbarFocus}
        onKeyDown={handleToolbarKeyDown}
        ref={toolbarRef}
        role="toolbar"
      >
        <button
          aria-disabled={isBlockControlsDisabled ? "true" : "false"}
          aria-expanded={blockTypeMenuState !== null}
          aria-haspopup="listbox"
          aria-label={dictionary.toolbar.static.blockTypeAriaLabel}
          className="geul-static-toolbar__block-type-trigger"
          data-geul-block-type-trigger=""
          onClick={handleBlockTypeTriggerClick}
          onKeyDown={handleBlockTypeTriggerKeyDown}
          onMouseDown={preserveFocusOnMouseDown()}
          ref={blockTypeTriggerRef}
          tabIndex={rovingTabIndex()}
          title={blockControlsDisabledReason}
          type="button"
        >
          {/* 현재 타입이 Text·Heading 밖(Quote 등)이거나 대상이 없으면 잘못된
              값을 보이지 않고 중립 라벨을 보인다. */}
          <span>
            {activeBlockTypeId !== null &&
            TEXT_STYLE_OPTION_IDS.has(activeBlockTypeId)
              ? blockTypeText(dictionary, activeBlockTypeId).label
              : dictionary.toolbar.static.blockTypeNeutralLabel}
          </span>
          <ChevronDown {...iconProps} />
        </button>
        {BLOCK_TYPE_ICON_OPTIONS.filter((option) =>
          editor.isBlockTypeEnabled(option.blockType.type),
        ).map((option) => (
          <IconButton
            aria-disabled={
              !isBlockControlsDisabled &&
              allowedBlockTypeIds?.has(option.id) === true
                ? "false"
                : "true"
            }
            aria-pressed={activeBlockTypeId === option.id}
            className={buttonClassName}
            icon={BLOCK_TYPE_ICONS[option.id as BlockTypeIconId]}
            key={option.id}
            label={blockTypeText(dictionary, option.id).label}
            onClick={() => {
              const { blockSelection } = computeFormattingToolbarState(editor);
              if (blockSelection === null) return;
              if (allowedBlockTypeIds?.has(option.id) !== true) return;
              editor.commands.setBlockType(
                blockSelection.blockId,
                option.blockType,
              );
            }}
            tabIndex={rovingTabIndex()}
            title={blockControlsDisabledReason}
          />
        ))}
        <IconButton
          aria-disabled={
            state.nestingActions?.canIndent === true ? "false" : "true"
          }
          className={buttonClassName}
          icon={indentIcon}
          key="indent"
          label="Indent"
          onClick={() => {
            const { blockSelection, nestingActions } =
              computeFormattingToolbarState(editor);
            if (blockSelection === null) return;
            if (nestingActions?.canIndent !== true) return;
            editor.commands.indentBlock(blockSelection.blockId);
          }}
          tabIndex={rovingTabIndex()}
          title={
            isBlockControlsDisabled
              ? blockControlsDisabledReason
              : state.nestingActions?.canIndent === true
                ? undefined
                : dictionary.nesting.indentDisabledReason
          }
        />
        <IconButton
          aria-disabled={
            state.nestingActions?.canOutdent === true ? "false" : "true"
          }
          className={buttonClassName}
          icon={outdentIcon}
          key="outdent"
          label="Outdent"
          onClick={() => {
            const { blockSelection, nestingActions } =
              computeFormattingToolbarState(editor);
            if (blockSelection === null) return;
            if (nestingActions?.canOutdent !== true) return;
            editor.commands.outdentBlock(blockSelection.blockId);
          }}
          tabIndex={rovingTabIndex()}
          title={
            isBlockControlsDisabled
              ? blockControlsDisabledReason
              : state.nestingActions?.canOutdent === true
                ? undefined
                : dictionary.nesting.outdentDisabledReason
          }
        />
        {toolbarButtons.map(({ mark, label, icon, toggle }) => (
          <IconButton
            aria-disabled={isMarkingDisabled ? "true" : "false"}
            aria-pressed={state.activeMarks.includes(mark)}
            className={buttonClassName}
            icon={icon}
            key={mark}
            label={label}
            onClick={(event) => {
              if (isMarkingDisabled) return;
              if (event.detail === 0) {
                restoreEditorSelection(element, trackedRange.current);
              }
              toggle(editor);
            }}
            tabIndex={rovingTabIndex()}
          />
        ))}
        <IconButton
          aria-disabled={isMarkingDisabled ? "true" : "false"}
          className={buttonClassName}
          data-geul-color-trigger=""
          icon={textColorIcon}
          key="text-color"
          label={dictionary.color.textLabel}
          onClick={(event) => {
            if (isMarkingDisabled) return;
            handleColorTriggerClick("text", event);
          }}
          tabIndex={rovingTabIndex()}
        />
        <IconButton
          aria-disabled={isMarkingDisabled ? "true" : "false"}
          className={buttonClassName}
          data-geul-color-trigger=""
          icon={backgroundColorIcon}
          key="background-color"
          label={dictionary.color.backgroundLabel}
          onClick={(event) => {
            if (isMarkingDisabled) return;
            handleColorTriggerClick("background", event);
          }}
          tabIndex={rovingTabIndex()}
        />
      </div>
      {blockTypeMenuState !== null && (
        <StaticToolbarBlockTypeMenu
          activeOptionId={activeBlockTypeId}
          element={element}
          focusSelected={blockTypeMenuState.focusSelected}
          label={dictionary.toolbar.static.blockTypeAriaLabel}
          left={blockTypeMenuState.left}
          onConfirm={confirmBlockType}
          onEscapeDismiss={closeBlockTypeMenu}
          onOutsideDismiss={dismissBlockTypeMenu}
          onTabDismiss={closeBlockTypeMenuToTrigger}
          optionLabel={(option) => blockTypeText(dictionary, option.id).label}
          options={blockTypeMenuOptions}
          top={blockTypeMenuState.top}
        />
      )}
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
