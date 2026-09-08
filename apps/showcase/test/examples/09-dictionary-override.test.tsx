// @vitest-environment jsdom

/**
 * Dictionary override 예제가 마운트되면 SlashMenu가(항상 렌더링되진
 * 않지만) 최소한 에디터가 정상 마운트되는지 확인하는 스모크 테스트.
 * override된 라벨("Grid")이 실제로 슬래시 메뉴에 반영되는지는
 * packages/react의 dictionary 통합 테스트(dictionary-ko-integration.test.tsx
 * 등) 영역이다 — 여기서는 EditorProvider의 dictionary prop 배선이
 * 크래시를 내지 않는지만 확인한다.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import DictionaryOverridePage from "../../src/examples/09-dictionary-override/page.js";

afterEach(cleanup);

describe("Dictionary override 예제", () => {
  it("에디터가 마운트되고 contenteditable 영역이 생긴다", async () => {
    render(<DictionaryOverridePage />);

    const host = screen.getByRole("textbox", { name: "Editor" });
    await waitFor(() => {
      expect(host.querySelector('[contenteditable="true"]')).not.toBeNull();
    });
  });
});
