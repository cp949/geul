import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";
import { createEditor, type DocumentChangeEvent } from "../src/index.js";
import {
  documentWithContent,
  paragraphDocument,
} from "./editor-controller-support.js";

describe("에디터 컨트롤러 문서 검증", () => {
  it("잘못된 형식의 교체 문서를 원자적으로 거부한다", () => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept", 3),
      onChange: (event) => changes.push(event),
    });

    expect(editor.replaceDocument({ formatVersion: 1 })).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
    expect(editor.getDocument()).toEqual(paragraphDocument("kept", 3));
    expect(changes).toEqual([]);
  });

  it("에디터 생성 전에 빈 텍스트 run을 거부한다", () => {
    expect(() =>
      createEditor({
        initialDocument: documentWithContent([{ text: "" }]),
      }),
    ).toThrow(TypeError);
  });

  it("에디터 생성 전에 빈 mark 배열을 거부한다", () => {
    expect(() =>
      createEditor({
        initialDocument: documentWithContent([
          { text: "noncanonical", marks: [] },
        ]),
      }),
    ).toThrow(TypeError);
  });

  it("에디터 생성 전에 블록 없는 문서를 거부한다", () => {
    expect(() =>
      createEditor({
        initialDocument: { formatVersion: 1, revision: 0, blocks: [] },
      }),
    ).toThrow(TypeError);
  });

  it("에디터 생성 전에 mark가 같은 인접 인라인 run을 거부한다", () => {
    expect(() =>
      createEditor({
        initialDocument: documentWithContent([
          { text: "left", marks: [{ type: "bold" }] },
          { text: "right", marks: [{ type: "bold" }] },
        ]),
      }),
    ).toThrow(TypeError);
  });

  it("에디터 생성 전에 정규 순서가 아닌 mark 배열을 거부한다", () => {
    expect(() =>
      createEditor({
        initialDocument: documentWithContent([
          {
            text: "ordered",
            marks: [
              { type: "link", href: "https://example.com" },
              { type: "bold" },
              { type: "italic" },
              { type: "underline" },
              { type: "strike" },
              { type: "code" },
            ],
          },
        ]),
      }),
    ).toThrow(TypeError);
  });

  it.each([
    {
      name: "블록 없는 문서",
      document: {
        formatVersion: 1,
        revision: 0,
        blocks: [],
      } satisfies Document,
    },
    {
      name: "빈 텍스트 run",
      document: documentWithContent([{ text: "" }]),
    },
    {
      name: "빈 mark 배열",
      document: documentWithContent([{ text: "noncanonical", marks: [] }]),
    },
    {
      name: "동일한 인접 인라인 run",
      document: documentWithContent([
        { text: "left", marks: [{ type: "italic" }] },
        { text: "right", marks: [{ type: "italic" }] },
      ]),
    },
    {
      name: "정규 순서가 아닌 mark 배열",
      document: documentWithContent([
        {
          text: "ordered",
          marks: [{ type: "italic" }, { type: "bold" }],
        },
      ]),
    },
  ])("문서 교체 시 $name을 원자적으로 거부한다", ({
    document: replacement,
  }) => {
    const changes: DocumentChangeEvent[] = [];
    const editor = createEditor({
      initialDocument: paragraphDocument("kept", 3),
      onChange: (event) => changes.push(event),
    });

    expect(editor.replaceDocument(replacement)).toMatchObject({
      ok: false,
      error: { code: "DOCUMENT_INVALID" },
    });
    expect(editor.getDocument()).toEqual(paragraphDocument("kept", 3));
    expect(changes).toEqual([]);
  });
});
