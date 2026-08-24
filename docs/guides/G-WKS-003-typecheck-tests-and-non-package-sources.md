# G-WKS-003 추적 TypeScript·JavaScript 소스 전량을 typecheck 체인에 넣는다

- 상태: `ACTIVE`
- 적용 조건: package test, config, e2e, script 또는 workspace 밖 TS·JS source 추가

## 구현 규칙

- package test는 main composite config에 섞지 않고 `tsconfig.base.json`을 직접 extends하는 `tsconfig.test.json`에서 `noEmit`으로 검사한다.
- 기존 config의 `include`가 새 파일을 실제로 덮으면 재사용한다. 덮는 config가 없을 때만 새 config를 만든다.
- 루트 `typecheck`가 workspace 밖 config도 실행하도록 연결한다. JS는 `checkJs`가 켜져 있어야 coverage로 센다.
- package test config가 dependency의 `dist` type을 읽으면 Turbo `typecheck`에 `^build` 선행 관계를 둔다.
- 새 config는 의도적 type error로 RED를 확인한다. build 뒤 `dist/test` 또는 test 산출물이 생기지 않아야 한다.
- typecheck 커버리지는 소유 기준으로 판정한다 — 파일이 속한 tsconfig 디렉터리에 그 파일이 직접 있고, 그 tsconfig가 실제로 컴파일 대상에 담아야 커버다. dry graph 항목 수, 실행 exit 0 또는 `--listFilesOnly` 멤버십만으로 판정하지 않는다.

## 완료 기준

새 파일이 `--listFilesOnly` 대상이고 실제 type error를 잡으며, clean checkout과 같은 dist 부재 조건에서도 루트 typecheck 체인이 필요한 dependency를 먼저 build한다. dist 부재 조건은 dependency `dist`가 없는 격리 환경에서 `pnpm exec turbo run typecheck --filter=<consumer> --force`로 확인하고, 검증 뒤 build로 산출물을 복구한다.
