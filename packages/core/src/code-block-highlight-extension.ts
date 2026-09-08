import { Extension } from "@tiptap/core";
import { Decoration } from "@tiptap/pm/view";
import { createHighlightPlugin, type Parser } from "prosemirror-highlight";

import type {
  SyntaxHighlighter,
  SyntaxHighlightToken,
} from "./syntax-highlight.js";

// RD-001-DELTA-01(spec §3) — 이 어댑터는 동기 파서 경로만 다룬다. 비동기
// 결과 반영·stale 방지(spec §4 "비동기 최신 결과만 반영")는 DELTA-02가,
// 범위 밖·겹침·거절된 Promise·미지원 language 등 나머지 edge case(spec §4)는
// DELTA-03이 다룬다. 지금은 Promise를 돌려주면 빈 배열로 취급한다 —
// "미연결"과 같은 plain text 결과이고, DELTA-02가 이 분기를 대체한다.
const toDecorations = (
  tokens: readonly SyntaxHighlightToken[],
  contentStart: number,
): Decoration[] =>
  tokens.map((token) =>
    Decoration.inline(
      contentStart + token.from,
      contentStart + token.to,
      token.className === undefined ? {} : { class: token.className },
    ),
  );

// geul의 공개 seam(SyntaxHighlighter, {source,language} 입력)을
// prosemirror-highlight의 내부 Parser 계약({content,pos,language,size}
// 입력, 실측: dist/types-*.d.ts)으로 감싼다. 소비자에게는 이 어댑터도
// Parser 타입도 노출하지 않는다(ADR-0002). 코드 블록 텍스트 콘텐츠는 노드
// 시작 위치(pos) 바로 다음(pos + 1)부터 시작한다(ProseMirror 관례) — token의
// source-상대 오프셋에 이 값을 더해 문서 절대 위치로 변환한다.
const createParserFromHighlighter = (
  highlighter: SyntaxHighlighter,
): Parser => {
  return ({ content, pos, language }) => {
    const result = highlighter({ source: content, language });
    if (result instanceof Promise) return [];
    return toDecorations(result, pos + 1);
  };
};

// 비공개 Tiptap 확장 — index.ts가 재수출하지 않는다.
// createHighlightPlugin의 nodeTypes 기본값(['code_block','codeBlock'])과
// languageExtractor 기본값(node => node.attrs.language)이 geul의 codeBlock
// 스키마(code-block-extension.ts)와 이미 일치해 별도 configure가 필요 없다.
export const CodeBlockHighlightExtension = Extension.create<{
  syntaxHighlighter: SyntaxHighlighter;
}>({
  name: "codeBlockHighlight",
  addProseMirrorPlugins() {
    return [
      createHighlightPlugin({
        parser: createParserFromHighlighter(this.options.syntaxHighlighter),
      }),
    ];
  },
});
