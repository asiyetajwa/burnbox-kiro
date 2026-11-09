# The lab: demo phishing page and collector, reachable only on the private lab network.
ARG BASE=python:3.12-slim
FROM ${BASE}
COPY lab.py gate.py /opt/burnbox/
USER 1000:1000
# Port 80 inside a container needs no privilege with the default sysctl net.ipv4.ip_unprivileged_port_start=0.
ENTRYPOINT ["python3", "-I", "/opt/burnbox/lab.py"]
