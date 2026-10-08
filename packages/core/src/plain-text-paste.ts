import { isNestableBlockType, sanitizeInlineText } from "@cp949/geul-model";
import {
  Fragment,
  Slice,
  type Mark,
  type Node as ProseMirrorNode,
  type ResolvedPos,
  type Schema,
} from "@tiptap/pm/model";
import {
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";

import { splitAtCaret } from "./block-split-extension.js";
import { textToHardBreakInline } from "./code-block-inline-text.js";

// 여러 줄 plain text 붙여넣기·drop의 블록 배치(Issue #284, #285).
//
// PM 기본 처리는 줄마다 <p>를 만들어 slice로 붙인다. 이 slice는 캐럿 블록의
// 기존 자식(blockGroup)을 마지막 줄 블록으로 넘긴다. 들여쓰기 없던 문단이
// 붙여넣기만으로 자식을 얻는다.
//
// 이 모듈은 두 경로를 둔다.
// - 직접 삽입(buildPlainMultilinePasteTransaction): handlePaste와 handleDrop이
//   쓴다. 줄 사이를 Enter 분할(splitAtCaret)로 잇는다. 배치는 Enter와 같다.
//   자식 없음 → 다음 형제, 자식 있음 → 첫 자식(D23), 접힌 toggle → 형제(#252).
//   drop은 `position` 옵션으로 drop 위치에 놓는다. selection은 지우지 않는다.
// - clipboardTextParser(plainTextClipboardParser): 두 입력을 받는다.
//   - 여러 줄. 직접 삽입이 물러나는 경로가 쓴다. 대상은 직접 삽입을 못 하는
//     입력이다(NodeSelection, 시작이 codeBlock 안인 범위, 직접 삽입이 줄을 못
//     놓는 위치). 줄마다 blockContainer를 만든 slice를 돌려준다. 자식 있는
//     블록의 D23 배치는 이 경로로 만들 수 없다. PM Fitter가 꼬리 텍스트를
//     가르면서 기존 blockGroup을 함께 옮기기 때문이다. 한계는 r2 스펙 7.3이
//     소유한다.
//   - 한 줄(Issue #310). 캐럿 마크를 입힌 paragraph 하나를 돌려준다. PM 기본은
//     마크를 DOM 직렬화·재파싱으로 옮긴다. 파싱 규칙이 없는 마크(textColor·
//     backgroundColor)는 이 왕복에서 빠진다.

// PM parseFromClipboard의 줄 분리와 같은 정규식이다. 직접 삽입은
// normalizePasteText 뒤 호출하므로 CR이 남지 않는다. clipboardTextParser는
// raw 입력도 받아 CR 분기가 쓰인다. 연속 개행은 한 경계로 묶는다(Q2, 현행 유지).
const LINE_BREAKS = /(?:\r\n?|\n)+/;

// 줄 경계를 LF로 통일한다(Issue #291). 경계는 CRLF·CR·LF만이다. U+2028·
// U+2029·U+0085는 건드리지 않는다. sanitizeInlineText가 CR을 지우므로 항상
// 그보다 먼저 호출한다.
export const normalizeLineBreaks = (text: string): string =>
  text.replace(/\r\n?/g, "\n");

// 붙여넣기·drop 평문의 삽입용 정규화본이다(Issue #291). CR을 줄 경계로
// 바꾼 뒤 무효 문자(LF 외 C0·DEL·Tab·짝 없는 surrogate)를 지운다. 직접 삽입,
// 시작이 codeBlock 밖인 범위의 codeBlock 분기, PM 폴백, drop이 이 결과를
// 쓴다. 캐럿·시작이 codeBlock 안인 붙여넣기는 Tab을 남기는
// normalizeKeepingTabs를 쓴다(Issue #296).
export const normalizePasteText = (text: string): string =>
  sanitizeInlineText(normalizeLineBreaks(text));

// Tab을 지우지 않고 CR을 줄 경계로 바꾼 뒤 나머지 무효 문자(LF 외 C0·DEL·
// 짝 없는 surrogate)를 지운다. 삽입용(normalizePasteText)과 Tab 처리만
// 다르다. 두 곳이 쓴다.
// - Markdown 감지(Issue #291). Tab은 중첩 목록·들여쓴 코드의 구조이고 마커
//   뒤 공백이며 코드 내용이다. model의 codeBlock 정책도 Tab을 허용한다.
//   인라인 본문에 남은 Tab은 importMarkdown이 거절해 감지가 꺼진다(QA-078
//   Tab 정책, 이전과 같다).
// - codeBlock 안 붙여넣기(Issue #296). model의 codeBlock 검증
//   (isValidCodeBlockSource)이 거부하는 문자만 지운다. Tab·LF는 코드 내용이라
//   남긴다. U+2028·U+2029·U+FEFF·U+0085는 유효라 지우지 않는다. 출력은 항상
//   검증을 통과한다.
export const normalizeKeepingTabs = (text: string): string =>
  normalizeLineBreaks(text)
    .split("\t")
    .map((part) => sanitizeInlineText(part))
    .join("\t");

// slice 안 text 노드의 무효 문자를 지운다(Issue #302). 표 셀 안 붙여넣기의
// transformPasted가 쓴다. PM 기본 붙여넣기는 slice의 무효 문자를 거르지 않아
// 되돌림 guard가 붙여넣기를 통째로 지운다. 정리 규칙은 model의
// sanitizeInlineText를 그대로 쓴다(G-CNV-001).
// - 정리 결과가 빈 text 노드는 제거한다. PM은 빈 text 노드를 만들 수 없다.
// - 마크·노드 속성·openStart·openEnd는 그대로다.
// - codeBlock 안 text는 건드리지 않는다. codeBlock은 Tab을 허용한다.
// - 바뀐 것이 없으면 같은 slice 객체를 돌려준다.
const sanitizeFragmentInlineText = (fragment: Fragment): Fragment => {
  const nodes: ProseMirrorNode[] = [];
  let changed = false;

  fragment.forEach((node) => {
    if (node.isText) {
      const text = node.text ?? "";
      const cleaned = sanitizeInlineText(text);
      if (cleaned === text) {
        nodes.push(node);
        return;
      }
      changed = true;
      if (cleaned.length > 0) {
        nodes.push(node.type.schema.text(cleaned, node.marks));
      }
      return;
    }
    if (node.type.spec.code === true) {
      nodes.push(node);
      return;
    }
    const content = sanitizeFragmentInlineText(node.content);
    if (content === node.content) {
      nodes.push(node);
      return;
    }
    changed = true;
    nodes.push(node.copy(content));
  });

  return changed ? Fragment.fromArray(nodes) : fragment;
};

export const sanitizeSliceInlineText = (slice: Slice): Slice => {
  const content = sanitizeFragmentInlineText(slice.content);
  if (content === slice.content) return slice;
  return new Slice(content, slice.openStart, slice.openEnd);
};

// 줄 분해. 앞·뒤 개행은 빈 줄로 남아 줄 경계가 된다(Q7).
export const splitPlainTextLines = (text: string): string[] =>
  text.split(LINE_BREAKS);

// 줄 목록을 hardBreak로 이은 inline Fragment를 만든다(Issue #299). 표 셀처럼
// 블록을 나눌 수 없는 인라인 컨텐츠에 여러 줄을 넣을 때 쓴다.
// - 입력은 splitPlainTextLines 결과다. 연속 개행은 이미 경계 하나다.
// - 빈 줄은 text 노드를 만들지 않는다. 앞·뒤 개행은 hardBreak 하나가 된다.
// - marks는 text와 hardBreak 모두에 붙인다.
export const linesToHardBreakInline = (
  schema: Schema,
  lines: readonly string[],
  marks: readonly Mark[] = [],
): Fragment => textToHardBreakInline(schema, lines.join("\n"), marks);

const isSplittableTextBlock = (node: ProseMirrorNode): boolean =>
  node.isTextblock && isNestableBlockType(node.type.name);

export type PlainMultilinePasteOptions = {
  // 삽입 위치다. 있으면 selection 삭제를 건너뛰고 이 위치에 캐럿을 둔 채
  // 줄을 놓는다(drop). 마크는 이 위치의 $from.marks()다. 이 위치의 부모가
  // 분할 가능한 텍스트 블록이어야 한다. 이때 tr은 paste meta·uiEvent·scroll을
  // 달지 않는다. 호출부가 이벤트에 맞게 단다.
  position?: number;
};

// 직접 삽입 transaction을 만든다. 지금 selection(position이면 그 위치)에서 줄 수만큼
// 블록을 만들 수 없으면 null이다. 호출부는 tr을 버리고 PM 기본 처리에
// 위임한다. 삭제·줄별 삽입·분할을 한 tr에 쌓아 dispatch·undo가 1회다
// (G-EDT-001). 호출부는 live state를 넘긴다(G-EDT-002).
//
// 범위 선택 삭제는 Enter(splitBlockContainer)와 같은 tr.deleteSelection이다.
// codeBlock에 걸친 범위는 시작이 codeBlock 밖일 때만 받는다. 호출부가 그
// 조건을 거른다.
export const buildPlainMultilinePasteTransaction = (
  state: EditorState,
  lines: readonly string[],
  options: PlainMultilinePasteOptions = {},
): Transaction | null => {
  const tr = state.tr;
  // 모든 줄에 붙여넣기 시작 시점 캐럿의 마크를 입힌다. PM parseFromClipboard가
  // 한 줄을 $from.marks()로 만드는 것과 같다. storedMarks는 쓰지 않는다.
  // 줄 삽입 전에 setStoredMarks로 덮어야 tr.insertText가 storedMarks를
  // 우선하는 동작과 분할 뒤 새 블록의 마크 끊김을 함께 막는다.
  let marks: readonly Mark[];

  if (options.position !== undefined) {
    const $position = state.doc.resolve(options.position);
    if (!isSplittableTextBlock($position.parent)) return null;
    marks = $position.marks();
    tr.setSelection(TextSelection.create(tr.doc, options.position));
  } else {
    // TextSelection만 다룬다. NodeSelection·AllSelection·CellSelection은 PM
    // 기본 처리에 맡긴다.
    if (!(state.selection instanceof TextSelection)) return null;
    marks = state.selection.$from.marks();
    if (!tr.selection.empty) tr.deleteSelection();
  }

  for (const [index, line] of lines.entries()) {
    if (!isSplittableTextBlock(tr.selection.$from.parent)) return null;
    if (index > 0 && !splitAtCaret(tr, { exitEmptyList: false })) return null;
    if (line.length === 0) continue;
    tr.setStoredMarks(marks).insertText(line);
  }

  if (options.position !== undefined) return tr;
  return tr.setMeta("paste", true).setMeta("uiEvent", "paste").scrollIntoView();
};

// 한 줄 평문의 slice다(Issue #310). $context의 마크를 입힌 text를 paragraph
// 하나에 담아 open(1,1)로 돌려준다.
// - PM의 DOM 왕복을 타지 않아 파싱 규칙 없는 마크도 이어진다.
// - paragraph로 감싼 이유는 doPaste가 단일 text 노드 slice를 inheritMarks
//   삽입(replaceSelectionWith)으로 보내기 때문이다. 그 경로는 storedMarks로
//   마크를 덮어쓴다. 현행은 storedMarks를 무시하므로 이를 지킨다.
// - blockContainer로 한 겹 더 감싸지 않는다. 빈 블록에서 PM replaceRange가
//   container째 바꿔 blockId가 새로 매겨진다.
// - 표 셀처럼 blockContainer 밖에도 같은 모양이다. 인라인 내용만 셀에 들어간다.
const buildSingleLineSlice = (
  line: string,
  $context: ResolvedPos,
): Slice | null => {
  const { schema } = $context.parent.type;
  const paragraphType = schema.nodes.paragraph;
  if (paragraphType === undefined) return null;

  const paragraph = paragraphType.create(
    null,
    schema.text(line, $context.marks()),
  );
  return new Slice(Fragment.from(paragraph), 1, 1);
};

// clipboardTextParser 본체. $context가 텍스트 블록(codeBlock 아님)일 때만 slice를
// 만든다. 그 외는 null이라 PM 기본 처리를 유지한다(codeBlock 안, 빈 줄).
// - 한 줄: 캐럿 마크를 입힌 paragraph 하나(buildSingleLineSlice).
// - 두 줄 이상: $context가 blockContainer 안일 때만 줄마다 blockContainer
//   (paragraph)를 만든다. 첫·끝 container의 paragraph를 열어(open 2,2) 캐럿
//   앞뒤 텍스트와 잇는다. 표 셀 안은 null이다.
export const parsePlainTextClipboard = (
  text: string,
  $context: ResolvedPos,
): Slice | null => {
  const lines = splitPlainTextLines(text);
  const parent = $context.parent;
  if (!parent.isTextblock || parent.type.spec.code === true) return null;

  const [first] = lines;
  if (lines.length === 1) {
    return first === undefined || first.length === 0
      ? null
      : buildSingleLineSlice(first, $context);
  }

  if ($context.depth < 1) return null;
  const container = $context.node($context.depth - 1);
  if (container.type.name !== "blockContainer") return null;

  const { schema } = parent.type;
  const containerType = schema.nodes.blockContainer;
  const paragraphType = schema.nodes.paragraph;
  if (containerType === undefined || paragraphType === undefined) return null;

  const marks = $context.marks();
  const containers = lines.map((line) =>
    containerType.create(
      null,
      paragraphType.create(
        null,
        line.length === 0 ? null : schema.text(line, marks),
      ),
    ),
  );
  return new Slice(Fragment.from(containers), 2, 2);
};

// prosemirror-view 타입은 clipboardTextParser의 반환을 Slice로만 선언하지만
// 런타임(parseFromClipboard)은 falsy 반환을 "파서가 처리하지 않음"으로 받아
// 기본 <p> 분리로 넘어간다. 등록 시그니처에 맞추려고 좁게 단언한다.
export const plainTextClipboardParser = parsePlainTextClipboard as (
  text: string,
  $context: ResolvedPos,
) => Slice;
