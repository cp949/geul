/**
 * markdown import own-traversal의 결정적 깊이 방어(Issue #135)를 검증한다.
 * blockquote·list 중첩이 model 상한(MAX_NESTING_DEPTH)까지는 캡 이전과
 * 동일하게 보존되고, 상한을 넘으면 전면 거절 대신 초과분이 형제 블록으로
 * 평탄화되며 NESTED_BLOCKS_FLATTENED 경고와 함께 ok:true를 반환하는지
 * 고정한다(구조 단언만 사용, PIT-0034 — wall-clock 미사용).
 *
 * §9 갱신: own-cap(64, MAX_NESTING_DEPTH)만으로는 "model 깊이"를 64로
 * 묶을 뿐, 캡을 넘은 나머지 mdast 서브트리를 여전히 blocksFromNodes
 * 상호재귀로 한 단계씩 내려가므로(같은 depth 인자로 반복 호출) 호출 스택
 * 깊이 자체는 입력의 실제 중첩 단수에 비례해 계속 자란다 — 실측으로 depth
 * 1370(비결정)·2000·3000+에서 RangeError가 재현됐다. 그래서
 * capMarkdownTreeDepth(import-markdown-tree-depth.ts)가 own-traversal
 * "이전"에 raw mdast 트리 자체를 MAX_MARKDOWN_TREE_DEPTH(256)로 캡해
 * own-traversal에 들어가는 재귀 호출 횟수 자체를 유계로 만든다. 아래
 * "깊은 중첩" describe가 이 사전 캡으로 crash-free를 고정한다.
 */
import { MAX_NESTING_DEPTH } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { importMarkdown } from "../src/index.js";
import {
  capMarkdownTreeDepth,
  MAX_MARKDOWN_TREE_DEPTH,
} from "../src/markdown/import-markdown-tree-depth.js";
import {
  buildNestedBlockquoteMarkdown,
  buildNestedEmphasisMarkdown,
  buildNestedListMarkdown,
  documentNestingDepth,
  documentVisibleText,
  parseRawMarkdownTree,
  rawMarkdownTreeDepth,
} from "./markdown-depth-support.js";

describe("blockquote 깊이 방어", () => {
  it(`중첩이 MAX_NESTING_DEPTH-1(${MAX_NESTING_DEPTH - 1})이면 캡 이전과 동일하게 전부 보존되고 경고가 없다`, () => {
    const result = importMarkdown(
      buildNestedBlockquoteMarkdown(MAX_NESTING_DEPTH - 1),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(documentNestingDepth(result.value.document)).toBe(
      MAX_NESTING_DEPTH - 1,
    );
    expect(result.value.warnings).toEqual([]);
  });

  it(`중첩이 정확히 MAX_NESTING_DEPTH(${MAX_NESTING_DEPTH})이면 캡 이전과 동일하게 전부 보존되고 경고가 없다`, () => {
    const result = importMarkdown(
      buildNestedBlockquoteMarkdown(MAX_NESTING_DEPTH),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(documentNestingDepth(result.value.document)).toBe(MAX_NESTING_DEPTH);
    expect(result.value.warnings).toEqual([]);
  });

  it(`중첩이 MAX_NESTING_DEPTH+1(${MAX_NESTING_DEPTH + 1})이면 depth ${MAX_NESTING_DEPTH}까지 보존하고 초과분을 형제로 평탄화하며 NESTED_BLOCKS_FLATTENED를 경고한다`, () => {
    const result = importMarkdown(
      buildNestedBlockquoteMarkdown(MAX_NESTING_DEPTH + 1),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(documentNestingDepth(result.value.document)).toBe(MAX_NESTING_DEPTH);
    expect(documentVisibleText(result.value.document)).toContain("leaf");
    expect(result.value.warnings).toEqual([
      expect.objectContaining({ kind: "NESTED_BLOCKS_FLATTENED" }),
    ]);
  });

  it("중첩 200단(캡보다 훨씬 깊지만 own-traversal 크래시 표면과는 거리가 먼 안전 구간)도 depth 상한까지 보존하고 초과분 전부를 형제로 평탄화한다", () => {
    const depth = 200;
    const result = importMarkdown(buildNestedBlockquoteMarkdown(depth));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(documentNestingDepth(result.value.document)).toBe(MAX_NESTING_DEPTH);
    expect(documentVisibleText(result.value.document)).toContain("leaf");
    expect(result.value.warnings).toHaveLength(depth - MAX_NESTING_DEPTH);
    expect(
      result.value.warnings.every((w) => w.kind === "NESTED_BLOCKS_FLATTENED"),
    ).toBe(true);
  });
});

describe("list 깊이 방어", () => {
  it(`중첩이 MAX_NESTING_DEPTH+1(${MAX_NESTING_DEPTH + 1})이면 depth ${MAX_NESTING_DEPTH}까지 보존하고 초과분을 형제로 평탄화하며 NESTED_BLOCKS_FLATTENED를 경고한다`, () => {
    const result = importMarkdown(
      buildNestedListMarkdown(MAX_NESTING_DEPTH + 1),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(documentNestingDepth(result.value.document)).toBe(MAX_NESTING_DEPTH);
    expect(documentVisibleText(result.value.document)).toContain(
      `item-${MAX_NESTING_DEPTH + 1}`,
    );
    expect(result.value.warnings).toEqual([
      expect.objectContaining({ kind: "NESTED_BLOCKS_FLATTENED" }),
    ]);
  });
});

// own-cap(64)만으로는 depth 1370부터 실측 크래시가 재현된다(§9 결정 근거) —
// own-cap 도달 후에도 남은 서브트리가 여전히 blocksFromNodes 상호재귀로
// 순회되기 때문에, 재귀 호출 스택 깊이 자체는 own-cap과 무관하게 입력의
// 실제 중첩 단수에 비례해 계속 자란다. 이 describe는 사전 트리 캡
// (capMarkdownTreeDepth, MAX_MARKDOWN_TREE_DEPTH=256)이 그 재귀 호출 횟수
// 자체를 유계로 묶어 크래시를 없앤다는 완료 조건 3을 고정한다. 아래 depth
// 값(1370/2000/5000)은 own-cap만 있던 상태에서 RangeError로 실패(RED)함을
// 먼저 실행해 확인한 값이다.
describe("깊은 중첩(own-cap 도달 후에도 크래시하던 구간) 크래시 방지(§9)", () => {
  it.each([1370, 2000, 5000])(
    "blockquote 중첩 depth %i는 크래시 없이 성공하고 DEEP_TREE_FLATTENED를 경고한다",
    (depth) => {
      const result = importMarkdown(buildNestedBlockquoteMarkdown(depth));

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(`${result.error.code}: ${result.error.message}`);
      }
      expect(result.value.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "DEEP_TREE_FLATTENED" }),
        ]),
      );
    },
  );

  // list는 blockquote와 같은 절대 depth(1370)를 쓰지 않는다 — 실측으로
  // 확인한 사실: remark-gfm의 list 파싱 자체가 중첩 단수에 초선형으로
  // 느려진다(list 300단 파싱 ~1.3초, 800단 ~22초, 1370단은 100초 넘게
  // 걸려 own-traversal 크래시 여부를 보기도 전에 테스트가 타임아웃된다).
  // 이 초선형 파싱 시간은 own-traversal(파서 이후 단계)과 무관한 별개
  // 문제로 Issue #206에 이미 분리돼 있고(계획 §5, 범위 밖), own-cap만
  // 있던 상태로 직접 측정한 결과 list는 800단까지도 own-traversal이
  // 크래시하지 않았다(전부 ok:true) — 즉 list의 own-traversal 콜스택
  // 크래시 임계값은 blockquote보다 훨씬 깊거나, 그 임계값에 도달하기
  // 전에 파싱 시간이 먼저 비현실적으로 커진다. 그래서 이 테스트는 "언젠가
  // 크래시하던 지점"이 아니라 "사전 트리 캡(raw depth 602 > 256)이 실제로
  // 발동해 DEEP_TREE_FLATTENED가 경고되고 크래시 없이 성공한다"만
  // 검증한다 — list 300단은 파싱 시간이 여전히 짧으면서(약 1.3초) 캡
  // 발동 조건(raw depth > MAX_MARKDOWN_TREE_DEPTH)을 확실히 넘는다(300단
  // list의 raw depth는 2*300+2=602).
  it("list 중첩 300단(사전 캡 발동 조건을 확실히 넘는 실용적 깊이)은 크래시 없이 성공하고 DEEP_TREE_FLATTENED를 경고한다", () => {
    const result = importMarkdown(buildNestedListMarkdown(300));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "DEEP_TREE_FLATTENED" }),
      ]),
    );
  });

  // 결함 1(리뷰, Issue #135) — capMarkdownTreeDepth가 캡 도달 노드를 위치
  // 구분 없이 항상 {type:"paragraph", children:[...]}로 치환하면, emphasis
  // 중첩처럼 phrasing content(paragraph.children) 위치에서 캡이 발동할 때
  // paragraph(flow 노드)가 phrasing 부모의 자식이 되는 mdast 구조 위반이
  // 생긴다. readInlineNodes는 "paragraph" case가 없어 default 분기로
  // 떨어져 실제 원인(깊이 캡)과 무관한 UNSUPPORTED_INLINE_DOWNGRADED를
  // 오보고한다. 600단은 raw 깊이 301(paragraph 진입 1 + emphasis 600 -
  // 안쪽 300개만 캡 이전에 소비되고 나머지가 절단됨)로 캡을 확실히 넘는다.
  it("emphasis 중첩(phrasing 위치)이 사전 캡에 걸리면 UNSUPPORTED_INLINE_DOWNGRADED를 오보고하지 않고 DEEP_TREE_FLATTENED만 경고하며 텍스트를 보존한다", () => {
    const result = importMarkdown(buildNestedEmphasisMarkdown(600, "x"));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
    expect(documentVisibleText(result.value.document)).toContain("x");
    expect(
      result.value.warnings.some(
        (w) => w.kind === "UNSUPPORTED_INLINE_DOWNGRADED",
      ),
    ).toBe(false);
    expect(result.value.warnings).toEqual([
      expect.objectContaining({ kind: "DEEP_TREE_FLATTENED" }),
    ]);
  });
});

// capMarkdownTreeDepth(사전 트리 캡) 자체의 경계를 own-cap·documentFromRoot
// 경로와 분리해 단위 테스트한다 — importMarkdown을 거치면 own-cap(64)이
// 항상 먼저 겹쳐 결과 warning에 NESTED_BLOCKS_FLATTENED가 섞이므로, "raw
// mdast 트리 깊이가 정확히 캡 경계일 때 truncated가 어떻게 갈리는지"를
// 순수하게 보려면 raw 파서 출력에 capMarkdownTreeDepth를 직접 호출해야
// 한다. 경계값은 어림짐작이 아니라 rawMarkdownTreeDepth로 실측해 정했다 —
// blockquote N단 중첩의 raw 깊이는 N+2다(blockquote 노드 N개 체인 자체가
// 아니라, 가장 안쪽 blockquote가 감싼 paragraph+text까지 포함해서 깊이가
// 매겨지기 때문에 "N단 중첩 = 캡 N단 초과"가 아니라 "N+2단"이 된다 —
// measure-depth 스크립트로 levels=1,63,64,254,255,256,257,500을 전부
// 대조해 이 관계가 항상 정확히 N+2임을 확인했다). 그래서 raw 깊이를 정확히
// MAX_MARKDOWN_TREE_DEPTH(256)에 맞추려면 levels=254를 써야 한다(254+2=256).
//
// 캡을 넘었을 때의 결과 깊이도 어림짐작하지 않고 실측으로 정정했다 —
// HTML의 capParse5TreeDepth는 절단 노드를 "bare text 노드"로 바꿔 결과가
// 캡 이하로 정확히 떨어지지만, markdown은 명세상 절단 노드를
// `{type:"paragraph", children:[{type:"text", value}]}`(2단짜리 wrapper)로
// 바꿔야 한다(loose text가 blockquote/list item의 직계 자식일 수 없는
// mdast 제약, own-traversal이 이후 block 노드를 기대하기 때문). 그 결과
// 절단된 노드는 "캡에 처음 도달한 depth"(항상 정확히
// MAX_MARKDOWN_TREE_DEPTH — 그보다 얕으면 재귀를 계속하고 그보다 깊은
// 값에는 애초에 도달하지 못한다) 자리에 그대로 남고, 그 자식 text가 한
// 단 더 깊다 — 즉 결과 최대 깊이는 입력이 아무리 깊어도 항상 정확히
// MAX_MARKDOWN_TREE_DEPTH + 1로 고정된다(HTML의 "결과 <= 캡"과 달리
// markdown은 "결과 <= 캡 + 1"이 진짜 계약이다). 아래 세 번째 테스트가
// 이 상수 상한이 입력 깊이(255 대 5000)와 무관함을 직접 보여준다 —
// own-traversal 크래시 방지에 실제로 중요한 성질은 정확히 이것이다
// (재귀 호출 스택 소비가 입력 크기에 비례하지 않고 상수로 묶인다).
describe("capMarkdownTreeDepth 경계(§9)", () => {
  it(`blockquote 254단(raw 트리 깊이 정확히 MAX_MARKDOWN_TREE_DEPTH(256))은 캡에 걸리지 않는다`, () => {
    const root = parseRawMarkdownTree(buildNestedBlockquoteMarkdown(254));
    expect(rawMarkdownTreeDepth(root)).toBe(256);

    const truncated = capMarkdownTreeDepth(root);

    expect(truncated).toBe(false);
    expect(rawMarkdownTreeDepth(root)).toBe(256);
  });

  it("blockquote 255단(raw 트리 깊이 257, 캡을 한 단계 넘음)은 캡에 걸리고 결과 깊이는 캡+1(paragraph wrapper 한 단)로 고정된다", () => {
    const root = parseRawMarkdownTree(buildNestedBlockquoteMarkdown(255));
    expect(rawMarkdownTreeDepth(root)).toBe(257);

    const truncated = capMarkdownTreeDepth(root);

    expect(truncated).toBe(true);
    expect(rawMarkdownTreeDepth(root)).toBe(MAX_MARKDOWN_TREE_DEPTH + 1);
  });

  it("blockquote 5000단처럼 입력이 훨씬 깊어도 결과 깊이는 여전히 캡+1로 고정된다(재귀 호출 스택 소비가 입력 크기에 비례하지 않는다는 방증)", () => {
    const root = parseRawMarkdownTree(buildNestedBlockquoteMarkdown(5000));
    expect(rawMarkdownTreeDepth(root)).toBe(5002);

    const truncated = capMarkdownTreeDepth(root);

    expect(truncated).toBe(true);
    expect(rawMarkdownTreeDepth(root)).toBe(MAX_MARKDOWN_TREE_DEPTH + 1);
  });

  it("캡에 걸려도 최심부 텍스트는 보존된다", () => {
    const root = parseRawMarkdownTree(
      buildNestedBlockquoteMarkdown(300, "deep-leaf"),
    );

    const truncated = capMarkdownTreeDepth(root);

    expect(truncated).toBe(true);
    expect(JSON.stringify(root)).toContain("deep-leaf");
  });
});
