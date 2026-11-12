// Page-world filler loaded by the extension into WeBenefit. Fills a tax invoice-receipt from the job sent by the business app.
// SAFETY: it never presses "שמור" on the invoice itself — only on the product-line and payment sub-screens.
window.__TB_RUN = async () => {
  const D = document, sleep = ms => new Promise(r => setTimeout(r, ms));
  const N = D.querySelector('#navigatorMetro');
  const job = window.__TB_JOB;
  if (!N || !job || window.__TB_RUNNING) return;
  window.__TB_RUNNING = true;
  const emit = (n, o) => D.dispatchEvent(new CustomEvent(n, { detail: JSON.stringify(o || {}) }));

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
  async function wait(fn, ms = 20000) {
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
  const cmd = c => {
    try {
      const [y, m, d] = c.date.split('-').map(Number), dt = () => new Date(y, m - 1, d, 12);
      const root = window.angular.element(D.body).scope().$root;
      if (c.op === 'invdate') { root.modelEdit.InvoiceDate = dt(); if (root.modelEdit.DueDate) root.modelEdit.DueDate = dt(); root.$apply(); return 'ok'; }
      if (c.op === 'pay') {
        const inp = [...top().querySelectorAll('input[ng-model="payment.scTotal"]')].pop();
        const sc = window.angular.element(inp).scope();
        sc.payment.Date = dt(); if (!sc.payment.scTotal) sc.payment.scTotal = c.amount; sc.$apply();
        const btn = [...top().querySelectorAll('ons-toolbar-button')].find(b => /saveForm/.test(b.getAttribute('ng-click') || ''));
        if (!btn) return 'nobtn'; btn.click(); return 'ok';
      }
    } catch (e) { return 'fail:' + e.message; }
    return 'fail';
  };
  let step = 'פתיחה';
  const norm = s => (s || '').replace(/[׳'"`]/g, '').replace(/\s+/g, ' ').trim();


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

    step = 'בחירת לקוח';
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

    step = 'שורת השירות';
    // 3. product line, price including VAT
    say(`מוסיף שורה: ${ils(job.amount)} כולל מע״מ`);
    await go('הוסף מוצר לחיוב');
    await go(job.product || 'אימון כושר אישי');
    await wait(() => leaf('כמות'));
    const vat = [...top().querySelectorAll('*')].find(e => vis(e) && e.children.length === 0 && /לפני מע/.test(e.textContent));
    if (vat) {
      click(vat);
      const li = await wait(() => [...D.querySelectorAll('ons-dialog ons-list-item')].find(l => vis(l) && /המחיר כולל מע/.test(l.textContent)), 5000);
      const rd = li.querySelector('ons-radio input') || li.querySelector('input') || li.querySelector('ons-radio');
      rd.click(); await sleep(700);
      if (!/כולל מע/.test(top().innerText)) throw new Error('vat');
    }
    const price = [...top().querySelectorAll('input')].filter(i => vis(i) && i.type !== 'search' && !isNaN(parseFloat(i.value)))[0];
    setVal(price, String(job.amount)); await sleep(400);
    await subSave();

    step = 'אמצעי תשלום';
    // 4. payment method + date
    const M = { transfer: 'העברה בנקאית', cash: 'מזומן', bit: 'אפליקציה Bit', paybox: 'אפליקציה PayBox', check: 'שיק' };
    say(`אמצעי תשלום: ${M[job.method] || M.transfer}`);
    await go('בחר אמצעי תשלום');
    await go(M[job.method] || M.transfer);
    await wait(() => top().querySelector('input[ng-model="payment.scTotal"]'));
    step = 'שמירת התשלום';
    const pr = await cmd({ op: 'pay', date: job.date || new Date().toISOString().slice(0, 10), amount: job.amount });
    if (pr !== 'ok') throw new Error('pay ' + pr);
    await wait(() => onInvoiceMain());
    await sleep(600);
    // invoice date = payment date
    step = 'תאריך החשבונית';
    const dateOk = job.date ? await cmd({ op: 'invdate', date: job.date }) : 'ok';

    // 5. ready — the user presses "שמור"
    const [y, m, d] = (job.date || '').split('-');
    say(`✓ החשבונית מוכנה: <b>${job.name}</b> · ${ils(job.amount)}<br>בדוק ולחץ <b>שמור</b> למעלה כדי להפיק.` +
      (job.date ? (dateOk === 'ok' ? `<br>תאריך: ${+d}/${+m}/${y}` : `<br>⚠️ התאריך לא עודכן — שנה ידנית ל-${+d}/${+m}/${y}`) : ''));

    // 6. after the user issues: read the document number and send it back to the app
    const num = await wait(() => {
      if (onInvoiceMain()) return null;
      const t = top().innerText;
      if (!/הדפס/.test(t) || !/מייל/.test(t)) return null;
      const mm = t.match(/#\s*(\d{3,7})/);
      return mm && mm[1];
    }, 60 * 60 * 1000);
    emit('tb-result', { pid: job.pid, number: num, date: job.date || new Date().toISOString().slice(0, 10), wbName: chosen });
    say(`✓ הופקה חשבונית <b>${num}</b> — נרשמה באפליקציה`);
    setTimeout(() => bar.remove(), 15000);
  } catch (err) {
    emit('tb-clear');
    say(`עצרתי בשלב: <b>${step}</b> (${err.message}). שום דבר לא הופק — אפשר להשלים ידנית או לצאת בלי לשמור.`, true);
  }
};
window.__TB_RUN();
