import type {
  BlockCommands,
  BlockTypeBlocker,
  BlockTypeDescriptor,
  Dictionary,
  EditorLifecycle,
  SelectionQuery,
} from "@cp949/geul-core";

type SetBlockTypeInput = Parameters<
  BlockCommands["commands"]["setBlockType"]
>[1];
type SupportedBlockTypeInput = SetBlockTypeInput & BlockTypeDescriptor;

export type BlockTypeOption = {
  id: string;
  label: string;
  description: string;
  keywords: readonly string[];
  blockType: SupportedBlockTypeInput;
};

export const BLOCK_TYPE_OPTIONS: readonly BlockTypeOption[] = [
  {
    id: "paragraph",
    label: "Text",
    description: "Plain paragraph text",
    keywords: ["text", "paragraph", "p"],
    blockType: { type: "paragraph" },
  },
  {
    id: "heading-1",
    label: "Heading 1",
    description: "Large section heading",
    keywords: ["heading", "h1", "title"],
    blockType: { type: "heading", level: 1 },
  },
  {
    id: "heading-2",
    label: "Heading 2",
    description: "Medium section heading",
    keywords: ["heading", "h2", "subtitle"],
    blockType: { type: "heading", level: 2 },
  },
  {
    id: "heading-3",
    label: "Heading 3",
    description: "Small section heading",
    keywords: ["heading", "h3"],
    blockType: { type: "heading", level: 3 },
  },
  {
    id: "heading-4",
    label: "Heading 4",
    description: "Smaller section heading",
    keywords: ["heading", "h4"],
    blockType: { type: "heading", level: 4 },
  },
  {
    id: "heading-5",
    label: "Heading 5",
    description: "Extra small section heading",
    keywords: ["heading", "h5"],
    blockType: { type: "heading", level: 5 },
  },
  {
    id: "heading-6",
    label: "Heading 6",
    description: "Smallest section heading",
    keywords: ["heading", "h6"],
    blockType: { type: "heading", level: 6 },
  },
  {
    id: "quote",
    label: "Quote",
    description: "Capture a quote",
    keywords: ["quote", "blockquote", "citation"],
    blockType: { type: "quote" },
  },
  {
    id: "callout",
    label: "Callout",
    description: "Highlight important information",
    keywords: ["callout", "notice", "alert", "highlight"],
    blockType: { type: "callout" },
  },
  {
    id: "code",
    label: "Code",
    description: "Write plain code",
    keywords: ["code", "codeblock", "pre"],
    blockType: { type: "codeBlock" },
  },
  {
    id: "bullet-list",
    label: "Bulleted List",
    description: "Create a bulleted list",
    keywords: ["bullet", "list", "unordered", "ul"],
    blockType: { type: "bulletListItem" },
  },
  {
    id: "numbered-list",
    label: "Numbered List",
    description: "Create a numbered list",
    keywords: ["number", "list", "ordered", "ol"],
    blockType: { type: "numberedListItem" },
  },
  {
    id: "check-list",
    label: "Check List",
    description: "Track tasks with a checklist",
    keywords: ["check", "checkbox", "checklist", "todo", "task"],
    blockType: { type: "checkListItem" },
  },
  {
    id: "toggle-list",
    label: "Toggle List",
    description: "Create a collapsible toggle list",
    keywords: ["toggle", "list", "collapsible", "expand", "collapse"],
    blockType: { type: "toggleListItem" },
  },
];

export type BlockTypeChoice = {
  option: BlockTypeOption;
  // core 변환 거절 사유다. null이면 변환할 수 있다(Issue #245).
  blocker: BlockTypeBlocker | null;
};

// 변환 대상. 한 블록이면 `getBlockTypeBlocker`, 여러 블록 선택이면
// `getBlockTypesBlocker`로 질의한다. null이면 대상이 없다.
export type BlockTypeTarget =
  { blockId: string } | { blockIds: readonly string[] };

type BlockTypeChoiceEditor = Pick<
  SelectionQuery,
  "getBlockTypeBlocker" | "getBlockTypesBlocker"
> &
  Pick<EditorLifecycle, "isBlockTypeEnabled">;

// 변환 옵션과 core 거절 사유를 한 곳에서 짝짓는다. 어떤 옵션이 어떤 블록에서
// 막히는지는 core 질의가 정한다. react는 그 조건을 다시 유도하지 않는다.
// 표면은 `blocker !== null`인 옵션을 숨길지 비활성(사유 title)으로 둘지만
// 고른다.
// - enabledBlockTypes(mode: "deny")로 끈 타입은 목록에서 뺀다(Issue #189).
// - target이 null이면 켜진 옵션 전부를 NOT_FOUND로 돌려준다. 대상이 없는
//   상시 툴바가 버튼 목록을 그리는 데 쓴다.
// - clearContent는 단일 블록 질의에만 적용한다. 내용을 비우는 변환(슬래시
//   메뉴)은 탭이 든 codeBlock도 일반 블록으로 바꿀 수 있다.
export const getBlockTypeChoices = (
  editor: BlockTypeChoiceEditor,
  target: BlockTypeTarget | null,
  options?: { clearContent?: boolean },
): readonly BlockTypeChoice[] =>
  BLOCK_TYPE_OPTIONS.filter((option) =>
    editor.isBlockTypeEnabled(option.blockType.type),
  ).map((option) => ({
    option,
    blocker:
      target === null
        ? "NOT_FOUND"
        : "blockId" in target
          ? options === undefined
            ? editor.getBlockTypeBlocker(target.blockId, option.blockType)
            : editor.getBlockTypeBlocker(
                target.blockId,
                option.blockType,
                options,
              )
          : editor.getBlockTypesBlocker(target.blockIds, option.blockType),
  }));

// 비활성 변환 버튼의 사유 title. 원인이 눈에 보이지 않는 두 사유만 전용
// 문구를 쓰고 나머지는 일반 문구 하나를 공유한다(Issue #245, G-UI-004).
export const blockTypeBlockerReason = (
  dictionary: Dictionary,
  blocker: BlockTypeBlocker,
): string => {
  switch (blocker) {
    case "HAS_CHILDREN":
      return dictionary.toolbar.static.blockTypeDisabledByChildrenReason;
    case "INVALID_TEXT":
      return dictionary.toolbar.static.blockTypeDisabledByInvalidTextReason;
    default:
      return dictionary.toolbar.static.blockTypeDisabledReason;
  }
};

// spec §8(EXT-009), RD-002-DELTA-02 — `dictionary.blockType`에서 표시용
// label·description을 읽는다. `id`는 항상 위 `BLOCK_TYPE_OPTIONS`의 14개
// 리터럴 중 하나이므로(호출부가 그 배열에서 얻은 `option.id`만 넘긴다)
// 이 cast 하나로 안전하다 — 호출부마다 반복하지 않는다. `BLOCK_TYPE_OPTIONS`
// 자신의 `label`/`description`(검색 매칭 전용, dictionary와 무관)과는
// 별개다.
export const blockTypeText = (
  dictionary: Dictionary,
  id: string,
): { label: string; description: string } =>
  dictionary.blockType[id as keyof Dictionary["blockType"]];

export const blockTypeToOptionId = (blockType: BlockTypeDescriptor): string => {
  switch (blockType.type) {
    case "paragraph":
      return "paragraph";
    case "heading":
      return `heading-${blockType.level}`;
    case "quote":
      return "quote";
    case "codeBlock":
      return "code";
    case "bulletListItem":
      return "bullet-list";
    case "numberedListItem":
      return "numbered-list";
    case "checkListItem":
      return "check-list";
    case "toggleListItem":
      return "toggle-list";
    case "callout":
      return "callout";
  }
};
