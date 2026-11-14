---
status: accepted
---

# npm 배포를 태그 push의 trusted publishing으로 일원화한다

`model`·`io`·`core`·`react` 4개 패키지의 npm 배포는 `v<버전>` 태그 push로 실행되는 GitHub Actions(`.github/workflows/release.yml`)에서만 한다. 인증은 OIDC trusted publishing이며 npm 토큰 secret을 쓰지 않는다. 같은 방식을 `cp949/web-image-util`이 먼저 적용했다(그 저장소의 ADR-0010).

이전에는 개발자 PC에서 `pnpm changeset:publish`를 실행했다. 인증 정보가 로컬 환경에 남고, 배포본에 출처 증명(provenance)이 없었다.

## 결정

1. 태그는 lockstep(ADR-0018)에 맞춰 `v<버전>` 하나다. 패키지별 태그(`@cp949/geul-react@0.3.0` 형식)는 더 만들지 않는다. 기존 태그는 그대로 둔다.
2. 배포 전에 세 가지를 모두 확인한다. 하나라도 실패하면 배포하지 않는다.
   - 태그 이름이 4개 `package.json` 버전과 모두 같다.
   - 태그 커밋이 `main`에 포함된다.
   - `pnpm verify`(CI와 같은 전체 검증)가 통과한다.
3. 배포는 `scripts/publish-release.mjs`가 한다. 내부 의존 순서(model, io, core, react)로 `pnpm pack`을 만들고 `npm publish <tarball> --provenance --access public`으로 올린다.
   - `workspace:*`는 `pnpm pack`이 실제 버전으로 바꾼다.
   - OIDC 교환은 npm CLI(11.5.1 이상)가 한다. `pnpm publish`가 같은 교환을 하는지는 확인하지 못해 쓰지 않는다.
   - 이미 npm에 있는 버전은 건너뛴다. 일부만 올라간 뒤 workflow를 다시 실행해도 된다.
4. `changeset:publish` 스크립트를 없앤다. Changesets는 버전과 CHANGELOG 갱신(`changeset:version`)까지만 맡는다.
5. npmjs.com의 4개 패키지마다 trusted publisher를 등록한다. Organization or user `cp949`, Repository `geul`, Workflow filename `release.yml`, Environment 비움. workflow 파일명을 바꾸면 등록도 함께 바꾼다.
6. 첫 CI 배포가 성공한 뒤 4개 패키지 설정에서 토큰 publish를 막는다.

## Consequences

- 태그 push는 npm에 되돌릴 수 없는 공개 배포를 일으킨다. 태그는 사용자가 직접 push한다.
- 버전 커밋(`pnpm changeset:version` 결과)을 먼저 `main`에 병합해야 한다. 병합 전 커밋의 태그는 배포되지 않는다.
- 4개 패키지 중 하나라도 trusted publisher가 등록되지 않으면 그 패키지에서 배포가 멈춘다. 앞선 패키지는 이미 올라가 있을 수 있다. 등록을 마친 뒤 같은 workflow를 다시 실행하면 나머지만 올라간다.
- workflow runner는 기본 CI와 같은 `ubuntu-latest`다. web-image-util은 `ubuntu-26.04`로 고정했지만, 이 저장소의 e2e 게이트는 `ubuntu-latest`에서 검증된 상태라 바꾸지 않았다.
- `scripts/publish-release.mjs`의 OIDC 인증과 provenance는 GitHub Actions 안에서만 동작한다. 로컬에서는 태그·버전 판정(`--check`)과 `pnpm pack` 결과만 확인했다.
