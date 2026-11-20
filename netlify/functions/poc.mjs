import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const publicRoot = join(process.cwd(), 'public');
const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
const namedPatterns = {
  '/poc-assets/ga-normal.js': 'script-normal', '/poc-assets/ga-async.js': 'script-async',
  '/poc-assets/ga-defer.js': 'script-defer', '/poc-assets/droppingcookie.js': 'dropping-cookie',
  '/poc-assets/gtm-child.js': 'gtm-child', '/poc-assets/meta-child.js': 'meta-child',
  '/poc-assets/image-pixel.gif': 'image-html', '/poc-assets/tracker-iframe.html': 'iframe-html',
  '/poc-assets/preload-target.js': 'preload', '/poc-assets/prefetch-target.js': 'prefetch',
  '/poc-assets/dynamic-tracker.js': 'dynamic-script', '/poc-assets/dynamic-pixel.gif': 'dynamic-image'
};
const headers = { 'cache-control': 'no-store' };

function clean(value, fallback) {
  const result = String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, '');
  return result || fallback;
}

function pageSettings(pathname, searchParams) {
  if (pathname === '/') return { mode: 'baseline', delay: 0 };
  if (pathname === '/blocked') return { mode: 'blocked', delay: 0 };
  if (pathname === '/blocked-delayed') return { mode: 'blocked', delay: 800 };
  if (pathname === '/autoblocker-poc.html') return {
    mode: searchParams.get('mode') === 'blocked' ? 'blocked' : 'baseline',
    delay: Math.max(0, Math.min(5_000, Number(searchParams.get('delay')) || 0))
  };
  return null;
}

function response(status, body = '', contentType = 'text/plain; charset=utf-8') {
  return new Response(body, { status, headers: { ...headers, 'content-type': contentType } });
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

export const config = {
  path: ['/', '/blocked', '/blocked-delayed', '/autoblocker-poc.html', '/autoblocker-poc.js', '/poc-api/:route', '/poc-assets/:route']
};

export default async (request) => {
  const url = new URL(request.url);
  const page = pageSettings(url.pathname, url.searchParams);
  const run = clean(url.searchParams.get('run'), `run-${Date.now()}`);
  const pattern = clean(url.searchParams.get('pattern') || namedPatterns[url.pathname], 'unknown');
  if (page) {
    const template = await readFile(join(publicRoot, 'autoblocker-poc.html'), 'utf8');
    const blocker = page.mode === 'blocked' ? `<script src="/autoblocker-poc.js?delay=${page.delay}"></script>` : '';
    return response(200, template
      .replace('<!-- POC_BLOCKER -->', blocker)
      .replaceAll('__POC_RUN__', run)
      .replaceAll('__POC_MODE__', page.mode)
      .replaceAll('__POC_DELAY__', String(page.delay)), 'text/html; charset=utf-8');
  }
  if (url.pathname === '/autoblocker-poc.js') {
    const source = await readFile(join(publicRoot, 'autoblocker-poc.js'), 'utf8');
    const delay = Math.max(0, Math.min(5_000, Number(url.searchParams.get('delay')) || 0));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    return response(200, source, 'application/javascript; charset=utf-8');
  }
  if (url.pathname.startsWith('/poc-api/')) return new Response(null, { status: 204, headers });
  if (url.pathname.startsWith('/poc-assets/') && url.pathname.endsWith('.gif')) return new Response(pixel, { status: 200, headers: { ...headers, 'content-type': 'image/gif' } });
  if (url.pathname === '/poc-assets/tracker-iframe.html') return response(200, '<!doctype html><title>Controlled tracker frame</title>', 'text/html; charset=utf-8');
  if (url.pathname === '/poc-assets/preload-target.js' || url.pathname === '/poc-assets/prefetch-target.js') return response(200, '/* controlled resource hint */', 'application/javascript; charset=utf-8');
  if (namedPatterns[url.pathname] && url.pathname.endsWith('.js')) return response(200, trackerScript(run, pattern), 'application/javascript; charset=utf-8');
  return response(404, 'Not found');
};
