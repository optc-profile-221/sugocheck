const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  }
});

const allowedPages = new Set(['sugo', 'festival-rare']);

const adminHtml = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sugocheck 방문 통계</title><style>
body{margin:0;padding:24px;background:#17100b;color:#eee7dc;font:14px system-ui,sans-serif}main{max-width:960px;margin:auto}form,.card{padding:16px;border:1px solid #80683a;border-radius:10px;background:#2b1c12;margin-bottom:16px}input,button{padding:10px;border:1px solid #80683a;border-radius:6px;background:#17100b;color:#eee7dc}button{cursor:pointer;background:#77300f}table{width:100%;border-collapse:collapse}.scroll{overflow:auto}th,td{padding:8px;border-bottom:1px solid #49331e;text-align:left}strong{font-size:24px}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:12px}.error{color:#ff9b8f}@media(max-width:600px){.metrics{grid-template-columns:1fr}}
</style></head><body><main><h1>Sugocheck 방문 통계</h1>
<form id="login"><input id="token" type="password" placeholder="관리자 토큰" required autocomplete="current-password"><input id="days" type="number" value="30" min="1" max="3650"><button>조회</button></form>
<p id="message"></p><section id="result" hidden><div class="metrics"><div class="card">누적 페이지뷰<br><strong id="views"></strong></div><div class="card">누적 순방문자<br><strong id="visitors"></strong></div></div>
<div class="card scroll"><h2>국가·지역</h2><table><thead><tr><th>국가</th><th>지역</th><th>방문자</th><th>페이지뷰</th></tr></thead><tbody id="geo"></tbody></table></div>
<div class="card scroll"><h2>일별</h2><table><thead><tr><th>날짜</th><th>페이지</th><th>방문자</th><th>페이지뷰</th></tr></thead><tbody id="daily"></tbody></table></div></section>
<script>
const makeCell=(row,value)=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell)};
document.querySelector('#login').addEventListener('submit',async(event)=>{event.preventDefault();const message=document.querySelector('#message');message.textContent='불러오는 중...';message.className='';try{const response=await fetch('/stats?days='+encodeURIComponent(document.querySelector('#days').value),{headers:{Authorization:'Bearer '+document.querySelector('#token').value}});if(!response.ok)throw new Error(response.status===401?'관리자 토큰이 올바르지 않습니다.':'통계를 불러오지 못했습니다.');const data=await response.json();document.querySelector('#views').textContent=data.totals.pageviews;document.querySelector('#visitors').textContent=data.totals.unique_visitors;for(const [id,items,fields] of [['geo',data.geo,['country','region','unique_visitors','pageviews']],['daily',data.daily,['date','page','unique_visitors','pageviews']]]){const body=document.querySelector('#'+id);body.replaceChildren();for(const item of items){const row=document.createElement('tr');for(const field of fields)makeCell(row,item[field]);body.append(row)}}document.querySelector('#result').hidden=false;message.textContent='한국 시간 기준 최근 '+data.days+'일';}catch(error){message.textContent=error.message;message.className='error';document.querySelector('#result').hidden=true}});
</script></main></body></html>`;

function corsHeaders(origin, allowedOrigin) {
  return origin === allowedOrigin
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}

function koreaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function visitorHash(visitorId, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(visitorId));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function collect(request, env) {
  const origin = request.headers.get('Origin') || '';
  const headers = corsHeaders(origin, env.ALLOWED_ORIGIN);
  if (origin !== env.ALLOWED_ORIGIN) return json({ error: 'origin_not_allowed' }, 403, headers);
  if ((Number(request.headers.get('Content-Length')) || 0) > 256) return json({ error: 'payload_too_large' }, 413, headers);

  const userAgent = request.headers.get('User-Agent') || '';
  if (!userAgent || /bot|crawler|spider|preview|facebookexternalhit|discordbot/i.test(userAgent)) {
    return json({ counted: false }, 202, headers);
  }

  let body;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 256) return json({ error: 'payload_too_large' }, 413, headers);
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'invalid_json' }, 400, headers);
  }
  if (!allowedPages.has(body.page)) return json({ error: 'invalid_page' }, 400, headers);
  if (typeof body.visitorId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.visitorId)) {
    return json({ error: 'invalid_visitor' }, 400, headers);
  }

  const day = koreaDate();
  const hash = await visitorHash(body.visitorId, env.VISITOR_HASH_SECRET);
  const country = String(request.cf?.country || 'XX').slice(0, 2);
  const region = String(request.cf?.region || 'Unknown').slice(0, 80);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO daily_stats (date, page, pageviews) VALUES (?, ?, 1)
      ON CONFLICT(date, page) DO UPDATE SET pageviews = pageviews + 1
    `).bind(day, body.page),
    env.DB.prepare(`
      INSERT OR IGNORE INTO daily_visitors (date, page, visitor_hash) VALUES (?, ?, ?)
    `).bind(day, body.page, hash),
    env.DB.prepare(`
      INSERT OR IGNORE INTO visitors (visitor_hash, first_seen) VALUES (?, ?)
    `).bind(hash, day),
    env.DB.prepare(`
      INSERT INTO geo_daily_stats (date, country, region, pageviews) VALUES (?, ?, ?, 1)
      ON CONFLICT(date, country, region) DO UPDATE SET pageviews = pageviews + 1
    `).bind(day, country, region),
    env.DB.prepare(`
      INSERT OR IGNORE INTO geo_daily_visitors (date, country, region, visitor_hash) VALUES (?, ?, ?, ?)
    `).bind(day, country, region, hash)
  ]);
  return json({ counted: true }, 202, headers);
}

async function stats(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  if (authorization !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'unauthorized' }, 401);

  const url = new URL(request.url);
  const days = Math.min(3650, Math.max(1, Number.parseInt(url.searchParams.get('days') || '30', 10) || 30));
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days + 1);
  const startDay = koreaDate(start);

  const [daily, totals, geo] = await Promise.all([
    env.DB.prepare(`
      SELECT s.date, s.page, s.pageviews, COUNT(v.visitor_hash) AS unique_visitors
      FROM daily_stats s
      LEFT JOIN daily_visitors v ON v.date = s.date AND v.page = s.page
      WHERE s.date >= ?
      GROUP BY s.date, s.page, s.pageviews
      ORDER BY s.date DESC, s.page ASC
    `).bind(startDay).all(),
    env.DB.prepare(`
      SELECT
        COALESCE((SELECT SUM(pageviews) FROM daily_stats), 0) AS pageviews,
        COALESCE((SELECT COUNT(*) FROM visitors), 0) AS unique_visitors
    `).first(),
    env.DB.prepare(`
      SELECT g.country, g.region, SUM(g.pageviews) AS pageviews,
        (SELECT COUNT(DISTINCT v.visitor_hash) FROM geo_daily_visitors v
          WHERE v.country = g.country AND v.region = g.region AND v.date >= ?) AS unique_visitors
      FROM geo_daily_stats g
      WHERE g.date >= ?
      GROUP BY g.country, g.region
      ORDER BY unique_visitors DESC, pageviews DESC
    `).bind(startDay, startDay).all()
  ]);
  return json({ timezone: 'Asia/Seoul', days, totals, daily: daily.results, geo: geo.results });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS' && url.pathname === '/collect') {
      const origin = request.headers.get('Origin') || '';
      if (origin !== env.ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin, env.ALLOWED_ORIGIN),
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
    if (request.method === 'POST' && url.pathname === '/collect') return collect(request, env);
    if (request.method === 'GET' && url.pathname === '/stats') return stats(request, env);
    if (request.method === 'GET' && url.pathname === '/admin') {
      return new Response(adminHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    return json({ error: 'not_found' }, 404);
  }
};
