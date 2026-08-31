(() => {
  const endpoint = document.querySelector('meta[name="sugocheck-metrics-endpoint"]')?.content.trim();
  if (!endpoint || navigator.doNotTrack === '1') return;

  const page = document.body.dataset.collection === 'festival-rare' ? 'festival-rare' : 'sugo';
  const storageKey = 'sugocheck-anonymous-visitor';
  let visitorId;
  try {
    visitorId = localStorage.getItem(storageKey);
  } catch {}
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    try {
      localStorage.setItem(storageKey, visitorId);
    } catch {}
  }
  fetch(`${endpoint.replace(/\/$/, '')}/collect`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ page, visitorId })
  }).catch(() => {});
})();
