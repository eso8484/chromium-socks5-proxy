# Chromium in Docker with an Authenticated SOCKS5 Proxy

A working setup for running [linuxserver/chromium](https://docs.linuxserver.io/images/docker-chromium/)
in Docker and routing all its traffic through a **username/password SOCKS5 proxy**.

## The Problem

If you point Chromium at an authenticated SOCKS5 proxy directly:

```yaml
- CHROME_CLI=--proxy-server=socks5://user:pass@1.2.3.4:1080
```

…it fails with errors like:

- `ERR_SOCKS_CONNECTION_FAILED`
- `Browser does not support socks5 proxy authentication`
- "This site can't be reached" / "No supported proxy"

**Why:** Chromium (and Chrome) has a hard limitation — it does **not** support
SOCKS5 proxy *authentication*. Credentials in the URL are silently ignored, and
the SOCKS5 handshake is rejected by the proxy because no auth was sent. The proxy
works fine with `curl` (which *does* support SOCKS5 auth), which is why it's so
confusing — the proxy isn't broken, the browser just can't authenticate to it.

## The Solution

Run a tiny **proxy bridge** ([`gost`](https://github.com/ginuerzh/gost)) as a sidecar
container. It listens locally with **no authentication** and forwards everything
upstream to your authenticated SOCKS5 proxy:

```
Chromium ──(no auth)──> gost bridge ──(handles auth)──> upstream SOCKS5 proxy
   socks5://proxy-bridge:1080            socks5://user:pass@host:port
```

Chromium only ever talks to the unauthenticated local bridge, so it's happy.
`gost` does the authentication on its behalf.

## Usage

1. Copy the example and fill in your real values:

   ```bash
   cp docker-compose.example.yaml docker-compose.yaml
   ```

   Edit `docker-compose.yaml` and set:
   - `PROXY_USER`, `PROXY_PASS`, `PROXY_HOST`, `PROXY_PORT` in the `gost` command
   - `CUSTOM_USER` and `PASSWORD` (the login for the Chromium web UI)

2. Start it:

   ```bash
   docker compose up -d
   ```

3. Open the browser UI at `http://YOUR_SERVER_IP:3010` (HTTP) or
   `https://YOUR_SERVER_IP:3011` (HTTPS) and log in.

## Verifying it works

Check your exit IP from *inside* the Chromium container — it should be the
**proxy's** IP, not your server's:

```bash
docker exec chromium curl --socks5-hostname proxy-bridge:1080 \
  --max-time 15 http://httpbin.org/ip
```

Expected output (the proxy's IP):

```json
{ "origin": "<your-proxy-ip>" }
```

Or just visit `https://httpbin.org/ip` inside the browser itself.

## How to diagnose this yourself

A quick way to prove whether the problem is the proxy or the browser:

1. **Test the proxy with `curl`** (curl supports SOCKS5 auth):

   ```bash
   curl --socks5-hostname USER:PASS@HOST:PORT --max-time 10 http://httpbin.org/ip
   ```

   - Works → the proxy is fine, the browser is the problem (this guide applies).
   - "connection to proxy closed" with no creds but works *with* creds → auth is required.

2. **Confirm the browser limitation with Playwright** (optional). The included
   [`proxy-test.js`](./proxy-test.js) launches headless Chromium with the proxy three
   ways. The telling result is:

   ```
   browserType.launch: Browser does not support socks5 proxy authentication
   ```

   That message is Chromium itself refusing SOCKS5 auth — confirming you need the bridge.

## Files

| File | Purpose |
|------|---------|
| `docker-compose.example.yaml` | The compose stack with placeholders — copy to `docker-compose.yaml` |
| `proxy-test.js` | Standalone Playwright script to reproduce/diagnose the issue |
| `.gitignore` | Keeps your real `docker-compose.yaml` (with secrets) out of git |

## Notes

- **`socks5` vs `socks5h`:** `socks5h` makes the proxy do DNS resolution (avoids DNS
  leaks). With the bridge, configure DNS behavior on the `gost -F` upstream side.
- **Security:** Never commit your real `docker-compose.yaml` — it holds your proxy
  password and the browser UI password. The `.gitignore` here prevents that.
- **Alternatives to `gost`:** `redsocks`, `3proxy`, `dante`, or `microsocks` can play
  the same bridge role. `gost` is used here because it's a single binary configured
  entirely from one command-line flag.
