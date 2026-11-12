// Runs inside WeBenefit. Fills a tax invoice-receipt from the job sent by the business app.
// SAFETY: it never presses "שמור" on the invoice itself — only on the product-line and payment sub-screens.
(async () => {
  const D = document, sleep = ms => new Promise(r => setTimeout(r, ms));
  // only the inner app frame has the navigator
  for (let i = 0; i < 60 && !D.querySelector('#navigatorMetro'); i++) await sleep(250);
  const N = D.querySelector('#navigatorMetro');
  if (!N) return;

  const get = k => new Promise(r => chrome.storage.local.get(k, x => r(x[k])));
  const set = o => new Promise(r => chrome.storage.local.set(o, r));
  let job = await get('job');
  if (!job || job.started || Date.now() - job.ts > 10 * 60 * 1000) return;
  job.started = Date.now(); await set({ job });

  // ---------- banner ----------
  const bar = D.createElement('div');
  bar.style.cssText = 'position:fixed;z-index:2147483647;left:50%;bottom:16px;transform:translateX(-50%);max-width:92vw;background:#16231c;color:#fff;font:600 14px/1.5 Assistant,Arial,sans-serif;padding:12px 18px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.35);direction:rtl;text-align:right';
  D.body.appendChild(bar);
  const say = (t, warn) => { bar.innerHTML = t; bar.style.background = warn ? '#8a5a12' : '#16231c'; };
  const ils = n => '₪' + (+n).toLocaleString('he-IL');
  say(`ממלא חשבונית: <b>${job.name}</b> · ${ils(job.amount)}…`);

  // ---------- helpers ----------
  const pages = () => [...N.children].filter(c => c.tagName === 'ONS-PAGE');
  const top = () => pages().pop();
  const vis = e => e && e.getClientRects().length;
  const leaf = t => [...top().querySelectorAll('*')].filter(e => vis(e) && e.children.length === 0 && e.textContent.trim() === t);
  async function wait(fn, ms = 12000) {
    const t = Date.now();
    while (Date.now() - t < ms) { let r; try { r = fn(); } catch (e) {} if (r && (!Array.isArray(r) || r.length)) return Array.isArray(r) ? r[0] : r; await sleep(150); }
    throw new Error('timeout');
  }
  const click = e => (e.closest('ons-list-item,ons-button,ons-toolbar-button,button,[ng-click]') || e).click();
  const setVal = (i, v) => { i.focus(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); i.blur(); };
  const sig = () => pages().length + '|' + (top().querySelector('ons-toolbar')?.innerText || '').trim();
  const go = async t => { const s = sig(); click(await wait(() => leaf(t))); await wait(() => sig() !== s); await sleep(500); };
  const onInvoiceMain = () => !!leaf('בחר אמצעי תשלום').length || !!leaf('הוסף מוצר לחיוב').length;
  const subSave = async () => {
    if (onInvoiceMain()) throw new Error('safety: not on a sub-screen');
    const b = [...top().querySelectorAll('ons-toolbar-button')].filter(e => vis(e) && e.textContent.trim() === 'שמור').pop();
    if (!b) throw new Error('no save on sub-screen');
    const s = sig(); b.click(); await wait(() => sig() !== s); await sleep(600);
    if (!onInvoiceMain()) throw new Error('did not return to invoice');
  };
  const norm = s => (s || '').replace(/[׳'"`]/g, '').replace(/\s+/g, ' ').trim();

  // page-world helper (AngularJS) for the payment date
  const pg = D.createElement('script'); pg.src = chrome.runtime.getURL('page.js'); D.documentElement.appendChild(pg);

  try {
    // 1. open a new tax invoice-receipt
    for (let k = 0; k < 6 && !leaf('הפקת חשבונית מס קבלה').length; k++) {
      if (leaf('הכנסות').length && leaf('הוצאות').length && leaf('שעון נוכחות').length) { await go('הכנסות'); continue; }
      const s = sig();
      const plus = [...top().querySelectorAll('.ion-plus-circled')].find(vis) || D.querySelector('#toolBarHome .ion-plus-circled');
      click(plus); await wait(() => sig() !== s); await sleep(500);
    }
    await go('הפקת חשבונית מס קבלה');
    await wait(() => leaf('בחר לקוח'));

    // 2. customer
    say(`בוחר לקוח: <b>${job.wbName || job.name}</b>`);
    await go('בחר לקוח');
    setVal(await wait(() => [...top().querySelectorAll('input')].filter(vis)), job.wbName || job.name);
    await sleep(1000);
    const items = [...top().querySelectorAll('ons-list-item')].filter(vis);
    const want = norm(job.wbName || job.name);
    let pick = items.filter(li => norm(li.innerText.split('\n')[0]) === want);
    if (pick.length !== 1) pick = items.length === 1 ? items : [];
    let chosen = pick.length ? norm(pick[0].innerText.split('\n')[0]) : null;
    if (pick.length) { click(pick[0]); }
    else {
      say(`לא מצאתי לקוח אחד בשם <b>${job.name}</b> — חפש ובחר אותו מהרשימה, ואני ממשיך.`, true);
      const listPage = top();
      listPage.addEventListener('click', e => { const li = e.target.closest('ons-list-item'); if (li) chosen = norm(li.innerText.split('\n')[0]); }, true);
    }
    await wait(() => leaf('הוסף מוצר לחיוב'), 10 * 60 * 1000);
    await sleep(500);

    // 3. product line, price including VAT
    say(`מוסיף שורה: ${ils(job.amount)} כולל מע״מ`);
    await go('הוסף מוצר לחיוב');
    await go(job.product || 'אימון כושר אישי');
    await wait(() => leaf('כמות'));
    const vat = [...top().querySelectorAll('*')].find(e => vis(e) && e.children.length === 0 && /לפני מע/.test(e.textContent));
    if (vat) {
      click(vat);
      const inc = await wait(() => [...D.querySelectorAll('ons-dialog *,ons-alert-dialog *,.dialog *')].find(e => vis(e) && e.children.length === 0 && /המחיר כולל מע/.test(e.textContent)), 5000);
      click(inc); await sleep(500);
    }
    const price = [...top().querySelectorAll('input')].filter(i => vis(i) && i.type !== 'search' && !isNaN(parseFloat(i.value)))[0];
    setVal(price, String(job.amount)); await sleep(400);
    await subSave();

    // 4. payment method + date
    const M = { transfer: 'העברה בנקאית', cash: 'מזומן', bit: 'אפליקציה Bit', paybox: 'אפליקציה PayBox', check: 'שיק' };
    say(`אמצעי תשלום: ${M[job.method] || M.transfer}`);
    await go('בחר אמצעי תשלום');
    await go(M[job.method] || M.transfer);
    await wait(() => top().querySelector('input[ng-model="payment.scTotal"]'));
    let dateOk = 'fail';
    if (job.date) {
      dateOk = await new Promise(r => {
        const h = e => { D.removeEventListener('tb-set-paydate-done', h); r(e.detail); };
        D.addEventListener('tb-set-paydate-done', h);
        D.dispatchEvent(new CustomEvent('tb-set-paydate', { detail: job.date }));
        setTimeout(() => r('fail'), 2000);
      });
    }
    await sleep(400);
    await subSave();

    // 5. ready — the user presses "שמור"
    const [y, m, d] = (job.date || '').split('-');
    say(`✓ החשבונית מוכנה: <b>${job.name}</b> · ${ils(job.amount)}<br>בדוק ולחץ <b>שמור</b> למעלה כדי להפיק.` +
      (dateOk === 'ok' || !job.date ? '' : `<br>⚠️ תאריך התשלום לא עודכן — אם צריך, שנה ידנית ל-${+d}/${+m}/${y}`));

    // 6. after the user issues: read the document number and send it back to the app
    const num = await wait(() => {
      if (onInvoiceMain()) return null;
      const t = top().innerText;
      if (!/הדפס/.test(t) || !/מייל/.test(t)) return null;
      const mm = t.match(/#\s*(\d{3,7})/);
      return mm && mm[1];
    }, 60 * 60 * 1000);
    const results = (await get('results')) || [];
    results.push({ pid: job.pid, number: num, date: new Date().toISOString().slice(0, 10), wbName: chosen });
    await set({ results, job: null });
    say(`✓ הופקה חשבונית <b>${num}</b> — נרשמה באפליקציה`);
    setTimeout(() => bar.remove(), 15000);
  } catch (err) {
    await set({ job: null });
    say(`עצרתי באמצע (${err.message}). שום דבר לא הופק — אפשר להשלים ידנית או לצאת בלי לשמור.`, true);
  }
})();
