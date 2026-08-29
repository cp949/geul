/**
 * GFM markdown 왕복(export→re-import) 테스트가 공유하는 단언 helper다.
 * `markdown-heading-divider.test.ts`(DELTA-07)·`markdown-blockquote.test.ts`
 * (DELTA-07a)가 같은 본문을 각자 선언했던 것을 여기로 승격했다(G-TST-002).
 */
import type { Document } from "@cp949/geul-model";
import { expect } from "vitest";

import { exportMarkdown, importMarkdown } from "../src/index.js";

/**
 * importMarkdown이 성공했다고 단언하고 문서와 경고를 돌려준다. 실패하면 그
 * 오류 메시지로 즉시 실패시켜 뒤따르는 단언의 원인을 가리지 않는다.
 */
export const importOk = (source: string) => {
  const result = importMarkdown(source);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

/**
 * exportMarkdown(strict)이 성공하고, 그 출력을 다시 importMarkdown하면
 * 경고 없이 원래 blocks(id 포함)가 그대로 복원되는지 단언한다 — export
 * 형상과 re-import 결과를 한 번에 고정하는 왕복 단언이다.
 */
export const expectRoundTrip = (document: Document): string => {
  const exported = exportMarkdown(document, { mode: "strict" });
  expect(exported.ok).toBe(true);
  if (!exported.ok) throw new Error(exported.error.code);
  const imported = importOk(exported.value);
  expect(imported.document.blocks).toEqual(document.blocks);
  expect(imported.warnings).toEqual([]);
  return exported.value;
};
