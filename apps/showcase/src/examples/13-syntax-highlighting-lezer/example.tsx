import type { Document } from "@cp949/geul-model";
import { EditorContent, EditorProvider } from "@cp949/geul-react";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { parser } from "@lezer/javascript";
import { useState } from "react";

import "./theme.css";

// spec §3(BLK-017) — geul의 공개 seam은 `{source, language} => token[]`
// 함수(`SyntaxHighlighter`)다. lowlight·refractor와 달리
// `@lezer/highlight`의 `highlightTree`는 hast 트리가 아니라 소스 오프셋
// 기준으로 겹치지 않는 flat 구간을 직접 콜백(`(from, to, classes) =>
// void`)으로 준다 — hast 순회·평탄화 헬퍼가 필요 없다
// (RD-003-DELTA-04.md "결정" 실측). `EditorProviderProps`가 구조적으로
// 이 타입을 검사하므로 `SyntaxHighlighter` 타입을 별도 import하지
// 않는다(RD-003-DELTA-01.md "결정" — 새 타입 전용 의존성 회피, 이
// DELTA도 동일하게 따른다).
type Token = { from: number; to: number; className?: string };

// spec §4 "미지원/빈 language" — geul은 관여하지 않는다. 이 예제는
// javascript 하나만 배선한다(RD-003-DELTA-04.md "결정" — 11개 기본
// 언어 중 8개만 공식 `@lezer/*` 패키지가 있고, 완료 조건은
// "라이브러리당 동작 예제 1개"). 그 외 language는 빈 배열을 돌려줘
// plain text로 남긴다.
const lezerSyntaxHighlighter = ({
  source,
  language,
}: {
  source: string;
  language: string | undefined;
}): readonly Token[] => {
  if (language !== "javascript") return [];
  const tree = parser.parse(source);
  const tokens: Token[] = [];
  highlightTree(tree, classHighlighter, (from, to, classes) => {
    tokens.push({ from, to, className: classes });
  });
  return tokens;
};

const SAMPLE_SOURCE = `function greet(name) {
  // Says hello
  const greeting = \`Hello, \${name}!\`;
  return greeting.toUpperCase();
}

console.log(greet("Geul"));`;

const SyntaxHighlightingLezerExample = () => {
  const [initialDocument] = useState<Document>(() => ({
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "showcase-syntax-highlighting-lezer-block-1",
        type: "codeBlock",
        language: "javascript",
        content: [{ text: SAMPLE_SOURCE }],
      },
    ],
  }));

  return (
    <EditorProvider
      initialDocument={initialDocument}
      syntaxHighlighter={lezerSyntaxHighlighter}
    >
      <EditorContent />
    </EditorProvider>
  );
};

export default SyntaxHighlightingLezerExample;
