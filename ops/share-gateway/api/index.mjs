const ORIGIN = 'https://playne.ru';
const SHARE_ORIGIN = 'https://playne-share.vercel.app';

// Only existing public challenge pages, their PNGs and the public analytics script.
// Never forward credentials, cookies, arbitrary destinations or user query strings.
export function upstreamPath(path) {
  if (/^\/c\/[A-Za-z0-9_-]{16}$/.test(path)) return path;
  if (/^\/challenge\/[A-Za-z0-9_-]{43}$/.test(path)) return path;
  if (/^\/api\/challenges\/[A-Za-z0-9_-]{43}\/image\.png$/.test(path)) return path;
  if (path === '/api/challenges/analytics.js') return path;
  return null;
}

export function gatewayHtml(html, shareOrigin = SHARE_ORIGIN) {
  return html
    .replace(/(property="og:url" content=")https:\/\/(?:playne\.ru|go\.playne\.ru)/g, `$1${shareOrigin}`)
    .replace(/((?:property="og:image"|name="twitter:image") content=")https:\/\/playne\.ru/g, `$1${shareOrigin}`)
    .replace(/href="\//g, `href="${ORIGIN}/`)
    .replace('<script src="/api/challenges/analytics.js" defer>', '<script src="/api/continue.js" defer>');
}

export async function handle(request, response, fetcher = fetch) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    response.statusCode = 405;
    return response.end();
  }
  const requestedPath = request.url.startsWith('/') && !request.url.startsWith('//')
    ? new URL(request.url, SHARE_ORIGIN).pathname : null;
  if (requestedPath === '/api/continue.js') {
    response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    response.statusCode = 200;
    // Browsers continue on the main site, preserving login and existing analytics.
    // Social crawlers read the HTML/PNG without executing JavaScript.
    return response.end(request.method === 'HEAD' ? undefined : `if (/^\\/(?:c\\/[A-Za-z0-9_-]{16}|challenge\\/[A-Za-z0-9_-]{43})$/.test(location.pathname)) location.replace('https://playne.ru' + location.pathname);`);
  }
  const path = requestedPath && upstreamPath(requestedPath);
  if (!path) {
    response.statusCode = 404;
    return response.end('Not found');
  }
  try {
    const upstream = await fetcher(ORIGIN + path, {
      redirect: 'error', signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'Playne-Share-Gateway/1.0' },
    });
    // Do not cache revoked/missing challenges or upstream failures.
    if (!upstream.ok) {
      response.statusCode = upstream.status === 404 ? 404 : 503;
      return response.end('Challenge unavailable');
    }
    const type = path.endsWith('.png') ? 'image/png' : path.endsWith('.js') ? 'application/javascript' : 'text/html';
    if (!(upstream.headers.get('content-type') || '').startsWith(type)) throw new Error('Unexpected content');
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.length > 1024 * 1024) throw new Error('Response too large');
    if (type === 'image/png' && bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG');
    const shareOrigin = request.headers?.host === 'go.playne.ru' ? 'https://go.playne.ru' : SHARE_ORIGIN;
    const body = type === 'text/html' ? Buffer.from(gatewayHtml(bytes.toString('utf8'), shareOrigin)) : bytes;
    response.setHeader('Content-Type', type === 'image/png' ? type : `${type}; charset=utf-8`);
    const csp = upstream.headers.get('content-security-policy');
    if (csp) response.setHeader('Content-Security-Policy', csp);
    response.setHeader('Content-Length', body.length);
    response.statusCode = 200;
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.statusCode = 503;
    response.end('Challenge unavailable');
  }
}

export default handle;
