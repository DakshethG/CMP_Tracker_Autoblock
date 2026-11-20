# CMP Tracker Autoblocker POC

A small, controlled experiment for the question: **what can a client-side CMP
autoblocker stop when tracker URLs are already in the initial HTML?**

It is not production CMP code. It deliberately makes tracker patterns live in
the initial response so browser parser/preload races remain observable.

## Run locally

Requirements: Node.js 18 or later.

```bash
npm start
```

Open one mode at a time. Use a new `run` value on every load.

Opening the base URL (`/`) redirects to the baseline page. The direct URLs are
useful when you want to choose a specific mode deliberately.

```text
http://127.0.0.1:56813/autoblocker-poc.html?mode=baseline&run=baseline-1
http://127.0.0.1:56813/autoblocker-poc.html?mode=blocked&delay=0&run=blocked-0-1
http://127.0.0.1:56813/autoblocker-poc.html?mode=blocked&delay=800&run=blocked-800-1
```

## What each mode means

| Mode | Purpose |
| --- | --- |
| `baseline` | No blocker. Confirms that each applicable test pattern can fire. |
| `blocked&delay=0` | Candidate blocker is loaded first with no artificial delay. |
| `blocked&delay=800` | Same candidate blocker, but its response is delayed by 800 ms. |

## Test patterns

- Normal, `async`, and `defer` scripts
- A controlled `droppingcookie.js`-style script that writes a test cookie and
  localStorage key, starts a timer, and attempts follow-on requests
- GTM-style and Meta-style inline loaders plus child scripts
- Image pixel, iframe, preload, and prefetch
- Dynamic script/image insertion, `fetch`, XHR, and `sendBeacon`

The table shows controlled server requests, JavaScript execution markers, and
the cookie/localStorage outcome. This makes the key distinction visible:

```text
Request observed ≠ script executed
```

## Expected POC conclusion

The candidate can prevent execution and side effects for configured tracker
code, and it can block activity created after it has loaded. It cannot promise
that no request starts for every live URL in initial HTML: browser parsing and
preload behavior can begin those requests before page JavaScript takes control.

For a strict “zero optional requests before consent” promise, make optional
tracker markup inert before it reaches the browser, or rewrite it at the
server/CDN.

## Deploy to Netlify

This repository includes a Netlify Functions adapter. It preserves the dynamic
test behaviour: mode selection, a first-in-head blocker in denied mode, the
intentional 800 ms blocker delay, and controlled tracker endpoints.

1. In Netlify, choose **Add new project → Import an existing project**.
2. Select this GitHub repository.
3. Leave the build command empty. Netlify reads `netlify.toml` automatically.
4. Deploy, then open the same three paths shown above using your Netlify site
   URL instead of `127.0.0.1:56813`.

Example:

```text
https://your-site.netlify.app/autoblocker-poc.html?mode=baseline&run=baseline-1
```

The plain site URL redirects to the baseline mode:

```text
https://your-site.netlify.app/
```

Keep the repository and deployed preview private while the POC is under
internal review.
