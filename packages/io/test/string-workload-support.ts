/**
 * 복잡도 회귀 테스트(G-TST-004)가 공유하는 String.prototype 작업량 계측이다.
 *
 * 대상 함수가 입력을 읽는 데 쓰는 `String.prototype` 메서드(split·indexOf·
 * slice·trim·replace 등)를 감싸 두 축을 센다.
 * 1. 호출 횟수: 이미 읽은 조각을 되돌아가 다시 처리하는 형태는 호출 횟수가
 *    입력 크기의 제곱으로 뛴다.
 * 2. 처리 문자 수: 호출마다 수신 문자열의 길이를 더한다. 호출 횟수가 선형이어도
 *    긴 문자열 전체를 위치마다 다시 처리하는 형태는 처리 문자 수가 제곱으로
 *    뛴다. 호출 횟수만 세면 놓친다.
 *
 * 한계: 정규식 엔진 내부 작업은 이 계측에 잡히지 않는다. 정규식을 쓰는 함수는
 * 정규식 자체가 선형인지 따로 확인해야 한다. 기계 속도와 동시 실행 부하에
 * 의존하지 않는다.
 */

const INSTRUMENTED_METHODS = [
  "split",
  "indexOf",
  "lastIndexOf",
  "slice",
  "substring",
  "trim",
  "trimStart",
  "trimEnd",
  "toLowerCase",
  "toUpperCase",
  "startsWith",
  "endsWith",
  "includes",
  "charAt",
  "charCodeAt",
  "codePointAt",
  "at",
  "replace",
  "replaceAll",
  "match",
  "matchAll",
  "search",
] as const;

export type StringWorkload = { calls: number; chars: number };

type StringMethod = (this: string, ...args: unknown[]) => unknown;

const originals = new Map<string, PropertyDescriptor>();

/** 감싼 메서드를 원래대로 되돌린다. 계측이 던져도 남지 않게 afterEach에서 부른다. */
export const restoreStringMethods = (): void => {
  for (const [name, descriptor] of originals) {
    Object.defineProperty(String.prototype, name, descriptor);
  }
  originals.clear();
};

/**
 * `run` 한 번 동안 String.prototype 메서드 호출 횟수와 수신 문자열 길이 합을
 * 센다. 계측 코드는 `.length`와 숫자 덧셈만 쓴다 — 계측된 메서드를 부르면
 * 자기 호출까지 세어 결과가 오염된다. `run` 안에서는 단언하지 않는다.
 */
export const measureStringWorkload = (run: () => void): StringWorkload => {
  const workload: StringWorkload = { calls: 0, chars: 0 };

  for (const name of INSTRUMENTED_METHODS) {
    const descriptor = Object.getOwnPropertyDescriptor(String.prototype, name);
    if (descriptor === undefined) continue;
    originals.set(name, descriptor);
    const original = descriptor.value as StringMethod;
    Object.defineProperty(String.prototype, name, {
      ...descriptor,
      value: function (this: string, ...args: unknown[]) {
        workload.calls += 1;
        workload.chars += this.length;
        return original.apply(this, args);
      },
    });
  }

  try {
    run();
  } finally {
    restoreStringMethods();
  }
  return workload;
};
