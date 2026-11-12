// Loader: runs in the WeBenefit app frame, hands the job to the filler (hosted with the app, so fixes need no reinstall).
(async () => {
  const D = document, sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 80 && !D.querySelector('#navigatorMetro'); i++) await sleep(250);
  if (!D.querySelector('#navigatorMetro')) return;
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
  const j = D.createElement('script');
  j.textContent = 'window.__TB_JOB=' + JSON.stringify(job) + ';';
  D.documentElement.appendChild(j);
  await sleep(1500);
  const s = D.createElement('script');
  s.src = 'https://tal373.github.io/tal-business/wbfill.js?t=' + Date.now();
  D.documentElement.appendChild(s);
})();
