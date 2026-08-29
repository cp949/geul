/**
 * HTML CodeBlock 입력의 sanitizer 허용 속성과 raw warning 투영을 검증한다.
 * pre 내부의 코드 원문 보존과 pre 외부 텍스트의 기존 보안 경계를 함께 다룬다.
 */
import { describe, expect, it } from "vitest";

import { importHtml } from "../src/index.js";

/**
 * 공개 HTML import 결과에서 warning 종류만 추출해 sanitizer 정책을 검증한다.
 * semantic CodeBlock 변환은 DELTA-01a의 책임이므로 이 테스트에서는 다루지 않는다.
 */
function importWarningKinds(source: string): string[] {
  const result = importHtml(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.warnings.map((warning) => warning.kind);
}

describe("HTML CodeBlock 입력 정제", () => {
  it("pre와 code의 CodeBlock metadata를 보존하고 미지원 속성은 경고한다", () => {
    const result = importHtml(
      '<pre data-be-block-id="code-1" data-language="ts" class="language-ts" data-unknown="x"><code data-be-block-id="wrong" data-language="typescript" class="language-typescript" data-extra="y">const x = 1;</code></pre>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: "pre",
          attribute: "dataUnknown",
        }),
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: "code",
          attribute: "dataExtra",
        }),
      ]),
    );
    expect(result.value.warnings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: "pre",
          attribute: "dataBeBlockId",
        }),
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: "code",
          attribute: "dataBeBlockId",
        }),
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: "code",
          attribute: "dataLanguage",
        }),
      ]),
    );
  });

  it("pre는 지원 블록으로 취급해 SAFE_BLOCK_DOWNGRADED를 만들지 않는다", () => {
    expect(importWarningKinds("<pre><code>source</code></pre>")).not.toContain(
      "SAFE_BLOCK_DOWNGRADED",
    );
  });

  it("pre 내부 literal Tab은 코드포인트 경고를 만들지 않는다", () => {
    expect(
      importWarningKinds("<pre><code>one\ttwo</code></pre>"),
    ).not.toContain("UNSAFE_CODE_POINT_REMOVED");
  });

  it("pre 밖 literal Tab은 기존 코드포인트 경고를 유지한다", () => {
    expect(importWarningKinds("<p>one\ttwo</p>")).toContain(
      "UNSAFE_CODE_POINT_REMOVED",
    );
  });

  it("pre 밖 code metadata는 제거 경고를 반환하고 inline code는 유지한다", () => {
    const result = importHtml(
      '<p><code data-language="ts" class="language-ts">x</code></p>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.document.blocks).toEqual([
      {
        id: "html-1",
        type: "paragraph",
        content: [{ text: "x", marks: [{ type: "code" }] }],
      },
    ]);
    expect(result.value.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: "code",
          attribute: "dataLanguage",
        }),
        expect.objectContaining({
          kind: "UNSAFE_ATTRIBUTE_REMOVED",
          element: "code",
          attribute: "className",
        }),
      ]),
    );
  });
});
