# Chrome83 실검증용 이미지. Debian snapshot.debian.org에 고정된
# chromium=83.0.4103.116-3(2020-07-12 sid snapshot)을 설치하고, Playwright
# executablePath launch를 이 컨테이너 안에서 실행할 수 있도록 Node.js·pnpm도
# 같이 둔다 — 호스트(glibc 2.39)에서 이 바이너리를 직접 실행하려면 ~140개
# 공유 라이브러리(GTK/D-Bus/fontconfig 등, 다수가 절대 경로를 하드코딩)를
# 통째로 추출해야 해 host-extraction보다 훨씬 취약하다.
#
# 공식 browser floor(ADR-0008)는 Chrome75다. 이 이미지가 83인 이유는
# Playwright(1.0.0~1.62.1 전 버전 확인)가 page/context 생성 시 무조건
# 호출하는 CDP `Browser.setDownloadBehavior`가 Chrome75/76엔 없고
# Chrome82 branch point부터 존재하기 때문이다(01-계획.md D10·D11) — Debian
# 스냅샷엔 82.x가 없어 83.x가 실제 시험 가능한 최소 후보다.
FROM debian:buster-slim

# pnpm@11.21.0의 engines.node 최소값(>=22.13)을 만족하려 저장소 CI 핀
# (22.12.0)보다 패치 한 단계 위를 쓴다 — 이 컨테이너는 e2e 실행 전용이라
# 다른 패키지의 Node 버전 계약과 무관하다.
ARG NODE_VERSION=22.13.0
ARG PNPM_VERSION=11.21.0

RUN set -eux; \
    # 20200712T145349Z(83.0.4103.116-3)를 쓴다 — 같은 버전의 더 이른 리비전
    # (-1, 20200623T204338Z)은 그 스냅샷 시점 아카이브가 전이 중이었는지
    # libavformat58 의존성이 깨져 apt install이 실패한다(01-계획.md D11).
    echo "deb [check-valid-until=no trusted=yes] http://snapshot.debian.org/archive/debian/20200712T145349Z unstable main" > /etc/apt/sources.list; \
    printf 'Acquire::Check-Valid-Until "false";\nAcquire::Retries "5";\n' > /etc/apt/apt.conf.d/99snapshot; \
    apt-get update; \
    # dbus-x11을 먼저 설치해 apt 리졸버가 default-dbus-session-bus 가상
    # 패키지의 provider를 systemd 체인(이 스냅샷엔 없음)이 아니라
    # dbus-x11로 먼저 고정하게 한다 — 순서를 바꾸면 libgtk-3-0이
    # "not going to be installed"로 걸려 chromium 설치가 막힌다.
    apt-get install -y --no-install-recommends dbus-x11; \
    apt-get install -y --no-install-recommends chromium=83.0.4103.116-3; \
    apt-get install -y --no-install-recommends curl ca-certificates xz-utils; \
    curl -fsSL -o /tmp/node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"; \
    mkdir -p /usr/local/lib/nodejs; \
    tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs; \
    rm /tmp/node.tar.xz; \
    export PATH="/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64/bin:${PATH}"; \
    # corepack activate는 pnpm@11.21.0의 서명 키가 이 Node 버전에 번들된
    # corepack의 키 목록에 없어 "Cannot find matching keyid"로 실패한다
    # (corepack 자체 버그·키 로테이션) — npm 전역 설치로 우회한다.
    npm install -g "pnpm@${PNPM_VERSION}"; \
    rm -rf /var/lib/apt/lists/*

ENV PATH="/usr/local/lib/nodejs/node-v${NODE_VERSION}-linux-x64/bin:${PATH}"
WORKDIR /repo
