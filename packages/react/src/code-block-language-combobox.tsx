import { Check, Copy, Trash2 } from "lucide-react";
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
import { useClampedMenuPosition } from "./use-clamped-menu-position.js";
import { useDismissOnOutsideOrEscape } from "./use-dismiss-on-outside-or-escape.js";
import { useDictionary, useEditor, useEditorMount } from "./use-editor.js";
import { useFocusEditor } from "./use-focus-editor.js";
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

// outer toolbar(언어 trigger + 삭제 버튼, RD-001-DELTA-01 Issue #193)와
// 팝오버 둘 다 여기 포함한다 — 바깥 pointerdown 판정이 `.closest()`로 두
// 셀렉터 아무 쪽에나 걸리면 "바깥"으로 보지 않는다. `.geul-code-block-
// -language-trigger`는 이제 toolbar 안에 항상 nest돼 별도로 나열할
// 필요가 없다(media-toolbar.tsx가 `.geul-media-toolbar` 하나로 내부 버튼
// 전부를 커버하는 것과 같은 이유). toolbar를 빼먹으면 팝오버가 열린
// 상태에서 트리거를 다시 클릭할 때 pointerdown이 먼저 "바깥 클릭"으로
// 처리돼 버리고, 뒤이은 click의 토글 로직과 경합한다.
const LANGUAGE_COMBOBOX_ALLOW_SELECTORS = [
  ".geul-code-block-toolbar",
  ".geul-code-block-language-popover",
] as const;

const codeBlockToolbarButtonClassName = "geul-code-block-toolbar__button";
const codeBlockToolbarDangerButtonClassName = `${codeBlockToolbarButtonClassName} geul-code-block-toolbar__button--danger`;
// media-toolbar.tsx의 deleteIcon 등과 같은 이유로 모듈 top-level에서 한
// 번만 만든다 — 매 렌더 새 ReactElement를 만들지 않는다.
const deleteIcon = <Trash2 {...iconProps} />;
// RD-001-DELTA-02(Issue #193) — 복사 버튼 기본 아이콘과 복사 성공 2초간의
// 대체 아이콘(같은 이유로 top-level에서 한 번만 만든다).
const copyIcon = <Copy {...iconProps} />;
const copiedIcon = <Check {...iconProps} />;
// 복사 성공 title이 몇 ms 유지되는지(RD-001.md "결정" — 짧은 시각 피드백).
const COPIED_FEEDBACK_MS = 2000;

type LanguageState = {
  blockId: string;
  committed: string;
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
  const [open, setOpen] = useState(false);
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
  // RD-001-DELTA-01(Issue #193) — 삭제 버튼의 Result 실패를
  // actionError로 표시한다(media-toolbar.tsx handleDelete와 동일 패턴).
  const { actionError, runCommand } = useTableCommandFeedback();
  // RD-001-DELTA-02(Issue #193) — 복사 성공 뒤 2초간 title/아이콘을
  // "복사됨" 상태로 전환한다. deferredUpdateTimeoutRef와 같은 관례로
  // owner window의 setTimeout/clearTimeout을 쓴다.
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  const readActiveCodeBlock = useCallback(() => {
    const selection = editor.getSelectionBlockType();
    if (selection?.blockType.type !== "codeBlock") return null;
    return {
      blockId: selection.blockId,
      value: selection.blockType.language ?? "text",
    };
  }, [editor]);

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

  const updateFromSelection = useCallback(() => {
    const active = readActiveCodeBlock();
    if (active === null) {
      setLanguageState(null);
      setOpen(false);
      setSearch("");
      return;
    }

    updateAnchor(active.blockId);
    const previous = languageStateRef.current;
    if (previous === null || previous.blockId !== active.blockId) {
      // 새 블록으로 전환(또는 최초 진입) — 팝오버를 닫고 검색을 버린다.
      setLanguageState({ blockId: active.blockId, committed: active.value });
      setOpen(false);
      setSearch("");
      return;
    }
    if (previous.committed !== active.value) {
      setLanguageState({ blockId: active.blockId, committed: active.value });
    }
    // 같은 블록이고 committed 값도 그대로면 아무 것도 바꾸지 않는다 —
    // 팝오버가 열려 있었으면 열린 채, 검색어도 그대로 유지한다.
  }, [readActiveCodeBlock, updateAnchor]);

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
    setOpen(false);
    setSearch("");
  }, []);

  const dismissWithFocus = useCallback(() => {
    cancel();
    focusEditor();
  }, [cancel, focusEditor]);

  useDismissOnOutsideOrEscape({
    active: open,
    element,
    allowSelectors: LANGUAGE_COMBOBOX_ALLOW_SELECTORS,
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
        setLanguageState({ blockId: active.blockId, committed: active.value });
      }
      setOpen(false);
      setSearch("");
      focusEditor();
    },
    [editor, focusEditor, readActiveCodeBlock],
  );

  const openPopover = () => {
    setSearch("");
    setOpen(true);
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

  // outer toolbar(언어 trigger + 삭제 버튼)를 코드블록 우상단에
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
  // toolbar 전체가 아니라 trigger 버튼 바로 아래로 펼친다(삭제 버튼이
  // 옆에 추가돼도 팝오버 위치가 밀리지 않는다). 트리거 위치(anchor)가
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

  // RD-001-DELTA-01(Issue #193) — media-toolbar.tsx handleDelete와 동일
  // 패턴: Result 실패는 runCommand가 actionError에 남기고, 성공하면
  // updateFromSelection이 languageState를 null로 되돌려 toolbar 전체가
  // 사라진다(readActiveCodeBlock이 삭제된 블록을 더는 찾지 못한다).
  const handleDelete = () => {
    const current = languageStateRef.current;
    if (current === null) return;
    runCommand(
      () => editor.commands.deleteBlock(current.blockId),
      updateFromSelection,
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
        <IconButton
          className={codeBlockToolbarButtonClassName}
          icon={copied ? copiedIcon : copyIcon}
          label={dictionary.toolbar.codeBlock.copyAriaLabel}
          onClick={handleCopy}
          title={copied ? dictionary.toolbar.codeBlock.copiedTitle : undefined}
        />
        <IconButton
          className={codeBlockToolbarDangerButtonClassName}
          icon={deleteIcon}
          label={dictionary.toolbar.codeBlock.deleteAriaLabel}
          onClick={handleDelete}
        />
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
    </>
  );
};
