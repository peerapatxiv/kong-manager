# Running locally with the Kong proxy

The hosted site (GitHub Pages) runs in your browser and calls your Kong Admin API from
there. Browsers block that unless Kong sends CORS headers, and Kong's Admin API does not by
default. A desktop app such as Primate never hits this because no browser sits in between.

Running this app on your own machine avoids it: the dev server forwards Kong requests for
you, and CORS does not apply to server-to-server calls.

## Start it

```bash
npm install
npm run dev:proxy
```

Open the address Vite prints (for example `http://localhost:5173/kong-manager/`), then use
**Connect to Kong** as usual. The New Connection panel shows *"Requests go through the local
proxy, so CORS does not apply."* when the proxy is active.

Type the Admin API address exactly as your machine reaches it, for example `HTTP` and
`localhost:8001`, or `HTTPS` and `kong.internal:8444`. A path prefix such as
`gateway.internal/kong-admin` works too. Kong can be remote and plain `http`: the https-only
restriction applies to browsers, not to this proxy.

## How it works

- Only `npm run dev:proxy` turns it on (Vite mode `proxy`, which sets `VITE_KONG_PROXY=true`
  from `.env.proxy`). `npm run dev`, tests and the production build never include it.
- The app calls `/__kong/<admin api path>` on the dev server with an `X-Kong-Target` header
  naming your Kong. The dev server forwards the method, headers (including `Authorization`
  and `Kong-Admin-Token`) and body, and returns Kong's response unchanged.
- If Kong cannot be reached, the proxy answers with its own error and the app says
  "Could not reach … through the local proxy".
- Code: `tools/kongProxy.ts`, wired up in `vite.config.ts`.

## Safety

The proxy forwards to whatever `http` or `https` address it is given. That is fine on your
own machine, where Vite listens on localhost by default. Do **not** run `dev:proxy` with
`--host` or otherwise expose the dev server to other machines, or anyone who can reach it
can use it to call addresses from your network.

## The hosted site

GitHub Pages has no server, so it cannot proxy. To use it against your Kong, Kong itself has
to allow `https://peerapatxiv.github.io`: front the Admin API with a route that has the
`cors` plugin, and use `https` (or `localhost`) for the address.
