# G-WKS-005 호스트 저장소를 bind-mount한 컨테이너 안에서는 pnpm deps-status-check를 끄거나 우회한다

- 상태: `ACTIVE`
- 적용 조건: 호스트에서 `pnpm install`한 저장소(`node_modules` 포함)를 Docker 컨테이너에 bind-mount하고, 그 컨테이너 안에서 pnpm 기반 명령을 실행하는 작업. 컨테이너의 OS·Node 버전이 호스트와 다를 때 특히 해당한다.

## 구현 규칙

- `pnpm --filter <pkg> <script>`/`pnpm run` 계열을 컨테이너 안에서 그대로 쓰지 않는다. pnpm 11.x의 "deps status check"가 호스트에서 만든 `node_modules`를 컨테이너 관점의 lockfile·환경과 대조해 불일치로 판단하면, TTY 없는 환경에서 대화형 확인 없이 재설치를 시도하다 abort된다(`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`).
- 에러 메시지가 제안하는 `CI=true`를 그대로 따르지 않는다 — 확인 프롬프트를 자동 승인할 뿐 실제로 `pnpm install`을 수행하게 만든다. 컨테이너가 root로 실행 중이면 bind-mount된 호스트 저장소의 `node_modules`·신규 `.pnpm-store/`가 root 소유로 오염된다.
- 대신 다음 중 하나를 쓴다.
  - 리졸브된 바이너리를 직접 호출한다: `./node_modules/.bin/<tool>`(pnpm이 만드는 `.bin/*`는 POSIX 셸 shim이라 `node <path>`로 넘기면 문법 오류가 난다).
  - deps status check 자체를 끈다: `-e pnpm_config_verify_deps_before_run=false`(env var) 또는 `pnpm --config.verify-deps-before-run=false --filter <pkg> <script>`(CLI flag).
- 컨테이너를 호스트 UID로 실행한다: `docker run --user "$(id -u):$(id -g)"`. 위 두 우회를 지켜도 이 옵션은 기본으로 켠다 — root 실행이 원인이 아닌 다른 오염 경로(lifecycle script, 캐시 쓰기)까지 막는 마지막 안전판이다.
- 오염이 이미 발생했다면 `sudo chown -R <host-user>:<host-group> <repo>`로 즉시 복구하고 컨테이너가 만든 신규 디렉터리(`.pnpm-store/` 등)를 삭제한다.

## 완료 기준

컨테이너에서 pnpm 관련 명령 실행 후 `find <repo> -xdev -user root | wc -l`이 0이고, `git status --short`가 의도한 변경만 보인다.
