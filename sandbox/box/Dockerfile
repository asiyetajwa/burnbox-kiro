# The detonation box: one throwaway container per run.
# The host starts it with no network, a read-only root, tmpfs scratch space, a non-root user,
# no capabilities and CPU, memory, process and time limits (see server/src/sandbox.ts).
ARG BASE=python:3.12-slim
FROM ${BASE}

# strace records every file, network and process call the sample makes.
# Packages in debs/ are installed offline when present (for build machines without apt access).
RUN --mount=type=bind,source=debs,target=/tmp/debs \
    set -eux; \
    if ls /tmp/debs/*.deb >/dev/null 2>&1; then dpkg -i /tmp/debs/*.deb; \
    else apt-get update && apt-get install -y --no-install-recommends strace && rm -rf /var/lib/apt/lists/*; fi; \
    strace -V | head -1

RUN useradd --uid 1000 --create-home --home-dir /home/sandbox --shell /bin/sh sandbox

# Shared files the sample can see but never change: the box root is read-only.
RUN mkdir -p /srv/shared/Documents && \
    printf 'Q3 budget, draft 2\n' > /srv/shared/Documents/budget-q3.txt && \
    printf 'Board minutes, October\n' > /srv/shared/Documents/minutes-oct.txt

COPY harness.py email_reader.py /opt/burnbox/
COPY hook/sitecustomize.py /opt/burnbox/hook/sitecustomize.py

USER 1000:1000
WORKDIR /work
ENTRYPOINT ["python3", "-I", "/opt/burnbox/harness.py"]
