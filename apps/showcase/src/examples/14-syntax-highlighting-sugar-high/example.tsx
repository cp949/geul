import type { Document } from "@cp949/geul-model";
import { EditorContent, EditorProvider } from "@cp949/geul-react";
import "./theme.css";
import { generate, parse } from "sugar-high/core";
import type { GeneratedLine, ParseOptions } from "sugar-high/core";
import { tokenize } from "sugar-high/lang/javascript";
import { useState } from "react";

// spec §3(BLK-017) — geul의 공개 seam은 `{source, language} => token[]`
// 함수(`SyntaxHighlighter`)다. sugar-high는 이 시그니처를 모른다 —
// `EditorProviderProps`가 구조적으로 이 타입을 검사하므로
// `SyntaxHighlighter` 타입을 별도 import하지 않는다(RD-003-DELTA-01.md
// "결정" — 새 타입 전용 의존성 회피, 이 DELTA도 동일하게 따른다).
//
// `sugar-high`(top-level, 전체 언어 레지스트리) 대신 `sugar-high/core` +
// `sugar-high/lang/javascript` 조합을 쓴다 — README "Composable core"가
// 문서화한 방식으로, javascript 프리셋 하나만 번들에 포함시킨다.
type Token = { from: number; to: number; className?: string };

/**
 * `generate()`가 돌려주는 줄→토큰 트리를 source 오프셋 기준 token
 * 목록으로 평탄화한다. lowlight·refractor의 hast 트리와 달리 이 트리는
 * 오프셋을 전혀 담지 않는다 — 각 줄의 토큰 텍스트 길이를 누적하고, 줄
 * 사이에는 원본 source에 있었지만 어느 토큰에도 남지 않는 개행 문자
 * 1개를 되돌려 넣는다(RD-003-DELTA-05.md "결정" 2 — scratchpad 실측으로
 * 최종 offset이 source.length와 정확히 일치함을 확인). example.tsx는
 * 복사해 쓰는 자기완결적 파일이라는 관례(DELTA-01 "결정")에 따라 다른
 * 예제의 평탄화 헬퍼와 별개로 이 파일에 둔다.
 */
const flattenLinesToTokens = (lines: readonly GeneratedLine[]): Token[] => {
  const tokens: Token[] = [];
  let cursor = 0;
  lines.forEach((line, lineIndex) => {
    for (const token of line.children) {
      const text = token.children[0]?.value ?? "";
      const from = cursor;
      cursor += text.length;
      tokens.push({ from, to: cursor, className: token.properties.className });
    }
    if (lineIndex < lines.length - 1) cursor += 1; // 줄 사이 개행 1개 복원
  });
  return tokens;
};

// spec §4 "미지원/빈 language" — geul은 관여하지 않는다. javascript 외
// 언어는 빈 배열을 돌려줘 그 블록을 plain text로 남긴다(이 예제는
// `sugar-high/lang/javascript`만 번들에 포함 — 위 "배경" 참고).
const sugarHighSyntaxHighlighter = ({
  source,
  language,
}: {
  source: string;
  language: string | undefined;
}): readonly Token[] => {
  if (language !== "javascript") return [];
  // `sugar-high/lang/javascript`의 `tokenize`는 자체 내부
  // `HighlightOptions` 타입(패키지 presets 모듈 전용, 공개 export
  // 아님)으로 선언돼 있고 `onCommentEnd` 파라미터 수가
  // `sugar-high/core`의 공개 `ParseOptions.onCommentEnd`(5개)와 다르다
  // (내부 4개) — 패키지 자체 .d.ts 간 불일치이지 이 어댑터의 문제가
  // 아니다. README "Composable core"가 문서화한 `parse(code, languages[lang])`
  // 조합이 곧 이 형태라 런타임 동작은 정확하다(RD-003-DELTA-05.md
  // "결정" 2 — scratchpad 실측).
  const parsed = parse(source, { tokenize } as ParseOptions);
  return flattenLinesToTokens(generate(parsed));
};

const SAMPLE_SOURCE = `function greet(name) {
  // Says hello
  const greeting = \`Hello, \${name}!\`;
  return greeting.toUpperCase();
}

console.log(greet("Geul"));`;

const SyntaxHighlightingSugarHighExample = () => {
  const [initialDocument] = useState<Document>(() => ({
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "showcase-syntax-highlighting-sugar-high-block-1",
        type: "codeBlock",
        language: "javascript",
        content: [{ text: SAMPLE_SOURCE }],
      },
    ],
  }));

  return (
    <EditorProvider
      initialDocument={initialDocument}
      syntaxHighlighter={sugarHighSyntaxHighlighter}
    >
      <EditorContent />
    </EditorProvider>
  );
};

export default SyntaxHighlightingSugarHighExample;
