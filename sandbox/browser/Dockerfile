# The link box: a throwaway headless browser that visits one link and records what the page does.
# Started like the file box (read-only root, no capabilities, non-root, limits) but on the private
# lab network, which has no route to the internet. Real links leave only through the gate proxy.
ARG BASE=python:3.12-slim
FROM ${BASE}

# Chromium (headless shell) and Playwright. debs/ and wheels/ are used offline when present.
RUN --mount=type=bind,source=debs,target=/tmp/debs --mount=type=bind,source=wheels,target=/tmp/wheels \
    set -eux; \
    if ls /tmp/debs/*.deb >/dev/null 2>&1; then dpkg -i /tmp/debs/*.deb; \
    else apt-get update && apt-get install -y --no-install-recommends chromium-headless-shell fonts-liberation && rm -rf /var/lib/apt/lists/*; fi; \
    if ls /tmp/wheels/*.whl >/dev/null 2>&1; then pip install --no-cache-dir --no-index /tmp/wheels/*.whl; \
    else pip install --no-cache-dir playwright; fi; \
    test -x /usr/lib/chromium/chromium-headless-shell

RUN useradd --uid 1000 --create-home --home-dir /home/sandbox --shell /bin/sh sandbox
COPY link_harness.py /opt/burnbox/link_harness.py
USER 1000:1000
WORKDIR /work
ENTRYPOINT ["python3", "-I", "/opt/burnbox/link_harness.py"]
