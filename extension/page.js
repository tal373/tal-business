// Runs in the WeBenefit page world (needs AngularJS scope). Sets the payment date on the open payment screen.
document.addEventListener('tb-set-paydate', e => {
  let ok = false;
  try {
    const [y, m, d] = e.detail.split('-').map(Number);
    const inp = document.querySelector('input[ng-model="payment.scTotal"]');
    const s = inp && window.angular.element(inp).scope();
    const p = s && s.payment;
    if (p) {
      for (const k of Object.keys(p)) if (/date/i.test(k) && (p[k] instanceof Date || /^\d{4}-\d\d-\d\d/.test(String(p[k])))) { p[k] = new Date(y, m - 1, d, 12); ok = true; }
      if (ok) s.$apply();
    }
  } catch (err) {}
  document.dispatchEvent(new CustomEvent('tb-set-paydate-done', { detail: ok ? 'ok' : 'fail' }));
});
