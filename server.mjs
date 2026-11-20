import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

const port = Number(process.env.PORT || 56813);
const root = join(process.cwd(), 'public');
const runs = new Map();
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
const namedPatterns = {
  '/poc-assets/ga-normal.js': 'script-normal',
  '/poc-assets/ga-async.js': 'script-async',
  '/poc-assets/ga-defer.js': 'script-defer',
  '/poc-assets/droppingcookie.js': 'dropping-cookie',
  '/poc-assets/gtm-child.js': 'gtm-child',
  '/poc-assets/meta-child.js': 'meta-child',
  '/poc-assets/image-pixel.gif': 'image-html',
  '/poc-assets/tracker-iframe.html': 'iframe-html',
  '/poc-assets/preload-target.js': 'preload',
  '/poc-assets/prefetch-target.js': 'prefetch',
  '/poc-assets/dynamic-tracker.js': 'dynamic-script',
  '/poc-assets/dynamic-pixel.gif': 'dynamic-image'
};

function clean(value, fallback = 'manual') {
  const normalized = String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, '');
  return normalized || fallback;
}

function event(run, type, pattern) {
  const events = runs.get(run) || [];
  events.push({ at: new Date().toISOString(), type, pattern });
  runs.set(run, events);
}

function send(response, status, type, body) {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(body);
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const run = clean(url.searchParams.get('run'));
  const pattern = clean(url.searchParams.get('pattern') || namedPatterns[url.pathname], 'unknown');
  const mode = url.searchParams.get('mode') || 'baseline';
  const delay = Math.max(0, Math.min(5_000, Number(url.searchParams.get('delay') || 0) || 0));

  if (!['baseline', 'blocked'].includes(mode)) {
    send(response, 400, 'text/plain; charset=utf-8', 'mode must be baseline or blocked');
    return;
  }
  if (url.pathname === '/') {
    response.writeHead(302, { location: '/autoblocker-poc.html?mode=baseline&run=baseline-local' });
    response.end();
    return;
  }
  if (url.pathname === '/autoblocker-poc.html') {
    runs.set(run, []);
    event(run, 'page-requested', mode);
    const template = await readFile(join(root, 'autoblocker-poc.html'), 'utf8');
    const blocker = mode === 'blocked'
      ? `<script src="/autoblocker-poc.js?delay=${delay}"></script>`
      : '';
    send(response, 200, 'text/html; charset=utf-8', template
      .replace('<!-- POC_BLOCKER -->', blocker)
      .replaceAll('__POC_RUN__', run)
      .replaceAll('__POC_MODE__', mode));
    return;
  }
  if (url.pathname === '/poc-api/events') {
    send(response, 200, 'application/json; charset=utf-8', JSON.stringify({ events: runs.get(run) || [] }));
    return;
  }
  if (url.pathname.startsWith('/poc-api/')) {
    event(run, 'api-requested', pattern);
    response.writeHead(204, { 'cache-control': 'no-store' });
    response.end();
    return;
  }
  if (url.pathname.startsWith('/poc-assets/') && url.pathname.endsWith('.gif')) {
    event(run, 'pixel-requested', pattern);
    send(response, 200, 'image/gif', gif);
    return;
  }
  if (url.pathname === '/poc-assets/tracker-iframe.html') {
    event(run, 'frame-requested', pattern);
    send(response, 200, 'text/html; charset=utf-8', `<!doctype html><title>Controlled tracker frame</title>`);
    return;
  }
  if (url.pathname === '/poc-assets/preload-target.js' || url.pathname === '/poc-assets/prefetch-target.js') {
    event(run, 'resource-hint-requested', pattern);
    send(response, 200, 'application/javascript; charset=utf-8', '/* controlled resource hint */');
    return;
  }
  if (namedPatterns[url.pathname] && url.pathname.endsWith('.js')) {
    event(run, 'script-requested', pattern);
    const script = pattern === 'dropping-cookie'
      ? `document.cookie = 'poc_tracker_cookie=1; Path=/; SameSite=Lax';\nlocalStorage.setItem('poc_tracker_storage', '1');\nwindow.__poc?.markExecuted('dropping-cookie');\nsetTimeout(() => window.__poc?.markExecuted('dropping-cookie-timer'), 50);\nfetch('/poc-api/dropping-cookie-fetch?run=${run}&pattern=dropping-cookie-fetch').catch(() => {});\nconst pixel = new Image(); pixel.src = '/poc-assets/dropping-cookie-pixel.gif?run=${run}&pattern=dropping-cookie-pixel';\nnavigator.sendBeacon?.('/poc-api/dropping-cookie-beacon?run=${run}&pattern=dropping-cookie-beacon', 'poc');`
      : `window.__poc?.markExecuted(${JSON.stringify(pattern)});`;
    send(response, 200, 'application/javascript; charset=utf-8', script);
    return;
  }
  if (url.pathname === '/poc-api/collect') {
    event(run, 'api-requested', pattern);
    response.writeHead(204, { 'cache-control': 'no-store' });
    response.end();
    return;
  }
  if (url.pathname === '/poc-assets/pixel.gif') {
    event(run, 'pixel-requested', pattern);
    send(response, 200, 'image/gif', gif);
    return;
  }
  if (url.pathname === '/poc-assets/frame.html') {
    event(run, 'frame-requested', pattern);
    send(response, 200, 'text/html; charset=utf-8', `<!doctype html><title>Controlled tracker frame</title><script>parent.postMessage({ type: 'poc-frame-loaded', pattern: ${JSON.stringify(pattern)} }, '*');</script>`);
    return;
  }
  if (url.pathname === '/poc-assets/hint.js') {
    event(run, 'resource-hint-requested', pattern);
    send(response, 200, 'application/javascript; charset=utf-8', '/* controlled resource hint */');
    return;
  }
  if (url.pathname === '/poc-assets/tracker.js') {
    event(run, 'script-requested', pattern);
    const script = pattern === 'dropping-cookie'
      ? `document.cookie = 'poc_tracker_cookie=1; Path=/; SameSite=Lax';\nlocalStorage.setItem('poc_tracker_storage', '1');\nwindow.__poc?.markExecuted('dropping-cookie');\nsetTimeout(() => window.__poc?.markExecuted('dropping-cookie-timer'), 50);\nfetch('/poc-api/collect?run=${run}&pattern=dropping-cookie-fetch').catch(() => {});\nconst pixel = new Image(); pixel.src = '/poc-assets/pixel.gif?run=${run}&pattern=dropping-cookie-pixel';\nnavigator.sendBeacon?.('/poc-api/collect?run=${run}&pattern=dropping-cookie-beacon', 'poc');`
      : `window.__poc?.markExecuted(${JSON.stringify(pattern)});`;
    send(response, 200, 'application/javascript; charset=utf-8', script);
    return;
  }
  if (url.pathname === '/autoblocker-poc.js') {
    const source = await readFile(join(root, 'autoblocker-poc.js'), 'utf8');
    if (delay > 0) setTimeout(() => send(response, 200, 'application/javascript; charset=utf-8', source), delay);
    else send(response, 200, 'application/javascript; charset=utf-8', source);
    return;
  }
  if (url.pathname === '/favicon.ico') {
    response.writeHead(204, { 'cache-control': 'no-store' });
    response.end();
    return;
  }
  send(response, 404, 'text/plain; charset=utf-8', 'Not found');
}).listen(port, '0.0.0.0', () => {
  console.log(`CMP Autoblocker POC: http://127.0.0.1:${port}/autoblocker-poc.html?mode=baseline&run=demo`);
});
