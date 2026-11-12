// Runs the filler in the WeBenefit page itself (main world), the reliable Chrome way.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg && msg.type === 'tb-run' && sender.tab) {
    chrome.scripting.executeScript({ target: { tabId: sender.tab.id, frameIds: [0] }, world: 'MAIN', files: ['wbfill.js'] });
  }
});
