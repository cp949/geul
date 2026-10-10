/**
 * 클립보드 시퀀스 입력 리터럴을 만드는 테스트 지원 모듈이다. parseClipboardTable의
 * 새 출력 모양(model Block 파생, 비표 블록은 임시 id 보유, codeBlock은
 * `content` 런)을 core 테스트가 한 줄로 만들게 한다. 표 variant는 id가 없어
 * 여기서 다루지 않는다.
 *
 * id는 파서의 임시 id와 같은 `clipboard-` 접두어를 쓴다. core는 이 id를
 * 문서에 넣지 않고 재발급한다.
 */
import type { ClipboardContentBlock } from "@cp949/geul-io";
import type { InlineContent } from "@cp949/geul-model";

type NonTableBlock = Exclude<ClipboardContentBlock, { type: "table" }>;

/** type에 해당하는 비표 블록에서 id·type·content를 뺀 선택 필드다. */
type Extras<T extends NonTableBlock["type"]> = Partial<
  Omit<Extract<NonTableBlock, { type: T }>, "id" | "type" | "content">
>;

/** 같은 모듈 안에서 겹치지 않는 임시 id를 낸다. */
let nextIdNumber = 0;
const tempId = (): string => {
  nextIdNumber += 1;
  return `clipboard-${nextIdNumber}`;
};

/** paragraph 블록이다. */
export const clipParagraph = (
  content: InlineContent,
  extras: Extras<"paragraph"> = {},
): ClipboardContentBlock => ({
  ...extras,
  id: tempId(),
  type: "paragraph",
  content,
});

/** heading 블록이다. */
export const clipHeading = (
  level: 1 | 2 | 3 | 4 | 5 | 6,
  content: InlineContent,
  extras: Extras<"heading"> = {},
): ClipboardContentBlock => ({
  ...extras,
  id: tempId(),
  type: "heading",
  level,
  content,
});

/** bulletListItem 블록이다. */
export const clipBullet = (
  content: InlineContent,
  extras: Extras<"bulletListItem"> = {},
): ClipboardContentBlock => ({
  ...extras,
  id: tempId(),
  type: "bulletListItem",
  content,
});

/** numberedListItem 블록이다. */
export const clipNumbered = (
  content: InlineContent,
  extras: Extras<"numberedListItem"> = {},
): ClipboardContentBlock => ({
  ...extras,
  id: tempId(),
  type: "numberedListItem",
  content,
});

/**
 * codeBlock 블록이다. 파서 계약대로 소스를 마크 없는 런 하나로 담는다.
 * 빈 소스는 런 없는 content다.
 */
export const clipCodeBlock = (
  source: string,
  extras: Extras<"codeBlock"> = {},
): ClipboardContentBlock => ({
  ...extras,
  id: tempId(),
  type: "codeBlock",
  content: source.length === 0 ? [] : [{ text: source }],
});

/** divider 블록이다. */
export const clipDivider = (): ClipboardContentBlock => ({
  id: tempId(),
  type: "divider",
});
