import { createContext, useContext } from "react";

// spec §6(BLK-017), RD-002-DELTA-02(Issue #162) — `packages/react` 전담
// 공개 계약. core는 이 타입을 모른다(model의 CodeBlock.language는 이미
// 자유 문자열이고 고정 목록을 강제하지 않는다). `id`가 콤보박스에
// commit되는 실제 language 값을 겸한다 — 기존 내부 구현이 갖고 있던
// `id`/`language` 두 필드(모든 항목에서 항상 같은 값)를 이 공개 타입은
// 하나로 합친다.
export type CodeBlockLanguageOption = {
  id: string;
  label: string;
  aliases?: readonly string[];
};

// `EditorProvider`가 `codeBlockLanguages` prop을 여기 담아 children
// 트리로 내려보내고, `CodeBlockLanguageCombobox`가 `useCodeBlockLanguages()`로
// 읽는다. `EditorController`에는 없는 값이다(core가 모르는 react 전용
// 개념이라 `useDictionary()`처럼 `editor.getXxx()`로 되읽을 수 없다) —
// 그래서 dictionary와 달리 별도 Context가 필요하다. 기본값 `undefined`는
// "지정하지 않음"을 뜻하고, 콤보박스가 자신의 기본 12개로 대체한다.
//
// 마운트 시점에 얼리지 않는다(RD-002.md "## 결정") — 이 값은
// `createEditor()`를 전혀 거치지 않는 순수 렌더 목록이라, `EditorProvider`가
// 매 렌더 `props.codeBlockLanguages`를 그대로 여기로 흘린다.
const CodeBlockLanguagesContext = createContext<
  readonly CodeBlockLanguageOption[] | undefined
>(undefined);

export const CodeBlockLanguagesProvider = CodeBlockLanguagesContext.Provider;

export const useCodeBlockLanguages = ():
  readonly CodeBlockLanguageOption[] | undefined =>
  useContext(CodeBlockLanguagesContext);
