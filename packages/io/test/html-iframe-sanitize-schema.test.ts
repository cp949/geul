/**
 * iframe 블록(CUS-001~004, RD-003 DELTA-01)의 sanitize 계약 두 가지를
 * 직접 검증한다: raw <iframe> 태그는 여전히 제거되고(완료 조건 1),
 * own-format wrapper(div/figure)의 data-geul-src/data-geul-aspect-ratio는
 * document-import sanitize 단계에서 보존된다. import-html-media.ts는 아직
 * "iframe" media kind를 인식하지 않아(DELTA-03) 공개 importHtml()을 통한
 * 관찰만으로는 두 번째 계약을 격리해 확인할 수 없다 — import-html.ts가
 * 실제로 쓰는 sanitize(parseHtmlFragment 결과, htmlImportSanitizeSchema)
 * 호출을 그대로 재현해 sanitize 직후 HAST만 직접 대조한다(block-
 * segmenter.test.ts가 parseHtmlFragment를 직접 import하는 선례와 동일
 * 패턴).
 */
import { sanitize } from "hast-util-sanitize";
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";
import { htmlImportSanitizeSchema } from "../src/html/import-html-sanitize-schema.js";
import type { HtmlElementNode } from "../src/html/inline-content.js";
import { asRoot, parseHtmlFragment } from "../src/html/parse-html.js";

const sanitizedWrapperProperties = (
  html: string,
): HtmlElementNode["properties"] => {
  const parsed = parseHtmlFragment(html);
  if (parsed === undefined) throw new Error("fixture 파싱 실패");
  const safeRoot = asRoot(sanitize(parsed.root, htmlImportSanitizeSchema));
  if (safeRoot === undefined) throw new Error("sanitize 실패");
  const [node] = safeRoot.children;
  if (node === undefined || node.type !== "element") {
    throw new Error("sanitize 결과에 element가 없음");
  }
  return node.properties;
};

describe("raw <iframe> 태그는 여전히 제거된다(RD-003 완료 조건 1)", () => {
  // htmlStrippedTagNames(sanitize-schema.ts)는 clipboard와 공유하는
  // 원본이고 clipboardStrippedTagNames는 이를 그대로 상속해 "title"만
  // 더한다 — importHtml() 하나로 두 소비자의 strip 계약을 함께 고정한다.
  // clipboard 전용 중복 테스트는 만들지 않는다.
  it("import 시 UNSAFE_ELEMENT_REMOVED로 제거되고 문서에 남지 않는다", () => {
    const result = importHtml(
      '<p>before</p><iframe src="https://evil.example" title="x"></iframe><p>after</p>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.warnings).toContainEqual(
      expect.objectContaining({
        kind: "UNSAFE_ELEMENT_REMOVED",
        element: "iframe",
      }),
    );
    expect(result.value.document.blocks).toEqual([
      { id: "html-1", type: "paragraph", content: [{ text: "before" }] },
      { id: "html-2", type: "paragraph", content: [{ text: "after" }] },
    ]);
  });
});

describe("iframe wrapper(div/figure)의 data-geul-src/data-geul-aspect-ratio가 sanitize에서 보존된다(RD-003 DELTA-01)", () => {
  it("div wrapper에서 보존된다", () => {
    const properties = sanitizedWrapperProperties(
      '<div data-geul-block-id="ifr-1" data-geul-media-type="iframe" data-geul-src="https://example.com/embed" data-geul-aspect-ratio="16:9"></div>',
    );
    expect(properties.dataGeulSrc).toBe("https://example.com/embed");
    expect(properties.dataGeulAspectRatio).toBe("16:9");
  });

  it("figure wrapper에서 보존된다", () => {
    const properties = sanitizedWrapperProperties(
      '<figure data-geul-block-id="ifr-2" data-geul-media-type="iframe" data-geul-src="https://example.com/embed" data-geul-aspect-ratio="16:9"></figure>',
    );
    expect(properties.dataGeulSrc).toBe("https://example.com/embed");
    expect(properties.dataGeulAspectRatio).toBe("16:9");
  });
});
