import { detectMarkdownPaste, importHtml } from "@cp949/geul-io";
import {
  type Block,
  type IdFactory,
  MAX_NESTING_DEPTH,
} from "@cp949/geul-model";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { isInTable } from "@tiptap/pm/tables";

import { modelDepthAtPasteTarget } from "./indent-commands.js";
import { modelToTiptap, type TiptapJsonNode } from "./model-to-tiptap.js";

// spec §7.3은 HTML 붙여넣기가 문서 HTML import와 같은 sanitizer·매핑을
// 재사용해야 한다고 못 박는다 — 개별 Tiptap 확장의 parseHTML을 하나씩
// 여는 대신, 클립보드에서 파싱한 Document를 modelToTiptap으로 인코드해
// editor.commands.insertContent로 삽입하면 슬라이스 2~9가 쌓은 전체
// 블록 타입을 한 경로로 커버한다. TablePasteExtension이 이미 같은
// handlePaste 가로채기 패턴으로 표를 처리하므로 이 확장은 그 패턴을
// 그대로 따르되 표가 아닌 콘텐츠만 다룬다.
//
// 등록 순서는 ListPasteFallbackExtension 다음이다(RD-004 "## 결정") —
// 옛 확장이 목록 요소(ul/ol) 있는 HTML만 가로채므로 목록 없는 HTML만
// 자연히 이 확장으로 흘러온다. 이 확장 자신은 목록을 배제하는 코드를
// 두지 않는다 — RD-005가 옛 확장을 제거하는 순간 목록류까지 그대로
// 흡수한다.
//
// own export document HTML의 data-be-children wrapper와 생산 편집기
// in-editor copy의 data-be-block-group wrapper(RD-002가 io.importHtml
// 에서 이미 동등하게 인식) 둘 다 이 확장을 거치지 않고 io.importHtml에
// 원본 그대로 전달된다 — 이 확장은 두 형식을 구분하는 사전 정규화
// 코드를 갖지 않는다(G-CNV-002, 의미는 sanitize 이후 HAST에서만 만든다).

export type ClipboardPasteOptions = { createId: IdFactory };

// 이미 조립된 blockContainer JSON 배열의 절대 깊이가 MAX_NESTING_DEPTH를
// 넘지 않도록 평탄화한다. list-paste-fallback-extension.ts의 clampDepth와
// 같은 정책(초과 지점의 blockGroup을 지우지 않고 그 children을 부모의
// 형제로 승격)이지만 RD-005가 그 파일을 통째로 삭제할 예정이라 공유
// 모듈로 뽑지 않고 독립 복제한다(RD-004 "## 결정").
const clampDepth = (
  nodes: TiptapJsonNode[],
  startDepth: number,
): TiptapJsonNode[] => {
  const result: TiptapJsonNode[] = [];
  for (const node of nodes) {
    if (node.type !== "blockContainer" || node.content === undefined) {
      result.push(node);
      continue;
    }
    const groupIndex = node.content.findIndex(
      (child) => child.type === "blockGroup",
    );
    const group = groupIndex === -1 ? undefined : node.content[groupIndex];
    if (group === undefined || group.content === undefined) {
      result.push(node);
      continue;
    }
    if (startDepth >= MAX_NESTING_DEPTH) {
      result.push({
        ...node,
        content: node.content.filter((child) => child.type !== "blockGroup"),
      });
      result.push(...clampDepth(group.content, startDepth));
      continue;
    }
    const clampedChildren = clampDepth(group.content, startDepth + 1);
    result.push({
      ...node,
      content: node.content.map((child, index) =>
        index === groupIndex ? { ...child, content: clampedChildren } : child,
      ),
    });
  }
  return result;
};

// 비표 블록의 id를 하위 트리 전체에서 전부 새로 발급한다(재귀). own HTML이
// 대상 문서와 같은 data-be-block-id를 담고 있어도(RD-002가 원본 값을
// 보존한다) 그 값을 대상 문서에 재사용하지 않는다 — 표 열·행·셀 id는 R1
// 표 경로가 소유해 손대지 않는다. 코드베이스의 일반 블록 생성 명령
// (divider-commands.ts 등)과 같은 관례로 createId()를 무조건 새로
// 호출한다 — duplicateBlock류의 세션-Document 충돌 검사 allocator는
// 이 확장이 접근할 수 없는 세션 내부 상태가 필요해 재사용하지 않는다
// (readiness probe 근거, `_works/roadmap/result/RD-004-DELTA-01.md`).
const reassignNonTableBlockIds = (
  blocks: readonly Block[],
  createId: IdFactory,
): Block[] =>
  blocks.map((block): Block => {
    if (block.type === "table") return block;
    if (!("children" in block) || block.children === undefined) {
      return { ...block, id: createId() };
    }
    return {
      ...block,
      id: createId(),
      children: reassignNonTableBlockIds(block.children, createId),
    };
  });

export const ClipboardPasteExtension = Extension.create<ClipboardPasteOptions>({
  name: "clipboardPaste",

  addOptions() {
    return {
      createId: () => {
        throw new Error("ClipboardPasteExtension requires a createId option");
      },
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    const createId = this.options.createId;

    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            // 표 셀 안에서는 손대지 않는다(R1 계약 그대로).
            if (isInTable(view.state)) return false;
            const clipboardData = event.clipboardData;
            if (clipboardData === null) return false;

            const html = clipboardData.getData("text/html");
            const text = clipboardData.getData("text/plain");

            const insert = (nodes: TiptapJsonNode[]): void => {
              if (nodes.length === 0) return;
              const targetDepth = modelDepthAtPasteTarget(
                view.state.selection.$from,
              );
              editor.commands.insertContent(clampDepth(nodes, targetDepth));
            };

            if (html.length > 0) {
              // TablePasteExtension이 이 확장보다 먼저 등록돼 있어(
              // production-editor-assembly.ts) 표 형태 HTML은 여기
              // 도달하지 않는다 — 이 확장 안에서 표 여부를 다시
              // 판정하지 않는다.
              // createId를 넘기지 않는다 — 이 결과의 모든 비표 블록 id는
              // 어차피 아래에서 전부 재발급되므로, importHtml 내부가 임시로
              // 발급하는 기본 id(own 마커가 없는 블록에만 해당)까지 editor의
              // createId로 낭비하지 않는다.
              const imported = importHtml(html);
              if (!imported.ok) return true;
              const document = {
                ...imported.value.document,
                blocks: reassignNonTableBlockIds(
                  imported.value.document.blocks,
                  createId,
                ),
              };
              const encoded = modelToTiptap(document);
              if (!encoded.ok) return true;
              insert(encoded.value.content ?? []);
              return true;
            }

            if (text.length === 0) return false;

            const detection = detectMarkdownPaste(text, { createId });
            if (!detection.detected) return false;

            const encoded = modelToTiptap(detection.document);
            if (!encoded.ok) return true;
            insert(encoded.value.content ?? []);
            return true;
          },
        },
      }),
    ];
  },
});
