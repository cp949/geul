/**
 * BlockJoinExtension의 Backspace/Delete 병합 계약을 확인한다.
 *
 * 컨테이너 스키마(D19)에서 PM joinBackward의 deleteBarrier는 두
 * blockContainer를 join하지 못하고(blockContent 둘 연속은 content
 * expression 위반) findWrapping(blockGroup) 경로로 떨어져 뒤 블록을 앞
 * 블록의 자식으로 들여쓴다 — 평면 문서에서도. Delete(forward)도 대칭으로
 * 뒤 블록을 자식화한다. 이 파일은 D22(커스텀 split/join 커맨드 도입)의
 * join 쪽 이행이 dev(StarterKit joinBackward/joinForward) 의미론 —
 * 병합·빈 블록 제거·표 인접 NodeSelection — 을 복원함을 고정한다.
 * 병합은 단일 dispatch(undo 1회 단위, G-EDT-001)여야 한다.
 *
 * Issue #404: 문서를 바꾸지 않는 Delete(빈 마지막 문단, 자동 trailing 문단
 * 병합)가 키를 소비하고 트랜잭션을 만들지 않음을 두 파일이 같은 헬퍼로
 * 단언한다(G-TST-002).
 *
 * Issue #410: Backspace 쪽 형제 경로도 같은 헬퍼를 쓴다. 자동 trailing 문단은
 * blockId를 미리 알 수 없어 placeCaretInLastContainer가 위치로 캐럿을 둔다.
 *
 * Issue #38 슬라이스 3(DELTA-05)이 더한 축: quote 블록의 Backspace join이
 * paragraph|heading 규칙을 그대로 따르고(05-C2), divider(비포장 atom)
 * 인접 Backspace/Delete가 divider를 그 자리에 그대로 두고 건너뛰어 그 너머의
 * 병합 가능한 블록과 현재 블록을 결합한다(Issue #202 RD-002 — 05-C5의
 * selection-only 2단계 삭제를 대체, atom 연속 시 재귀적으로 전부 건너뛴다).
 *
 * Issue #138이 더한 축: 표가 인접한 중첩 위치에서도 첫 키는 표 전체
 * CellSelection만 만들고, 이어지는 키는 표만 삭제해 undo 1회로 복원한다.
 *
 * 키 소비(반환 true)는 view.someProp("handleKeyDown", ...) 실 디스패치로
 * 검증한다 — 이 커맨드는 addKeyboardShortcuts로만 등록돼 editor.commands로
 * 노출되지 않는다(G-WKS-001).
 */
import { type Block, type Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { expect } from "vitest";

import { createEditor, type CreateEditorOptions } from "../../src/index.js";
import { contentTextStart, dispatchKeydown } from "../block-test-support.js";
import {
  documentOf,
  mountTiptapEditor,
  sequentialIds,
} from "../editor-controller-support.js";

/**
 * 문서를 EditorController로 마운트해 실 키맵 체인이 걸린 tiptap 에디터를
 * 얻는다 — 각 케이스의 공통 도입부.
 */
const mountDocument = (document: Document) => {
  const editor = createEditor({
    initialDocument: document,
    createId: sequentialIds("id"),
  });
  return mountTiptapEditor(editor);
};

/**
 * 문서 안 해당 타입 노드 수를 센다 — blockGroup 완전 소멸(유령 빈 블록
 * 없음)과 "중첩이 생기지 않았다"를 구조 수치로 단언한다.
 */
const countNodes = (
  tiptap: Pick<TiptapEditor, "state">,
  typeName: string,
): number => {
  let count = 0;
  tiptap.state.doc.descendants((node) => {
    if (node.type.name === typeName) count += 1;
    return true;
  });
  return count;
};

/**
 * 직렬화·재파싱 후 check()로 결과 트리의 스키마 유효성을 고정한다 — 병합
 * step이 content expression을 깼다면 여기서 드러난다.
 */
const expectSchemaValid = (tiptap: TiptapEditor): void => {
  expect(() =>
    tiptap.schema.nodeFromJSON(tiptap.state.doc.toJSON()).check(),
  ).not.toThrow();
};

/**
 * 키 입력 동안 문서를 바꾼 트랜잭션 수를 센다. 키 소비 여부와 함께 돌려준다.
 * 구독은 입력이 끝나면 해제한다.
 */
const pressCountingDocChanges = (
  tiptap: TiptapEditor,
  press: () => boolean,
): { handled: boolean; docChanged: number } => {
  let docChanged = 0;
  const onTransaction = ({
    transaction,
  }: {
    transaction: { docChanged: boolean };
  }): void => {
    if (transaction.docChanged) docChanged += 1;
  };
  tiptap.on("transaction", onTransaction);
  try {
    const handled = press();
    return { handled, docChanged };
  } finally {
    tiptap.off("transaction", onTransaction);
  }
};

/**
 * 키를 소비하고 아무것도 바꾸지 않음을 단언한다 — 소비(true), 문서를 바꾼
 * 트랜잭션 0개, blockId 포함 문서 JSON 불변. 문서 JSON만 비교하면 blockId가
 * 바뀌는 "지웠다 되붙는" 변경을 놓치지 않도록 id까지 비교한다.
 */
const expectKeyConsumedUnchanged = (
  tiptap: TiptapEditor,
  press: () => boolean,
): void => {
  const beforeJson = tiptap.state.doc.toJSON();
  const result = pressCountingDocChanges(tiptap, press);

  expect(result.handled).toBe(true);
  expect(result.docChanged).toBe(0);
  expect(tiptap.state.doc.toJSON()).toEqual(beforeJson);
};

/**
 * 블록 목록을 마운트하고 캐럿을 블록 "i"의 텍스트 선두에 둔다(Issue #411,
 * #413). enabledBlockTypes가 undefined면 설정 없음 대조군이다.
 */
const mountAtBlockStart = (
  blocks: Block[],
  enabledBlockTypes: EnabledBlockTypes | undefined,
) => {
  const editor = createEditor({
    initialDocument: documentOf(...blocks),
    createId: sequentialIds("id"),
    // exactOptionalPropertyTypes라 undefined는 키째 뺀다.
    ...(enabledBlockTypes === undefined ? {} : { enabledBlockTypes }),
  });
  const { editable, tiptap } = mountTiptapEditor(editor);
  editable.focus();
  tiptap.commands.setTextSelection(contentTextStart(tiptap, "i"));
  return { editor, tiptap };
};

/**
 * Backspace가 문서를 바꾸지 않고 키만 소비함을 단언한다. selection과 undo
 * 깊이도 그대로다(Issue #411, #413).
 */
const expectBackspaceConsumedOnly = (tiptap: TiptapEditor): void => {
  const selection = tiptap.state.selection;
  const depth = undoDepth(tiptap.state);

  expectKeyConsumedUnchanged(tiptap, () =>
    dispatchKeydown(tiptap, "Backspace"),
  );

  expect(tiptap.state.selection.eq(selection)).toBe(true);
  expect(undoDepth(tiptap.state)).toBe(depth);
};

/**
 * 문서 마지막 컨테이너의 콘텐츠 노드 안 선두에 캐럿을 둔다. 자동 trailing
 * 문단은 blockId를 미리 알 수 없어(생성 시점에 정해진다) blockId 대신 위치로
 * 찾는다. 컨테이너 pos + 2가 콘텐츠 노드 안 텍스트 시작이다(D19).
 */
const placeCaretInLastContainer = (tiptap: TiptapEditor): void => {
  const { doc } = tiptap.state;
  const last = doc.lastChild;
  if (last === null) throw new Error("마지막 컨테이너가 없다");
  tiptap.commands.setTextSelection(doc.content.size - last.nodeSize + 2);
};

/**
 * paragraph를 막은 enabledBlockTypes 설정 행렬(Issue #411, #412). 두 테스트 파일이
 * 같은 상수·단언을 쓴다(G-TST-002).
 */
export type EnabledBlockTypes = NonNullable<
  CreateEditorOptions["enabledBlockTypes"]
>;
export type DeniedType = EnabledBlockTypes["types"][number];

const PARAGRAPH_BLOCKED_SETTINGS: ReadonlyArray<{
  name: string;
  denied: readonly DeniedType[];
}> = [
  { name: "paragraph", denied: ["paragraph"] },
  {
    name: "paragraph+heading+quote+callout",
    denied: ["paragraph", "heading", "quote", "callout"],
  },
];

const denyBlockTypes = (denied: readonly DeniedType[]): EnabledBlockTypes => ({
  mode: "deny",
  types: [...denied],
});

// 문서 어디에도 막은 타입이 없다.
const expectNoDeniedNodes = (
  tiptap: TiptapEditor,
  denied: readonly DeniedType[],
): void => {
  tiptap.state.doc.descendants((node) => {
    expect(denied).not.toContain(node.type.name);
  });
};

export {
  countNodes,
  denyBlockTypes,
  expectBackspaceConsumedOnly,
  expectNoDeniedNodes,
  expectKeyConsumedUnchanged,
  expectSchemaValid,
  mountAtBlockStart,
  mountDocument,
  PARAGRAPH_BLOCKED_SETTINGS,
  placeCaretInLastContainer,
  pressCountingDocChanges,
};
