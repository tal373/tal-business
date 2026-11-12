// Runs inside the WeBenefit app iframe. Fills a tax invoice-receipt from a job and stops before the final "שמור".
window.TBFill=async function(job,log){
  const D=document,N=D.querySelector('#navigatorMetro'),sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const pages=()=>[...N.children].filter(c=>c.tagName==='ONS-PAGE');
  const top=()=>pages().pop();
  const vis=e=>e&&e.getClientRects().length;
  const leaf=t=>[...top().querySelectorAll('*')].filter(e=>vis(e)&&e.children.length===0&&e.textContent.trim()===t);
  async function wait(fn,ms=10000){const t=Date.now();while(Date.now()-t<ms){let r;try{r=fn()}catch(e){}if(r&&(!Array.isArray(r)||r.length))return Array.isArray(r)?r[0]:r;await sleep(150)}throw new Error('timeout')}
  const click=e=>{(e.closest('ons-list-item,ons-button,ons-toolbar-button,button,[ng-click]')||e).click()};
  const setVal=(i,v)=>{i.focus();i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));i.blur()};
  const go=async(t)=>{const n=pages().length;click(await wait(()=>leaf(t)));await wait(()=>pages().length!==n||!leaf(t).length);await sleep(400)};
  const saveTop=async()=>{const n=pages().length;click(await wait(()=>leaf('שמור')));await wait(()=>pages().length<n);await sleep(500)};
  const norm=s=>(s||'').replace(/[׳'"`]/g,'').replace(/\s+/g,' ').trim();
  log('פותח חשבונית מס קבלה…');
  if(!leaf('הכנסות').length){click(await wait(()=>D.querySelector('#toolBarHome .ion-plus-circled')));await wait(()=>leaf('הכנסות'))}
  await go('הכנסות');await go('הפקת חשבונית מס קבלה');
  log('בוחר לקוח: '+job.name);
  await go('בחר לקוח');
  setVal(await wait(()=>[...top().querySelectorAll('input')].filter(vis)),job.wbName||job.name);await sleep(900);
  const items=[...top().querySelectorAll('ons-list-item')].filter(vis);
  const want=norm(job.wbName||job.name);
  let pick=items.filter(li=>norm(li.innerText.split('\n')[0])===want);
  if(pick.length!==1)pick=items.length===1?items:[];
  if(!pick.length){log('⚠️ לא מצאתי את "'+(job.wbName||job.name)+'" — בחר לקוח מהרשימה, והתוסף ימשיך');
    const n=pages().length;await wait(()=>pages().length<n,600000);}else{const n=pages().length;click(pick[0]);await wait(()=>pages().length<n)}
  await sleep(500);
  log('מוסיף שורה: '+job.amount+' ₪ כולל מע״מ');
  await go('הוסף מוצר לחיוב');await go(job.product||'אימון כושר אישי');
  await wait(()=>leaf('כמות'));
  const sel=[...top().querySelectorAll('select')].find(s=>[...s.options].some(o=>/כולל/.test(o.text)));
  if(sel){sel.value=[...sel.options].find(o=>/כולל/.test(o.text)).value;sel.dispatchEvent(new Event('change',{bubbles:true}));await sleep(200)}
  const nums=[...top().querySelectorAll('input')].filter(i=>vis(i)&&i.type!=='search'&&!isNaN(parseFloat(i.value)));
  if(nums[0])setVal(nums[0],String(job.amount));
  if(job.desc){const ta=[...top().querySelectorAll('textarea')].filter(vis)[0];if(ta)setVal(ta,job.desc)}
  await sleep(300);await saveTop();
  const M={transfer:'העברה בנקאית',cash:'מזומן',bit:'אפליקציה Bit',paybox:'אפליקציה PayBox',check:'שיק'};
  log('אמצעי תשלום: '+(M[job.method]||M.transfer));
  await go('בחר אמצעי תשלום');await go(M[job.method]||M.transfer);
  const date=await wait(()=>[...top().querySelectorAll('input')].filter(vis).find(i=>/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(i.value)));
  if(job.date){const [y,m,d]=job.date.split('-');setVal(date,`${d}/${m}/${y}`)}
  await sleep(300);await saveTop();
  log('✓ החשבונית מוכנה — בדוק ולחץ "שמור" כדי להפיק');
  return 'ready';
};
