/**
 * packages/io가 "./preview.css"를 공개 export로 제공하는지 확인하는
 * 테스트다(Issue #178, RD-001). exports 계약, 빌드 산출물 존재, 승격
 * 소스의 Chrome75 호환(`:is()` 재유입 방지)과 커버리지 유지를 다룬다 —
 * 편집기-미리보기 시각 일치 자체는 RD-002의 e2e 회귀가 맡는다.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Document } from "@cp949/geul-model";
import { select, selectAll } from "hast-util-select";
import { describe, expect, it } from "vitest";

import { parseHtmlFragment } from "../src/html/parse-html.js";
import { exportHtml } from "../src/index.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * package.json을 매번 다시 읽는다 — 캐싱하면 값이 고정돼 필드가 지워져도
 * 테스트가 그걸 놓친다.
 */
function readPackageManifest(): { exports?: Record<string, unknown> } {
  return JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  ) as { exports?: Record<string, unknown> };
}

describe("preview.css export", () => {
  it('exports["./preview.css"]가 dist/preview.css를 가리킨다', () => {
    const manifest = readPackageManifest();
    expect(manifest.exports?.["./preview.css"]).toBe("./dist/preview.css");
  });

  it("빌드 산출물 dist/preview.css가 존재하고 .geul-preview 셀렉터를 포함한다", () => {
    const css = readFileSync(join(packageRoot, "dist/preview.css"), "utf8");
    expect(css).toContain(".geul-preview");
  });

  it("소스가 Chrome75 미지원 :is() 셀렉터를 쓰지 않는다", () => {
    const css = readFileSync(join(packageRoot, "src/preview.css"), "utf8");
    // 파일 상단 설명 주석이 ":is()"를 언급하므로(Chrome75엔 왜 못 쓰는지
    // 설명) 주석을 지운 실제 CSS 규칙만 검사한다.
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toContain(":is(");
  });

  it("소스가 승격 대상 규칙을 전부 유지한다(헤딩/문단/blockquote/목록/코드/표/hr/링크/details/미디어)", () => {
    const css = readFileSync(join(packageRoot, "src/preview.css"), "utf8");
    for (const selectorFragment of [
      ".geul-preview h1,",
      ".geul-preview h6 {",
      ".geul-preview p {",
      ".geul-preview blockquote {",
      'li[data-geul-checked="true"]::before',
      ".geul-preview pre {",
      "pre[data-geul-code-wrap]",
      ".geul-preview :not(pre) > code {",
      ".geul-preview table {",
      ".geul-preview hr {",
      ".geul-preview a {",
      ".geul-preview summary {",
      ".geul-preview img,",
      'img[data-geul-text-alignment="left"]',
      'img[data-geul-text-alignment="right"]',
      ".geul-preview figcaption {",
      "pre + figcaption",
      ".geul-preview [data-geul-media-type] {",
      ".geul-preview a[data-geul-media-type] {",
    ]) {
      expect(css).toContain(selectorFragment);
    }
  });
});

/**
 * exportHtml() 실제 출력 기반 셀렉터 매치 검증(Issue #201). 위
 * "소스가 승격 대상 규칙을 전부 유지한다" 테스트는 CSS 소스 텍스트에
 * 셀렉터 문자열이 남아 있는지만 본다 — 그 셀렉터가 실제 export DOM에
 * 매치하는지는 별개다(Issue #197: export DOM에 없는 속성을 겨냥한
 * 셀렉터를 추가해도 문자열 검사만으로는 통과했다). 이 describe는
 * exportHtml()이 실제로 만드는 HTML을 preview.css 소비 방식 그대로
 * `.geul-preview` 컨테이너로 감싸 파싱하고, 각 셀렉터가 의도한 노드에
 * 실제로 매치하는지 확인한다.
 */
const previewRoot = (innerHtml: string) => {
  const parsed = parseHtmlFragment(
    `<div class="geul-preview">${innerHtml}</div>`,
  );
  if (parsed === undefined) throw new Error("preview HTML 파싱 실패");
  return parsed.root;
};

const exportOk = (document: Document): string => {
  const result = exportHtml(document);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

// parseHtmlFragment가 반환하는 io 자체 HtmlRoot/HtmlElementNode는
// hast-util-select가 기대하는 hast 트리와 구조적으로 동형(type/tagName/
// properties/children)이지만 명목 타입은 다르다 — export-html.ts의
// stringifyProcessor 캐스트 선례와 같은 이유로 타입만 단언한다.
type SelectTree = Parameters<typeof select>[1];

describe("실제 export DOM에 승격 대상 규칙이 매치한다(Issue #201)", () => {
  it("heading(h1·h6)이 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "h-1",
            type: "heading",
            level: 1,
            content: [{ text: "제목1" }],
          },
          {
            id: "h-6",
            type: "heading",
            level: 6,
            content: [{ text: "제목6" }],
          },
        ],
      }),
    );
    expect(select(".geul-preview h1", tree as SelectTree)).toBeDefined();
    expect(select(".geul-preview h6", tree as SelectTree)).toBeDefined();
  });

  it("paragraph가 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [{ id: "p-1", type: "paragraph", content: [{ text: "문단" }] }],
      }),
    );
    expect(select(".geul-preview p", tree as SelectTree)).toBeDefined();
  });

  it("blockquote(quote)가 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [{ id: "q-1", type: "quote", content: [{ text: "인용" }] }],
      }),
    );
    expect(
      select(".geul-preview blockquote", tree as SelectTree),
    ).toBeDefined();
  });

  it('checkListItem이 li[data-geul-checked="true"]에 실제 매치한다(의사요소 ::before는 제외)', () => {
    // ::before는 hast-util-select가 지원하지 않는다(실측: `Invalid
    // selector` 예외) — 부모 요소 매치까지만 실제 DOM으로 검증하고,
    // 의사요소가 만드는 content("☑"/"☐")는 위 문자열 확인 테스트가
    // 계속 담당한다(완료 조건의 "등가 표현").
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "c-1",
            type: "checkListItem",
            checked: true,
            content: [{ text: "완료" }],
          },
        ],
      }),
    );
    expect(
      select('li[data-geul-checked="true"]', tree as SelectTree),
    ).toBeDefined();
  });

  it("codeBlock(plain)이 pre에 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [{ id: "cb-1", type: "codeBlock", content: [{ text: "x" }] }],
      }),
    );
    expect(select(".geul-preview pre", tree as SelectTree)).toBeDefined();
  });

  it("wrap:true codeBlock이 pre[data-geul-code-wrap]에 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "cb-2",
            type: "codeBlock",
            wrap: true,
            content: [{ text: "y" }],
          },
        ],
      }),
    );
    expect(
      select(".geul-preview pre[data-geul-code-wrap]", tree as SelectTree),
    ).toBeDefined();
  });

  it("인라인 code mark가 pre 밖 code에 실제 매치한다(.geul-preview :not(pre) > code 등가 검증)", () => {
    // hast-util-select는 combinator 뒤 :not()에서 거짓 음성을 낸다(실측:
    // ".geul-preview :not(pre) > code"가 실제 매치 대상이 있어도 0건
    // 반환 — ":not(pre) > code" 단독으로는 정상 매치). 셀렉터 문자열을
    // 그대로 넘기지 않고 "전체 code 개수 > pre 안 code 개수"로 같은
    // 의미(pre 밖에 있는 code가 존재한다)를 확인한다.
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "p-code",
            type: "paragraph",
            content: [{ text: "인라인", marks: [{ type: "code" }] }],
          },
          { id: "cb-plain2", type: "codeBlock", content: [{ text: "block" }] },
        ],
      }),
    );
    const allCode = selectAll(".geul-preview code", tree as SelectTree);
    const codeInPre = selectAll(".geul-preview pre code", tree as SelectTree);
    expect(allCode.length).toBeGreaterThan(codeInPre.length);
  });

  it("table이 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "t-1",
            type: "table",
            columns: [{ id: "col-1", width: 200 }],
            rows: [
              {
                id: "row-1",
                cells: [
                  {
                    id: "cell-1",
                    columnId: "col-1",
                    rowSpan: 1,
                    columnSpan: 1,
                    content: [{ text: "a" }],
                  },
                ],
              },
            ],
            headerRows: 0,
            headerColumns: 0,
          },
        ],
      }),
    );
    expect(select(".geul-preview table", tree as SelectTree)).toBeDefined();
  });

  it("divider가 hr에 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [{ id: "d-1", type: "divider" }],
      }),
    );
    expect(select(".geul-preview hr", tree as SelectTree)).toBeDefined();
  });

  it("link mark가 a에 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "p-link",
            type: "paragraph",
            content: [
              {
                text: "링크",
                marks: [{ type: "link", href: "https://example.com" }],
              },
            ],
          },
        ],
      }),
    );
    expect(select(".geul-preview a", tree as SelectTree)).toBeDefined();
  });

  it("toggleListItem이 summary에 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "tg-1", type: "toggleListItem", content: [{ text: "토글" }] },
        ],
      }),
    );
    expect(select(".geul-preview summary", tree as SelectTree)).toBeDefined();
  });

  it("caption 없는 image가 img에 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "i-1", type: "image", url: "https://example.com/a.png" },
        ],
      }),
    );
    expect(select(".geul-preview img", tree as SelectTree)).toBeDefined();
  });

  it('textAlignment="left"/"right" image가 각 속성 셀렉터에 실제 매치한다', () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "i-left",
            type: "image",
            url: "https://example.com/l.png",
            textAlignment: "left",
          },
          {
            id: "i-right",
            type: "image",
            url: "https://example.com/r.png",
            textAlignment: "right",
          },
        ],
      }),
    );
    expect(
      select('img[data-geul-text-alignment="left"]', tree as SelectTree),
    ).toBeDefined();
    expect(
      select('img[data-geul-text-alignment="right"]', tree as SelectTree),
    ).toBeDefined();
  });

  it("caption 있는 media가 figcaption에 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "i-cap",
            type: "image",
            url: "https://example.com/c.png",
            caption: "설명",
          },
        ],
      }),
    );
    expect(
      select(".geul-preview figcaption", tree as SelectTree),
    ).toBeDefined();
  });

  it("caption 없는 audio/file이 [data-geul-media-type]에 실제 매치한다(2026-09-16 media margin)", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "au-1", type: "audio", url: "https://example.com/a.mp3" },
          { id: "fi-1", type: "file", url: "https://example.com/a.pdf" },
        ],
      }),
    );
    expect(
      selectAll(".geul-preview [data-geul-media-type]", tree as SelectTree),
    ).toHaveLength(2);
  });

  it("caption 있는 image는 figure 하나에만 [data-geul-media-type]이 매치한다(안쪽 img는 중복 없음)", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "i-cap2",
            type: "image",
            url: "https://example.com/c2.png",
            caption: "설명2",
          },
        ],
      }),
    );
    const matches = selectAll(
      ".geul-preview [data-geul-media-type]",
      tree as SelectTree,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.tagName).toBe("figure");
  });

  it("file 블록이 a[data-geul-media-type]에 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          { id: "fi-2", type: "file", url: "https://example.com/b.pdf" },
        ],
      }),
    );
    expect(
      select(".geul-preview a[data-geul-media-type]", tree as SelectTree),
    ).toBeDefined();
  });

  it("showPreview:false로 강등된 image도 a[data-geul-media-type]에 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "i-suppressed",
            type: "image",
            url: "https://example.com/s.png",
            showPreview: false,
          },
        ],
      }),
    );
    expect(
      select(".geul-preview a[data-geul-media-type]", tree as SelectTree),
    ).toBeDefined();
  });

  it("caption 있는 codeBlock이 pre + figcaption(인접 형제)에 실제 매치한다", () => {
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [
          {
            id: "cb-cap",
            type: "codeBlock",
            caption: "코드 설명",
            content: [{ text: "z" }],
          },
        ],
      }),
    );
    expect(
      select(".geul-preview pre + figcaption", tree as SelectTree),
    ).toBeDefined();
  });

  it("Issue #197 재현 — export DOM에 없는 속성을 겨냥한 셀렉터는 매치하지 않는다(검출 변이)", () => {
    // pre[data-geul-code-block]은 라이브 에디터 DOM 전용 marker다(core
    // code-block-extension.ts) — exportHtml()의 codeBlockNode는 이 속성을
    // 내지 않는다. 옛 문자열 확인 테스트라면 이 문구가 CSS 소스에 있기만
    // 하면 통과했다(Issue #197에서 실제로 벌어진 일) — 이 테스트는 새
    // 방식이 같은 실수를 RED로 잡는다는 것을 보인다.
    const tree = previewRoot(
      exportOk({
        formatVersion: 1,
        revision: 0,
        blocks: [{ id: "cb-3", type: "codeBlock", content: [{ text: "w" }] }],
      }),
    );
    expect(
      select(".geul-preview pre[data-geul-code-block]", tree as SelectTree),
    ).toBeUndefined();
  });
});
