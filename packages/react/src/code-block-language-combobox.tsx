import type { CodeBlock } from "@cp949/geul-core";
import { Check, Copy, MoreHorizontal, WrapText } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  type CodeBlockLanguageOption,
  useCodeBlockLanguages,
} from "./code-block-language-option.js";
import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { MenuItemButton } from "./menu-item-button.js";
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
import { useMirroredState } from "./use-mirrored-state.js";
import { usePointerHoverTarget } from "./use-pointer-hover-target.js";
import { useSelectionRefresh } from "./use-selection-refresh.js";
import { useTableCommandFeedback } from "./use-table-command-feedback.js";

// spec §6(BLK-017), RD-002-DELTA-02(Issue #162) — `codeBlockLanguages`
// 미지정 시(`useCodeBlockLanguages()` === undefined) 쓰는 기본 12개.
// `id`가 commit되는 실제 language 값을 겸한다(공개
// `CodeBlockLanguageOption`과 동일 shape — 과거 내부 `language` 필드는
// 모든 항목에서 `id`와 항상 같은 값이었다).
const DEFAULT_LANGUAGE_OPTIONS: readonly CodeBlockLanguageOption[] = [
  { id: "text", label: "Plain Text", aliases: ["plain text", "none"] },
  { id: "javascript", label: "JavaScript", aliases: ["js"] },
  { id: "typescript", label: "TypeScript", aliases: ["ts"] },
  { id: "html", label: "HTML", aliases: [] },
  { id: "css", label: "CSS", aliases: [] },
  { id: "json", label: "JSON", aliases: [] },
  { id: "bash", label: "Bash", aliases: ["sh", "shell"] },
  { id: "python", label: "Python", aliases: ["py"] },
  { id: "java", label: "Java", aliases: [] },
  { id: "kotlin", label: "Kotlin", aliases: [] },
  { id: "sql", label: "SQL", aliases: [] },
  { id: "markdown", label: "Markdown", aliases: ["md"] },
];

// outer toolbar(언어 trigger + 복사 + 더보기), 언어 팝오버, 더보기 메뉴
// 셋 다 여기 포함한다 — 바깥 pointerdown 판정이나 hover 추적이
// `.closest()`로 이 중 아무 셀렉터에나 걸리면 "바깥"으로 보지 않는다.
// `.geul-code-block-language-trigger`/`.geul-code-block-toolbar__more-
// -trigger`는 toolbar 안에 항상 nest돼 별도로 나열할 필요가 없다
// (media-toolbar.tsx가 `.geul-media-toolbar` 하나로 내부 버튼 전부를
// 커버하는 것과 같은 이유). toolbar를 빼먹으면 팝오버가 열린 상태에서
// 트리거를 다시 클릭할 때 pointerdown이 먼저 "바깥 클릭"으로 처리돼
// 버리고, 뒤이은 click의 토글 로직과 경합한다. usePointerHoverTarget의
// ignoreSelectors로도 재사용한다 — 포인터가 이 오버레이들 위에 있을 때
// hover 후보 판정 자체를 건너뛰어(block-side-menu.tsx
// BLOCK_HOVER_IGNORE_SELECTORS와 동일 이유) 버튼으로 이동하는 순간 hover가
// 풀리는 걸 막는다.
const CODE_BLOCK_TOOLBAR_ALLOW_SELECTORS = [
  ".geul-code-block-toolbar",
  ".geul-code-block-language-popover",
  ".geul-code-block-toolbar__more-menu",
] as const;

const codeBlockToolbarButtonClassName = "geul-code-block-toolbar__button";
const codeBlockToolbarMoreMenuItemClassName =
  "geul-code-block-toolbar__more-menu-item";
// RD-001-DELTA-02(Issue #193) — 복사 버튼 기본 아이콘과 복사 성공 2초간의
// 대체 아이콘. 더보기(⋯) 트리거 아이콘도 매 렌더 새 ReactElement를 만들지
// 않도록 top-level에서 한 번만 만든다(media-toolbar.tsx deleteIcon과 같은
// 이유).
const copyIcon = <Copy {...iconProps} />;
const copiedIcon = <Check {...iconProps} />;
const moreIcon = <MoreHorizontal {...iconProps} />;
// RD-001-DELTA-02(Issue #194) — wrap on/off 토글 버튼 아이콘. copyIcon 등과
// 같은 이유로 top-level에서 한 번만 만든다.
const wrapIcon = <WrapText {...iconProps} />;
// 복사 성공 title이 몇 ms 유지되는지(RD-001.md "결정" — 짧은 시각 피드백).
const COPIED_FEEDBACK_MS = 2000;

type LanguageState = {
  blockId: string;
  committed: string;
  // RD-001-DELTA-02(Issue #194) — wrap 토글 버튼의 aria-pressed 소스.
  // committed(language)와 같은 자리에 둔다 — 둘 다 "현재 active
  // CodeBlock의 committed 문서 상태"라 별도 state로 쪼개면 두 값이
  // 서로 다른 시점을 가리킬 위험이 생긴다.
  wrap: boolean;
};

type AnchorPosition = { left: number; top: number };

const ZERO_ANCHOR: AnchorPosition = { left: 0, top: 0 };

/** CodeBlock language 편집에 필요한 상태·명령·dismiss 동작을 한곳에 소유한다. */
export const CodeBlockLanguageCombobox = () => {
  const editor = useEditor();
  const dictionary = useDictionary();
  const { element } = useEditorMount();
  const focusEditor = useFocusEditor(element);
  const [languageState, setLanguageState] = useState<LanguageState | null>(
    null,
  );
  // open/moreMenuOpen 둘 다 ref를 함께 갖는다 — updateFromSelection의 가드
  // (아래)가 이 값을 읽는데, setState 직후 같은 핸들러 안에서 곧바로 다시
  // 읽으면(예: cancel()) state는 아직 이전 렌더 값이라 stale closure가
  // 된다. ref는 setter 호출과 동시에 동기로 갱신되므로 이 문제가 없다
  // (use-mirrored-state.ts 문서 주석 — block-side-menu.tsx, table-handles.tsx
  // 와 같은 이유).
  const [open, openRef, updateOpen] = useMirroredState(false);
  const [moreMenuOpen, moreMenuOpenRef, updateMoreMenuOpen] =
    useMirroredState(false);
  const [search, setSearch] = useState("");
  const [anchor, setAnchor] = useState<AnchorPosition>(ZERO_ANCHOR);
  // spec §6(BLK-017), RD-002-DELTA-02(Issue #162) — 지정하면 완전
  // 교체(enabledBlockTypes와 동일 패턴), 안 하면 기본 12개.
  const configuredLanguages = useCodeBlockLanguages();
  const languageOptions = configuredLanguages ?? DEFAULT_LANGUAGE_OPTIONS;
  const languageStateRef = useRef(languageState);
  languageStateRef.current = languageState;
  const listboxId = `${useId()}-code-language-listbox`;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  // RD-001-DELTA-01(Issue #193) — 삭제(더보기 메뉴 항목)의 Result 실패를
  // actionError로 표시한다(media-toolbar.tsx handleDelete와 동일 패턴).
  const { actionError, runCommand } = useTableCommandFeedback();
  // RD-001-DELTA-02(Issue #193) — 복사 성공 뒤 2초간 title/아이콘을
  // "복사됨" 상태로 전환한다. deferredUpdateTimeoutRef와 같은 관례로
  // owner window의 setTimeout/clearTimeout을 쓴다.
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  // 마우스가 코드블록 위에 있는 동안의 blockId(hover 우선 — 사용자 요청
  // "Notion처럼 코드블록에 마우스 hover일 때만 표시"). BlockSideMenu·
  // TableHandles와 같은 usePointerHoverTarget을 재사용한다 — 이 컴포넌트는
  // 그 훅의 독립된 세 번째 소비자다(같은 document에 각자 자기 pointermove
  // 리스너를 건다, 서로 간섭하지 않는다).
  const [hoverBlockId, hoverBlockIdRef, updateHoverBlockId] = useMirroredState<
    string | null
  >(null);

  const handleHoverCandidateChange = useCallback(
    (candidate: HTMLElement | null) => {
      // table/media 전용 오버레이가 자기 블록을 거르는 것과 같은 이유로
      // 여기서도 "code block인가"만 거른다 — 다만 이 toolbar는 gutter처럼
      // 블록 바깥 여백에 뜨지 않고 코드블록 자신의 우상단 모서리와 겹쳐
      // 뜬다(아래 anchor 계산 — rect.right/rect.top을 그대로 쓴다). 그래서
      // block-side-menu.tsx의 BLOCK_GUTTER_HOVER_MARGIN 같은 여백
      // 히스테리시스가 필요 없다: 포인터가 블록에서 toolbar로 이동하는 동안
      // 항상 둘 중 하나(블록 자신, 또는
      // CODE_BLOCK_TOOLBAR_ALLOW_SELECTORS로 ignore되는 toolbar·팝오버·
      // 메뉴) 위에 있다.
      const isCodeBlock =
        candidate !== null &&
        candidate.querySelector("pre[data-geul-code-block]") !== null;
      updateHoverBlockId(
        isCodeBlock ? candidate.getAttribute("data-geul-block-id") : null,
      );
    },
    [updateHoverBlockId],
  );
  usePointerHoverTarget({
    element,
    ignoreSelectors: CODE_BLOCK_TOOLBAR_ALLOW_SELECTORS,
    entitySelector: "[data-geul-block-id]",
    onCandidateChange: handleHoverCandidateChange,
  });

  // hover 우선, hover가 코드블록을 안 가리키면 selection으로 fallback한다
  // (table-handles.tsx의 activeTableId = hoverTableId ?? selectionTableId와
  // 동일 판단, Notion 참고·사용자 요청) — 마우스가 코드블록을 완전히
  // 벗어난 채 키보드만으로 커서가 블록 안에 남아 있을 때도 언어 변경·복사·
  // 삭제에 계속 접근할 수 있어야 한다. hover 소스는 selection과 무관한
  // 공개 조회 `editor.getBlock(id)`로 committed language를 읽고, selection
  // 소스는 기존 그대로 `editor.getSelectionBlockType()`을 쓴다.
  const readActiveCodeBlock = useCallback(() => {
    const hoverId = hoverBlockIdRef.current;
    if (hoverId !== null) {
      const block = editor.getBlock(hoverId);
      if (block?.type === "codeBlock") {
        // getBlock의 반환 타입 DocumentBlock = Block | CustomBlock에서
        // CustomBlock.type이 넓은 string이라 위 리터럴 비교만으로는
        // CustomBlock을 좁혀내지 못한다(spec — CustomBlock은 서드파티
        // 미지 블록 전용 escape hatch, 실제로 "codeBlock" 타입일 수
        // 없다) — 알려진 CodeBlock으로 단언한다.
        const codeBlock = block as CodeBlock;
        return {
          blockId: hoverId,
          value: codeBlock.language ?? "text",
          wrap: codeBlock.wrap === true,
        };
      }
    }
    const selection = editor.getSelectionBlockType();
    if (selection?.blockType.type !== "codeBlock") return null;
    // getSelectionBlockType()의 BlockTypeDescriptor는 language만 담고
    // wrap이 없다(Turn into 판별용 유니온이라 언어 이후 추가된 attr까지
    // 따라가지 않는다) — hover 경로와 동일하게 getBlock으로 다시 조회한다.
    // hover·selection이 서로 다른 blockId를 가리킬 수 있어 hover 결과를
    // 재사용할 수 없다.
    const selectionBlock = editor.getBlock(selection.blockId);
    const wrap =
      selectionBlock?.type === "codeBlock"
        ? (selectionBlock as CodeBlock).wrap === true
        : false;
    return {
      blockId: selection.blockId,
      value: selection.blockType.language ?? "text",
      wrap,
    };
  }, [editor, hoverBlockIdRef]);

  // blockId는 따옴표·백슬래시를 포함할 수 있어(테스트로 고정) CSS
  // attribute selector 문자열을 직접 조립하지 않는다 — 전부 순회하며
  // `getAttribute` 동등 비교로만 찾는다. updateAnchor(위치 계산)와
  // handleCopy(RD-001-DELTA-02, 텍스트 추출)가 함께 쓴다.
  const findBlockElement = useCallback(
    (blockId: string): HTMLElement | undefined => {
      if (element === null) return undefined;
      const blockElements = Array.from(
        element.querySelectorAll<HTMLElement>("[data-geul-block-id]"),
      );
      return blockElements.find(
        (candidate) => candidate.getAttribute("data-geul-block-id") === blockId,
      );
    },
    [element],
  );

  const updateAnchor = useCallback(
    (blockId: string) => {
      const block = findBlockElement(blockId);
      if (block === undefined) return;
      const rect = block.getBoundingClientRect();
      // 트리거를 코드블록 우상단에 앵커링한다(topRight) — 코드블록 DOM
      // 자체에는 아무것도 쓰지 않는다(PM DOMObserver가 예상 밖 변경으로
      // 보고 노드를 재생성하는 걸 피한다).
      setAnchor((current) =>
        current.left === rect.right && current.top === rect.top
          ? current
          : { left: rect.right, top: rect.top },
      );
    },
    [findBlockElement],
  );

  // selectionchange(아래 deferred 경로)나 명시적 close(cancel/commit/
  // dismissMoreMenu/handleDelete)가 호출한다 — 실제 selection이 다른
  // 블록/블록 밖으로 옮겨갔으면(active===null 또는 blockId 변경) 열려
  // 있던 팝오버·메뉴도 함께 닫는다(기존 계약, 무회귀). hover만 바뀐
  // 경우의 "열려 있으면 무시" 판단은 이 함수가 아니라 아래
  // hoverBlockId effect가 진입 전에 따로 가드한다 — 여기서 가드하면
  // 진짜 키보드 탐색으로 다른 블록에 들어갔을 때도 팝오버가 안 닫힌다
  // (실측 회귀: 기존 "다른 블록으로 전환하면 팝오버를 닫고 트리거도
  // 숨긴다" 테스트가 이 가드 위치를 고정한다).
  const updateFromSelection = useCallback(() => {
    const active = readActiveCodeBlock();
    if (active === null) {
      setLanguageState(null);
      updateOpen(false);
      setSearch("");
      updateMoreMenuOpen(false);
      return;
    }

    updateAnchor(active.blockId);
    const previous = languageStateRef.current;
    if (previous === null || previous.blockId !== active.blockId) {
      // 새 블록으로 전환(또는 최초 진입) — 열려 있던 팝오버·메뉴는 이전
      // 블록 것이라 함께 닫는다.
      setLanguageState({
        blockId: active.blockId,
        committed: active.value,
        wrap: active.wrap,
      });
      updateOpen(false);
      setSearch("");
      updateMoreMenuOpen(false);
      return;
    }
    // language뿐 아니라 wrap도 비교한다 — handleToggleWrap의 낙관적 갱신
    // 경로를 안 거치는 변경(undo/redo, 협업 동기화, 호스트 앱의 직접
    // commands.setCodeBlockWrap 호출)도 여기로 들어와야 aria-pressed가
    // 실제 문서 상태와 어긋나지 않는다.
    if (previous.committed !== active.value || previous.wrap !== active.wrap) {
      setLanguageState({
        blockId: active.blockId,
        committed: active.value,
        wrap: active.wrap,
      });
    }
    // 같은 블록이고 committed·wrap 모두 그대로면 아무 것도 바꾸지 않는다 —
    // 팝오버가 열려 있었으면 열린 채, 검색어도 그대로 유지한다.
  }, [readActiveCodeBlock, updateAnchor, updateOpen, updateMoreMenuOpen]);

  // hoverBlockId(state)가 바뀔 때마다(pointermove → handleHoverCandidateChange
  // → updateHoverBlockId) 다시 계산한다 — selectionchange 등 네이티브
  // 이벤트가 없는 순수 hover 전환은 아래 useSelectionRefresh 경로를 타지
  // 않으므로 이 effect가 유일한 트리거다. 언어 팝오버·더보기 메뉴가 열려
  // 있는 동안은 이 hover 재평가를 건너뛴다 — 그러지 않으면 검색어를
  // 입력하려고 키보드로 손을 옮기는 사이(마우스가 코드블록 밖에 멈추는
  // 흔한 경우) 트리거·팝오버가 사라져 버린다. 이 freeze는 여기(hover
  // 트리거)에만 걸고 updateFromSelection 자신에는 걸지 않는다 —
  // selectionchange로 촉발된 호출(실제 키보드 탐색)은 그대로 popover/
  // menu를 닫아야 한다(위 주석). ProseMirror의 selectionchange 리스너
  // 순서 문제(아래 주석)는 pointermove와는 무관해 지연 없이 동기로
  // 호출한다.
  useEffect(() => {
    if (openRef.current || moreMenuOpenRef.current) return;
    updateFromSelection();
  }, [hoverBlockId, updateFromSelection, openRef, moreMenuOpenRef]);

  // (Issue #173 QA) selectionchange/mouseup/keyup 이벤트 안에서 이
  // 컴포넌트의 리스너를 곧바로 실행하면 매번 한 상호작용 전 selection을
  // 본다 — 원인은 리스너 "등록 순서"다. ProseMirror(DOMObserver)도 같은
  // document에 자기 selectionchange 리스너를 걸어 그 안에서 동기로
  // state.selection을 flush하는데, 그 리스너는 EditorProvider의 mount
  // effect(부모)에서 등록되고 이 컴포넌트의 리스너는 자식 effect에서
  // 등록된다 — React가 자식 effect를 부모보다 먼저 실행하므로 이
  // 컴포넌트의 리스너가 매번 PM 것보다 앞선 순번으로 붙는다. 같은
  // 이벤트를 동기로 처리하는 한 PM의 flush가 항상 이 컴포넌트의 읽기
  // 다음에 일어나 한 박자 밀린 값을 읽는다(실측: 클릭 N번째의 읽기가
  // N-1번째 클릭의 위치를 가리킴). 매크로태스크 하나만큼 읽기를
  // 미루면 그 사이 이벤트의 나머지 리스너(PM 포함)가 전부 끝나 있어
  // 최신 selection을 본다 — connect 순서를 바꾸는 대신(공유 훅·PM
  // 내부에 손대지 않고) 이 컴포넌트만 방어한다. 상호작용마다 여러
  // 이벤트(mousedown+mouseup+selectionchange 등)가 겹쳐 들어오므로
  // 타이머를 매번 새로 잡아(직전 예약분 취소) 상호작용당 실제 갱신은
  // 한 번만 나가게 한다.
  const deferredUpdateTimeoutRef = useRef<number | null>(null);
  const deferredUpdateFromSelection = useCallback(() => {
    const ownerWindow = element?.ownerDocument.defaultView;
    if (ownerWindow === undefined || ownerWindow === null) {
      updateFromSelection();
      return;
    }
    if (deferredUpdateTimeoutRef.current !== null) {
      ownerWindow.clearTimeout(deferredUpdateTimeoutRef.current);
    }
    deferredUpdateTimeoutRef.current = ownerWindow.setTimeout(() => {
      deferredUpdateTimeoutRef.current = null;
      updateFromSelection();
    }, 0);
  }, [element, updateFromSelection]);

  useEffect(() => {
    const ownerWindow = element?.ownerDocument.defaultView;
    return () => {
      if (deferredUpdateTimeoutRef.current !== null) {
        ownerWindow?.clearTimeout(deferredUpdateTimeoutRef.current);
      }
    };
  }, [element]);

  useSelectionRefresh({ element, onUpdate: deferredUpdateFromSelection });

  const cancel = useCallback(() => {
    updateOpen(false);
    setSearch("");
    updateFromSelection();
  }, [updateOpen, updateFromSelection]);

  const dismissWithFocus = useCallback(() => {
    cancel();
    focusEditor();
  }, [cancel, focusEditor]);

  useDismissOnOutsideOrEscape({
    active: open,
    element,
    allowSelectors: CODE_BLOCK_TOOLBAR_ALLOW_SELECTORS,
    onOutsideDismiss: cancel,
    onEscapeDismiss: dismissWithFocus,
  });

  const commit = useCallback(
    (value: string) => {
      const current = languageStateRef.current;
      if (current === null) return;
      const result = editor.commands.setBlockType(current.blockId, {
        type: "codeBlock",
        language: value,
      });
      if (!result.ok) return;

      const active = readActiveCodeBlock();
      if (active !== null && active.blockId === current.blockId) {
        setLanguageState({
          blockId: active.blockId,
          committed: active.value,
          wrap: active.wrap,
        });
      }
      updateOpen(false);
      setSearch("");
      focusEditor();
    },
    [editor, focusEditor, readActiveCodeBlock, updateOpen],
  );

  const openPopover = () => {
    setSearch("");
    updateOpen(true);
  };

  const handleTriggerClick = () => {
    if (open) {
      cancel();
      return;
    }
    openPopover();
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearch(event.currentTarget.value);
  };

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    commit(event.currentTarget.value);
  };

  const needle = search.toLocaleLowerCase();
  const suggestions = languageOptions.filter((option) =>
    needle.length === 0
      ? true
      : [option.id, option.label, ...(option.aliases ?? [])].some((value) =>
          value.toLocaleLowerCase().includes(needle),
        ),
  );
  // 필터 결과의 첫 항목을 자동 활성화하면 unknown 검색어가 부분 일치한 known
  // option으로 읽히지만 Enter는 raw 검색어를 commit하는 ARIA 불일치가 생긴다.
  // canonical/label/alias가 정확히 일치할 때만 해당 option을 활성화한다.
  // 검색어가 비어 있으면(팝오버를 막 연 상태) 현재 committed 언어를 기본
  // 활성 항목으로 삼는다 — 네이티브 select가 현재 값을 미리 강조하는 것과
  // 같은 관례다. 체크마크(aria-selected)와는 다른 신호라 서로 간섭하지
  // 않는다.
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const activeSuggestion = suggestions.find((option) =>
    search.length === 0
      ? option.id === languageState?.committed
      : option.id === search ||
        (option.aliases ?? []).some(
          (alias) => alias.toLocaleLowerCase() === normalizedSearch,
        ),
  );
  const activeOptionId =
    activeSuggestion !== undefined
      ? `${listboxId}-${activeSuggestion.id}`
      : undefined;

  const matchOption = (value: string) =>
    languageOptions.find((option) => option.id === value);

  const displayLabel = (value: string): string => {
    const match = matchOption(value);
    if (match === undefined) return value;
    return match.id === "text"
      ? dictionary.codeLanguage.plainText
      : match.label;
  };

  // outer toolbar(언어 trigger + 복사 + 더보기)를 코드블록 우상단에
  // 앵커링한다(RD-001의 topRight variant, RD-001-DELTA-01(Issue #193)에서
  // 단일 트리거 대신 toolbar 전체로 확장).
  const { menuRef: toolbarRef, style: toolbarStyle } = useClampedMenuPosition(
    anchor.left,
    anchor.top,
    "topRight",
  );
  // 언어 trigger 자신의 div — 더는 독립 위치를 갖지 않는다(위치는 outer
  // toolbar가 소유). `.geul-code-block-language-trigger`의 SCSS 주석대로
  // "shell rect == 버튼 rect"만 유지해 popoverAnchor 실측 기준으로 쓴다.
  const languageTriggerRef = useRef<HTMLDivElement | null>(null);

  // 팝오버는 언어 trigger 자신의 렌더된 rect를 앵커로 쓴다 — 코드블록이나
  // toolbar 전체가 아니라 trigger 버튼 바로 아래로 펼친다(복사·더보기
  // 버튼이 옆에 있어도 팝오버 위치가 밀리지 않는다). 트리거 위치(anchor)가
  // 바뀌면(스크롤·리사이즈) 다시 실측한다. jsdom에는 ResizeObserver가
  // 없어 단위 테스트는 이 재실행에 기댄다(use-clamped-menu-position.ts와
  // 같은 제약).
  const [popoverAnchor, setPopoverAnchor] = useState<AnchorPosition | null>(
    null,
  );
  useLayoutEffect(() => {
    if (!open) {
      setPopoverAnchor(null);
      return;
    }
    const node = languageTriggerRef.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    setPopoverAnchor((current) =>
      current !== null &&
      current.left === rect.right &&
      current.top === rect.bottom
        ? current
        : { left: rect.right, top: rect.bottom },
    );
  }, [open, languageTriggerRef, anchor.left, anchor.top]);

  const { menuRef: popoverRef, style: popoverStyle } = useClampedMenuPosition(
    popoverAnchor?.left ?? 0,
    popoverAnchor?.top ?? 0,
    "topRight",
  );

  useEffect(() => {
    if (open) searchInputRef.current?.focus();
  }, [open]);

  // 더보기(⋯) 메뉴 — 사용자 요청(실수 방지)으로 삭제를 toolbar 최상위에서
  // 이 메뉴 안 항목 하나로 옮겼다. 여닫기·바깥/Escape dismiss는
  // block-side-menu-menu.tsx/table-handle-menu.tsx와 같은 계약
  // (useDismissOnOutsideOrEscape + MenuItemButton)을 그대로 재사용한다.
  const dismissMoreMenu = useCallback(() => {
    updateMoreMenuOpen(false);
    updateFromSelection();
  }, [updateMoreMenuOpen, updateFromSelection]);

  const closeMoreMenuWithFocus = useCallback(() => {
    dismissMoreMenu();
    focusEditor();
  }, [dismissMoreMenu, focusEditor]);

  useDismissOnOutsideOrEscape({
    active: moreMenuOpen,
    element,
    allowSelectors: CODE_BLOCK_TOOLBAR_ALLOW_SELECTORS,
    onOutsideDismiss: dismissMoreMenu,
    onEscapeDismiss: closeMoreMenuWithFocus,
  });

  const handleMoreClick = () => {
    if (moreMenuOpen) {
      dismissMoreMenu();
      return;
    }
    updateMoreMenuOpen(true);
  };

  // 더보기 트리거 자신의 div — 언어 trigger(languageTriggerRef)와 같은
  // 이유로 padding 없는 shell을 둔다: IconButton은 forwardRef가 아니라
  // ref를 곧바로 버튼 DOM에 붙일 수 없어, 이 shell의 rect를 버튼 경계로
  // 대신 쓴다.
  const moreTriggerRef = useRef<HTMLDivElement | null>(null);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<AnchorPosition | null>(
    null,
  );
  useLayoutEffect(() => {
    if (!moreMenuOpen) {
      setMoreMenuAnchor(null);
      return;
    }
    const node = moreTriggerRef.current;
    if (node === null) return;
    const rect = node.getBoundingClientRect();
    setMoreMenuAnchor((current) =>
      current !== null &&
      current.left === rect.right &&
      current.top === rect.bottom
        ? current
        : { left: rect.right, top: rect.bottom },
    );
  }, [moreMenuOpen, anchor.left, anchor.top]);

  const { menuRef: moreMenuRef, style: moreMenuStyle } = useClampedMenuPosition(
    moreMenuAnchor?.left ?? 0,
    moreMenuAnchor?.top ?? 0,
    "topRight",
  );

  // RD-001-DELTA-01(Issue #193), 더보기 메뉴 이전 — Result 실패는
  // runCommand가 actionError에 남기고, 성공하면 updateFromSelection이
  // languageState를 null로 되돌려 toolbar 전체가 사라진다
  // (readActiveCodeBlock이 삭제된 블록을 더는 찾지 못한다). 메뉴는 클릭
  // 즉시(성공/실패와 무관하게) 닫는다 — 곧 사라질 블록을 가리키는 메뉴를
  // 열어 두지 않는다. 실패 메시지는 toolbar의 actionError span이 그대로
  // 보여준다(메뉴 밖이라 moreMenuOpen과 무관하게 계속 보인다).
  const handleDelete = () => {
    const current = languageStateRef.current;
    if (current === null) return;
    updateMoreMenuOpen(false);
    runCommand(
      () => editor.commands.deleteBlock(current.blockId),
      updateFromSelection,
    );
  };

  // RD-001-DELTA-02(Issue #194) — media toggleShowPreview(media-toolbar.tsx)
  // 와 동일 패턴이다: 성공하면 core를 다시 조회하지 않고 반전값을 로컬
  // languageState에 바로 반영한다 — 실패하면 로컬 state를 건드리지 않아
  // aria-pressed가 실제 문서 상태와 어긋나지 않는다.
  const handleToggleWrap = () => {
    const current = languageStateRef.current;
    if (current === null) return;
    const next = !current.wrap;
    runCommand(
      () => editor.commands.setCodeBlockWrap(current.blockId, next),
      () =>
        setLanguageState((prev) =>
          prev !== null && prev.blockId === current.blockId
            ? { ...prev, wrap: next }
            : prev,
        ),
    );
  };

  const clearCopiedTimeout = useCallback(() => {
    if (copiedTimeoutRef.current === null) return;
    element?.ownerDocument.defaultView?.clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = null;
  }, [element]);

  // RD-001-DELTA-02(Issue #193) — codeBlock의 [data-geul-block-id] 자신(=
  // <pre>)의 textContent를 그대로 복사한다. 하이라이트 decoration은
  // Decoration.inline + class만 적용해 텍스트를 삽입하지 않으므로(RD-001.md
  // "결정" 근거) 개행 포함 raw source가 그대로 나온다. 실패(권한 거부 등)는
  // 흔치 않은 경로라 신규 에러 UI 없이 console.warn만 남긴다(RD-001.md
  // "결정").
  const handleCopy = () => {
    const current = languageStateRef.current;
    if (current === null) return;
    const blockElement = findBlockElement(current.blockId);
    if (blockElement === undefined) return;
    // non-secure context 등에서는 navigator.clipboard 자체가 없다(spec —
    // Clipboard API는 secure context 전용). writeText를 바로 호출하면 동기
    // TypeError라 reject로 잡히지 않는다 — RD-001.md "결정"의 실패 정책
    // (console.warn) 대상에 이 경로도 포함된다.
    if (navigator.clipboard === undefined) {
      console.warn("[geul] code block 복사 실패: clipboard API 없음");
      return;
    }
    const text = blockElement.textContent ?? "";
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        clearCopiedTimeout();
        copiedTimeoutRef.current =
          element?.ownerDocument.defaultView?.setTimeout(() => {
            copiedTimeoutRef.current = null;
            setCopied(false);
          }, COPIED_FEEDBACK_MS) ?? null;
      },
      (error: unknown) => {
        console.warn("[geul] code block 복사 실패", error);
      },
    );
  };

  // 다른 코드블록으로 전환하면(languageState.blockId 변경) 이전 블록에서
  // 켜진 "복사됨" 상태를 새 블록에 이어가지 않는다 — 그러지 않으면 블록
  // A 복사 직후 2초 안에 블록 B로 옮겼을 때 B의 복사 버튼이 잘못
  // "복사됨"으로 보인다. cleanup에서 대기 중인 timeout도 함께 정리한다
  // (블록 전환뿐 아니라 unmount에도 적용).
  useEffect(() => {
    setCopied(false);
    return clearCopiedTimeout;
  }, [languageState?.blockId, clearCopiedTimeout]);

  if (languageState === null) return null;

  return (
    <>
      {/* 위치 계산(useClampedMenuPosition)이 `menuRef`를 div 기준으로
          잡는다 — outer toolbar가 코드블록 우상단 position shell이다
          (RD-001-DELTA-01, Issue #193). 언어 trigger 자신의 div는 더는
          위치를 갖지 않는 평범한 자식이지만 padding 없이 버튼 크기에
          그대로 맞춘다 — popoverAnchor 실측이 이 div의 rect를 버튼
          경계로 그대로 쓴다(아래 languageTriggerRef). */}
      <div
        aria-label={dictionary.toolbar.codeBlock.ariaLabel}
        className="geul-code-block-toolbar"
        data-block-id={languageState.blockId}
        ref={toolbarRef}
        role="toolbar"
        style={toolbarStyle}
      >
        <div
          className="geul-code-block-language-trigger"
          ref={languageTriggerRef}
        >
          <button
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={dictionary.codeLanguage.label}
            onClick={handleTriggerClick}
            type="button"
          >
            {displayLabel(languageState.committed)}
          </button>
        </div>
        {/* RD-001-DELTA-02(Issue #194) — 더보기 메뉴가 아닌 상시 노출
            아이콘(RD-001.md "결정" — wrap은 파괴적이지 않고 사용 빈도가
            높아 삭제류의 "실수 방지로 더보기 이동" 기준에 해당하지
            않는다). media Preview 토글(media-toolbar.tsx)과 동일하게
            aria-pressed만으로 상태를 전달하고 title override는 없다. */}
        <IconButton
          aria-pressed={languageState.wrap}
          className={codeBlockToolbarButtonClassName}
          icon={wrapIcon}
          label={dictionary.toolbar.codeBlock.wrapAriaLabel}
          onClick={handleToggleWrap}
        />
        <IconButton
          className={codeBlockToolbarButtonClassName}
          icon={copied ? copiedIcon : copyIcon}
          label={dictionary.toolbar.codeBlock.copyAriaLabel}
          onClick={handleCopy}
          title={copied ? dictionary.toolbar.codeBlock.copiedTitle : undefined}
        />
        <div
          className="geul-code-block-toolbar__more-trigger"
          ref={moreTriggerRef}
        >
          <IconButton
            aria-expanded={moreMenuOpen}
            aria-haspopup="menu"
            className={codeBlockToolbarButtonClassName}
            icon={moreIcon}
            label={dictionary.toolbar.codeBlock.moreAriaLabel}
            onClick={handleMoreClick}
          />
        </div>
        {actionError !== null && (
          <span className="geul-code-block-toolbar__error" role="alert">
            {actionError.code}
          </span>
        )}
      </div>
      {open && (
        <div
          className="geul-code-block-language-popover"
          data-block-id={languageState.blockId}
          ref={popoverRef}
          style={popoverStyle}
        >
          <input
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={true}
            aria-label={dictionary.codeLanguage.searchPlaceholder}
            className="geul-code-block-language-popover__search"
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            placeholder={dictionary.codeLanguage.searchPlaceholder}
            ref={searchInputRef}
            role="combobox"
            value={search}
          />
          <div
            aria-label={dictionary.codeLanguage.suggestionsAriaLabel}
            className="geul-code-block-language-popover__suggestions"
            id={listboxId}
            role="listbox"
          >
            {suggestions.map((option) => (
              <button
                aria-selected={option.id === languageState.committed}
                className="geul-code-block-language-popover__option"
                data-active={
                  activeOptionId === `${listboxId}-${option.id}`
                    ? ""
                    : undefined
                }
                id={`${listboxId}-${option.id}`}
                key={option.id}
                onClick={() => commit(option.id)}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                type="button"
              >
                <span className="geul-code-block-language-popover__option-label">
                  <span
                    aria-hidden="true"
                    className="geul-code-block-language-popover__check"
                  >
                    {option.id === languageState.committed ? "✓" : ""}
                  </span>
                  {option.id === "text"
                    ? dictionary.codeLanguage.plainText
                    : option.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {moreMenuOpen && (
        <div
          className="geul-code-block-toolbar__more-menu"
          data-block-id={languageState.blockId}
          ref={moreMenuRef}
          role="menu"
          style={moreMenuStyle}
        >
          <MenuItemButton
            className={`${codeBlockToolbarMoreMenuItemClassName} geul-code-block-toolbar__more-menu-item--danger`}
            onClick={handleDelete}
          >
            {dictionary.menu.delete}
          </MenuItemButton>
        </div>
      )}
    </>
  );
};
