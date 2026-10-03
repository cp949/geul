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
import { readAnchorBelowTrigger } from "./fixed-placement.js";
import {
  computeFormattingToolbarState,
  type FormattingToolbarState,
} from "./formatting-toolbar-state.js";
import { IconButton, preserveFocusOnMouseDown } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { handleMenuKeyDown } from "./menu-keyboard.js";
import {
  BLOCK_TYPE_MENU_SELECTOR,
  StaticToolbarBlockTypeMenu,
} from "./static-toolbar-block-type-menu.js";
import {
  COLOR_MENU_SELECTOR,
  type ColorMenuProperty,
  StaticToolbarColorMenu,
} from "./static-toolbar-color-menu.js";
import { useStaticToolbarState } from "./static-toolbar-state.js";
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

type ColorMenuState = {
  property: ColorMenuProperty;
  // 클릭된 트리거 버튼. 메뉴 좌표는 rect를 보관하지 않고 이 요소에서 매번 읽는다
  // (Issue #234).
  trigger: HTMLButtonElement;
  // 키보드로 연 메뉴만 첫 스와치로 포커스를 옮긴다(Issue #224).
  focusFirst: boolean;
};

type BlockTypeMenuState = {
  // 클릭된 트리거 버튼. 메뉴 좌표는 rect를 보관하지 않고 이 요소에서 매번 읽는다
  // (Issue #234).
  trigger: HTMLButtonElement;
  // 키보드로 연 메뉴만 옵션으로 포커스를 옮긴다(RD-003 결정).
  focusSelected: boolean;
};

/**
 * 툴바 컨테이너 자신을 누른 mousedown의 기본 동작을 막는다(Issue #222).
 * - 빈 영역이나 컨트롤 사이 틈을 눌러도 편집기 포커스와 selection이 남는다
 *   (G-UI-001).
 * - 자식이 target이면 건드리지 않는다. `component` override 안의 입력
 *   요소는 그대로 포커스를 받는다.
 */
const preserveFocusOnToolbarMouseDown = (
  event: ReactMouseEvent<HTMLDivElement>,
) => {
  if (event.target === event.currentTarget) event.preventDefault();
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
  const { state } = useStaticToolbarState(editor);
  // 블록 컨트롤(트리거, 아이콘 버튼 7종, Indent/Outdent)은 항상 렌더하고
  // 대상 블록이 없으면 disable로 표시한다. 세 군데의 표시와 가드가 이 값
  // 하나를 공유한다.
  const isBlockControlsDisabled = state.blockSelection === null;
  // codeBlock·미디어 블록·표 셀 다중선택 전부 mark·색상 버튼이 적용
  // 불가능한 상황이다(FormattingToolbar는 이 셋을 hide로 처리 — 위 컴포넌트
  // 주석 참고). StaticToolbar는 disable로만 표시한다. 열린 색상 메뉴를 닫는
  // layout effect가 읽으므로 `Component` early return 앞에서 계산한다(hook 순서).
  const isCodeBlockSelection =
    state.blockSelection?.blockType.type === "codeBlock";
  const isMarkingDisabled =
    isCodeBlockSelection ||
    state.isMediaBlockSelected ||
    state.isCellRangeSelected;
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

  // 메뉴가 닫히거나 바뀔 때, 또는 메뉴를 자동으로 닫을 때 초점이 `selector`가
  // 가리키는 메뉴 안에 있었으면 편집기로 돌린다. 트리거·툴바 버튼의
  // mousedown은 `preventDefault`라 초점이 메뉴 항목에 남는다. 그대로
  // 언마운트하면 초점이 `<body>`로 떨어진다(G-UI-001 자동 닫힘). 초점이 메뉴
  // 밖이면 건드리지 않는다. 블록 타입 메뉴와 색상 메뉴가 공유한다.
  const focusEditorIfFocusIn = useCallback(
    (selector: string) => {
      const activeElement = element?.ownerDocument.activeElement ?? null;
      if (
        activeElement instanceof Element &&
        activeElement.closest(selector) !== null
      ) {
        focusEditor();
      }
    },
    [element, focusEditor],
  );

  // 메뉴가 열린 채 대상 블록이 사라지면 상태까지 비운다. 렌더 조건만 막으면
  // 대상이 돌아왔을 때 닫힌 메뉴가 되살아난다. 초점이 메뉴 안에 있었으면
  // 편집기로 돌린다(G-UI-001 자동 닫힘). 메뉴를 렌더에서 먼저 빼면 초점이
  // `<body>`로 떨어진 뒤라 판정할 수 없으므로, 메뉴는 이 effect가 닫을 때까지
  // 그대로 렌더한다. layout effect라 그려지기 전에 닫힌다.
  useLayoutEffect(() => {
    if (!isBlockControlsDisabled) return;
    focusEditorIfFocusIn(BLOCK_TYPE_MENU_SELECTOR);
    setBlockTypeMenuState(null);
  }, [focusEditorIfFocusIn, isBlockControlsDisabled]);

  // 색상 메뉴가 열린 채 mark 적용이 불가능해지면(코드 블록·미디어 블록·표 셀
  // 범위) 상태까지 비운다. 위 effect와 같은 이유로 렌더 조건만 막지 않고
  // effect가 닫는다. 초점이 스와치에 있었으면 편집기로 돌린다(Issue #225).
  useLayoutEffect(() => {
    if (!isMarkingDisabled) return;
    focusEditorIfFocusIn(COLOR_MENU_SELECTOR);
    setColorMenuState(null);
  }, [focusEditorIfFocusIn, isMarkingDisabled]);

  // 바깥 클릭·Escape 닫힘은 메뉴 안의 `useDismissibleOverlay`가 소유한다.
  // 이 둘은 상호배제(`useExclusiveOverlay`)가 한쪽 메뉴를 닫을 때만 쓴다.
  const dismissColorMenu = useCallback(() => {
    focusEditorIfFocusIn(COLOR_MENU_SELECTOR);
    setColorMenuState(null);
  }, [focusEditorIfFocusIn]);
  const dismissBlockTypeMenu = useCallback(() => {
    focusEditorIfFocusIn(BLOCK_TYPE_MENU_SELECTOR);
    setBlockTypeMenuState(null);
  }, [focusEditorIfFocusIn]);
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
  // Tab은 편집기가 아니라 해당 속성의 트리거로 돌아간다. 블록 타입 메뉴와
  // 같다.
  const closeColorMenuToTrigger = useCallback((property: ColorMenuProperty) => {
    setColorMenuState(null);
    toolbarRef.current
      ?.querySelector<HTMLElement>(`[data-geul-color-trigger="${property}"]`)
      ?.focus({ preventScroll: true });
  }, []);

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

  const openColorMenu = (
    property: ColorMenuProperty,
    trigger: HTMLButtonElement,
    focusFirst: boolean,
  ) => {
    focusEditorIfFocusIn(COLOR_MENU_SELECTOR);
    overlay.open("color");
    setColorMenuState({ property, trigger, focusFirst });
  };

  // `event.detail === 0`이면 키보드 활성화(Enter·Space)다. 마우스로 열면
  // 편집기 포커스를 유지하고, 키보드로 열면 화살표 이동을 위해 메뉴 안으로
  // 포커스를 옮긴다.
  const handleColorTriggerClick = (
    property: ColorMenuProperty,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (colorMenuState !== null && colorMenuState.property === property) {
      closeColorMenu();
      return;
    }
    openColorMenu(property, event.currentTarget, event.detail === 0);
  };

  // 같은 속성의 메뉴가 이미 열려 있으면 키만 소비한다. Enter 반복·수식 키·
  // `preventDefault`의 순서는 handleMenuKeyDown이 소유한다(G-UI-001).
  // 메뉴가 닫혀 있을 때의 Enter는 메뉴를 여는 일반 활성화다. 억제를 걸면 뒤이은
  // 편집기의 Enter 반복이 삼켜지므로 module을 거치지 않는다(Issue #228).
  const handleColorTriggerKeyDown = (
    property: ColorMenuProperty,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    const isOpen = colorMenuState?.property === property;
    if (event.key === "Enter" && !isOpen) return;
    const trigger = event.currentTarget;
    handleMenuKeyDown(event, {
      navigate: (key) => {
        if (key !== "ArrowDown" && key !== "ArrowUp") return false;
        if (!isOpen) openColorMenu(property, trigger, true);
        return true;
      },
    });
  };

  const openBlockTypeMenu = (
    trigger: HTMLButtonElement,
    focusSelected: boolean,
  ) => {
    overlay.open("blockType");
    setBlockTypeMenuState({ trigger, focusSelected });
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

  // Enter 반복·수식 키·`preventDefault`의 순서는 handleMenuKeyDown이 소유한다
  // (Issue #225, #228, #230). 블록 컨트롤이 비활성이면 화살표를 처리하지 않는다.
  // 메뉴가 닫혀 있을 때의 Enter는 메뉴를 여는 일반 활성화다. 억제를 걸면 뒤이은
  // 편집기의 Enter 반복이 삼켜지므로 module을 거치지 않는다.
  const handleBlockTypeTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "Enter" && blockTypeMenuState === null) return;
    const trigger = event.currentTarget;
    handleMenuKeyDown(event, {
      navigate: (key) => {
        if (isBlockControlsDisabled) return false;
        if (key !== "ArrowDown" && key !== "ArrowUp") return false;
        if (blockTypeMenuState === null) openBlockTypeMenu(trigger, true);
        return true;
      },
    });
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

  // 키보드 활성화에서도 DOM selection을 다시 쓰지 않는다. 명령은 편집기
  // 상태의 selection을 읽는다(Issue #224).
  // 메뉴를 닫고 편집기로 포커스를 돌린 뒤 명령을 부른다. 포커스가 스와치에
  // 있는 채로 명령을 부르면 DOM 갱신이 DOM selection을 접고, 뒤이은
  // 포커스 복귀가 그 접힌 selection을 편집기 상태로 읽어 범위가 사라진다
  // (Chromium 실측). 포커스가 편집기에 있으면 ProseMirror가 명령 뒤에
  // 상태의 selection을 DOM에 다시 쓴다.
  const applyInlineColor = (
    property: ColorMenuProperty,
    color: string | null,
  ) => {
    closeColorMenu();
    if (property === "text") {
      toggleCaretFirst(editor.commands.toggleCaretTextColor(color), () =>
        editor.commands.toggleInlineTextColor(color),
      );
    } else {
      toggleCaretFirst(editor.commands.toggleCaretBackgroundColor(color), () =>
        editor.commands.toggleInlineBackgroundColor(color),
      );
    }
  };

  const colorPropertyLabel = (property: ColorMenuProperty) =>
    property === "text"
      ? dictionary.color.textLabel
      : dictionary.color.backgroundLabel;

  const containerClassName =
    className === undefined
      ? "geul-static-toolbar"
      : `geul-static-toolbar ${className}`;

  if (Component !== undefined) {
    const overridden = (
      <div
        aria-label={dictionary.toolbar.static.ariaLabel}
        className={containerClassName}
        onMouseDown={preserveFocusOnToolbarMouseDown}
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
  // mark·색상 버튼의 비활성 사유(Issue #220). 활성이면 undefined를 넘겨
  // IconButton이 title을 label로 폴백하게 한다(G-UI-004).
  const markingDisabledReason = isMarkingDisabled
    ? dictionary.toolbar.static.markingDisabledReason
    : undefined;

  // 컨트롤(기본 17개)의 `tabIndex`를 JSX 순서대로 매긴다. 컨트롤 수는
  // `enabledBlockTypes`에 따라 줄 수 있지만 selection에 따라 바뀌지 않으므로
  // 인덱스가 안정적이다(RD-003-DELTA-02).
  let controlOrder = 0;
  const rovingTabIndex = () => (controlOrder++ === rovingIndex ? 0 : -1);

  const content = (
    <>
      <div
        aria-label={dictionary.toolbar.static.ariaLabel}
        className={containerClassName}
        onFocus={handleToolbarFocus}
        onKeyDown={handleToolbarKeyDown}
        onMouseDown={preserveFocusOnToolbarMouseDown}
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
            title={
              isBlockControlsDisabled
                ? blockControlsDisabledReason
                : allowedBlockTypeIds?.has(option.id) !== true
                  ? dictionary.toolbar.static.blockTypeDisabledReason
                  : undefined
            }
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
            onClick={() => {
              if (isMarkingDisabled) return;
              // 키보드 활성화에서도 DOM selection을 다시 쓰지 않는다.
              // 명령은 편집기 상태의 selection을 읽는다. 포커스는 버튼에
              // 남는다(Issue #222).
              toggle(editor);
            }}
            tabIndex={rovingTabIndex()}
            title={markingDisabledReason}
          />
        ))}
        <IconButton
          aria-disabled={isMarkingDisabled ? "true" : "false"}
          aria-expanded={colorMenuState?.property === "text"}
          aria-haspopup="menu"
          className={buttonClassName}
          data-geul-color-trigger="text"
          icon={textColorIcon}
          key="text-color"
          label={dictionary.color.textLabel}
          onClick={(event) => {
            if (isMarkingDisabled) return;
            handleColorTriggerClick("text", event);
          }}
          onKeyDown={(event) => {
            if (isMarkingDisabled) return;
            handleColorTriggerKeyDown("text", event);
          }}
          tabIndex={rovingTabIndex()}
          title={markingDisabledReason}
        />
        <IconButton
          aria-disabled={isMarkingDisabled ? "true" : "false"}
          aria-expanded={colorMenuState?.property === "background"}
          aria-haspopup="menu"
          className={buttonClassName}
          data-geul-color-trigger="background"
          icon={backgroundColorIcon}
          key="background-color"
          label={dictionary.color.backgroundLabel}
          onClick={(event) => {
            if (isMarkingDisabled) return;
            handleColorTriggerClick("background", event);
          }}
          onKeyDown={(event) => {
            if (isMarkingDisabled) return;
            handleColorTriggerKeyDown("background", event);
          }}
          tabIndex={rovingTabIndex()}
          title={markingDisabledReason}
        />
      </div>
      {blockTypeMenuState !== null && (
        <StaticToolbarBlockTypeMenu
          activeOptionId={activeBlockTypeId}
          element={element}
          focusSelected={blockTypeMenuState.focusSelected}
          label={dictionary.toolbar.static.blockTypeAriaLabel}
          onConfirm={confirmBlockType}
          onClose={() => setBlockTypeMenuState(null)}
          onTabDismiss={closeBlockTypeMenuToTrigger}
          optionLabel={(option) => blockTypeText(dictionary, option.id).label}
          options={blockTypeMenuOptions}
          readAnchor={() => readAnchorBelowTrigger(blockTypeMenuState.trigger)}
        />
      )}
      {colorMenuState !== null && (
        <StaticToolbarColorMenu
          colorName={(color) => dictionary.color.names[color.id]}
          element={element}
          focusFirst={colorMenuState.focusFirst}
          key={colorMenuState.property}
          label={colorPropertyLabel(colorMenuState.property)}
          noneLabel={dictionary.color.none}
          onApply={(color) => applyInlineColor(colorMenuState.property, color)}
          onClose={() => setColorMenuState(null)}
          onTabDismiss={() => closeColorMenuToTrigger(colorMenuState.property)}
          property={colorMenuState.property}
          readAnchor={() => readAnchorBelowTrigger(colorMenuState.trigger)}
        />
      )}
    </>
  );

  return portalTarget === null ? content : createPortal(content, portalTarget);
};
