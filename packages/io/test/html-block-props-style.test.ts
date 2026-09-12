// Issue #179 — TextBlockProps(textColor/backgroundColor/textAlignment)를
// exportHtml() 출력의 인라인 style로도 방출하는지 검증한다. data-geul-*
// 3종은 계속 왕복의 유일한 권위 값이고(html-block-props.test.ts가 그
// 계약을 이미 고정한다), style은 별도 CSS·JS 후처리 없이 브라우저가 바로
// 렌더링하도록 값을 복제만 하는 부가 출력이다 — INL-008/INL-009의 인라인
// mark textColor/backgroundColor → `<span style="...">` 선례와 동일 이유
// (임의 #RRGGBB라 정적 CSS attribute-selector로 표현할 수 없다).
import type { Block, Document, TextBlockProps } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { parseStyleDeclarations } from "../src/clipboard/style-declarations.js";
import { exportHtml, importHtml } from "../src/index.js";

// paragraph/heading(h2 대표)/quote/목록 4종 7개 블록 타입이 textBlockPropsAttributes
// 를 통해서만 속성을 받는다는 계약(export-html.ts) 위에서, 같은 props
// 조합이 각 타입에서 동일한 style 문자열로 나오는지 표로 확인한다.
const propsAllThree: TextBlockProps = {
  textColor: "#FF0000",
  backgroundColor: "#00FF00",
  textAlignment: "center",
};
const expectedStyleAllThree =
  "color:#FF0000;background-color:#00FF00;text-align:center";

const blockFixtures: Array<{
  name: string;
  block: Block;
  ownTag: string;
}> = [
  {
    name: "paragraph",
    block: {
      id: "b1",
      type: "paragraph",
      content: [{ text: "x" }],
      ...propsAllThree,
    },
    ownTag: "p",
  },
  {
    name: "heading(h2)",
    block: {
      id: "b1",
      type: "heading",
      level: 2,
      content: [{ text: "x" }],
      ...propsAllThree,
    },
    ownTag: "h2",
  },
  {
    name: "quote",
    block: {
      id: "b1",
      type: "quote",
      content: [{ text: "x" }],
      ...propsAllThree,
    },
    ownTag: "blockquote",
  },
  {
    name: "bulletListItem",
    block: {
      id: "b1",
      type: "bulletListItem",
      content: [{ text: "x" }],
      ...propsAllThree,
    },
    ownTag: "li",
  },
  {
    name: "numberedListItem",
    block: {
      id: "b1",
      type: "numberedListItem",
      content: [{ text: "x" }],
      ...propsAllThree,
    },
    ownTag: "li",
  },
  {
    name: "checkListItem",
    block: {
      id: "b1",
      type: "checkListItem",
      content: [{ text: "x" }],
      checked: false,
      ...propsAllThree,
    },
    ownTag: "li",
  },
  {
    name: "toggleListItem",
    block: {
      id: "b1",
      type: "toggleListItem",
      content: [{ text: "x" }],
      ...propsAllThree,
    },
    ownTag: "summary",
  },
];

describe("완료 조건 1 — 지정된 필드만 인라인 style로 실린다", () => {
  it.each(blockFixtures)(
    "$name의 루트 요소($ownTag)가 color/background-color/text-align 3종을 모두 실은 style을 갖는다",
    ({ block, ownTag }) => {
      const document: Document = {
        formatVersion: 1,
        revision: 0,
        blocks: [block],
      };
      const exported = exportHtml(document);
      expect(exported.ok).toBe(true);
      if (!exported.ok) throw new Error(exported.error.message);
      expect(exported.value).toContain(`style="${expectedStyleAllThree}"`);
      // style은 own 태그 자신에 실린다(목록류는 <li>, toggle은 <summary>) —
      // 바깥 <ul>/<details> 등 컨테이너에는 실리지 않는다.
      const ownTagOpenTags = [
        ...exported.value.matchAll(new RegExp(`<${ownTag}\\b[^>]*>`, "g")),
      ];
      expect(ownTagOpenTags.some((match) => match[0].includes("style="))).toBe(
        true,
      );
    },
  );

  it("textColor 하나만 지정하면 style에도 color 선언 하나만 실린다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          content: [{ text: "x" }],
          textColor: "#ABCDEF",
        },
      ],
    };
    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain('style="color:#ABCDEF"');
    expect(exported.value).not.toContain("background-color");
    expect(exported.value).not.toContain("text-align");
  });

  it("backgroundColor 하나만 지정하면 style에도 background-color 선언 하나만 실린다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          content: [{ text: "x" }],
          backgroundColor: "#112233",
        },
      ],
    };
    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain('style="background-color:#112233"');
  });

  it("textAlignment 하나만 지정하면 style에도 text-align 선언 하나만 실린다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          content: [{ text: "x" }],
          textAlignment: "right",
        },
      ],
    };
    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toContain('style="text-align:right"');
  });

  it("props가 하나도 없으면 style 속성 자체를 내지 않는다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [{ id: "b1", type: "paragraph", content: [{ text: "plain" }] }],
    };
    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value).toBe('<p data-geul-block-id="b1">plain</p>');
  });
});

// style 속성값을 export 문자열에서 그대로 뽑아 실제 CSS 선언 파서
// (parseStyleDeclarations, span mark import가 이미 신뢰해 쓰는 표준 color/
// background-color/text-align 파서)로 되읽는다 — 브라우저가 이 세 선언을
// 원생으로 지원한다는 사실 위에서, "표준 CSS 선언으로 정확히 파싱된다"는
// 것이 "별도 CSS 없이 시각적으로 렌더된다"(완료 조건 2)의 검증 가능한
// 대리 지표다. jsdom computed style 같은 렌더링 엔진 왕복은 이 패키지의
// node 테스트 환경(vitest root config)과 맞지 않고 패키지 의존성도 아니라
// 쓰지 않는다.
const extractStyleAttribute = (html: string): string | undefined =>
  /\sstyle="([^"]*)"/.exec(html)?.[1];

describe("완료 조건 2 — style이 표준 CSS 선언(color/background-color/text-align)으로 파싱된다", () => {
  it("paragraph의 style이 세 선언 모두 원래 값 그대로 파싱된다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          content: [{ text: "x" }],
          ...propsAllThree,
        },
      ],
    };
    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);

    const style = extractStyleAttribute(exported.value);
    expect(style).toBeDefined();
    expect(parseStyleDeclarations(style ?? "")).toEqual({
      color: propsAllThree.textColor,
      backgroundColor: propsAllThree.backgroundColor,
      align: propsAllThree.textAlignment,
    });
  });

  it("bulletListItem(li)의 style이 color 선언으로 파싱된다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "b1",
          type: "bulletListItem",
          content: [{ text: "x" }],
          textColor: "#0000FF",
        },
      ],
    };
    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);

    const style = extractStyleAttribute(exported.value);
    expect(style).toBeDefined();
    expect(parseStyleDeclarations(style ?? "")).toEqual({ color: "#0000FF" });
  });
});

describe("완료 조건 3 — style이 재-import 경고를 만들지 않는다(round-trip)", () => {
  it.each(blockFixtures)(
    "$name을 export한 HTML을 재-import하면 model이 원본과 같고 style 유래 경고가 없다",
    ({ block }) => {
      const document: Document = {
        formatVersion: 1,
        revision: 0,
        blocks: [block],
      };
      const exported = exportHtml(document);
      expect(exported.ok).toBe(true);
      if (!exported.ok) throw new Error(exported.error.message);

      const imported = importHtml(exported.value);
      expect(imported).toEqual({ ok: true, value: { document, warnings: [] } });
    },
  );

  it("heading이 isToggleable이어도(summary가 hN을 감싸는 경로) style 경고 없이 왕복한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "b1",
          type: "heading",
          level: 3,
          content: [{ text: "x" }],
          isToggleable: true,
          collapsed: false,
          ...propsAllThree,
        },
      ],
    };
    const exported = exportHtml(document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(importHtml(exported.value)).toEqual({
      ok: true,
      value: { document, warnings: [] },
    });
  });

  it("직접 작성한 data-geul-*+style p 태그를 import해도 style 경고가 없다", () => {
    const result = importHtml(
      '<p data-geul-block-id="p1" data-geul-text-color="#FF0000" style="color:#FF0000">x</p>',
    );
    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "p1",
              type: "paragraph",
              content: [{ text: "x" }],
              textColor: "#FF0000",
            },
          ],
        },
        warnings: [],
      },
    });
  });
});

// Issue #179 IMPL-REVIEW-01(MAJOR) 수정 검증 — style 오탐 억제를
// "data-geul-* 3종 중 하나라도 있으면 소비"(존재 여부만)로 판정하면 두
// 가지가 깨졌다: (a) data-geul-*가 설명하지 못하는 추가 선언(예:
// font-weight)이 같은 style 안에 섞여 있어도 통째로 조용히 사라지고,
// (b) 서로 다른 두 노드의 "style 제거됨" warning이 배열 순서 기반
// consumePreservedAttributeWarning(findIndex+splice)에서 뒤바뀔 수
// 있었다(리뷰가 재현: 진짜 손실 노드의 warning이 지워지고 무손실 노드
// 쪽이 남는 조합이 가능했다). import-warnings.ts의 isOwnEchoStyle이
// raw 노드 하나만 보고 "raw style이 그 노드의 data-geul-*로 정확히
// 재구성한 값과 완전히 같을 때만" 판정하도록 고쳤다 — 두 결함 모두 여기서
// 재발 여부를 고정한다.
describe("style 오탐 억제는 raw 노드 단위로 정확하다(IMPL-REVIEW-01 MAJOR 수정)", () => {
  it("data-geul-text-color와 정확히 같은 색만 있는 style은 억제된다(회귀 없음 확인)", () => {
    const result = importHtml(
      '<p data-geul-block-id="p1" data-geul-text-color="#112233" style="color:#112233">x</p>',
    );
    expect(result).toEqual({
      ok: true,
      value: {
        document: {
          formatVersion: 1,
          revision: 0,
          blocks: [
            {
              id: "p1",
              type: "paragraph",
              content: [{ text: "x" }],
              textColor: "#112233",
            },
          ],
        },
        warnings: [],
      },
    });
  });

  it("data-geul-text-color가 설명하지 못하는 추가 선언(font-weight)이 섞이면 억제하지 않고 경고한다", () => {
    const result = importHtml(
      '<p data-geul-block-id="p1" data-geul-text-color="#112233" style="color:#112233;font-weight:bold">x</p>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    // textColor 자체는 data-geul-*로 정상 복원된다 — 사라지는 것은
    // font-weight뿐이고, 그 손실이 정확히 경고돼야 한다(조용히 사라지면
    // 안 된다).
    expect(result.value.document.blocks[0]).toEqual({
      id: "p1",
      type: "paragraph",
      content: [{ text: "x" }],
      textColor: "#112233",
    });
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: "p",
          attribute: "style",
        }),
      ]),
    );
  });

  it("진짜 손실이 있는 외부 <p>와 own-echo <p>가 나란히 있으면 진짜 손실 쪽만 경고하고 own-echo 쪽 값은 정상 복원된다", () => {
    const result = importHtml(
      '<p style="font-weight:bold">Foreign</p>' +
        '<p data-geul-block-id="p2" data-geul-text-color="#112233" style="color:#112233">Own</p>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    // own-echo 쪽은 손실 없이 정상 복원된다(억제가 과소 적용되지 않았다).
    expect(result.value.document.blocks[1]).toEqual({
      id: "p2",
      type: "paragraph",
      content: [{ text: "Own" }],
      textColor: "#112233",
    });
    // 경고는 정확히 1건 — foreign 쪽 진짜 손실만 나오고(과소 억제 없음),
    // own-echo 쪽이 잘못 끼어들지 않는다(과잉 억제로 반대쪽까지 삼키지
    // 않음 — 두 결함 모두 여기서 동시에 재확인된다).
    expect(result.value.warnings).toEqual([
      expect.objectContaining({
        kind: "UNSAFE_ATTRIBUTE_REMOVED",
        element: "p",
        attribute: "style",
      }),
    ]);
  });
});

describe("style 단독(외부 HTML)은 여전히 손실로 경고된다 — 억제가 data-geul-* 동반 없이 과잉 적용되지 않는다", () => {
  it("data-geul-text-color 없이 style만 있는 외부 <p>는 style 제거를 경고한다", () => {
    const result = importHtml(
      '<p data-geul-block-id="p1" style="color:#FF0000">x</p>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.value.document.blocks[0]).toEqual({
      id: "p1",
      type: "paragraph",
      content: [{ text: "x" }],
    });
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: "p",
          attribute: "style",
        }),
      ]),
    );
  });

  it("data-geul-* 동반 없이 style만 있는 외부 <li>도 style 제거를 경고한다", () => {
    const result = importHtml('<ul><li style="color:#FF0000">x</li></ul>');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: "li",
          attribute: "style",
        }),
      ]),
    );
  });
});
