import type { Document } from "@cp949/geul-model";
import { EditorContent, EditorProvider } from "@cp949/geul-react";
import "highlight.js/styles/github.css";
import { common, createLowlight } from "lowlight";
import { useState } from "react";

// spec §3(BLK-017) — geul의 공개 seam은 `{source, language} => token[]`
// 함수(`SyntaxHighlighter`)다. lowlight(+highlight.js)는 이 시그니처를
// 모른다 — hast(hypertext AST) 트리를 돌려줄 뿐이라, 트리를 순회해
// source 오프셋을 우리가 직접 계산해야 한다. `EditorProviderProps`가
// 구조적으로 이 타입을 검사하므로 `SyntaxHighlighter` 타입을 별도
// import하지 않는다(RD-003-DELTA-01.md "결정" — 새 타입 전용
// 의존성 회피).
const lowlight = createLowlight(common);

type HastRoot = ReturnType<typeof lowlight.highlight>;
type HastNode = HastRoot["children"][number];
type Token = { from: number; to: number; className?: string };

/**
 * hast 트리를 source 오프셋 기준 token 목록으로 평탄화한다. 겹치는
 * element(예: 템플릿 리터럴 안 `${expr}`)는 병합 없이 각자 독립된
 * token으로 남는다 — spec §4 "겹치는 token"이 ProseMirror의 기본 동작
 * (두 class를 함께 적용)에 맡기기로 한 그대로다(scratchpad 실측: 실제
 * hast 출력에서 `hljs-string`과 `hljs-subst`가 겹쳐 나온다).
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

// spec §4 "미지원/빈 language" — geul은 관여하지 않는다. lowlight가
// 모르는 언어면 빈 배열을 돌려줘 그 블록을 plain text로 남긴다.
const lowlightSyntaxHighlighter = ({
  source,
  language,
}: {
  source: string;
  language: string | undefined;
}): readonly Token[] => {
  if (language === undefined || !lowlight.registered(language)) return [];
  const tree = lowlight.highlight(language, source);
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

const SyntaxHighlightingLowlightExample = () => {
  const [initialDocument] = useState<Document>(() => ({
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "showcase-syntax-highlighting-lowlight-block-1",
        type: "codeBlock",
        language: "javascript",
        content: [{ text: SAMPLE_SOURCE }],
      },
    ],
  }));

  return (
    <EditorProvider
      initialDocument={initialDocument}
      syntaxHighlighter={lowlightSyntaxHighlighter}
    >
      <EditorContent />
    </EditorProvider>
  );
};

export default SyntaxHighlightingLowlightExample;
