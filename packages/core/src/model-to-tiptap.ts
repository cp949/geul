import {
  type AudioBlock,
  type Block,
  type BulletListItemBlock,
  type CheckListItemBlock,
  type CodeBlock,
  type CustomBlock,
  type Document,
  type FileBlock,
  type HeadingBlock,
  type ImageBlock,
  type InlineContent,
  isCanonicalTextMarks,
  isKnownBlockType,
  isKnownTextMarkType,
  isSupportedLinkHref,
  isTextRunItem,
  isValidInlineText,
  type NumberedListItemBlock,
  type ParagraphBlock,
  type QuoteBlock,
  type Result,
  type TableBlock,
  type TextMark,
  type ToggleListItemBlock,
  type VideoBlock,
} from "@cp949/geul-model";

import { walkBlockTree } from "./block-tree.js";
import type { EditorError } from "./errors.js";
import { columnIndexMap } from "./table-grid.js";

// enabledBlockTypes(spec §4.4 EXT-004, RD-002-DELTA-12) — 기존 14종 대상
// allow/deny 목록. model에 "14종 전체 목록" export가 없고(만들 필요도
// 없다) allow 모드도 매 타입마다 predicate 호출로 판정한다(여집합을
// 미리 계산하지 않는다). 옵션 미지정이면 항상 true(회귀 없음).
export type EnabledBlockTypes = {
  mode: "allow" | "deny";
  types: readonly Block["type"][];
};

export const isBlockTypeEnabled = (
  type: Block["type"],
  enabledBlockTypes?: EnabledBlockTypes,
): boolean => {
  if (enabledBlockTypes === undefined) return true;
  const listed = enabledBlockTypes.types.includes(type);
  return enabledBlockTypes.mode === "allow" ? listed : !listed;
};

export type TiptapJsonMark = {
  type?: string;
  attrs?: Record<string, unknown>;
};

export type TiptapJsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TiptapJsonNode[];
  marks?: TiptapJsonMark[];
  text?: string;
};

const invalid = (message: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "DOCUMENT_INVALID", message },
});

const markKey = (mark: TextMark): string =>
  mark.type === "link" ? `link:${mark.href}` : mark.type;

export type InlineContentViolation = {
  code: "DOCUMENT_INVALID" | "EDITOR_FEATURE_UNAVAILABLE";
  reason: string;
};

// 편집기에 커밋되는 인라인 콘텐츠의 항목 계약: 빈 텍스트 런 금지
// (ProseMirror는 빈 텍스트 노드를 만들 수 없다), 빈 마크 배열 금지,
// 미지원 링크 금지(LinkPolicyExtension이 트랜잭션째 버리기 전에 경계에서
// 거절), 정규 마크 순서, 인접 동일 마크 런 금지. 위반이 없으면 null,
// 있으면 위반을 설명하는 서술어와 코드를 반환한다 — 호출자가 위치(블록
// id, 셀 좌표)를 앞에 붙여 message를 만든다.
//
// 커스텀 inline 원소(EXT-002)·CustomTextMark(EXT-003)는 model 계약상
// 완전히 유효하지만 이 에디터 인스턴스에 registry(customInlineContentTypes/
// customStyleTypes, 추후 DELTA)가 없어 PM으로 표현하지 못하는 것뿐이다 —
// "문서가 잘못됨"을 뜻하는 나머지 DOCUMENT_INVALID 판정과 분류가 다르다
// (top-level CustomBlock 거절, DELTA-04/12와 같은 기준).
export const inlineContentViolation = (
  content: InlineContent,
  options?: { customInlineContentTypes?: ReadonlySet<string> },
): InlineContentViolation | null => {
  const customInlineContentTypes =
    options?.customInlineContentTypes ?? new Set<string>();
  let previousMarks: string | undefined;

  for (const item of content) {
    if (!isTextRunItem(item)) {
      if (!customInlineContentTypes.has(item.customType)) {
        return {
          code: "EDITOR_FEATURE_UNAVAILABLE",
          reason: `contains an unregistered custom inline type "${item.customType}"`,
        };
      }
      // 등록된 커스텀 inline 원소는 atom 노드로 표현 가능하다(RD-002-DELTA-18) —
      // "인접 동일 마크" 판정은 연속된 텍스트 런 사이에만 적용된다. 이
      // 원소가 그 인접성을 끊으므로 previousMarks를 리셋한다.
      previousMarks = undefined;
      continue;
    }
    if (item.text.length === 0) {
      return { code: "DOCUMENT_INVALID", reason: "contains an empty text run" };
    }
    if (!isValidInlineText(item.text)) {
      return {
        code: "DOCUMENT_INVALID",
        reason:
          "contains invalid inline text (control characters, DEL, or an unpaired surrogate)",
      };
    }
    if (item.marks?.length === 0) {
      return { code: "DOCUMENT_INVALID", reason: "contains an empty mark set" };
    }
    const marks = item.marks ?? [];
    const unregisteredMark = marks.find(
      (mark) => !isKnownTextMarkType(mark.type),
    );
    if (unregisteredMark !== undefined) {
      return {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        reason: `contains an unregistered custom mark type "${unregisteredMark.type}"`,
      };
    }
    // 위에서 CustomTextMark(알 수 없는 type)를 모두 거절해 이 지점의
    // marks는 TextMark만 남는다.
    const knownMarks = marks as TextMark[];
    for (const mark of knownMarks) {
      if (mark.type === "link" && !isSupportedLinkHref(mark.href)) {
        return {
          code: "DOCUMENT_INVALID",
          reason: "contains an unsupported link URL",
        };
      }
    }
    if (!isCanonicalTextMarks(knownMarks)) {
      return {
        code: "DOCUMENT_INVALID",
        reason: "contains noncanonical mark ordering",
      };
    }

    const currentMarks = JSON.stringify(knownMarks.map(markKey));
    if (currentMarks === previousMarks) {
      return {
        code: "DOCUMENT_INVALID",
        reason: "contains adjacent inline runs with identical marks",
      };
    }
    previousMarks = currentMarks;
  }
  return null;
};

// children까지 재귀로 훑는다 — 중첩 블록의 인라인 콘텐츠도 최상위와 같은
// 경계 계약(빈 텍스트 런 금지 등)을 적용받는다(G-CNV-001: codec은 구조
// 직대응만 하고 검증 권위는 여전히 model parseDocument다 — 이 함수는 PM
// 조립이 던지는 예외를 막는 사전 방어일 뿐, 최종 권위가 아니다).
const validateEditableContent = (
  blocks: readonly Block[],
  options?: { customInlineContentTypes?: ReadonlySet<string> },
): Result<void, EditorError> => {
  for (const block of blocks) {
    // divider는 content·children이 없어 검사 대상이 없다(DividerBlock 리프).
    if (block.type === "divider") continue;

    // CodeBlock source는 일반 inline text와 달리 literal Tab을 허용한다.
    // source·language 판정과 canonicalization은 model parseDocument만 소유하고,
    // core는 여기서 일반 inline validator를 중복 적용하지 않는다(G-CNV-001).
    if (block.type === "codeBlock") continue;

    // 4종 미디어 블록(RD-002 DELTA-01)도 divider와 같은 leaf라 content·
    // children이 없어 검사 대상이 없다(spec §3.1).
    if (
      block.type === "file" ||
      block.type === "image" ||
      block.type === "video" ||
      block.type === "audio"
    )
      continue;

    if (block.type === "table") {
      for (const row of block.rows) {
        for (const cell of row.cells) {
          const violation = inlineContentViolation(cell.content, options);
          if (violation !== null) {
            return {
              ok: false,
              error: {
                code: violation.code,
                message: `Block ${block.id} cell ${cell.id} ${violation.reason}`,
              },
            };
          }
        }
      }
      continue;
    }

    const violation = inlineContentViolation(block.content, options);
    if (violation !== null) {
      return {
        ok: false,
        error: {
          code: violation.code,
          message: `Block ${block.id} ${violation.reason}`,
        },
      };
    }

    if (block.children !== undefined && block.children.length > 0) {
      const childResult = validateEditableContent(block.children, options);
      if (!childResult.ok) return childResult;
    }
  }

  return { ok: true, value: undefined };
};

const markToTiptap = (mark: TextMark): TiptapJsonMark => {
  switch (mark.type) {
    case "bold":
      return { type: "bold" };
    case "italic":
      return { type: "italic" };
    case "underline":
      return { type: "underline" };
    case "strike":
      return { type: "strike" };
    case "code":
      return { type: "code" };
    case "link":
      return { type: "link", attrs: { href: mark.href } };
    case "textColor":
      return { type: "textColor", attrs: { color: mark.color } };
    case "backgroundColor":
      return { type: "backgroundColor", attrs: { color: mark.color } };
  }
};

export const inlineContentToTiptap = (
  content: InlineContent,
): TiptapJsonNode[] =>
  content.map((item) => {
    // 계약: validateEditableContent(inlineContentViolation)가 이 시점
    // 이전에 이미 미등록 커스텀 inline 원소·CustomTextMark를
    // EDITOR_FEATURE_UNAVAILABLE로 거절했다는 전제 위에서 동작한다
    // (DELTA-14 "설계 결정" 3). insertBlocks 등 저수준 API가 이 계약을
    // 우회하는 위험은 새로 생기지 않는다 — 이 함수가 PM 조립 예외를
    // 막는 사전 방어일 뿐 최종 권위가 아니라는 기존 위 주석이 이미
    // 인정하는 범주다(RD-002-DELTA-14.md "남은 위험").
    //
    // 등록된 커스텀 inline 원소는 여기서 등록 여부를 다시 확인하지
    // 않는다(RD-002-DELTA-18) — customBlockToTiptapJson이 top-level
    // CustomBlock의 등록 여부를 modelToTiptap 앞단에만 맡기는 것과 같은
    // 설계(그 함수도 등록 여부를 재확인하지 않는다).
    if (!isTextRunItem(item)) {
      return {
        type: item.customType,
        attrs: { props: item.props ?? null },
      };
    }
    const run = item;
    return {
      type: "text",
      text: run.text,
      ...(run.marks === undefined
        ? {}
        : { marks: (run.marks as TextMark[]).map(markToTiptap) }),
    };
  });

// G-TBL-001: 저장 배열 순서는 논리 열 순서의 권위가 아니다. ProseMirror 표는
// 셀의 물리 문서 순서(형제 노드 순서)로 열 위치를 결정하므로, tiptap JSON을
// 만들 때는 반드시 columnId가 가리키는 table.columns 인덱스로 재정렬한다.
export const tableBlockToTiptapJson = (table: TableBlock): TiptapJsonNode => {
  const columnIndexById = columnIndexMap(table);

  return {
    type: "table",
    attrs: {
      blockId: table.id,
      columns: table.columns,
      headerRows: table.headerRows,
      headerColumns: table.headerColumns,
    },
    content: table.rows.map((row) => ({
      type: "tableRow",
      attrs: { rowId: row.id },
      content: [...row.cells]
        .sort(
          (a, b) =>
            (columnIndexById.get(a.columnId) ?? 0) -
            (columnIndexById.get(b.columnId) ?? 0),
        )
        .map((cell) => ({
          type: "tableCell",
          attrs: {
            cellId: cell.id,
            columnId: cell.columnId,
            colspan: cell.columnSpan,
            rowspan: cell.rowSpan,
            colwidth: null,
            textColor: cell.textColor ?? null,
            backgroundColor: cell.backgroundColor ?? null,
            align: cell.align ?? null,
          },
          content: inlineContentToTiptap(cell.content),
        })),
    })),
  };
};

// 문단·헤딩·인용·목록 노드 자체(컨테이너 내부의 blockContent) 인코딩.
// blockId는 더 이상 여기 붙지 않는다 — D19가 identity를 blockContainer로
// 옮겼다. 번호 목록의 null attr은 model 필드 부재와 직대응한다. checkListItem의
// checked는 model 필수 필드라 numberedListItem.startNumber·
// toggleListItem.collapsed와 달리 null(필드 부재)로 떨어지는 경우가 없다 —
// 항상 boolean 값을 그대로 옮긴다(RD-001 DELTA-02).
const blockContentToTiptapJson = (
  block:
    | ParagraphBlock
    | HeadingBlock
    | QuoteBlock
    | BulletListItemBlock
    | NumberedListItemBlock
    | CheckListItemBlock
    | ToggleListItemBlock,
): TiptapJsonNode => ({
  type: block.type,
  ...(block.type === "heading"
    ? {
        attrs: {
          level: block.level,
          // null은 model 필드 부재와 직대응한다(numberedListItem.startNumber와
          // 같은 패턴) — isToggleable/collapsed 값 자체의 유효성은 model
          // parseDocument가 단독 판정한다(G-CNV-001).
          isToggleable: block.isToggleable ?? null,
          collapsed: block.collapsed ?? null,
        },
      }
    : block.type === "numberedListItem"
      ? { attrs: { startNumber: block.startNumber ?? null } }
      : block.type === "checkListItem"
        ? { attrs: { checked: block.checked } }
        : block.type === "toggleListItem"
          ? { attrs: { collapsed: block.collapsed ?? null } }
          : {}),
  content: inlineContentToTiptap(block.content),
});

// CodeBlock은 source run 경계를 저장하지 않는 model 정규형을 그대로 PM의
// text* content로 옮긴다. language 부재는 CodeBlockExtension attr 기본값과
// 같은 null로 명시한다. source·language 보정은 model 권위라 여기서 하지 않는다.
const codeBlockContentToTiptapJson = (block: CodeBlock): TiptapJsonNode => ({
  type: "codeBlock",
  attrs: { language: block.language ?? null },
  content: inlineContentToTiptap(block.content),
});

// 4종 미디어 블록(file/image/video/audio) 인코딩(RD-002 DELTA-01, spec
// §3.1) — divider와 같은 패턴으로 컨테이너 없이 attrs에 전체 prop을 직접
// 배정한다. 값 검증(previewWidth 양수 등)은 model parseDocument 권위라
// 여기서는 null 승격(필드 부재 ↔ PM attr 기본값)만 한다(numberedListItem.
// startNumber와 같은 패턴).
const mediaBlockToTiptapJson = (
  block: FileBlock | ImageBlock | VideoBlock | AudioBlock,
): TiptapJsonNode => ({
  type: block.type,
  attrs: {
    blockId: block.id,
    url: block.url ?? null,
    name: block.name ?? null,
    caption: block.caption ?? null,
    backgroundColor: block.backgroundColor ?? null,
    ...(block.type === "file"
      ? {}
      : block.type === "audio"
        ? { showPreview: block.showPreview ?? null }
        : {
            showPreview: block.showPreview ?? null,
            previewWidth: block.previewWidth ?? null,
            textAlignment: block.textAlignment ?? null,
          }),
  },
});

// Block 1개를 재귀로 PM JSON 노드로 인코딩한다(D19). table·divider·4종
// 미디어 블록은 컨테이너로 감싸지 않는다 — table은 tableBlockToTiptapJson
// 결과를 그대로 직결하고, divider·미디어는 table처럼 컨테이너 없이
// 직결하고 id를 명시 배정한다(parseDOM 없음과 짝 — 변환기·명령이 명시
// 배정). 셋 다 children을 가질 수 없어(model 계층, DELTA-01) 재귀 종료
// 조건이기도 하다.
// paragraph/heading/quote는 blockContainer(blockContent, blockGroup?(
// children…))로 감싼다 — blockGroup은 children이 있을 때만 만든다(빈
// 배열/undefined 둘 다 "자식 없음"으로 접는다). CodeBlock도 container로
// 감싸지만 leaf라 own blockGroup을 만들지 않는다.
// insertBlocks 등 범용 조작 API(spec §3.2, RD-002)가 문서 전체가 아니라
// 새로 삽입·수정한 블록 몇 개만 인코딩해야 해서 export한다 — modelToTiptap은
// Document 전체(빈 blocks 거절 등)를 요구해 이 용도에 맞지 않는다. 재귀
// 규칙(D19 컨테이너·table/divider/media 비포장)은 모두 위 modelToTiptap과
// 동일하다.
export const blockToTiptapJson = (block: Block): TiptapJsonNode => {
  if (block.type === "table") return tableBlockToTiptapJson(block);
  if (block.type === "divider") {
    return { type: "divider", attrs: { blockId: block.id } };
  }
  if (
    block.type === "file" ||
    block.type === "image" ||
    block.type === "video" ||
    block.type === "audio"
  ) {
    return mediaBlockToTiptapJson(block);
  }

  if (block.type === "codeBlock") {
    return {
      type: "blockContainer",
      attrs: { blockId: block.id },
      content: [codeBlockContentToTiptapJson(block)],
    };
  }

  const content: TiptapJsonNode[] = [blockContentToTiptapJson(block)];
  if (block.children !== undefined && block.children.length > 0) {
    content.push({
      type: "blockGroup",
      content: block.children.map(blockToTiptapJson),
    });
  }

  return {
    type: "blockContainer",
    attrs: {
      blockId: block.id,
      // TextBlockProps(RD-001 DELTA-02) — block은 여기서 이미 codeBlock/
      // table/divider가 제외된 7개 타입으로 좁혀져 있다(위 이른 반환들).
      textColor: block.textColor ?? null,
      backgroundColor: block.backgroundColor ?? null,
      textAlignment: block.textAlignment ?? null,
    },
    content,
  };
};

// registry(RD-002-DELTA-11)에 등록된 CustomBlock을 PM JSON으로 인코딩한다.
// blockToTiptapJson(위, export)에는 이 분기를 섞지 않는다 — CustomBlock은
// top-level 전용이라(RD-002-DELTA-01 "설계 결정") 그 함수의 다른 소비처
// (children 재귀, insertBlocks류 범용 API)에는 나타날 수 없다. content
// 모드("none"|"inline")는 실제 PM 콘텐츠 표현과 무관하게 attrs에 그대로
// 저장해 round-trip만 보존한다(DELTA-11.md "결정" 1 — model에 인라인
// 텍스트를 담을 필드가 없어 실제 편집은 범위 밖).
const customBlockToTiptapJson = (block: CustomBlock): TiptapJsonNode => ({
  type: block.type,
  attrs: {
    blockId: block.id,
    contentMode: block.content,
    props: block.props ?? null,
  },
});

// enabledBlockTypes(RD-002-DELTA-12)로 비활성화한 알려진 타입이 문서
// 어디에라도(최상위든 임의 깊이 중첩 children이든) 있으면 그 블록을
// 반환한다 — 7개 nestable 타입(paragraph/heading/quote/목록 4종)은 자식을
// 가질 수 있어 top-level만으로는 부족하다(CustomBlock 거절과 다른
// 이유, CustomBlock은 leaf·top-level 전용). PM 스키마에 없는 노드
// 타입으로 Editor를 만들거나 insertContent하면 PM이 예외를 던지므로
// 로드 자체를 막는다. block-tree.ts의 기존 재사용 프리미티브를 그대로
// 쓴다 — 재귀를 여기서 다시 구현하지 않는다.
const findDisabledBlock = (
  blocks: Document["blocks"],
  enabledBlockTypes: EnabledBlockTypes | undefined,
): Document["blocks"][number] | undefined => {
  if (enabledBlockTypes === undefined) return undefined;
  let found: Document["blocks"][number] | undefined;
  walkBlockTree(
    blocks,
    null,
    (block) => {
      if (
        isKnownBlockType(block.type) &&
        !isBlockTypeEnabled(block.type, enabledBlockTypes)
      ) {
        found = block;
        return false;
      }
    },
    false,
  );
  return found;
};

export const modelToTiptap = (
  document: Document,
  options?: {
    customBlockTypes?: ReadonlySet<string>;
    customInlineContentTypes?: ReadonlySet<string>;
    enabledBlockTypes?: EnabledBlockTypes;
  },
): Result<TiptapJsonNode, EditorError> => {
  if (document.blocks.length === 0) {
    return invalid("R0 editor documents require at least one block");
  }
  const customBlockTypes = options?.customBlockTypes ?? new Set<string>();
  // top-level CustomBlock(model, RD-002-DELTA-01)은 model 계약상 유효하지만
  // registry(CreateEditorOptions.customBlocks, RD-002-DELTA-11)에 등록되지
  // 않은 타입은 PM atom 노드가 없다 — 조용히 무시하거나
  // blockToTiptapJson/validateEditableContent가 알려진 14종 전용 필드
  // (content: InlineContent 등)에 접근해 잘못 동작하게 두지 않고 로드
  // 자체를 명시적으로 거절한다.
  const rejectedBlock = document.blocks.find(
    (block) =>
      !isKnownBlockType(block.type) && !customBlockTypes.has(block.type),
  );
  if (rejectedBlock !== undefined) {
    return {
      ok: false,
      error: {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        message: `Block ${rejectedBlock.id} has unregistered custom type "${rejectedBlock.type}" — register it via CreateEditorOptions.customBlocks`,
      },
    };
  }
  const disabledBlock = findDisabledBlock(
    document.blocks,
    options?.enabledBlockTypes,
  );
  if (disabledBlock !== undefined) {
    return {
      ok: false,
      error: {
        code: "EDITOR_FEATURE_UNAVAILABLE",
        message: `Block ${disabledBlock.id} has type "${disabledBlock.type}" disabled via CreateEditorOptions.enabledBlockTypes`,
      },
    };
  }
  const knownBlocks = document.blocks.filter((block) =>
    isKnownBlockType(block.type),
  ) as Block[];

  const representable = validateEditableContent(knownBlocks, options);
  if (!representable.ok) return representable;

  return {
    ok: true,
    value: {
      type: "doc",
      content: document.blocks.map((block) =>
        isKnownBlockType(block.type)
          ? blockToTiptapJson(block as Block)
          : customBlockToTiptapJson(block as CustomBlock),
      ),
    },
  };
};
