/**
 * `summary`·`figcaption`의 style 색·서식을 읽는지 고정한다(Issue #342).
 *
 * - toggle로 읽히지 않는 `details`의 `summary`와 단독 `figcaption`은 문단 경계다.
 *   그 문단이 요소의 style 색(블록 속성)과 서식(안쪽 마크)을 이어받는다.
 * - 자기 export toggle의 `summary`는 `toggleListItem`이 된다. 같은 규칙이다.
 *   `data-geul-*` 색이 style 색보다 먼저다. 자기 export가 `summary`에 내는
 *   style은 `data-geul-*`와 같은 값의 에코라 충돌하지 않는다.
 * - 미디어 `figure` 안 `figcaption`은 caption 문자열이다. style을 읽지 않고
 *   문단이 생기지 않는다.
 * - `details` 자신의 style은 읽지 않는다. 래퍼 정책은 Issue #336이 소유한다.
 * - 기대값은 Chromium `getComputedStyle` 실측(2026-10-10, Chromium 153)이다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportHtml, importHtml } from "../src/index.js";

type Run = { text: string; marks?: Array<{ type: string }> };
type TextLike = Document["blocks"][number] & {
  content: Run[];
  textColor?: string;
  backgroundColor?: string;
};

const documentOf = (block: Document["blocks"][number]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks: [block],
});

/** exportHtml → importHtml을 이어 원본 문서를 되돌려준다. */
const roundTrip = (document: Document): Document => {
  const exported = exportHtml(document);
  if (!exported.ok) throw new Error(`export 실패: ${exported.error.message}`);
  const imported = importHtml(exported.value);
  if (!imported.ok) throw new Error(`import 실패: ${imported.error.message}`);
  return imported.value.document;
};

const blocksOf = (html: string): Document["blocks"] => {
  const result = importHtml(html);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.document.blocks;
};

/** 글자 `x`를 든 블록의 속성과 마크 종류를 돌려준다. */
const read = (html: string) => {
  const block = blocksOf(html).find(
    (candidate) =>
      "content" in candidate &&
      (candidate.content as Run[]).some((run) => run.text === "x"),
  ) as TextLike | undefined;
  if (block === undefined) throw new Error("글자 x를 가진 블록이 없다");
  const run = block.content.find((item) => item.text === "x");
  return {
    type: block.type,
    textColor: block.textColor,
    backgroundColor: block.backgroundColor,
    marks: (run?.marks ?? []).map((mark) => mark.type).sort(),
  };
};

describe("toggle이 아닌 details의 summary", () => {
  it("색과 서식을 읽는다", () => {
    expect(
      read(
        '<details open><summary style="font-weight:bold;color:red">x</summary><p>c</p></details>',
      ),
    ).toEqual({
      type: "paragraph",
      textColor: "#FF0000",
      backgroundColor: undefined,
      marks: ["bold"],
    });
  });

  it("배경, 기울임, 밑줄, 취소선을 읽는다", () => {
    expect(
      read(
        '<details open><summary style="background-color:#00ff00;font-style:italic;text-decoration:underline line-through">x</summary><p>c</p></details>',
      ),
    ).toMatchObject({
      backgroundColor: "#00FF00",
      marks: ["italic", "strike", "underline"],
    });
  });

  it("계산 스타일 덤프가 붙으면 색은 읽지 않고 서식은 읽는다", () => {
    expect(
      read(
        '<details open><summary style="color:#112233;font-weight:bold;-webkit-text-stroke-width:0px">x</summary><p>c</p></details>',
      ),
    ).toMatchObject({ textColor: undefined, marks: ["bold"] });
  });

  it("summary 안 span의 끄는 값이 summary 서식을 끈다", () => {
    expect(
      read(
        '<details open><summary style="font-weight:bold"><span style="font-weight:normal">x</span></summary><p>c</p></details>',
      ).marks,
    ).toEqual([]);
  });

  it("details 자신의 style은 읽지 않는다(#336)", () => {
    expect(
      read(
        '<details open style="font-weight:bold;color:red"><summary>x</summary><p>c</p></details>',
      ),
    ).toMatchObject({ textColor: undefined, marks: [] });
  });

  it("본문 p는 summary의 style을 받지 않는다", () => {
    const blocks = blocksOf(
      '<details open><summary style="color:red">s</summary><p>x</p></details>',
    );
    const body = blocks.find(
      (block) =>
        "content" in block &&
        (block.content as Run[]).some((run) => run.text === "x"),
    ) as TextLike;
    expect(body.textColor).toBeUndefined();
  });
});

describe("단독 figcaption", () => {
  it("색과 서식을 읽는다", () => {
    expect(
      read('<figcaption style="font-weight:bold;color:red">x</figcaption>'),
    ).toMatchObject({ textColor: "#FF0000", marks: ["bold"] });
  });

  it("블록 자식이 있는 figcaption은 문단에 style을 싣지 않는다", () => {
    expect(
      read('<figcaption style="color:red"><p>x</p></figcaption>'),
    ).toMatchObject({ textColor: undefined });
  });
});

describe("자기 toggle의 summary", () => {
  it("style의 색과 서식을 읽는다", () => {
    expect(
      read(
        '<details data-geul-toggleable="true" open><summary style="font-weight:bold;color:red">x</summary></details>',
      ),
    ).toEqual({
      type: "toggleListItem",
      textColor: "#FF0000",
      backgroundColor: undefined,
      marks: ["bold"],
    });
  });

  it("data-geul 색이 style 색보다 먼저다", () => {
    expect(
      read(
        '<details data-geul-toggleable="true" open><summary data-geul-text-color="#112233" style="color:red">x</summary></details>',
      ),
    ).toMatchObject({ textColor: "#112233" });
  });

  it("자기 export 왕복은 색과 정렬을 그대로 낸다", () => {
    const original = documentOf({
      id: "t1",
      type: "toggleListItem",
      content: [{ text: "x" }],
      textColor: "#112233",
      backgroundColor: "#445566",
      textAlignment: "center",
    });
    expect(roundTrip(original)).toEqual(original);
  });
});

describe("미디어 figure의 figcaption", () => {
  it("자기 export한 caption은 왕복해도 caption으로 남는다", () => {
    const original = documentOf({
      id: "f1",
      type: "file",
      url: "https://example.com/a.pdf",
      name: "a.pdf",
      caption: "첨부 파일",
    });
    expect(roundTrip(original)).toEqual(original);
  });

  it("미디어로 읽히지 않는 figure의 figcaption은 단독 figcaption과 같다", () => {
    const blocks = blocksOf(
      '<figure><img src="https://example.com/a.png" alt="a"><figcaption style="font-weight:bold;color:red">cap</figcaption></figure>',
    );
    const caption = blocks.find((block) => "content" in block) as
      TextLike | undefined;
    expect(caption?.textColor).toBe("#FF0000");
    expect(caption?.content[0]?.marks?.map((mark) => mark.type)).toEqual([
      "bold",
    ]);
  });
});
