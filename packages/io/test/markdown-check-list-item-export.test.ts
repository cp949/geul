/**
 * 체크 목록의 GFM outbound 의미를 검증한다. `- [ ]`/`- [x]` 체크박스 표식과
 * 인접한 bulletListItem과의 목록 경계 분리를 다룬다.
 */
import type { Document } from "@cp949/geul-model";
import { describe, expect, it } from "vitest";

import { exportMarkdown } from "../src/index.js";

describe("체크 목록 GFM 내보내기", () => {
  it("checked true/false 항목을 - [x]/- [ ] 로 내보낸다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "c-1",
          type: "checkListItem",
          checked: true,
          content: [{ text: "완료" }],
        },
        {
          id: "c-2",
          type: "checkListItem",
          checked: false,
          content: [{ text: "미완료" }],
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "* [x] 완료\n* [ ] 미완료\n",
    });
  });

  it("bulletListItem과 checkListItem이 인접해도 서로 다른 목록 경계·bullet 문자로 분리한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        { id: "b-1", type: "bulletListItem", content: [{ text: "글머리" }] },
        {
          id: "c-1",
          type: "checkListItem",
          checked: false,
          content: [{ text: "체크" }],
        },
      ],
    };

    // 둘 다 unordered라 같은 bullet 문자를 고르면 재파싱 시 한 목록으로
    // 합쳐질 위험이 있다 — mdast-util-to-markdown이 직전 사용 bullet을
    // 추적해 인접한 형제 목록에 자동으로 다른 문자를 고른다(라이브러리
    // 기존 계약, 이 DELTA가 만드는 동작이 아니다. 실측으로 고정한다).
    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "* 글머리\n\n- [ ] 체크\n",
    });
  });

  it("체크 항목의 재귀 children을 들여쓰기로 보존한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "c-1",
          type: "checkListItem",
          checked: true,
          content: [{ text: "부모" }],
          children: [
            {
              id: "child-list",
              type: "bulletListItem",
              content: [{ text: "자식" }],
            },
          ],
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: true,
      value: "* [x] 부모\n\n  * 자식\n",
    });
  });

  it("own content가 비고 첫 child가 non-paragraph면 strict export가 CHECKED_STATE_LOST로 거절한다", () => {
    // mdast-util-gfm-task-list-item은 listItem의 첫 자식이 paragraph일 때만
    // 체크박스를 붙인다 — 이 조합은 GFM으로 checked를 표현할 수 없다.
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "empty-check-parent",
          type: "checkListItem",
          checked: true,
          content: [],
          children: [
            { id: "quote-child", type: "quote", content: [{ text: "인용" }] },
          ],
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "strict" })).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "CHECKED_STATE_LOST",
            blockId: "empty-check-parent",
            message: expect.stringContaining("empty-check-parent"),
          },
        ],
      },
    });
  });

  it("같은 케이스에서 lossy export는 콘텐츠·children을 보존하고 checked만 버리며 경고한다", () => {
    const document: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "empty-check-parent",
          type: "checkListItem",
          checked: true,
          content: [],
          children: [
            { id: "quote-child", type: "quote", content: [{ text: "인용" }] },
          ],
        },
      ],
    };

    expect(exportMarkdown(document, { mode: "lossy" })).toEqual({
      ok: true,
      value: {
        markdown: "* > 인용\n",
        warnings: [
          {
            kind: "CHECKED_STATE_LOST",
            blockId: "empty-check-parent",
            message: expect.stringContaining("empty-check-parent"),
          },
        ],
      },
    });
  });
});
