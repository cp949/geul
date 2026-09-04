/**
 * PM 기본 붙여넣기 폴백으로 들어오는 외부 ul/ol이 목록 구조(마커 타입·
 * 중첩 계층·명시적 startNumber)를 보존하는지, 그리고 깊이 상한을 넘는
 * 입력이 throw 없이 평탄화되는지 검증한다(DELTA-03, Issue #143 (c)).
 * quote-paste-fallback.test.ts와 같은 패턴(errors 이벤트 리스너로 미처리
 * 예외 감지)을 쓴다.
 */
import {
  isInlineContentBlockType,
  isNestableBlockType,
  MAX_NESTING_DEPTH,
  type Block,
  type InlineContentBlockType,
  type NestableBlockType,
} from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import { contentTextStart } from "./block-test-support.js";
import {
  pasteHtml,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  dividerBlock,
  documentOf,
  listItemBlock,
  maxBlockDepth,
  mountTiptapEditor,
  paragraphDocument,
  selectBlockNode,
  sequentialIds,
} from "./editor-controller-support.js";

/** depth단짜리 <ul><li>...</li></ul> 체인 HTML — li가 정확히 depth개
 * 중첩된다(리프는 leafText, 그 외는 "x"). */
const nestedListHtml = (depth: number, leafText: string): string => {
  let html = `<li>${leafText}</li>`;
  for (let level = 1; level < depth; level += 1) {
    html = `<li>x<ul>${html}</ul></li>`;
  }
  return `<ul>${html}</ul>`;
};

/** depth단짜리 bulletListItem 체인 model Block — chain-1이 top-level,
 * chain-depth가 가장 깊다(top-level=1 기준 절대 깊이 depth). */
const buildListDepthChain = (depth: number): Block => {
  let innermost = listItemBlock(`chain-${depth}`, "bulletListItem", "leaf");
  for (let level = depth - 1; level >= 1; level -= 1) {
    innermost = listItemBlock(`chain-${level}`, "bulletListItem", "mid", {
      children: [innermost],
    });
  }
  return innermost;
};

/** depth단짜리 bulletListItem 체인이되, 가장 깊은 자리(chain-depth)가
 * bulletListItem이 아니라 divider인 model Block — buildListDepthChain과
 * 같은 모양이지만 리프만 다르다. 결함 1(NodeSelection/경계 위치 off-by-one)
 * 재현 전용 — divider는 blockContainer로 감싸이지 않고 blockGroup의 직계
 * 자식으로 나란히 들어간다(divider-extension.ts 상단 주석)는 스키마 사실을
 * 그대로 이용해, 실제 프로덕션 경로(BlockJoinExtension.selectAdjacentAtom)가
 * 만드는 것과 같은 "divider 바로 앞 경계" NodeSelection을 그 depth에
 * 재현한다. */
const buildListChainEndingInDivider = (depth: number): Block => {
  let innermost: Block = dividerBlock(`chain-${depth}`);
  for (let level = depth - 1; level >= 1; level -= 1) {
    innermost = listItemBlock(`chain-${level}`, "bulletListItem", "mid", {
      children: [innermost],
    });
  }
  return innermost;
};

describe("PM 기본 붙여넣기 폴백의 외부 ul/ol", () => {
  it("문단 사이 목록이 섞인 외부 HTML을 붙여넣으면 throw 없이 bulletListItem이 문서에 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, "<p>a</p><ul><li>x</li><li>y</li></ul><p>b</p>");

      const blocks = editor.getDocument().blocks;
      const items = blocks.filter((block) => block.type === "bulletListItem");
      expect(items).toHaveLength(2);
      expect(items.map((item) => item.content)).toEqual([
        [{ text: "x" }],
        [{ text: "y" }],
      ]);

      expect(errors).toEqual([]);
    });
  });

  it("ol[start]가 첫 li의 numberedListItem.startNumber로 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, '<ol start="5"><li>z</li><li>w</li></ol>');

      const blocks = editor.getDocument().blocks;
      const items = blocks.filter((block) => block.type === "numberedListItem");
      expect(items).toHaveLength(2);
      expect(items[0]).toMatchObject({
        content: [{ text: "z" }],
        startNumber: 5,
      });
      expect(items[1]?.startNumber).toBeUndefined();

      expect(errors).toEqual([]);
    });
  });

  // 트랙-6 결함 탐지(BLOCKER): explicitStartNumber는 정수이기만 하면
  // 그대로 통과시켰다 — model schema의 startNumber 범위(min(0).max(999_999_999))를
  // 벗어난 값이 검증 없이 insertContent되면 readEditorDocument가 그 범위
  // 위반을 throw new TypeError로 바꿔 모델↔에디터를 영구 desync시킨다.
  // 범위 밖 값은 explicit start가 아예 없었던 것처럼(undefined) 처리해
  // throw 없이 진행돼야 한다 — 비정수 start를 undefined로 접는 기존
  // 정책(위 테스트의 items[1])과 같은 원칙.
  it("ol[start]가 model 범위를 벗어나면 무시되고 기본 번호로 반영된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, '<ol start="-1"><li>z</li></ol>');

      const blocks = editor.getDocument().blocks;
      const items = blocks.filter((block) => block.type === "numberedListItem");
      expect(items).toHaveLength(1);
      expect(items[0]?.content).toEqual([{ text: "z" }]);
      expect(items[0]?.startNumber).toBeUndefined();

      expect(errors).toEqual([]);
    });
  });

  it("중첩 목록이 children 트리로 반영되고 순서가 보존된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, "<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");

      const blocks = editor.getDocument().blocks;
      const items = blocks.filter((block) => block.type === "bulletListItem");
      expect(items).toHaveLength(2);
      expect(items[0]?.content).toEqual([{ text: "a" }]);
      expect(items[0]?.children).toHaveLength(1);
      expect(items[0]?.children?.[0]).toMatchObject({
        type: "bulletListItem",
        content: [{ text: "b" }],
      });
      expect(items[1]?.content).toEqual([{ text: "c" }]);
      expect(items[1]?.children).toBeUndefined();

      expect(errors).toEqual([]);
    });
  });

  // 완료 조건 4: slice 자신의 내부 깊이만으로 이미 MAX_NESTING_DEPTH를
  // 넘는 입력. guard 없이 그대로 반영하려 하면 readEditorDocument가
  // DOCUMENT_LIMIT_EXCEEDED를 throw new TypeError로 바꾼다(production-editor-
  // session.ts) — window의 error 이벤트로 이 미처리 예외를 잡는다.
  it("MAX_NESTING_DEPTH를 단독으로 넘는 깊게 중첩된 목록을 최상위에 붙이면 throw 없이 상한 안으로 평탄화된다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("seed"),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(tiptap.state.doc.content.size - 2);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedListHtml(MAX_NESTING_DEPTH + 10, "leaf"));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBeLessThanOrEqual(
        MAX_NESTING_DEPTH,
      );
      // isNestableBlockType/isInlineContentBlockType은 maxBlockDepth와 같은
      // 이유로 discriminated union인 block 자체를 좁히지 못한다 — 명시적으로
      // 좁힌다.
      const leaf = document.blocks
        .flatMap(function collect(block): Block[] {
          const children = isNestableBlockType(block.type)
            ? ((block as Extract<Block, { type: NestableBlockType }>)
                .children ?? [])
            : [];
          return [block, ...children.flatMap(collect)];
        })
        .find(
          (block) =>
            isInlineContentBlockType(block.type) &&
            (block as Extract<Block, { type: InlineContentBlockType }>)
              .content[0]?.text === "leaf",
        );
      expect(leaf).toBeDefined();
    });
  });

  // 완료 조건 5(N1 재현): 대상 위치 자체가 이미 깊다(60) — 그 위치에
  // 캐럿을 두고 얕은(5단) slice를 붙여도 합산(60+4=64 근접~초과)이 상한을
  // 넘으면 throw 없이 평탄화된다. guard가 slice 내부 깊이만 보고 대상 위치
  // 깊이를 합산하지 않으면 이 케이스에서 TypeError가 재현된다.
  it("이미 깊은 위치에 캐럿을 두고 목록을 추가로 붙이면 합산 깊이가 상한을 넘어도 throw 없이 평탄화된다", () => {
    const deepChainDepth = 60;
    const editor = createEditor({
      initialDocument: documentOf(buildListDepthChain(deepChainDepth)),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, `chain-${deepChainDepth}`),
    );

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedListHtml(10, "leaf"));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBeLessThanOrEqual(
        MAX_NESTING_DEPTH,
      );
    });
  });

  // 목적 정정(트랙-7 결함 탐지 결함 2): 원래 이 테스트는 "off-by-one 판별"을
  // 목적으로 적었으나, clampDepth를 그대로 재구현해 수치 검증한 결과
  // startDepth가 62든(정확) 63(off-by-one으로 오산)이든 이 depth·levels
  // 조합에서는 둘 다 최종 결과가 동일하게 64가 된다 — 상한 근처에서
  // clampDepth의 "초과 지점 형제 승격" 전략이 시작 깊이 1단 차이를
  // 흡수하기 때문이다(startDepth>=64 조건이 62/63 어느 쪽이든 다섯 단
  // 안에서 걸린다). 즉 이 테스트는 off-by-one을 잡지 못하는 tautology다 —
  // 실제 판별력이 있는 테스트는 아래 "상한에서 멀리 떨어진 위치" 테스트다.
  // 이 테스트는 대신 "상한 근접에서 클램프가 정확히 64에서 발동/도달하는가"
  // (경계값 자체의 clamp 동작)를 고정하는 용도로 남긴다.
  it("깊이 62의 목록 체인에 캐럿을 두고 5단 목록을 붙이면 상한 근접 clamp가 정확히 MAX_NESTING_DEPTH에서 발동한다", () => {
    const deepChainDepth = 62;
    const editor = createEditor({
      initialDocument: documentOf(buildListDepthChain(deepChainDepth)),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, `chain-${deepChainDepth}`),
    );

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedListHtml(5, "leaf"));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBe(MAX_NESTING_DEPTH);
    });
  });

  // 트랙-7 결함 탐지 결함 2 — off-by-one 판별력을 실제로 갖는 테스트.
  // 상한과 충분히(levels=5 이상) 떨어진 시작 깊이에서는 clampDepth의
  // startDepth>=MAX_NESTING_DEPTH 조건이 전혀 발동하지 않는다 — 재귀
  // clampDepth(group.content, startDepth+1) 호출마다 그대로 1단씩 쌓여
  // 결과 트리의 각 레벨 depth가 정확히 startDepth, startDepth+1, …,
  // startDepth+levels-1이 된다(clampDepth 208-246행, 위 depth-62 테스트의
  // tautology 분석과 동일 근거로 이번엔 반대 방향 — flatten이 없으니 흡수도
  // 없다). deepChainDepth=30에 5단(nestedListHtml(5, ...))을 붙이면 정확한
  // targetDepth(30)에서는 최심부가 정확히 30+5-1=34이고, off-by-one이면
  // (+1이든 -1이든) 33 또는 35가 되어 이 값과 어긋난다 — toBe로 직접
  // 구분한다.
  it("상한에서 멀리 떨어진 위치에 목록을 붙이면 결과 최대 깊이가 정확한 값이 된다", () => {
    const deepChainDepth = 30;
    const levels = 5;
    const editor = createEditor({
      initialDocument: documentOf(buildListDepthChain(deepChainDepth)),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    tiptap.commands.setTextSelection(
      contentTextStart(tiptap, `chain-${deepChainDepth}`),
    );

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedListHtml(levels, "leaf"));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBe(deepChainDepth + levels - 1);
    });
  });

  // 트랙-7 결함 탐지 결함 1(BLOCKER) 회귀 — divider(divider-extension.ts)는
  // blockContainer로 감싸이지 않고 blockGroup/doc의 직계 자식으로 나란히
  // 들어간다(D-EDT-… 없음, 스키마 사실 자체). Backspace/Delete로 divider가
  // 인접하면(block-join-extension.ts의 selectAdjacentAtom) 그 자리에
  // NodeSelection이 서고, 그 $anchor는 "divider 바로 앞 경계" 위치라
  // modelDepthAt이 원래 전제하는 계약과 정확히 일치한다(-1 보정이 필요
  // 없다) — 이 상태를 selectBlockNode로 재현한다(findBlockPosition +
  // NodeSelection.create, selectAdjacentAtom이 실제로 만드는 것과 같은 최종
  // selection 상태). divider를 MAX_NESTING_DEPTH(64)에 두고 2단 목록을
  // 붙였을 때, -1 보정을 잘못 적용하면(결함 1) clampDepth가 targetDepth를
  // 63으로 오산해 flatten을 한 단 늦게 시작한다 — pasted 최상위 항목이 실제
  // depth 64(divider의 NodeSelection을 그대로 대체)에 놓이는데 그 nested
  // 자식까지 안 지워진 채 함께 depth 65에 남아 MAX_NESTING_DEPTH를
  // 넘긴다(readEditorDocument가 DOCUMENT_LIMIT_EXCEEDED를 throw). 올바르게
  // 64로 계산하면 clampDepth가 첫 호출부터 flatten해 64 안에 눌러 담는다.
  it("divider가 MAX_NESTING_DEPTH에서 NodeSelection으로 선택된 상태로 목록을 붙이면 throw 없이 상한 안으로 유지된다", () => {
    const dividerDepth = MAX_NESTING_DEPTH;
    const editor = createEditor({
      initialDocument: documentOf(buildListChainEndingInDivider(dividerDepth)),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    selectBlockNode(tiptap, `chain-${dividerDepth}`);

    withUnhandledErrorTracking((errors) => {
      pasteHtml(editable, nestedListHtml(2, "leaf"));

      expect(errors).toEqual([]);
      const document = editor.getDocument();
      expect(maxBlockDepth(document.blocks)).toBeLessThanOrEqual(
        MAX_NESTING_DEPTH,
      );
    });
  });
});
