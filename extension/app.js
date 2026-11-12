// Bridge between the business app page and the extension storage.
document.documentElement.dataset.tbExt = '1';
window.addEventListener('message', e => {
  if (e.source !== window || !e.data) return;
  if (e.data.type === 'TB_ISSUE') chrome.storage.local.set({ job: { ...e.data.job, ts: Date.now() } });
  if (e.data.type === 'TB_ACK') chrome.storage.local.get('results', r => {
    chrome.storage.local.set({ results: (r.results || []).filter(x => x.pid !== e.data.pid) });
  });
});
function deliver() {
  chrome.storage.local.get('results', r => (r.results || []).forEach(x => window.postMessage({ type: 'TB_ISSUED', ...x }, '*')));
}
chrome.storage.onChanged.addListener(c => { if (c.results) deliver(); });
window.addEventListener('load', () => setTimeout(deliver, 1500));
