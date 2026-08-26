/**
 * createId 옵션 없이 createEditor·BlockIdExtension을 쓸 때도 기본
 * defaultIdFactory(createRandomDocumentId)가 유효한 blockId를
 * 발급하는지 확인한다.
 */
import { isValidDocumentId } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { createEditor } from "../src/index.js";
import { paragraphDocument } from "./editor-controller-support.js";
import { createTableFixtureEditor } from "./table-test-support.js";

// isValidDocumentId는 "비어있지 않고 제어문자가 없는 문자열"만 요구해
// 형식·유일성까지는 보지 않는다(model 스키마 계층 계약, D2). 이 두
// 테스트는 defaultIdFactory 배선(EditorController·BlockIdExtension) 자체를
// 검증하는 것이 목적이므로, 실제 배선이 createRandomDocumentId(RFC4122
// v4)로 향한다는 것까지 이 정규식으로 함께 고정한다 — isValidDocumentId만
// 쓰면 배선이 다른 factory로 조용히 바뀌어도(예: 상수 문자열) 잡히지
// 않는다.
const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("defaultIdFactory 소비 경로", () => {
  it("createId 옵션 없이 createEditor를 호출해도 유효한 blockId를 발급한다", () => {
    const editor = createEditor({
      initialDocument: paragraphDocument("content"),
    });

    const inserted = editor.commands.insertParagraphAfter("block-1");
    if (!inserted.ok) throw new Error("문단 삽입 fixture 준비 실패");

    expect(isValidDocumentId(inserted.value.blockId)).toBe(true);
    expect(inserted.value.blockId).toMatch(uuidV4Pattern);
  });

  it("createId 없이 BlockIdExtension을 등록해도 유효한 blockId를 발급한다", () => {
    const editor = createTableFixtureEditor({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello" }] },
      ],
    });

    editor.commands.insertContent("!");

    const blockId = editor.state.doc.firstChild?.attrs.blockId;
    expect(typeof blockId).toBe("string");
    expect(isValidDocumentId(blockId as string)).toBe(true);
    expect(blockId).toMatch(uuidV4Pattern);
  });
});
