/**
 * `list-item-block-type-support.ts`가 module scope에 소유하는 mountedEditors
 * cleanup 계약을 고정한다(G-TST-003, Issue #140). 마운트된 editor 중 하나(또는
 * 여럿)의 `destroy()`가 던져도 나머지 editor의 `destroy()` 시도를 막지 않는지,
 * 내부 `Set`이 성공·실패와 무관하게 비는지, 여러 실패가 하나의
 * `AggregateError`로 함께 보고되는지를 검증한다. `afterEach`가 실제로
 * 실행되는지는 vitest의 훅 스케줄링(`it` 등록 순서, `--sequence.shuffle`, 훅
 * 간 실행 순서)에 기대지 않는다 — `afterEach`가 참조하는 바로 그 정리 함수
 * (`destroyMountedEditorsForTest`)를 `it` 하나 안에서 직접 호출한다.
 *
 * 덮지 않는 것: `mountTiptapEditor`·`mounted` 자체의 마운트 동작, 문서·목록
 * fixture 빌더(`documentOf`·`paragraphBlock`·`listItemBlock`)의 출력 모양,
 * 목록 종류 변경 command 자체의 동작. 이 모두 다른 목록 command 테스트가
 * 이미 다룬다.
 */
import { describe, expect, it } from "vitest";

import {
  destroyMountedEditorsForTest,
  documentOf,
  mounted,
  paragraphBlock,
} from "./list-item-block-type-support.js";

describe("destroyMountedEditorsForTest 실패 집계", () => {
  it("등록된 editor 중 하나의 destroy()가 던져도 나머지가 정리되고 실패가 집계된다", () => {
    const doc = documentOf(paragraphBlock("p1", "hello"));
    // failing을 가장 먼저 등록해 Set 순회가 그 실패를 첫 항목으로 만나게
    // 한다 — "첫 실패가 나머지 정리를 막지 않는다"를 재현하려면 실패가
    // 앞서야 한다.
    const failing = mounted(doc);
    const survivorA = mounted(doc);
    const survivorB = mounted(doc);
    failing.editor.destroy = () => {
      throw new Error("의도된 destroy 실패");
    };

    let thrown: unknown;
    try {
      destroyMountedEditorsForTest();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    expect(survivorA.tiptap.isDestroyed).toBe(true);
    expect(survivorB.tiptap.isDestroyed).toBe(true);

    // Set이 성공·실패와 무관하게 비었는지 확인한다 — 비지 않았다면 failing이
    // 여전히 등록돼 있어 재호출이 같은 예외를 다시 던진다.
    expect(() => destroyMountedEditorsForTest()).not.toThrow();
  });

  it("여러 editor의 destroy() 실패가 하나의 AggregateError로 함께 보고된다", () => {
    const doc = documentOf(paragraphBlock("p1", "hello"));
    const failingA = mounted(doc);
    const failingB = mounted(doc);
    failingA.editor.destroy = () => {
      throw new Error("첫 번째 실패");
    };
    failingB.editor.destroy = () => {
      throw new Error("두 번째 실패");
    };

    let thrown: unknown;
    try {
      destroyMountedEditorsForTest();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AggregateError);
    const aggregate = thrown as AggregateError;
    expect(aggregate.errors).toHaveLength(2);
    expect(
      aggregate.errors.map((error: unknown) =>
        error instanceof Error ? error.message : String(error),
      ),
    ).toEqual(["첫 번째 실패", "두 번째 실패"]);
  });
});
