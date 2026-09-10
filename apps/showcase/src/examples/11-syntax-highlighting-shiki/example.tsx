import type { Document } from "@cp949/geul-model";
import { EditorContent, EditorProvider } from "@cp949/geul-react";
import { useState, useSyncExternalStore } from "react";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import jsLang from "shiki/langs/javascript.mjs";
import githubLight from "shiki/themes/github-light.mjs";

// spec §3(BLK-017) — geul의 공개 seam은 `{source, language} => token[] |
// Promise<token[]>`(`SyntaxHighlighter`)다. `shiki`는 이 시그니처를 모르고,
// 반환 토큰도 CSS class가 아니라 hex color를 준다 — 두 변환이 이 어댑터의
// 일이다. `EditorProviderProps`가 구조적으로 이 타입을 검사하므로
// `SyntaxHighlighter` 타입을 별도 import하지 않는다(RD-003-DELTA-01.md
// "결정" — 새 타입 전용 의존성 회피, 이 DELTA도 동일하게 따른다).
const SHIKI_LANG = "javascript";
const SHIKI_THEME = "github-light";

// top-level `shiki`(`createHighlighter`)는 지원 언어 100개+ 전체를 번들에
// 포함시킨다(실측: `pnpm --filter @cp949/geul-showcase build`가 언어별
// chunk 100개 이상 + WASM 622KB를 만들어냈다). 이 예제는 언어 1개만
// 쓰므로 `shiki`가 문서화한 "fine-grained bundle" 경로(`shiki/core` +
// 명시적 `langs`/`themes`/`engine`)로 필요한 것만 가져온다. WASM
// oniguruma 엔진 대신 순수 JS 정규식 엔진(`shiki/engine/javascript`)을
// 써서 WASM 자산 번들링 자체를 피한다(RD-003-DELTA-02.md "결정").
//
// 문법 엔진 초기화가 실제로 비동기다 — RD-003 완료 조건 1의 "비동기
// 대표"(DELTA-01의 lowlight는 동기)를 이 인스턴스 하나로 실증한다.
// 호출마다 새로 만들지 않는다(모듈 스코프 싱글턴).
const highlighterPromise: Promise<HighlighterCore> = createHighlighterCore({
  themes: [githubLight],
  langs: [jsLang],
  engine: createJavaScriptRegexEngine(),
});

// shiki `FontStyle` bit flag(0=None, 1=Italic, 2=Bold, 4=Underline,
// 8=Strikethrough) — `ThemedToken.fontStyle`가 이미 이 숫자값이다.
const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;
const FONT_STYLE_STRIKETHROUGH = 8;

// spec §3 — `SyntaxHighlightToken.className`만 노출한다(inline style 필드
// 없음). shiki의 hex color를 class 계약에 맞추려고 (color, fontStyle) 쌍마다
// 결정적인 class명을 만든다.
const tokenClassName = (
  color: string | undefined,
  fontStyle: number,
): string | undefined => {
  if (color === undefined) return undefined;
  const hex = color.replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  return fontStyle === 0 ? `shiki-tok-${hex}` : `shiki-tok-${hex}-${fontStyle}`;
};

/**
 * 실제로 등장한 (color, fontStyle) 조합의 CSS 규칙만 담는 registry다.
 * `getTheme().settings`를 미리 순회해 팔레트 전체를 추정하는 대신, 토큰이
 * 실제로 만들어질 때(`shikiSyntaxHighlighter` 호출 시점)마다 그 조합을
 * 등록한다 — vscode-textmate의 cascade 매칭은 color/fontStyle을 서로 다른
 * scope 규칙에서 각각 가져올 수 있어(TextMate 문법의 표준 동작), 테마
 * settings를 정적으로 순회하는 방식으로는 모든 (color, fontStyle) 조합을
 * 보장할 수 없다 — 실제 토큰에서 직접 등록하면 이 문제가 원천적으로
 * 없다(class 하나가 만들어지는 순간과 그 CSS 규칙이 만들어지는 순간이
 * 항상 같은 값에서 나온다).
 */
const themeRuleRegistry = new Map<string, string>();
const themeRuleListeners = new Set<() => void>();
let themeCssSnapshot = "";

const registerThemeRule = (
  color: string | undefined,
  fontStyle: number,
): string | undefined => {
  const className = tokenClassName(color, fontStyle);
  if (className === undefined || themeRuleRegistry.has(className)) {
    return className;
  }
  const declarations = [`color: ${color};`];
  if (fontStyle & FONT_STYLE_ITALIC) declarations.push("font-style: italic;");
  if (fontStyle & FONT_STYLE_BOLD) declarations.push("font-weight: bold;");
  if (fontStyle & FONT_STYLE_UNDERLINE)
    declarations.push("text-decoration: underline;");
  if (fontStyle & FONT_STYLE_STRIKETHROUGH)
    declarations.push("text-decoration: line-through;");
  themeRuleRegistry.set(
    className,
    `.${className} { ${declarations.join(" ")} }`,
  );
  themeCssSnapshot = Array.from(themeRuleRegistry.values()).join("\n");
  for (const listener of themeRuleListeners) listener();
  return className;
};

const subscribeThemeRules = (listener: () => void): (() => void) => {
  themeRuleListeners.add(listener);
  return () => themeRuleListeners.delete(listener);
};

const getThemeCssSnapshot = (): string => themeCssSnapshot;

type Token = { from: number; to: number; className?: string };

// spec §4 "미지원/빈 language" — geul은 관여하지 않는다. 이 예제는 단일
// 언어(javascript)만 시연한다(RD-003 완료 조건 1은 라이브러리당 예제
// 1개이지 언어 커버리지 전수가 아니다 — DELTA-01의 lowlight 예제는
// 이후 3개 언어로 범위가 늘었다, 이 shiki 예제와는 무관한 변경).
const shikiSyntaxHighlighter = async ({
  source,
  language,
}: {
  source: string;
  language: string | undefined;
}): Promise<readonly Token[]> => {
  if (language !== SHIKI_LANG) return [];
  const highlighter = await highlighterPromise;
  // `codeToTokensBase`의 `ThemedToken.offset`은 source 전체 기준 절대
  // 오프셋이다(scratchpad 실측 — RD-003-DELTA-02.md "결정" 참고). 줄바꿈을
  // 넘나드는 누적 계산이 필요 없다.
  const lines = highlighter.codeToTokensBase(source, {
    lang: SHIKI_LANG,
    theme: SHIKI_THEME,
  });
  const tokens: Token[] = [];
  for (const line of lines) {
    for (const tok of line) {
      const className = registerThemeRule(tok.color, tok.fontStyle ?? 0);
      if (className === undefined) continue;
      tokens.push({
        from: tok.offset,
        to: tok.offset + tok.content.length,
        className,
      });
    }
  }
  return tokens;
};

const SAMPLE_SOURCE = `function greet(name) {
  // Says hello
  const greeting = \`Hello, \${name}!\`;
  return greeting.toUpperCase();
}

console.log(greet("Geul"));`;

const SyntaxHighlightingShikiExample = () => {
  const [initialDocument] = useState<Document>(() => ({
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "showcase-syntax-highlighting-shiki-block-1",
        type: "codeBlock",
        language: "javascript",
        content: [{ text: SAMPLE_SOURCE }],
      },
    ],
  }));
  // 토큰이 실제로 만들어질 때마다 `registerThemeRule`이 채우는 registry를
  // 구독한다 — 강조 span은 React 트리 밖(ProseMirror decoration)에서
  // 생기므로, class에 대응하는 CSS 규칙만 React가 소유한 `<style>`로
  // 렌더하면 된다(규칙이 나중에 추가돼도 이미 그려진 span에 즉시
  // 적용된다 — CSS 엔진이 매칭을 다시 하므로 렌더 순서를 신경 쓸 필요가
  // 없다).
  const themeCss = useSyncExternalStore(
    subscribeThemeRules,
    getThemeCssSnapshot,
  );

  return (
    <>
      <style>{themeCss}</style>
      <EditorProvider
        initialDocument={initialDocument}
        syntaxHighlighter={shikiSyntaxHighlighter}
      >
        <EditorContent />
      </EditorProvider>
    </>
  );
};

export default SyntaxHighlightingShikiExample;
