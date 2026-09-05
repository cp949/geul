/**
 * MediaDropPasteExtension(RD-002 DELTA-01, roadmap
 * `_works/roadmap/RD-002.md`)의 위치 판정(D1 표 바이패스, D5 CodeBlock
 * 일반 규칙, F2 drop 앞/뒤, paste 빈 paragraph 교체), 다중 파일 체이닝(D2),
 * range selection 삭제(D7), 우선순위 배선(D4), 콜백 미등록 no-op 회귀(spec
 * §4)를 검증한다. drop 좌표 판정은 jsdom이 실제 레이아웃(`posAtCoords`·
 * `getBoundingClientRect`)을 계산하지 못해 두 값을 테스트 안에서 직접
 * 주입한다 — 실제 브라우저 hit-testing 통합은 DELTA-03 Playwright e2e가
 * 검증한다(계획 문서 "범위 밖" 참고).
 */
import { describe, expect, it } from "vitest";

import { findBlockPosition } from "../src/block-position.js";
import { createEditor, type UploadFile } from "../src/index.js";
import {
  dropEntries,
  dropFiles,
  pasteFiles,
  pasteFilesAndHtml,
  withUnhandledErrorTracking,
} from "./clipboard-test-support.js";
import {
  codeBlockBlock,
  documentOf,
  mediaBlock,
  mountTiptapEditor,
  oneCellTableBlock,
  paragraphBlock,
  sequentialIds,
  tailParagraphBlock,
} from "./editor-controller-support.js";
import { findCellBoundaryPosition } from "./table-test-support.js";

/** 이름·MIME만 지정한 File을 만든다(media-drop-paste-detection.test.ts와 동일 패턴). */
const fileOf = (name: string, type: string): File => new File([], name, { type });

/** DELTA-01 범위에서 실제로 호출되지 않는 stub — isUploadEnabled 게이트만 켠다. */
const noopUploadFile: UploadFile = () => new Promise(() => {});

/**
 * uploadFile을 등록한 채(= isUploadEnabled: true) 문서를 마운트한다. 이
 * 파일의 모든 "정상 동작" 테스트가 공유하는 준비 단계다 — no-op 회귀
 * 테스트만 uploadFile을 일부러 빼고 createEditor를 직접 호출한다.
 */
const mountedWithUploadEnabled = (initialDocument: ReturnType<typeof documentOf>) => {
  const editor = createEditor({
    initialDocument,
    createId: sequentialIds("id"),
    uploadFile: noopUploadFile,
  });
  return { editor, ...mountTiptapEditor(editor) };
};

/**
 * 캐럿을 blockId 블록의 콘텐츠 안(첫 글자 앞)에 둔다. blockContainer
 * 내부(+1)의 첫 자식 콘텐츠 시작(+1) — 컨테이너 위치 + 2가 그 지점이다.
 * paragraph·codeBlock처럼 blockContainer로 감싸인 leaf textblock 전부에
 * 통용된다(내용이 있어도 위치만 그 시작점일 뿐 캐럿은 여전히 그 블록 안).
 */
const placeCaretInBlock = (tiptap: ReturnType<typeof mountTiptapEditor>["tiptap"], blockId: string) => {
  const containerPos = findBlockPosition(tiptap.state.doc, blockId);
  if (containerPos === null) throw new Error(`블록을 찾지 못했다: ${blockId}`);
  tiptap.commands.setTextSelection(containerPos + 2);
  return containerPos;
};

/**
 * blockId 블록 DOM 요소의 getBoundingClientRect를 고정값으로 덮어쓰고,
 * view.posAtCoords가 그 블록 콘텐츠 안의 위치를 가리키도록 만든다. jsdom은
 * 실제 레이아웃을 계산하지 못해(항상 0-rect, posAtCoords도 hit-test 불가)
 * F2 좌표 판정 자체를 테스트하려면 이 두 값을 직접 주입해야 한다.
 */
const stubDropGeometry = (
  tiptap: ReturnType<typeof mountTiptapEditor>["tiptap"],
  blockId: string,
  rect: { top: number; height: number },
) => {
  const containerPos = findBlockPosition(tiptap.state.doc, blockId);
  if (containerPos === null) throw new Error(`블록을 찾지 못했다: ${blockId}`);
  const dom = tiptap.view.nodeDOM(containerPos);
  if (!(dom instanceof HTMLElement)) throw new Error("블록 DOM을 찾지 못했다");
  dom.getBoundingClientRect = () =>
    ({
      top: rect.top,
      bottom: rect.top + rect.height,
      height: rect.height,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
  tiptap.view.posAtCoords = () => ({ pos: containerPos + 2, inside: containerPos });
  return containerPos;
};

describe("표 셀 바이패스(D1) — paste·drop 공통", () => {
  it("표 셀 안에서 paste한 파일은 셀 내용을 건드리지 않고 표 뒤에 삽입된다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(oneCellTableBlock("tbl-1"), tailParagraphBlock),
    );
    editable.focus();
    tiptap.commands.setTextSelection(
      (findCellBoundaryPosition(tiptap, "cell-1") ?? 0) + 1,
    );

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      expect(editor.getDocument().blocks).toEqual([
        oneCellTableBlock("tbl-1"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("표 셀 안에서 drop한 파일은 좌표와 무관하게 표 뒤에 삽입된다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(oneCellTableBlock("tbl-1"), tailParagraphBlock),
    );
    editable.focus();
    const cellPos = (findCellBoundaryPosition(tiptap, "cell-1") ?? 0) + 1;
    tiptap.view.posAtCoords = () => ({ pos: cellPos, inside: cellPos - 1 });

    withUnhandledErrorTracking((errors) => {
      dropFiles(editable, [fileOf("photo.png", "image/png")], {
        clientX: 0,
        clientY: 99999,
      });

      expect(editor.getDocument().blocks).toEqual([
        oneCellTableBlock("tbl-1"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("CodeBlock 일반 규칙(D5)", () => {
  it("CodeBlock 안 paste는 표처럼 바이패스하지 않고 일반 규칙(뒤에 삽입)을 따른다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(codeBlockBlock("cb-1", "code text", "typescript"), tailParagraphBlock),
    );
    editable.focus();
    placeCaretInBlock(tiptap, "cb-1");

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      expect(editor.getDocument().blocks).toEqual([
        codeBlockBlock("cb-1", "code text", "typescript"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("paste — 빈 paragraph 교체 여부", () => {
  it("캐럿이 빈 paragraph 안이면 그 블록을 media 블록으로 교체한다(빈 paragraph가 남지 않는다)", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("empty-1", ""), tailParagraphBlock),
    );
    editable.focus();
    placeCaretInBlock(tiptap, "empty-1");

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      expect(editor.getDocument().blocks).toEqual([
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("캐럿이 내용 있는 블록 안이면 원본을 보존하고 그 뒤에 삽입한다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    placeCaretInBlock(tiptap, "p-1");

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("drop — F2 좌표 판정(교체 없음)", () => {
  it("drop 좌표가 대상 블록 rect 위쪽 절반이면 그 블록 앞에 삽입한다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    stubDropGeometry(tiptap, "p-1", { top: 100, height: 40 });

    withUnhandledErrorTracking((errors) => {
      dropFiles(editable, [fileOf("photo.png", "image/png")], {
        clientX: 0,
        clientY: 110,
      });

      expect(editor.getDocument().blocks).toEqual([
        mediaBlock("image", "id-1"),
        paragraphBlock("p-1", "hello"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("drop 좌표가 대상 블록 rect 아래쪽 절반이면 그 블록 뒤에 삽입한다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    stubDropGeometry(tiptap, "p-1", { top: 100, height: 40 });

    withUnhandledErrorTracking((errors) => {
      dropFiles(editable, [fileOf("photo.png", "image/png")], {
        clientX: 0,
        clientY: 130,
      });

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("빈 paragraph 위에 drop해도 교체하지 않고 앞/뒤에 삽입한다(paste와 다른 규칙)", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("empty-1", ""), tailParagraphBlock),
    );
    editable.focus();
    stubDropGeometry(tiptap, "empty-1", { top: 100, height: 40 });

    withUnhandledErrorTracking((errors) => {
      dropFiles(editable, [fileOf("photo.png", "image/png")], {
        clientX: 0,
        clientY: 130,
      });

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("empty-1", ""),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("D7 — range selection 삭제", () => {
  it("문단 전체가 선택된 상태에서 paste하면 선택을 먼저 지우고(빈 문단이 되어) 교체한다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    const containerPos = findBlockPosition(tiptap.state.doc, "p-1");
    if (containerPos === null) throw new Error("fixture 준비 실패");
    tiptap.commands.setTextSelection({ from: containerPos + 2, to: containerPos + 2 + "hello".length });

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      expect(editor.getDocument().blocks).toEqual([
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });

  it("drop은 D7을 적용하지 않는다 — 드롭 지점과 무관한 곳의 range selection을 지우지 않는다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(
        paragraphBlock("p-1", "hello"),
        paragraphBlock("p-2", "world"),
        tailParagraphBlock,
      ),
    );
    editable.focus();
    // p-1 전체를 선택해 두고, drop은 p-2를 겨냥한다 — p-1 selection과
    // drop 좌표는 서로 무관하다.
    const p1Pos = findBlockPosition(tiptap.state.doc, "p-1");
    if (p1Pos === null) throw new Error("fixture 준비 실패");
    tiptap.commands.setTextSelection({ from: p1Pos + 2, to: p1Pos + 2 + "hello".length });
    stubDropGeometry(tiptap, "p-2", { top: 100, height: 40 });

    withUnhandledErrorTracking((errors) => {
      dropFiles(editable, [fileOf("photo.png", "image/png")], {
        clientX: 0,
        clientY: 130,
      });

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        paragraphBlock("p-2", "world"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("D2 — 다중 파일 체이닝", () => {
  it("파일 3개를 한 번에 paste하면 입력 순서대로 블록 3개가 생성된다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    placeCaretInBlock(tiptap, "p-1");

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [
        fileOf("a.png", "image/png"),
        fileOf("b.mp4", "video/mp4"),
        fileOf("c.mp3", "audio/mpeg"),
      ]);

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        mediaBlock("video", "id-2"),
        mediaBlock("audio", "id-3"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("D8 — drop 디렉터리 필터", () => {
  it("디렉터리 항목이 섞인 drop은 디렉터리를 건너뛰고 파일만 입력 순서대로 삽입한다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    stubDropGeometry(tiptap, "p-1", { top: 100, height: 40 });

    withUnhandledErrorTracking((errors) => {
      dropEntries(
        editable,
        [
          { file: fileOf("a.png", "image/png"), isDirectory: false },
          { file: fileOf("folder", ""), isDirectory: true },
          { file: fileOf("b.png", "image/png"), isDirectory: false },
        ],
        { clientX: 0, clientY: 130 },
      );

      expect(editor.getDocument().blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        mediaBlock("image", "id-2"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("D4 — 우선순위(파일이 표·HTML보다 먼저)", () => {
  it("파일과 표 형태 HTML이 동시에 있으면 파일이 처리되고 표 파싱은 시도되지 않는다", () => {
    const { editor, editable, tiptap } = mountedWithUploadEnabled(
      documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
    );
    editable.focus();
    placeCaretInBlock(tiptap, "p-1");

    withUnhandledErrorTracking((errors) => {
      pasteFilesAndHtml(
        editable,
        [fileOf("photo.png", "image/png")],
        "<table><tbody><tr><td>x</td></tr></tbody></table>",
      );

      const blocks = editor.getDocument().blocks;
      expect(blocks.some((block) => block.type === "table")).toBe(false);
      expect(blocks).toEqual([
        paragraphBlock("p-1", "hello"),
        mediaBlock("image", "id-1"),
        tailParagraphBlock,
      ]);
      expect(errors).toEqual([]);
    });
  });
});

describe("no-op 회귀 — 업로드 콜백 미등록(spec §4, IO-007 own 경계)", () => {
  it("uploadFile 미등록이면 paste의 파일 페이로드는 완전히 무시된다(문서 불변)", () => {
    const editor = createEditor({
      initialDocument: documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    placeCaretInBlock(tiptap, "p-1");
    const before = editor.getDocument().blocks;

    withUnhandledErrorTracking((errors) => {
      pasteFiles(editable, [fileOf("photo.png", "image/png")]);

      expect(editor.getDocument().blocks).toEqual(before);
      expect(errors).toEqual([]);
    });
  });

  it("uploadFile 미등록이면 drop의 파일 페이로드도 완전히 무시된다(문서 불변)", () => {
    const editor = createEditor({
      initialDocument: documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
      createId: sequentialIds("id"),
    });
    const { editable } = mountTiptapEditor(editor);
    editable.focus();
    const before = editor.getDocument().blocks;

    withUnhandledErrorTracking((errors) => {
      dropFiles(editable, [fileOf("photo.png", "image/png")], { clientX: 0, clientY: 0 });

      expect(editor.getDocument().blocks).toEqual(before);
      expect(errors).toEqual([]);
    });
  });

  it("uploadFile 미등록이어도 같은 paste의 text/html은 기존 확장이 그대로 처리한다", () => {
    const editor = createEditor({
      initialDocument: documentOf(paragraphBlock("p-1", "hello"), tailParagraphBlock),
      createId: sequentialIds("id"),
    });
    const { editable, tiptap } = mountTiptapEditor(editor);
    editable.focus();
    placeCaretInBlock(tiptap, "p-1");

    withUnhandledErrorTracking((errors) => {
      pasteFilesAndHtml(editable, [fileOf("photo.png", "image/png")], "<p>world</p>");

      const blocks = editor.getDocument().blocks;
      expect(blocks.some((block) => block.type === "file" || block.type === "image")).toBe(
        false,
      );
      expect(
        blocks.some(
          (block) => block.type === "paragraph" && block.content[0]?.text === "world",
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
  });
});
