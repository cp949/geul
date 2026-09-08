import type { Document } from "@cp949/geul-model";
import { EditorContent, EditorProvider } from "@cp949/geul-react";
import "prismjs/themes/prism.css";
import { useState } from "react";
import { refractor } from "refractor";

// spec §3(BLK-017) — geul의 공개 seam은 `{source, language} => token[]`
// 함수(`SyntaxHighlighter`)다. refractor(Prism 어댑터)는 이 시그니처를
// 모른다 — lowlight와 동일하게 hast(hypertext AST) 트리를 돌려줄 뿐이라,
// 트리를 순회해 source 오프셋을 우리가 직접 계산해야 한다.
// `EditorProviderProps`가 구조적으로 이 타입을 검사하므로
// `SyntaxHighlighter` 타입을 별도 import하지 않는다(RD-003-DELTA-01.md
// "결정" — 새 타입 전용 의존성 회피, 이 DELTA도 동일하게 따른다).
//
// refractor의 default export 싱글턴은 이미 common 언어 62개(javascript
// 포함)가 등록돼 있다(RD-003-DELTA-03.md "결정" 실측) — lowlight의
// `createLowlight(common)` 같은 별도 초기화 호출이 필요 없다.
type HastRoot = ReturnType<typeof refractor.highlight>;
type HastNode = HastRoot["children"][number];
type Token = { from: number; to: number; className?: string };

/**
 * hast 트리를 source 오프셋 기준 token 목록으로 평탄화한다. DELTA-01의
 * lowlight 어댑터와 순회 로직이 동일하다(refractor도 hast Root를 돌려주고
 * `properties.className`도 동일한 배열 형태 — RD-003-DELTA-03.md "결정"
 * 실측). 겹치는 element는 병합 없이 각자 독립된 token으로 남는다 —
 * ProseMirror의 기본 동작(두 class를 함께 적용)에 맡긴다(spec §4).
 * example.tsx는 복사해 쓰는 자기완결적 파일이라는 관례(DELTA-01
 * "결정")에 따라 lowlight 어댑터와 별개로 이 파일에 다시 둔다.
 */
const flattenHastToTokens = (
  nodes: readonly HastNode[],
  offset: number,
  tokens: Token[],
): number => {
  let cursor = offset;
  for (const node of nodes) {
    if (node.type === "text") {
      cursor += node.value.length;
      continue;
    }
    if (node.type === "element") {
      const from = cursor;
      cursor = flattenHastToTokens(node.children, cursor, tokens);
      const classNameProp = node.properties?.className;
      const className = Array.isArray(classNameProp)
        ? classNameProp.join(" ")
        : typeof classNameProp === "string"
          ? classNameProp
          : undefined;
      tokens.push({
        from,
        to: cursor,
        ...(className === undefined ? {} : { className }),
      });
    }
    // comment/doctype 노드는 하이라이팅 텍스트가 없어 무시한다.
  }
  return cursor;
};

// spec §4 "미지원/빈 language" — geul은 관여하지 않는다. refractor가
// 모르는 언어면 빈 배열을 돌려줘 그 블록을 plain text로 남긴다.
const refractorSyntaxHighlighter = ({
  source,
  language,
}: {
  source: string;
  language: string | undefined;
}): readonly Token[] => {
  if (language === undefined || !refractor.registered(language)) return [];
  const tree = refractor.highlight(source, language);
  const tokens: Token[] = [];
  flattenHastToTokens(tree.children, 0, tokens);
  return tokens;
};

const SAMPLE_SOURCE = `function greet(name) {
  // Says hello
  const greeting = \`Hello, \${name}!\`;
  return greeting.toUpperCase();
}

console.log(greet("Geul"));`;

const SyntaxHighlightingRefractorExample = () => {
  const [initialDocument] = useState<Document>(() => ({
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "showcase-syntax-highlighting-refractor-block-1",
        type: "codeBlock",
        language: "javascript",
        content: [{ text: SAMPLE_SOURCE }],
      },
    ],
  }));

  return (
    <EditorProvider
      initialDocument={initialDocument}
      syntaxHighlighter={refractorSyntaxHighlighter}
    >
      <EditorContent />
    </EditorProvider>
  );
};

export default SyntaxHighlightingRefractorExample;
