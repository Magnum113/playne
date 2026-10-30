import {
  METRIKA_COUNTER_ID,
  SHARE_GOALS,
  ANALYTICS_CAMPAIGN_KEYS,
} from "../src/analytics";

const metrikaOrigins = [
  "ru",
  "az",
  "by",
  "co.il",
  "com",
  "com.am",
  "com.ge",
  "com.tr",
  "ee",
  "fr",
  "kg",
  "kz",
  "lt",
  "lv",
  "md",
  "tj",
  "tm",
  "uz",
]
  .map((tld) => `https://mc.yandex.${tld}`)
  .join(" ");
// No inline script or broad https: permission; all destinations follow Yandex's CSP guide.
export const challengeAnalyticsCsp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'self' ${metrikaOrigins} https://yastatic.net; connect-src ${metrikaOrigins} https://mc.webvisor.com https://mc.webvisor.org; img-src ${metrikaOrigins} https://mc.webvisor.com https://mc.webvisor.org; base-uri 'none'; form-action 'none'`;

// A browser-only page view: chat scrapers, OG image requests and API reads never convert.
export const challengeAnalyticsScript = `(() => {
  const counter = ${METRIKA_COUNTER_ID};
  const goals = ${JSON.stringify({ landing: SHARE_GOALS.landing, accepted: SHARE_GOALS.accepted })};
  const game = document.body.dataset.game;
  if (!${JSON.stringify(["naglaz", "circle", "colorfle", "geo", "pressure", "line", "flash", "rotate", "slide", "dispatch"])}.includes(game)) return;
  window.ym = window.ym || function(){(window.ym.a = window.ym.a || []).push(Array.from(arguments));};
  window.ym.l = Date.now();
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://mc.yandex.ru/metrika/tag.js?id=' + counter;
  document.head.appendChild(script);
  let referrer = '';
  try { const url = new URL(document.referrer); referrer = url.origin + (/^\\/(c|challenge)\\//.test(url.pathname) ? '/challenge/' : url.pathname); } catch {}
  const campaign = new URLSearchParams();
  const query = new URLSearchParams(location.search);
  for (const key of ${JSON.stringify(ANALYTICS_CAMPAIGN_KEYS)}) { const value=query.get(key); if(value) campaign.set(key,value); }
  const pageUrl = location.origin + '/challenge/' + (campaign.size ? '?' + campaign : '');
  window.ym(counter, 'init', {ssr:true, webvisor:false, clickmap:false, trackLinks:false, accurateTrackBounce:true, url:pageUrl, referrer, title:'Вызов друга · Playne'});
  const params = {game, mode:document.body.dataset.mode};
  let viewed = false;
  const view = () => {
    if (viewed || document.visibilityState !== 'visible') return;
    viewed = true;
    window.ym(counter, 'reachGoal', goals.landing, params);
  };
  view(); document.addEventListener('visibilitychange', view);
  document.querySelector('.cta')?.addEventListener('click', () => {
    window.ym(counter, 'reachGoal', goals.accepted, params);
  });
})();`;
