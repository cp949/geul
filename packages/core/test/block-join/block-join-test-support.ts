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
 * Issue #38 슬라이스 3(DELTA-05)이 더한 축: quote 블록의 Backspace join이
 * paragraph|heading 규칙을 그대로 따르고(05-C2), divider(비포장 atom)
 * 인접 Backspace/Delete가 텍스트를 divider 너머로 병합하지 않고 divider를
 * NodeSelection으로 선택한다(05-C5 — 첫 키는 selection-only, 이어지는 키가
 * divider를 지우고 그 삭제가 undo 1회 단위다).
 *
 * Issue #138이 더한 축: 표가 인접한 중첩 위치에서도 첫 키는 표 전체
 * CellSelection만 만들고, 이어지는 키는 표만 삭제해 undo 1회로 복원한다.
 *
 * 키 소비(반환 true)는 view.someProp("handleKeyDown", ...) 실 디스패치로
 * 검증한다 — 이 커맨드는 addKeyboardShortcuts로만 등록돼 editor.commands로
 * 노출되지 않는다(G-WKS-001).
 */
import { type Document } from "@cp949/geul-model";
import type { Editor as TiptapEditor } from "@tiptap/core";
import { expect } from "vitest";

import { createEditor } from "../../src/index.js";
import {
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

export { countNodes, expectSchemaValid, mountDocument };
