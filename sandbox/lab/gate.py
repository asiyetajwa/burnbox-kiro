"""Burn Box gate: the only way a link box reaches the internet.

A small forward proxy that sits on both the private lab network and the outside network.
It allows HTTPS tunnels to ports 443 and plain HTTP GET or HEAD to port 80, and refuses any
destination that resolves to a private, loopback, link-local or metadata address, so a link can
never be used to reach the host, the VM's metadata service or anything else on the inside.
Everything that would send data out is already stopped by the browser in the box; the gate is
the second wall.
"""
import asyncio
import ipaddress
import json
import socket
import sys
import time

PORT = 3128
MAX_SECONDS = 45


def log(**kv):
    print(json.dumps({"t": round(time.time(), 3), **kv}), flush=True)


async def resolve_public(host, port):
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        return None, "dns"
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            return None, "private"
    return infos[0][4][0], None


async def pipe(r, w):
    try:
        while data := await r.read(65536):
            w.write(data)
            await w.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        try:
            w.close()
        except Exception:
            pass


async def handle(reader, writer):
    try:
        head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 10)
    except (asyncio.TimeoutError, asyncio.IncompleteReadError, asyncio.LimitOverrunError):
        writer.close()
        return
    line = head.split(b"\r\n", 1)[0].decode("latin-1")
    try:
        method, target, _ = line.split(" ", 2)
    except ValueError:
        writer.close()
        return

    if method == "CONNECT":
        host, _, port = target.rpartition(":")
        port = int(port or 0)
    elif method in ("GET", "HEAD") and target.startswith("http://"):
        hostport = target[7:].split("/", 1)[0]
        host, _, p = hostport.partition(":")
        port = int(p or 80)
    else:
        log(event="refused", method=method, target=target[:200], why="method")
        writer.write(b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n")
        await writer.drain()
        writer.close()
        return

    if port not in (80, 443) or (method == "CONNECT" and port != 443):
        log(event="refused", method=method, host=host, port=port, why="port")
        writer.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
        await writer.drain()
        writer.close()
        return
    ip, why = await resolve_public(host.strip("[]"), port)
    if not ip:
        log(event="refused", method=method, host=host, port=port, why=why)
        writer.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
        await writer.drain()
        writer.close()
        return
    try:
        ur, uw = await asyncio.wait_for(asyncio.open_connection(ip, port), 10)
    except (OSError, asyncio.TimeoutError):
        writer.write(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
        await writer.drain()
        writer.close()
        return
    log(event="allowed", method=method, host=host, ip=ip, port=port)
    if method == "CONNECT":
        writer.write(b"HTTP/1.1 200 Connection Established\r\n\r\n")
        await writer.drain()
    else:
        path = "/" + target[7:].split("/", 1)[1] if "/" in target[7:] else "/"
        rest = head.split(b"\r\n", 1)[1]
        uw.write(f"{method} {path} HTTP/1.1\r\n".encode() + rest)
        await uw.drain()
    try:
        await asyncio.wait_for(asyncio.gather(pipe(reader, uw), pipe(ur, writer)), MAX_SECONDS)
    except asyncio.TimeoutError:
        pass
    for w in (uw, writer):
        try:
            w.close()
        except Exception:
            pass


async def main():
    server = await asyncio.start_server(handle, "0.0.0.0", PORT)
    log(event="listening", port=PORT)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
    sys.exit(0)
