import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(process.cwd(), 'public');
const runs = new Map();
const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

const headers = { 'cache-control': 'no-store' };

function clean(value, fallback = 'manual') {
  const cleaned = String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || fallback;
}

function addEvent(run, type, pattern) {
  const events = runs.get(run) || [];
  events.push({ at: new Date().toISOString(), type, pattern });
  runs.set(run, events);
}

function response(status, body = '', contentType = 'text/plain; charset=utf-8') {
  return new Response(body, { status, headers: { ...headers, 'content-type': contentType } });
}

function scriptFor(run, pattern) {
  if (pattern !== 'dropping-cookie') {
    return `window.__poc?.markExecuted(${JSON.stringify(pattern)});`;
  }
  return `document.cookie = 'poc_tracker_cookie=1; Path=/; SameSite=Lax';
localStorage.setItem('poc_tracker_storage', '1');
window.__poc?.markExecuted('dropping-cookie');
setTimeout(() => window.__poc?.markExecuted('dropping-cookie-timer'), 50);
fetch('/poc-api/collect?run=${run}&pattern=dropping-cookie-fetch').catch(() => {});
const pixel = new Image(); pixel.src = '/poc-assets/pixel.gif?run=${run}&pattern=dropping-cookie-pixel';
navigator.sendBeacon?.('/poc-api/collect?run=${run}&pattern=dropping-cookie-beacon', 'poc');`;
}

export const config = {
  path: [
    '/autoblocker-poc.html',
    '/autoblocker-poc.js',
    '/poc-api/:route',
    '/poc-assets/:route'
  ]
};

export default async (request) => {
  const url = new URL(request.url);
  const route = url.pathname === '/autoblocker-poc.html' ? 'page'
    : url.pathname === '/autoblocker-poc.js' ? 'blocker'
      : url.pathname.replace(/^\/poc-(api|assets)\//, '$1/');
  const run = clean(url.searchParams.get('run'));
  const pattern = clean(url.searchParams.get('pattern'), 'unknown');
  const mode = url.searchParams.get('mode') || 'baseline';
  const delay = Math.max(0, Math.min(5_000, Number(url.searchParams.get('delay') || 0) || 0));

  if (route === 'page') {
    if (!['baseline', 'blocked'].includes(mode)) return response(400, 'mode must be baseline or blocked');
    runs.set(run, []);
    addEvent(run, 'page-requested', mode);
    const template = await readFile(join(root, 'autoblocker-poc.html'), 'utf8');
    const blocker = mode === 'blocked' ? `<script src="/autoblocker-poc.js?delay=${delay}"></script>` : '';
    return response(200, template
      .replace('<!-- POC_BLOCKER -->', blocker)
      .replaceAll('__POC_RUN__', run)
      .replaceAll('__POC_MODE__', mode), 'text/html; charset=utf-8');
  }

  if (route === 'blocker') {
    const source = await readFile(join(root, 'autoblocker-poc.js'), 'utf8');
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    return response(200, source, 'application/javascript; charset=utf-8');
  }

  if (route === 'api/events') {
    return response(200, JSON.stringify({ events: runs.get(run) || [] }), 'application/json; charset=utf-8');
  }
  if (route === 'api/collect') {
    addEvent(run, 'api-requested', pattern);
    return new Response(null, { status: 204, headers });
  }
  if (route === 'assets/pixel.gif') {
    addEvent(run, 'pixel-requested', pattern);
    return new Response(pixel, { status: 200, headers: { ...headers, 'content-type': 'image/gif' } });
  }
  if (route === 'assets/frame.html') {
    addEvent(run, 'frame-requested', pattern);
    return response(200, `<!doctype html><title>Controlled tracker frame</title><script>parent.postMessage({ type: 'poc-frame-loaded', pattern: ${JSON.stringify(pattern)} }, '*');</script>`, 'text/html; charset=utf-8');
  }
  if (route === 'assets/hint.js') {
    addEvent(run, 'resource-hint-requested', pattern);
    return response(200, '/* controlled resource hint */', 'application/javascript; charset=utf-8');
  }
  if (route === 'assets/tracker.js') {
    addEvent(run, 'script-requested', pattern);
    return response(200, scriptFor(run, pattern), 'application/javascript; charset=utf-8');
  }

  return response(404, 'Not found');
};
