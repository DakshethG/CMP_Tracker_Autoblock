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

Open one mode at a time. Each page load receives a fresh run identifier
automatically.

```text
http://127.0.0.1:56813/
http://127.0.0.1:56813/blocked
http://127.0.0.1:56813/blocked-delayed
```

## What each mode means

| Mode | Purpose |
| --- | --- |
| `/` | Baseline: no blocker. Confirms that each applicable test pattern can fire. |
| `/blocked` | Candidate blocker is loaded first with no artificial delay. |
| `/blocked-delayed` | Same candidate blocker, but its response is delayed by 800 ms. |

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

## Live POC and deployment

The POC is deployed on Render. These links let reviewers reproduce the three
test modes in a browser:

```text
https://cmp-tracker-autoblock.onrender.com/
https://cmp-tracker-autoblock.onrender.com/blocked
https://cmp-tracker-autoblock.onrender.com/blocked-delayed
```

To deploy a copy on Render, create a **Web Service** from this repository and
use the following settings:

| Setting | Value |
| --- | --- |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Root Directory | Leave blank |

The Render free tier may spin down after inactivity, so its first request can
take longer to load. The hosted links are reproducibility evidence; browser
Network results, execution markers, and cookie/storage effects remain the
evidence for each blocking result.

Keep the repository under internal review as appropriate.
