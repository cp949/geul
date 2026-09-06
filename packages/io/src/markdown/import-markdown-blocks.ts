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
import type { ImportWarning } from "./import-markdown-warnings.js";

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
  warnings: ImportWarning[],
): Block[] {
  const blocks: Block[] = [];
  for (const node of nodes) {
    appendNodeBlocks(blocks, node, blocksFromNode(node, createId, warnings));
  }
  return blocks;
}

function listBlocksFromNode(
  node: MarkdownNode,
  createId: IdFactory,
  warnings: ImportWarning[],
): Block[] {
  const blocks: Block[] = [];

  for (const [itemIndex, item] of (node.children ?? []).entries()) {
    if (item.type !== "listItem") {
      blocks.push(...blocksFromNode(item, createId, warnings));
      continue;
    }

    const id = createId();
    const itemChildren = item.children ?? [];
    const contentNode =
      itemChildren[0]?.type === "paragraph" ? itemChildren[0] : undefined;
    const childNodes =
      contentNode === undefined ? itemChildren : itemChildren.slice(1);
    const children = blocksFromNodes(childNodes, createId, warnings);
    const content: InlineContent = [];
    readInlineNodes(contentNode?.children ?? [], [], content, warnings, {
      blockId: id,
      inTableCell: false,
    });

    if (item.checked === true || item.checked === false) {
      blocks.push({
        id,
        type: "checkListItem",
        checked: item.checked,
        content,
        ...(children.length === 0 ? {} : { children }),
      });
      continue;
    }

    if (node.ordered === true) {
      blocks.push({
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
      });
    } else {
      blocks.push({
        id,
        type: "bulletListItem",
        content,
        ...(children.length === 0 ? {} : { children }),
      });
    }
  }

  return blocks;
}

// blockquote 안 문단마다 children 없는 형제 quote 블록을 만든다(D8) —
// import 직후 quote가 children을 갖지 않아야 그 문서를 다시 strict
// export했을 때 NESTED_CHILDREN으로 실패하는 비대칭이 생기지 않는다.
// 비문단 자식(heading·list·table 등)은 인용 구조를 표현할 수 없으므로 일반
// blocksFromNode 매핑으로 풀어내고 QUOTE_CHILD_DOWNGRADED로 경고하며,
// 중첩 blockquote는 같은 규칙을 재귀 적용한 뒤 NESTED_QUOTE_FLATTENED로
// 경고한다(G-CNV-002 — 구조 단순화를 조용히 버리지 않는다).
function blockquoteToBlocks(
  node: MarkdownNode,
  createId: IdFactory,
  warnings: ImportWarning[],
): Block[] {
  const blocks: Block[] = [];

  for (const child of node.children ?? []) {
    if (child.type === "paragraph") {
      const id = createId();
      blocks.push({
        id,
        type: "quote",
        content: inlineContentFromNodes(child.children ?? [], warnings, {
          blockId: id,
          inTableCell: false,
        }),
      });
      continue;
    }

    if (child.type === "blockquote") {
      const nestedBlocks = blockquoteToBlocks(child, createId, warnings);
      appendNodeBlocks(blocks, child, nestedBlocks);
      const firstNestedBlock = nestedBlocks[0];
      if (firstNestedBlock !== undefined) {
        warnings.push({
          kind: "NESTED_QUOTE_FLATTENED",
          blockId: firstNestedBlock.id,
          message: "Nested blockquote was flattened into sibling blocks",
        });
      }
      continue;
    }

    const childBlocks = blocksFromNode(child, createId, warnings);
    appendNodeBlocks(blocks, child, childBlocks);
    const firstChildBlock = childBlocks[0];
    if (firstChildBlock !== undefined) {
      warnings.push({
        kind: "QUOTE_CHILD_DOWNGRADED",
        blockId: firstChildBlock.id,
        message: `Blockquote child "${child.type}" was imported outside the quote structure`,
      });
    }
  }

  if (blocks.length === 0) {
    blocks.push({ id: createId(), type: "quote", content: [] });
  }

  return blocks;
}

const unsupportedBlockText = (node: MarkdownNode): string =>
  node.value ?? node.alt ?? node.url ?? node.identifier ?? "";

function unsupportedBlocksFromNode(
  node: MarkdownNode,
  createId: IdFactory,
  warnings: ImportWarning[],
): Block[] {
  const hasBlockChildren =
    node.children?.some((child) => blockNodeTypes.has(child.type)) === true;
  const blocks = hasBlockChildren
    ? blocksFromNodes(node.children ?? [], createId, warnings)
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
  warnings: ImportWarning[],
): Block[] {
  if (node.type === "definition") return [];
  if (node.type === "table") {
    return [tableFromNode(node, createId, warnings)];
  }
  if (node.type === "list") {
    return listBlocksFromNode(node, createId, warnings);
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
    const depth = (node.depth ?? 1) as HeadingLevel;
    return [
      {
        id,
        type: "heading",
        level: depth,
        content,
      },
    ];
  }

  if (node.type === "thematicBreak") {
    return [{ id: createId(), type: "divider" }];
  }

  if (node.type === "blockquote") {
    return blockquoteToBlocks(node, createId, warnings);
  }

  if (node.type === "html") {
    return [paragraphFromNodes([node], createId, warnings)];
  }
  return unsupportedBlocksFromNode(node, createId, warnings);
}

export const documentFromRoot = (
  root: MarkdownRoot,
  createId: IdFactory,
  warnings: ImportWarning[],
): Document => {
  const blocks = blocksFromNodes(root.children, createId, warnings);

  return { formatVersion: 1, revision: 0, blocks };
};
