import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

const port = Number(process.env.PORT || 56813);
const publicRoot = join(process.cwd(), 'public');
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

function clean(value, fallback) {
  const result = String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, '');
  return result || fallback;
}

function routeSettings(pathname, searchParams) {
  if (pathname === '/') return { mode: 'baseline', delay: 0 };
  if (pathname === '/blocked') return { mode: 'blocked', delay: 0 };
  if (pathname === '/blocked-delayed') return { mode: 'blocked', delay: 800 };
  if (pathname === '/autoblocker-poc.html') {
    return {
      mode: searchParams.get('mode') === 'blocked' ? 'blocked' : 'baseline',
      delay: Math.max(0, Math.min(5_000, Number(searchParams.get('delay')) || 0))
    };
  }
  return null;
}

function send(response, status, type, body) {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(body);
}

function trackerScript(run, pattern) {
  if (pattern !== 'dropping-cookie') return `window.__poc?.markExecuted(${JSON.stringify(pattern)});`;
  return `document.cookie = 'poc_tracker_cookie=1; Path=/; SameSite=Lax';
localStorage.setItem('poc_tracker_storage', '1');
window.__poc?.markExecuted('dropping-cookie');
setTimeout(() => window.__poc?.markExecuted('dropping-cookie-timer'), 50);
fetch('/poc-api/dropping-cookie-fetch?run=${run}&pattern=dropping-cookie-fetch').catch(() => {});
const pixel = new Image(); pixel.src = '/poc-assets/dropping-cookie-pixel.gif?run=${run}&pattern=dropping-cookie-pixel';
navigator.sendBeacon?.('/poc-api/dropping-cookie-beacon?run=${run}&pattern=dropping-cookie-beacon', 'poc');`;
}

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const page = routeSettings(url.pathname, url.searchParams);
  const run = clean(url.searchParams.get('run'), `run-${Date.now()}`);
  const pattern = clean(url.searchParams.get('pattern') || namedPatterns[url.pathname], 'unknown');

  if (page) {
    const template = await readFile(join(publicRoot, 'autoblocker-poc.html'), 'utf8');
    const blocker = page.mode === 'blocked' ? `<script src="/autoblocker-poc.js?delay=${page.delay}"></script>` : '';
    send(response, 200, 'text/html; charset=utf-8', template
      .replace('<!-- POC_BLOCKER -->', blocker)
      .replaceAll('__POC_RUN__', run)
      .replaceAll('__POC_MODE__', page.mode)
      .replaceAll('__POC_DELAY__', String(page.delay)));
    return;
  }
  if (url.pathname === '/autoblocker-poc.js') {
    const source = await readFile(join(publicRoot, 'autoblocker-poc.js'), 'utf8');
    const delay = Math.max(0, Math.min(5_000, Number(url.searchParams.get('delay')) || 0));
    if (delay) setTimeout(() => send(response, 200, 'application/javascript; charset=utf-8', source), delay);
    else send(response, 200, 'application/javascript; charset=utf-8', source);
    return;
  }
  if (url.pathname.startsWith('/poc-api/')) {
    response.writeHead(204, { 'cache-control': 'no-store' });
    response.end();
    return;
  }
  if (url.pathname.startsWith('/poc-assets/') && url.pathname.endsWith('.gif')) {
    send(response, 200, 'image/gif', gif);
    return;
  }
  if (url.pathname === '/poc-assets/tracker-iframe.html') {
    send(response, 200, 'text/html; charset=utf-8', '<!doctype html><title>Controlled tracker frame</title>');
    return;
  }
  if (url.pathname === '/poc-assets/preload-target.js' || url.pathname === '/poc-assets/prefetch-target.js') {
    send(response, 200, 'application/javascript; charset=utf-8', '/* controlled resource hint */');
    return;
  }
  if (namedPatterns[url.pathname] && url.pathname.endsWith('.js')) {
    send(response, 200, 'application/javascript; charset=utf-8', trackerScript(run, pattern));
    return;
  }
  if (url.pathname === '/favicon.ico') {
    response.writeHead(204, { 'cache-control': 'no-store' });
    response.end();
    return;
  }
  send(response, 404, 'text/plain; charset=utf-8', 'Not found');
}).listen(port, '0.0.0.0', () => console.log(`CMP Autoblocker POC: http://127.0.0.1:${port}/`));
