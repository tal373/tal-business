// Loader: runs in the WeBenefit top page, finds the app frame and hands it the job.
// The filling logic itself is hosted with the app (wbfill.js), so fixes need no reinstall.
(async () => {
  if (window.top !== window) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const frameDoc = () => {
    if (document.querySelector('#navigatorMetro')) return document;
    for (const f of document.querySelectorAll('iframe')) { try { if (f.contentDocument?.querySelector('#navigatorMetro')) return f.contentDocument; } catch (e) {} }
    return null;
  };
  let D = null;
  for (let i = 0; i < 120 && !(D = frameDoc()); i++) await sleep(250);
  if (!D) return;
  const get = k => new Promise(r => chrome.storage.local.get(k, x => r(x[k])));
  const set = o => new Promise(r => chrome.storage.local.set(o, r));
  const job = await get('job');
  if (!job || job.started || Date.now() - job.ts > 10 * 60 * 1000) return;
  job.started = Date.now(); await set({ job });
  D.addEventListener('tb-result', async e => {
    const r = JSON.parse(e.detail), results = (await get('results')) || [];
    results.push(r); await set({ results, job: null });
  });
  D.addEventListener('tb-clear', () => set({ job: null }));
  await sleep(1500);
  D.documentElement.dataset.tbJob = JSON.stringify(job);
  const s = document.createElement('script');
  s.src = 'https://tal373.github.io/tal-business/wbfill.js?t=' + Date.now();
  document.documentElement.appendChild(s); // must be the loader's own page, or Chrome won't run it
})();
