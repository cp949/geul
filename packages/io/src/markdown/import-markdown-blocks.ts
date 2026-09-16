// document-import의 핵심 상호재귀 클러스터를 담당한다: blocksFromNode가
// mdast 노드 하나를 Block[]으로 옮기고, list·blockquote·미지원 노드는 각각
// listBlocksFromNode/blockquoteToBlocks/unsupportedBlocksFromNode로
// 위임하며, 이 셋과 blocksFromNodes는 서로 되돌아 호출하는 상호재귀라
// 순환 import를 피하려면 한 파일에 남아야 한다. documentFromRoot가 이
// 클러스터의 유일한 공개 진입점이다.
import {
  type Block,
  type Document,
  type HeadingBlock,
  type IdFactory,
  type InlineContent,
  MAX_NESTING_DEPTH,
} from "@cp949/geul-model";

import type { MarkdownNode, MarkdownRoot } from "./import-markdown-helpers.js";
import {
  inlineContentFromNodes,
  readInlineNodes,
} from "./import-markdown-inline.js";
import {
  imageBlockFromSingleChild,
  paragraphFromNodes,
  paragraphFromText,
} from "./import-markdown-paragraph.js";
import { tableFromNode } from "./import-markdown-table.js";
import {
  type ImportWarning,
  nestedBlocksFlattenedWarning,
} from "./import-markdown-warnings.js";

// remark-parse는 heading depth로 1-6만 생성한다(mdast 계약) — 리터럴
// 유니온을 여기서 다시 쓰지 않고 model의 HeadingBlock에서 파생한다.
type HeadingLevel = HeadingBlock["level"];

const blockNodeTypes = new Set([
  "paragraph",
  "heading",
  "table",
  "list",
  "blockquote",
  "code",
  "html",
  "thematicBreak",
  "definition",
  "footnoteDefinition",
]);

// 서로 다른 mdast node가 만든 block sequence는 model의 평평한 형제
// 배열에서 컨테이너 경계를 잃는다. 앞 numbered sibling과 인접한 새
// sequence의 첫 numbered 항목에 start를 명시해 GFM 번호 재시작을 보존한다.
const appendNodeBlocks = (
  blocks: Block[],
  node: MarkdownNode,
  nodeBlocks: Block[],
): void => {
  const previousBlock = blocks[blocks.length - 1];
  const firstBlock = nodeBlocks[0];
  if (
    previousBlock?.type === "numberedListItem" &&
    firstBlock?.type === "numberedListItem" &&
    firstBlock.startNumber === undefined
  ) {
    firstBlock.startNumber =
      node.type === "list" && node.ordered === true ? (node.start ?? 1) : 1;
  }
  blocks.push(...nodeBlocks);
};

function blocksFromNodes(
  nodes: MarkdownNode[],
  createId: IdFactory,
  depth: number,
  warnings: ImportWarning[],
): Block[] {
  const blocks: Block[] = [];
  for (const node of nodes) {
    appendNodeBlocks(
      blocks,
      node,
      blocksFromNode(node, createId, depth, warnings),
    );
  }
  return blocks;
}

// 캡 도달 여부에 따라 item/quote 자신 바로 뒤에 형제로 이어붙일 nested
// block들을 계산한다 — 캡 미만이면 depth + 1에서 재귀해 진짜 children이 될
// 결과를, 캡 이상이면 같은 depth에서 flatten한 결과를 반환한다(둘 다
// 반환값의 "형태"는 Block[]로 같다 — 호출부가 children으로 감쌀지 형제로
// 풀어놓을지만 다르게 처리한다). 호출부가 캡 도달 시에만 경고를 push한다
// (여기서 push하면 quote·list item 세 분기 모두가 각자 push해야 해
// 중복된다).
const nestedBlocksAtDepth = (
  childNodes: MarkdownNode[],
  createId: IdFactory,
  depth: number,
  warnings: ImportWarning[],
): { atCap: boolean; blocks: Block[] } => {
  const atCap = depth >= MAX_NESTING_DEPTH;
  return {
    atCap,
    blocks: blocksFromNodes(
      childNodes,
      createId,
      atCap ? depth : depth + 1,
      warnings,
    ),
  };
};

function listBlocksFromNode(
  node: MarkdownNode,
  createId: IdFactory,
  depth: number,
  warnings: ImportWarning[],
): Block[] {
  const blocks: Block[] = [];

  for (const [itemIndex, item] of (node.children ?? []).entries()) {
    if (item.type !== "listItem") {
      blocks.push(...blocksFromNode(item, createId, depth, warnings));
      continue;
    }

    const id = createId();
    const itemChildren = item.children ?? [];
    const contentNode =
      itemChildren[0]?.type === "paragraph" ? itemChildren[0] : undefined;
    const childNodes =
      contentNode === undefined ? itemChildren : itemChildren.slice(1);
    const { atCap, blocks: nestedBlocks } = nestedBlocksAtDepth(
      childNodes,
      createId,
      depth,
      warnings,
    );
    const content: InlineContent = [];
    readInlineNodes(contentNode?.children ?? [], [], content, warnings, {
      blockId: id,
      inTableCell: false,
    });
    const children = atCap ? [] : nestedBlocks;

    let itemBlock: Block;
    if (item.checked === true || item.checked === false) {
      itemBlock = {
        id,
        type: "checkListItem",
        checked: item.checked,
        content,
        ...(children.length === 0 ? {} : { children }),
      };
    } else if (node.ordered === true) {
      itemBlock = {
        id,
        type: "numberedListItem",
        ...(itemIndex === 0 &&
        node.start !== undefined &&
        node.start !== null &&
        node.start !== 1
          ? { startNumber: node.start }
          : {}),
        content,
        ...(children.length === 0 ? {} : { children }),
      };
    } else {
      itemBlock = {
        id,
        type: "bulletListItem",
        content,
        ...(children.length === 0 ? {} : { children }),
      };
    }

    if (atCap && nestedBlocks.length > 0) {
      warnings.push(nestedBlocksFlattenedWarning(id));
    }
    blocks.push(itemBlock, ...(atCap ? nestedBlocks : []));
  }

  return blocks;
}

// BLK-005 재평가(Issue #151, RD-001 DELTA-03) — listBlocksFromNode와 동일한
// 패턴으로 mdast blockquote 하나를 quote Block 하나로 옮긴다. 첫 자식이
// paragraph면 그 내용을 own content로 삼고(own content로 승격), 나머지
// 자식(비문단·중첩 blockquote 포함 임의 block)은 blocksFromNodes로 재귀
// 변환해 children에 둔다 — export-markdown.ts의 blockNode quote 분기(own
// paragraph materialize 여부 판정)와 대칭이라 재import가 quote 구조를 그대로
// 복원한다. 첫 자식이 paragraph가 아니면 own content는 빈 배열이고 첫
// 자식부터 children이다(목록 항목의 hasAmbiguousLeadingListParagraph와 동일
// 비대칭 없음 규칙).
function blockquoteToBlocks(
  node: MarkdownNode,
  createId: IdFactory,
  depth: number,
  warnings: ImportWarning[],
): Block[] {
  const id = createId();
  const quoteChildren = node.children ?? [];
  const contentNode =
    quoteChildren[0]?.type === "paragraph" ? quoteChildren[0] : undefined;
  const childNodes =
    contentNode === undefined ? quoteChildren : quoteChildren.slice(1);
  const { atCap, blocks: nestedBlocks } = nestedBlocksAtDepth(
    childNodes,
    createId,
    depth,
    warnings,
  );
  const content: InlineContent = [];
  readInlineNodes(contentNode?.children ?? [], [], content, warnings, {
    blockId: id,
    inTableCell: false,
  });

  if (atCap) {
    if (nestedBlocks.length > 0) {
      warnings.push(nestedBlocksFlattenedWarning(id));
    }
    return [{ id, type: "quote", content }, ...nestedBlocks];
  }

  return [
    {
      id,
      type: "quote",
      content,
      ...(nestedBlocks.length === 0 ? {} : { children: nestedBlocks }),
    },
  ];
}

const unsupportedBlockText = (node: MarkdownNode): string =>
  node.value ?? node.alt ?? node.url ?? node.identifier ?? "";

function unsupportedBlocksFromNode(
  node: MarkdownNode,
  createId: IdFactory,
  depth: number,
  warnings: ImportWarning[],
): Block[] {
  const hasBlockChildren =
    node.children?.some((child) => blockNodeTypes.has(child.type)) === true;
  const blocks = hasBlockChildren
    ? blocksFromNodes(node.children ?? [], createId, depth, warnings)
    : [
        node.children !== undefined && node.children.length > 0
          ? paragraphFromNodes(node.children, createId, warnings)
          : paragraphFromText(unsupportedBlockText(node), createId),
      ];
  if (blocks.length === 0) {
    blocks.push(paragraphFromNodes([], createId, warnings));
  }
  const firstBlock = blocks[0];
  if (firstBlock !== undefined) {
    warnings.push({
      kind: "UNSUPPORTED_BLOCK_DOWNGRADED",
      blockId: firstBlock.id,
      message: `Unsupported block ${node.type} was imported as paragraphs`,
    });
  }
  return blocks;
}

function blocksFromNode(
  node: MarkdownNode,
  createId: IdFactory,
  depth: number,
  warnings: ImportWarning[],
): Block[] {
  if (node.type === "definition") return [];
  if (node.type === "table") {
    return [tableFromNode(node, createId, warnings)];
  }
  if (node.type === "list") {
    return listBlocksFromNode(node, createId, depth, warnings);
  }
  if (node.type === "paragraph") {
    const children = node.children ?? [];
    const onlyChild = children.length === 1 ? children[0] : undefined;
    const promoted =
      onlyChild === undefined
        ? undefined
        : imageBlockFromSingleChild(onlyChild, createId);
    if (promoted !== undefined) return [promoted];
    return [paragraphFromNodes(children, createId, warnings)];
  }

  if (node.type === "code") {
    const id = createId();
    const source = (node.value ?? "").replace(/\r\n?/g, "\n");
    if (node.meta !== undefined && node.meta !== null && node.meta.length > 0) {
      warnings.push({
        kind: "CODE_BLOCK_META_DROPPED",
        blockId: id,
        message: "Code block meta was dropped during import",
      });
    }
    return [
      {
        id,
        type: "codeBlock",
        ...(node.lang === undefined || node.lang === null
          ? {}
          : { language: node.lang }),
        content: source.length === 0 ? [] : [{ text: source }],
      },
    ];
  }

  if (node.type === "heading") {
    const id = createId();
    const content = inlineContentFromNodes(node.children ?? [], warnings, {
      blockId: id,
      inTableCell: false,
    });
    const level = (node.depth ?? 1) as HeadingLevel;
    return [
      {
        id,
        type: "heading",
        level,
        content,
      },
    ];
  }

  if (node.type === "thematicBreak") {
    return [{ id: createId(), type: "divider" }];
  }

  if (node.type === "blockquote") {
    return blockquoteToBlocks(node, createId, depth, warnings);
  }

  if (node.type === "html") {
    return [paragraphFromNodes([node], createId, warnings)];
  }
  return unsupportedBlocksFromNode(node, createId, depth, warnings);
}

export const documentFromRoot = (
  root: MarkdownRoot,
  createId: IdFactory,
  warnings: ImportWarning[],
): Document => {
  const blocks = blocksFromNodes(root.children, createId, 1, warnings);

  return { formatVersion: 1, revision: 0, blocks };
};
