import { describe, it, expect, vi } from 'vitest';
import { challengePublicOrigin } from '../server/challenge-links';
// Standalone deployment uses native Node ESM, without application dependencies.
// @ts-expect-error JavaScript deployment entrypoint
import { handle, gatewayHtml } from '../ops/share-gateway/api/index.mjs';

const code = '0iFsCBF9bz3racnJ';
function response() {
  return { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
}
describe('public share gateway', () => {
  it('uses branded preview links in production without sending test links outside their installation', () => {
    expect(challengePublicOrigin('https://playne.ru')).toBe('https://go.playne.ru');
    expect(challengePublicOrigin('https://challenges.test')).toBe('https://challenges.test');
    expect(challengePublicOrigin('http://localhost:3035')).toBe('http://localhost:3035');
  });
  it('serves social images from the gateway and sends players to the original game', () => {
    const html = `<link rel="canonical" href="https://playne.ru/c/${code}"><meta property="og:url" content="https://playne.ru/c/${code}"><meta property="og:image" content="https://playne.ru/api/challenges/token/image.png?v=1"><meta name="twitter:image" content="https://playne.ru/api/challenges/token/image.png?v=1"><a href="/naglaz/?challenge=token">Играть</a>`;
    const result = gatewayHtml(html);
    expect(result).toContain('property="og:url" content="https://playne-results.vercel.app/c/');
    expect(result).toContain('property="og:image" content="https://playne-results.vercel.app/api/');
    expect(result).toContain('name="twitter:image" content="https://playne-results.vercel.app/api/');
    expect(result).toContain('href="https://playne.ru/naglaz/?challenge=token"');
    expect(result).toContain('rel="canonical" href="https://playne.ru/c/');
  });
  it.each(['/api/me', '/api/challenges', '/c/invalid', '//evil.example/c/'+code, '/c/'+code+'/../account'])('rejects nonpublic route %s', async url => {
    const fetcher = vi.fn(), res = response();
    await handle({method:'GET',url},res,fetcher);
    expect(res.statusCode).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not forward credentials or query strings and keeps revocation immediate', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('missing',{status:404}));
    const res = response();
    await handle({method:'GET',url:`/c/${code}?secret=private`,headers:{cookie:'secret'}},res,fetcher);
    expect(fetcher.mock.calls[0][0]).toBe(`https://playne.ru/c/${code}`);
    expect(fetcher.mock.calls[0][1].headers).toEqual({'User-Agent':'Playne-Share-Gateway/1.0'});
    expect(res.statusCode).toBe(404);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
  });
  it('passes valid HTML and fails closed on a substituted image or unavailable origin', async () => {
    const res = response();
    await handle({method:'GET',url:`/c/${code}`},res,async()=>new Response('<title>Вызов</title>',{headers:{'content-type':'text/html'}}));
    expect(res.statusCode).toBe(200);
    expect(res.end.mock.calls[0][0].toString()).toContain('Вызов');
    const image = response();
    await handle({method:'GET',url:`/api/challenges/${'a'.repeat(43)}/image.png`},image,async()=>new Response('not png',{headers:{'content-type':'image/png'}}));
    expect(image.statusCode).toBe(503);
    const failed = response();
    await handle({method:'GET',url:`/c/${code}`},failed,async()=>{throw Error('timeout')});
    expect(failed.statusCode).toBe(503);
  });
  it('renders PNGs locally from small verified metadata instead of transferring the remote image', async () => {
    const token='a'.repeat(43), data={token,score:179,game:'naglaz'};
    const png=Buffer.from('89504e470d0a1a0a','hex');
    const fetcher=vi.fn().mockResolvedValue(Response.json(data));
    const renderer=vi.fn().mockResolvedValue(png), res=response();
    await handle({method:'GET',url:`/api/challenges/${token}/image.png?v=3`},res,fetcher,renderer);
    expect(fetcher.mock.calls[0][0]).toBe(`https://playne.ru/api/challenges/${token}`);
    expect(renderer).toHaveBeenCalledWith(data);
    expect(res.statusCode).toBe(200);
    expect(res.end).toHaveBeenCalledWith(png);
    const revoked=response(), renderRevoked=vi.fn();
    await handle({method:'GET',url:`/api/challenges/${token}/image.png`},revoked,async()=>new Response('',{status:404}),renderRevoked);
    expect(revoked.statusCode).toBe(404);
    expect(renderRevoked).not.toHaveBeenCalled();
  });
  it('uses the branded host only when explicitly allowed, including after the origin returns branded URLs', async () => {
    const html = '<meta property="og:url" content="https://playne-results.vercel.app/c/test"><meta property="og:image" content="https://playne.ru/api/challenges/token/image.png">';
    for (const host of ['go.playne.ru', 'evil.example']) {
      const res=response();
      await handle({method:'GET',url:`/c/${code}`,headers:{host}},res,async()=>new Response(html,{headers:{'content-type':'text/html'}}));
      const body=res.end.mock.calls[0][0].toString();
      expect(body).toContain(`property="og:image" content="https://${host==='go.playne.ru'?'go.playne.ru':'playne-results.vercel.app'}/api/`);
      expect(body).not.toContain('evil.example');
    }
  });
  it('keeps the production share URL, canonical and both image tags on the branded domain', async () => {
    const url = `${challengePublicOrigin('https://playne.ru')}/c/${code}`;
    const html = `<link rel="canonical" href="${url}"><meta property="og:url" content="${url}"><meta property="og:image" content="https://playne.ru/api/challenges/token/image.png?v=3"><meta name="twitter:image" content="https://playne.ru/api/challenges/token/image.png?v=3">`;
    const res=response();
    await handle({method:'GET',url:`/c/${code}`,headers:{host:'go.playne.ru'}},res,async()=>new Response(html,{headers:{'content-type':'text/html'}}));
    const body=res.end.mock.calls[0][0].toString();
    expect(res.statusCode).toBe(200);
    expect(body).toContain(`rel="canonical" href="${url}"`);
    expect(body).toContain(`property="og:url" content="${url}"`);
    expect(body).toContain('property="og:image" content="https://go.playne.ru/api/');
    expect(body).toContain('name="twitter:image" content="https://go.playne.ru/api/');
    expect(body).not.toContain('vercel.app');
  });
  it('continues browsers on the same original challenge without copying cookies or opaque query parameters', async () => {
    expect(gatewayHtml('<script src="/api/challenges/analytics.js" defer>')).toContain('src="/api/continue.js"');
    const res=response(), fetcher=vi.fn();
    await handle({method:'GET',url:'/api/continue.js?path=api%2Fcontinue.js'},res,fetcher);
    expect(res.statusCode).toBe(200);
    const script=res.end.mock.calls[0][0];
    expect(script).toContain("location.replace('https://playne.ru' + location.pathname)");
    expect(script).not.toContain('location.search');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
