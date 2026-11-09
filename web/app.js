// Burn Box web app: hand over a file or link, watch the box live, read the verdict and keep the receipt.
(() => {
  const $ = (s) => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const AMBER_A = '#ffe383', AMBER_B = '#f59a3a', HOT = '#ff6b3d';
  const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
  function grad(svg, id, stops, attrs = {}) {
    const d = svg.querySelector('defs') ?? el('defs', {}, svg);
    const g = el(attrs.linear ? 'linearGradient' : 'radialGradient', { id, ...(attrs.linear ? { x1: 0, x2: 1, y1: 0, y2: 0 } : { cx: attrs.cx ?? '50%', cy: attrs.cy ?? '38%', r: attrs.r ?? '65%' }) }, d);
    stops.forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, g));
  }

  // Logo: a small knurled dial with a warm core. The drop icon is an empty dial.
  (() => {
    const g = $('#logo'); const svg = g.ownerSVGElement;
    grad(svg, 'lg-core', [['0', AMBER_A], ['1', AMBER_B]]);
    grad(svg, 'lg-body', [['0', '#303033'], ['1', '#151516']]);
    el('circle', { r: 46, fill: 'url(#lg-body)', stroke: 'rgba(255,255,255,.09)', 'stroke-width': 1.5 }, g);
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; const [x1, y1] = polar(35, a), [x2, y2] = polar(44, a); el('line', { x1, y1, x2, y2, stroke: '#0c0c0d', 'stroke-width': 2.2 }, g); }
    el('circle', { r: 27, fill: '#141415', stroke: 'rgba(255,255,255,.06)' }, g);
    el('circle', { r: 12, fill: 'url(#lg-core)' }, g);
    const o = $('#open-cube');
    el('circle', { r: 40, fill: 'none', stroke: 'currentColor', 'stroke-width': 3, opacity: .45 }, o);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const [x1, y1] = polar(44, a), [x2, y2] = polar(48, a); el('line', { x1, y1, x2, y2, stroke: 'currentColor', 'stroke-width': 2, opacity: .3 }, o); }
    el('path', { d: 'M0 -18 V14 M-12 3 L0 15 L12 3', fill: 'none', stroke: 'currentColor', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .8 }, o);
  })();

  function stamp(svg) {
    el('circle', { r: 54, fill: 'rgba(13,13,14,.9)', stroke: AMBER_B, 'stroke-width': 3 }, svg);
    el('circle', { r: 38, fill: 'none', stroke: AMBER_B, 'stroke-width': 1.5, opacity: .7 }, svg);
    const id = `a-${svg.id}`; const d = el('defs', {}, svg);
    el('path', { id, d: 'M-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0' }, d);
    const t = el('text', { fill: AMBER_B, 'font-family': 'Geist Mono, monospace', 'font-size': 10.5, 'font-weight': 500, 'letter-spacing': 2.2 }, svg);
    el('textPath', { href: `#${id}` }, t).textContent = 'DESTROYED · SIGNED · NO SURVIVORS · ';
    const b = el('text', { 'text-anchor': 'middle', y: 8, fill: AMBER_A, 'font-family': 'Geist, sans-serif', 'font-size': 21, 'font-weight': 600, 'letter-spacing': -.5 }, svg);
    b.textContent = 'Burned';
  }
  stamp($('#stamp')); stamp($('#stamp2'));

  // The sealed box, drawn as a dial. The outer ticks light up as the run moves through its steps, the knurled
  // ring turns while the sample runs, the core is the sample, and every blocked escape strikes the wall in red.
  const box = $('#box');
  grad(box, 'd-body', [['0', '#2e2e31'], ['.7', '#1b1b1d'], ['1', '#141415']]);
  grad(box, 'd-face', [['0', '#252527'], ['1', '#18181a']], { cy: '30%', r: '80%' });
  grad(box, 'd-core', [['0', '#6a6a6e'], ['.45', '#2e2e31'], ['1', '#121213']], { cx: '40%', cy: '32%' });
  grad(box, 'd-hot', [['0', AMBER_A], ['1', AMBER_B]]);
  const glow = el('filter', { id: 'd-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, box.querySelector('defs'));
  el('feGaussianBlur', { stdDeviation: 4, result: 'b' }, glow);
  const merge = el('feMerge', {}, glow); el('feMergeNode', { in: 'b' }, merge); el('feMergeNode', { in: 'SourceGraphic' }, merge);
  const shadowF = el('filter', { id: 'd-shadow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, box.querySelector('defs'));
  el('feGaussianBlur', { stdDeviation: 14 }, shadowF);

  const boxG = el('g', {}, box);
  el('circle', { cy: 14, r: 128, fill: '#000', opacity: .75, filter: 'url(#d-shadow)' }, boxG);
  const ticks = [];
  const TICKS = 72;
  for (let i = 0; i < TICKS; i++) {
    const a = -Math.PI / 2 + (i / TICKS) * Math.PI * 2;
    const [x1, y1] = polar(134, a), [x2, y2] = polar(144, a);
    ticks.push(el('line', { x1, y1, x2, y2, stroke: '#2a2a2c', 'stroke-width': 3, 'stroke-linecap': 'round' }, boxG));
  }
  const knurl = el('g', { class: 'knurl' }, boxG);
  el('circle', { r: 122, fill: 'url(#d-body)', stroke: 'rgba(255,255,255,.07)', 'stroke-width': 1.2 }, knurl);
  for (let i = 0; i < 110; i++) {
    const a = (i / 110) * Math.PI * 2;
    const [x1, y1] = polar(106, a), [x2, y2] = polar(121, a);
    el('line', { x1, y1, x2, y2, stroke: i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.65)', 'stroke-width': 2 }, knurl);
  }
  el('circle', { r: 102, fill: 'url(#d-face)', stroke: 'rgba(255,255,255,.06)', 'stroke-width': 1.2 }, boxG);
  el('circle', { r: 58, fill: '#0e0e0f', stroke: 'rgba(0,0,0,.9)', 'stroke-width': 3 }, boxG);
  el('circle', { r: 60, fill: 'none', stroke: 'rgba(255,255,255,.05)', 'stroke-width': 1 }, boxG);
  const sample = el('g', {}, boxG);
  const ball = el('circle', { r: 34, fill: 'url(#d-core)', stroke: 'rgba(255,255,255,.1)', 'stroke-width': 1 }, sample);
  const sparks = el('g', {}, box);

  function setProgress(frac) {
    const lit = Math.round(frac * TICKS);
    ticks.forEach((t, i) => {
      t.setAttribute('stroke', i < lit ? (i / TICKS < .5 ? AMBER_A : AMBER_B) : '#2a2a2c');
      if (i < lit) t.setAttribute('filter', 'url(#d-glow)'); else t.removeAttribute('filter');
    });
  }
  function spark() {
    if (reduced) return;
    const a = Math.random() * Math.PI * 2;
    const [x0, y0] = polar(38, a), [x1, y1] = polar(100, a);
    const l = el('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: HOT, 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-dasharray': '5 7', filter: 'url(#d-glow)' }, sparks);
    const [ax, ay] = polar(102, a - .18), [bx, by] = polar(102, a + .18);
    const hit = el('path', { d: `M${ax},${ay} A102,102 0 0 1 ${bx},${by}`, fill: 'none', stroke: HOT, 'stroke-width': 4, 'stroke-linecap': 'round', filter: 'url(#d-glow)' }, sparks);
    setTimeout(() => { l.remove(); hit.remove(); }, 420);
  }
  function resetBox(kind) {
    boxG.style.transition = 'none'; boxG.style.opacity = '1';
    ball.setAttribute('fill', 'url(#d-core)'); sample.style.opacity = kind === 'link' ? '0' : '1';
    setProgress(0); box.classList.add('spinning');
    $('#stamp').classList.remove('on'); $('#shot').classList.remove('on');
  }
  function burnBox() {
    box.classList.remove('spinning');
    boxG.style.transition = 'opacity .9s ease'; boxG.style.opacity = '.18';
    $('#shot').classList.remove('on'); $('#stamp').classList.add('on');
  }

  // API.
  const api = async (path, opts) => {
    const r = await fetch(path, opts);
    const ct = r.headers.get('content-type') ?? '';
    const body = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw new Error(body?.error ?? `The server said ${r.status}`);
    return body;
  };
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }

  // Health: is the box ready?
  api('/api/health').then((h) => {
    const ok = h.sandbox.docker && h.sandbox.box;
    $('#where').innerHTML = `<i style="${ok ? '' : 'background:var(--hot);box-shadow:0 0 10px var(--hot)'}"></i>Google Cloud · ${ok ? 'Box Ready' : 'Box Offline'}${h.inference && h.inference !== 'stub' ? ` · ${h.inference}` : ''}`;
    if (h.forwardTo) $('#fwd-addr').textContent = h.forwardTo;
    else { $('#fwd-addr').textContent = 'check@your-burnbox-domain'; $('#fwd-note').textContent = 'Forwarding switches on when this Burn Box has its own mail domain. Until then, drop the saved email below.'; }
  }).catch(() => { $('#where').innerHTML = '<i style="background:var(--hot);box-shadow:0 0 10px var(--hot)"></i>Server Unreachable'; });

  // Views.
  function show(v) {
    for (const k of ['new', 'run', 'email', 'verdict', 'past', 'quick', 'verify']) $(`#v-${k}`).hidden = k !== v;
    document.querySelectorAll('.nav button').forEach((b) => b.setAttribute('aria-current', (b.dataset.go === v || (v !== 'past' && b.dataset.go === 'new')) ? 'page' : 'false'));
    scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.go === 'new') reset();
    if (b.dataset.go === 'past') loadPast();
    show(b.dataset.go);
  }));

  // Intake.
  let choice = null; // { type: 'sample'|'file'|'url', ... }
  let mode = 'file';
  function setMode(m) {
    mode = m;
    $('#m-file').setAttribute('aria-pressed', String(m === 'file'));
    $('#m-link').setAttribute('aria-pressed', String(m === 'link'));
    $('#m-email').setAttribute('aria-pressed', String(m === 'email'));
    const chosen = !$('#chosen').hidden;
    $('#file-pane').hidden = m !== 'file' || chosen;
    $('#link-pane').hidden = m !== 'link' || chosen;
    $('#email-pane').hidden = m !== 'email' || chosen;
  }
  $('#m-file').addEventListener('click', () => { reset(); setMode('file'); });
  $('#m-link').addEventListener('click', () => { reset(); setMode('link'); $('#link').focus(); });
  $('#m-email').addEventListener('click', () => { reset(); setMode('email'); });
  $('#copy-addr').addEventListener('click', () => {
    const text = $('#fwd-addr').textContent;
    navigator.clipboard?.writeText(text).then(() => toast('Address copied'), () => { getSelection()?.selectAllChildren($('#fwd-addr')); toast('Address selected, copy it from here'); });
  });
  function showChosen(name, sub) {
    const c = $('#chosen'); c.hidden = false;
    c.querySelector('b').textContent = name; c.querySelector('span').textContent = sub;
    $('#file-pane').hidden = true; $('#link-pane').hidden = true; $('#email-pane').hidden = true;
    $('#detonate').disabled = false;
  }
  function reset() {
    choice = null; $('#chosen').hidden = true; $('#detonate').disabled = true; $('#link').value = ''; $('#file-in').value = ''; $('#eml-in').value = '';
    document.querySelectorAll('.sample').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    setMode(mode);
  }
  $('#clear').addEventListener('click', reset);
  const SAMPLE_NOTE = { email: 'Test email · opened in a box, then split into a box per link and attachment', phish: 'Test link · opens in a browser inside the box' };
  document.querySelectorAll('.sample').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.sample;
    const kind = id === 'phish' ? 'link' : id === 'email' ? 'email' : 'file';
    setMode(kind);
    choice = { type: 'sample', id, name: b.querySelector('b').textContent, kind };
    document.querySelectorAll('.sample').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    showChosen(choice.name, SAMPLE_NOTE[id] ?? 'Test file · self-written, harmless outside the box');
  }));
  for (const [dropSel, inSel] of [['#drop', '#file-in'], ['#eml-drop', '#eml-in']]) {
    const drop = $(dropSel), input = $(inSel);
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) takeFile(f); });
    input.addEventListener('change', () => { if (input.files[0]) takeFile(input.files[0]); });
  }
  function takeFile(f) {
    if (f.size > 25 * 1024 * 1024) { toast('Files can be up to 25 MB.'); return; }
    const kb = f.size < 1048576 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1048576).toFixed(1)} MB`;
    const isEmail = /\.(eml|msg)$/i.test(f.name) || f.type === 'message/rfc822';
    choice = { type: 'file', file: f, name: f.name, kind: isEmail ? 'email' : 'file' };
    showChosen(f.name, isEmail ? `${kb} · email, opened in a box and split into a box per link and attachment` : `${kb} · ready to detonate`);
  }
  $('#link').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    const ok = /^https?:\/\/[^\s/]+\.[^\s]+/.test(v);
    $('#detonate').disabled = !ok;
    choice = ok ? { type: 'url', url: v, name: v.replace(/^https?:\/\//, ''), kind: 'link' } : null;
  });
  $('#link').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('#detonate').disabled) start(); });
  $('#detonate').addEventListener('click', start);

  // Run view.
  const STEPS = ['Seal', 'Plant Canaries', 'Detonate', 'Record', 'Burn', 'Verdict'];
  // The run's progress is the amber track; the dial's outer ticks follow it.
  const setStep = (i) => {
    const host = $('#steps');
    if (!host.querySelector('.track')) host.innerHTML = '<div class="track"><i></i><b></b></div><div class="steps-label"><span></span><span></span></div>';
    const pct = Math.round(((i + 1) / STEPS.length) * 100);
    host.querySelector('.track i').style.width = `${pct}%`;
    const b = host.querySelector('.track b'); b.textContent = `${pct}%`; b.style.color = pct >= 88 ? '#2a1604' : '';
    const [now, of] = host.querySelectorAll('.steps-label span');
    now.textContent = STEPS[i]; of.textContent = `Step ${i + 1} of ${STEPS.length}`;
    setProgress((i + 1) / STEPS.length);
  };
  const CANARY_LABEL = { cloud_key: 'Cloud Key', wallet: 'Wallet', password: 'Password', login: 'Fake Login' };
  let counts, queue, draining, current;
  const hhmmss = (iso) => (iso ? new Date(iso).toISOString().slice(11, 19) : '');

  function line(kind, verb, text, at) {
    const ln = document.createElement('div'); ln.className = `ln t-${kind}`;
    ln.innerHTML = `<time>${hhmmss(at)}</time><b>${esc(verb)}</b><span>${esc(text)}</span>`;
    const tr = $('#trace'); tr.querySelector('.cursor')?.before(ln); tr.scrollTop = tr.scrollHeight;
  }
  function bump(k) { counts[k] += 1; $(`#c-${k} b`).textContent = String(counts[k]); if (k !== 'proc') $(`#c-${k}`).classList.add('bump'); }

  async function start() {
    if (!choice) return;
    $('#detonate').disabled = true;
    let run;
    const th = team ? { 'x-team-code': team.code } : {};
    try {
      if (choice.type === 'sample') run = await api('/api/runs', { method: 'POST', headers: { ...th, 'content-type': 'application/json' }, body: JSON.stringify({ sample: choice.id }) });
      else if (choice.type === 'url') run = await api('/api/runs', { method: 'POST', headers: { ...th, 'content-type': 'application/json' }, body: JSON.stringify({ url: choice.url }) });
      else run = await api(`/api/runs?name=${encodeURIComponent(choice.name)}`, { method: 'POST', headers: { ...th, 'content-type': 'application/octet-stream' }, body: choice.file });
    } catch (e) {
      if (team && /team code was not found/i.test(e.message)) { dropTeam('This team was not found any more, so you have left it.'); }
      toast(e.message); $('#detonate').disabled = false; return;
    }
    watch(run);
  }

  function watch(run) {
    if (run.kind === 'email') { watchEmail(run); return; }
    current = run;
    counts = { egress: 0, deny: 0, proc: 0 };
    queue = []; draining = false;
    $('#r-id').textContent = `Run ${run.id} · ${run.kind === 'link' ? 'Link' : 'File'}`;
    $('#r-name').textContent = run.name;
    const st = $('#r-status'); st.classList.remove('done'); st.querySelector('span').textContent = 'Detonating';
    $('#trace').innerHTML = '<span class="cursor"></span>';
    $('#shot .pg').innerHTML = '<b></b><div class="fld" id="f-user"></div><div class="fld" id="f-pass"></div><div class="sub">Sign In</div>'; $('#shot .pg').style.padding = '';
    resetBox(run.kind);
    const can = run.kind === 'link' ? ['login'] : ['cloud_key', 'wallet', 'password'];
    $('#canaries').style.gridTemplateColumns = `repeat(${can.length}, minmax(0, 1fr))`;
    $('#canaries').innerHTML = can.map((c) => `<div class="canary" id="cn-${c}"><i></i><b>${CANARY_LABEL[c]}</b><span>Untouched</span></div>`).join('');
    for (const k of ['egress', 'deny', 'proc']) { $(`#c-${k} b`).textContent = '0'; $(`#c-${k}`).classList.remove('bump'); }
    $('#r-note').textContent = run.kind === 'link' ? 'A browser inside the box is visiting the link. It can reach only a private lab network, and the details it types are fake.' : 'Everything here happens inside the box. Your computer and your network are never touched.';
    setStep(0); show('run');
    const es = new EventSource(`/api/runs/${run.id}/events`);
    es.onmessage = (m) => { const e = JSON.parse(m.data); if (e.type === 'end') es.close(); queue.push(e); drain(); };
    es.onerror = () => { es.close(); };
  }

  // Events arrive in bursts; they are shown in their real order, a beat apart, so a person can follow them.
  function drain() {
    if (draining) return;
    draining = true;
    const step = () => {
      const e = queue.shift();
      if (!e) { draining = false; return; }
      let wait = 0;
      try { wait = apply(e); } catch (err) { console.error(err); }
      setTimeout(step, reduced ? 0 : wait);
    };
    step();
  }

  function apply(e) {
    switch (e.type) {
      case 'stage':
        if (e.stage === 'starting') { setStep(0); return 150; }
        if (e.stage === 'sealed') {
          const l = e.limits ?? {};
          line('box', 'sealed', `net=${String(l.network).split(' ')[0]}  root=${l.root}  mem=${l.memory}  cpu=${l.cpus}  t=${l.seconds}s  ${l.runtime}`, e.at);
          setStep(1); return 350;
        }
        if (e.stage === 'canaries') { line('box', 'canaries', `${e.planted.length} planted: ${e.planted.map((c) => CANARY_LABEL[c] ?? c).join(', ').toLowerCase()}`, e.at); setStep(2); return 350; }
        if (e.stage === 'detonate') { line('exec', 'run', e.cmd ?? e.url ?? '', e.at); setStep(3); return 300; }
        if (e.stage === 'burning') { setStep(4); return 200; }
        if (e.stage === 'burned') { line('box', 'burned', `container ${e.container} removed${e.destroyed ? ', confirmed gone' : ''}`, e.destroyedAt); burnBox(); return 900; }
        if (e.stage === 'verdict') { setStep(5); $('#r-status span').textContent = 'Writing Verdict'; return 300; }
        return 100;
      case 'exec': bump('proc'); line('exec', 'exec', (e.argv ?? []).join(' ') || e.path, e.at); return 220;
      case 'canary': {
        const c = $(`#cn-${e.canary}`);
        if (c) { c.classList.add('hit'); c.querySelector('span').textContent = `Reached ${e.ts?.slice(0, 8) ?? ''}`; }
        ball.setAttribute('fill', 'url(#d-hot)'); ball.setAttribute('filter', 'url(#d-glow)');
        setTimeout(() => { ball.setAttribute('fill', 'url(#d-core)'); ball.removeAttribute('filter'); }, 520);
        if (e.canary !== 'login') line('canary', 'read', e.path ?? '', e.at); return 450;
      }
      case 'egress': bump('egress'); spark(); line('egress', e.port === 53 ? 'dns' : 'connect', `${e.host}:${e.port}  ${e.blocked ? 'BLOCKED' : 'ALLOWED (lab)'}`, e.at); return 200;
      case 'lookup': line('egress', 'lookup', `${e.host}  BLOCKED`, e.at); return 250;
      case 'write_denied': bump('deny'); line('deny', 'write', `${e.path}  DENIED`, e.at); return 300;
      case 'delete_denied': bump('deny'); line('deny', 'delete', `${e.path}  DENIED`, e.at); return 300;
      case 'write': line('ok', 'write', e.path, e.at); return 220;
      case 'delete': line('note', 'delete', `${e.path} (inside the box)`, e.at); return 220;
      case 'stdout': line('note', 'stdout', e.text, e.at); return 160;
      case 'page':
        $('#shot .url').textContent = e.url; { const t = $('#shot .pg b'); if (t) t.textContent = e.title || 'Page'; }
        $('#shot').classList.add('on'); line('note', 'visit', e.url, e.at); return 600;
      case 'screenshot': {
        const img = document.createElement('img'); img.src = e.data; img.alt = 'What the page looked like inside the box';
        img.style.cssText = 'display:block;width:100%;height:auto';
        const pg = $('#shot .pg'); pg.replaceChildren(img); pg.style.padding = '0';
        return 500;
      }
      case 'form': line('note', 'page', `${e.fields} fields, sends to ${e.action}`, e.at); return 400;
      case 'typed': if ($('#f-user')) { $('#f-user').textContent = e.user ?? ''; $('#f-pass').textContent = '••••••••••'; } line('canary', 'typed', `${e.user} and a one-time password (fake)`, e.at); return 400;
      case 'post': line('canary', 'posted', `to ${e.to}${e.crossSite ? '  (not the page you saw)' : ''}`, e.at); return 450;
      case 'note': line('note', 'note', e.message, e.at); return 200;
      case 'error': $('#r-status span').textContent = 'Failed'; line('deny', 'error', e.message, e.at); toast(e.message); return 0;
      case 'done': finish(); return 0;
      default: return 0;
    }
  }

  async function finish() {
    $('#trace .cursor')?.remove();
    const st = $('#r-status'); st.classList.add('done'); st.querySelector('span').textContent = 'Done';
    try { renderVerdict(await api(`/api/runs/${current.id}`)); } catch (e) { toast(e.message); }
  }

  // Verdict.
  const WORD = { malicious: 'Malicious.', suspicious: 'Suspicious.', safe: 'Safe.' };
  const PILL = { malicious: 'Malicious', suspicious: 'Suspicious', safe: 'Safe' };
  const CLS = { malicious: 'mal', suspicious: 'sus', safe: 'safe' };
  const utc = (iso) => (iso ? `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC` : '');
  function renderVerdict(r) {
    const v = r.verdict, f = r.facts, b = r.box;
    current = r;
    $('#v-top').className = `v-top ${CLS[v.level]}`;
    $('#v-runid').textContent = `Run ${r.id}${r.duration ? ` · ${r.duration} s inside the box` : ''}${r.parent ? ` · part of ${r.parent}` : ''}`;
    $('#v-word').textContent = WORD[v.level];
    $('#v-file').textContent = r.name;
    $('#v-summary').textContent = v.summary;
    const col = { canary: 'linear-gradient(135deg, var(--amber-a), var(--amber-b))', egress: 'var(--hot)', deny: '#c4b8ff', note: '#98c2e6', ok: 'var(--safe)' };
    $('#v-tried').innerHTML = v.tried.map((t, i) => `<li><i style="background:${col[t.kind]}">${i + 1}</i><span>${esc(t.what)}</span><em>${esc(t.outcome)}</em></li>`).join('');
    $('#v-children').hidden = r.kind !== 'email';
    if (r.kind === 'email') { renderEmailVerdict(r); return; }
    const planted = r.kind === 'link' ? 1 : 3;
    const reached = f.canaries.length;
    const denied = f.writesDenied.length + f.deletesDenied.length;
    $('#v-counts').innerHTML = `<div class="count"><b>${reached} of ${planted}</b><span>Canaries Touched</span></div><div class="count"><b>${f.egressTotal}</b><span>Egress Blocked</span></div><div class="count"><b>${denied}</b><span>Changes Denied</span></div>`;
    const kindOf = { stage: 'box', exec: 'exec', canary: 'canary', egress: 'egress', lookup: 'egress', write_denied: 'deny', delete_denied: 'deny', write: 'ok', stdout: 'note', post: 'canary', page: 'note', note: 'note' };
    $('#v-trace').innerHTML = r.events.filter((e) => kindOf[e.type]).map((e) => {
      const text = e.type === 'stage' ? (e.stage === 'sealed' ? `container ${e.container}` : e.stage === 'detonate' ? (e.cmd ?? '') : '') : e.type === 'egress' ? `${e.host}:${e.port} ${e.blocked ? 'BLOCKED' : ''}` : (e.path ?? e.host ?? e.text ?? e.to ?? e.url ?? e.message ?? (e.argv ?? []).join(' '));
      return `<div class="ln t-${kindOf[e.type]}"><time>${hhmmss(e.at)}</time><b>${esc(e.type === 'stage' ? e.stage : e.type.replace('_', ' '))}</b><span>${esc(text)}</span></div>`;
    }).join('');
    const l = b.limits;
    const rc = r.receipt?.body ?? {};
    $('#rc').innerHTML = [
      ['run', r.id], ['what', r.name], ['sha256', `${r.sha256.slice(0, 16)}…`], ['container', b.container],
      ['limits', `${l.network.split(' ')[0] === 'none' ? 'no network' : 'lab network only'} · read-only root · ${l.memory} · ${l.cpus} CPU · ${l.seconds} s · ${l.runtime}`],
      ['canaries', `${planted} planted · ${reached} reached`], ['started', utc(b.startedAt)], ['destroyed', `${utc(b.destroyedAt)}${b.destroyed ? ', confirmed' : ''}`],
      ['verdict', `${PILL[v.level]} · ${rc.verdictBy ?? ''}`], ['signature', `ed25519 ${(r.receipt?.signature ?? '').slice(0, 10)}…`],
    ].map(([k, val]) => `<dt>${k}</dt><dd>${esc(val)}</dd>`).join('');
    show('verdict');
  }
  function renderEmailVerdict(r) {
    const e = r.email, b = r.box, rc = r.receipt?.body ?? {};
    const kids = e.children;
    const red = e.findings.filter((x) => x.severity === 'high').length;
    $('#v-counts').innerHTML = `<div class="count"><b>${1 + kids.length}</b><span>Boxes Burned</span></div><div class="count"><b>${red}</b><span>Red Flags</span></div><div class="count"><b>${kids.filter((k) => k.level === 'malicious').length} of ${kids.length}</b><span>Parts Malicious</span></div>`;
    $('#v-kids').innerHTML = '';
    kids.forEach((k) => {
      const card = document.createElement('button'); card.type = 'button'; card.className = 'kid dev';
      card.innerHTML = `<svg viewBox="-60 -60 120 120" aria-hidden="true"></svg><div><b>${esc(k.name)}</b><span>${k.kind === 'file' ? 'Attachment' : 'Link'} · ${esc(k.id)}</span>${k.level ? `<span class="pill ${CLS[k.level]}">${PILL[k.level]}</span>` : ''}</div>`;
      const d = miniDial(card.querySelector('svg')); d.progress(1); d.done(k.level);
      card.addEventListener('click', async () => { try { renderVerdict(await api(`/api/runs/${k.id}`)); } catch (err) { toast(err.message); } });
      $('#v-kids').appendChild(card);
    });
    $('#v-trace').innerHTML = r.events.filter((x) => ['finding', 'extract', 'envelope'].includes(x.type) || (x.type === 'child' && x.ev.type === 'done') || (x.type === 'stage' && ['sealed', 'burned', 'fanout'].includes(x.stage))).map((x) => {
      const [k, verb, text] = x.type === 'finding' ? [x.severity === 'high' ? 'egress' : 'note', 'flag', `${x.what}: ${x.detail}`]
        : x.type === 'extract' ? ['exec', 'extract', `${x.kind} ${x.name}`]
        : x.type === 'envelope' ? ['box', 'envelope', `${x.from} · ${x.subject}`]
        : x.type === 'child' ? ['canary', 'verdict', `${x.child} ${x.ev.verdict ?? ''}`]
        : ['box', x.stage, x.stage === 'fanout' ? `${x.boxes.length} boxes` : `container ${x.container}`];
      return `<div class="ln t-${k}"><time>${hhmmss(x.at)}</time><b>${esc(verb)}</b><span>${esc(text)}</span></div>`;
    }).join('');
    $('#rc').innerHTML = [
      ['run', r.id], ['what', r.name], ['from', e.from], ['sha256', `${r.sha256.slice(0, 16)}…`],
      ['boxes', `${1 + kids.length} burned · ${[b.container, ...kids.map((k) => k.id)].join(', ')}`],
      ['started', utc(b.startedAt)], ['destroyed', `${utc(rc.destroyedAt)}${rc.destroyed ? ', all confirmed' : ''}`],
      ['verdict', `${PILL[r.verdict.level]} · ${rc.verdictBy ?? ''}`], ['signature', `ed25519 ${(r.receipt?.signature ?? '').slice(0, 10)}…`],
    ].map(([k, val]) => `<dt>${k}</dt><dd>${esc(val)}</dd>`).join('');
    show('verdict');
  }

  // A small dial for each box an email is split into.
  function miniDial(svg) {
    const ticks = [];
    for (let i = 0; i < 36; i++) {
      const a = -Math.PI / 2 + (i / 36) * Math.PI * 2;
      const [x1, y1] = polar(48, a), [x2, y2] = polar(56, a);
      ticks.push(el('line', { x1, y1, x2, y2, stroke: '#2a2a2c', 'stroke-width': 3, 'stroke-linecap': 'round' }, svg));
    }
    const spin = el('g', { class: 'k-spin' }, svg);
    el('circle', { r: 43, fill: '#1d1d1f', stroke: 'rgba(255,255,255,.07)' }, spin);
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; const [x1, y1] = polar(36, a), [x2, y2] = polar(43, a); el('line', { x1, y1, x2, y2, stroke: 'rgba(0,0,0,.6)', 'stroke-width': 2 }, spin); }
    el('circle', { r: 34, fill: '#18181a' }, svg);
    const core = el('circle', { r: 17, fill: '#2b2b2e', stroke: 'rgba(255,255,255,.08)' }, svg);
    return {
      progress(f) { const lit = Math.round(f * 36); ticks.forEach((t, i) => t.setAttribute('stroke', i < lit ? (i < 18 ? AMBER_A : AMBER_B) : '#2a2a2c')); },
      flash(color) { core.setAttribute('fill', color); setTimeout(() => core.setAttribute('fill', '#2b2b2e'), 450); },
      done(level) { core.setAttribute('fill', level === 'malicious' ? HOT : level === 'suspicious' ? '#f6c453' : level === 'safe' ? '#9bd6a9' : '#2b2b2e'); },
    };
  }

  // Live email run: the envelope box, then one box per link and attachment, side by side.
  const E_STEPS = ['Seal', 'Open Email', 'Read Envelope', 'Split', 'Detonate Parts', 'Verdict'];
  function setEStep(i) {
    const host = $('#e-steps');
    if (!host.querySelector('.track')) host.innerHTML = '<div class="track"><i></i><b></b></div><div class="steps-label"><span></span><span></span></div>';
    const pct = Math.round(((i + 1) / E_STEPS.length) * 100);
    host.querySelector('.track i').style.width = `${pct}%`;
    const b = host.querySelector('.track b'); b.textContent = `${pct}%`; b.style.color = pct >= 88 ? '#2a1604' : '';
    const [now, of] = host.querySelectorAll('.steps-label span');
    now.textContent = E_STEPS[i]; of.textContent = `Step ${i + 1} of ${E_STEPS.length}`;
  }
  function eline(kind, verb, text, at) {
    const ln = document.createElement('div'); ln.className = `ln t-${kind}`;
    ln.innerHTML = `<time>${hhmmss(at)}</time><b>${esc(verb)}</b><span>${esc(text)}</span>`;
    const tr = $('#e-trace'); tr.querySelector('.cursor')?.before(ln); tr.scrollTop = tr.scrollHeight;
  }
  function watchEmail(run) {
    current = run;
    const q = []; let busy = false;
    const kids = new Map();
    let envDial;
    $('#e-id').textContent = `Run ${run.id} · Email${run.via === 'email' ? ' · Forwarded' : ''}`;
    $('#e-name').textContent = run.name;
    const st = $('#e-status'); st.classList.remove('done'); st.querySelector('span').textContent = 'Opening the Email';
    $('#env-from').textContent = 'Reading inside a sealed box'; $('#env-subject').textContent = '';
    $('#flags').innerHTML = ''; $('#e-trace').innerHTML = '<span class="cursor"></span>';
    $('#kids').innerHTML = '<div class="kid dev live" id="kid-env"><svg viewBox="-60 -60 120 120" aria-hidden="true"></svg><div><b>The email</b><span>Envelope box · no network</span></div></div>';
    envDial = miniDial($('#kid-env svg'));
    setEStep(0); show('email');

    const apply = (e) => {
      switch (e.type) {
        case 'stage':
          if (e.stage === 'sealed') { eline('box', 'sealed', `envelope box ${e.container}, no network`, e.at); envDial.progress(.3); setEStep(0); return 350; }
          if (e.stage === 'detonate') { eline('exec', 'open', 'the email, inside the box', e.at); envDial.progress(.55); setEStep(1); return 350; }
          if (e.stage === 'burned') { eline('box', 'burned', `envelope box ${e.container}`, e.at); envDial.progress(1); $('#kid-env').classList.remove('live'); $('#kid-env span').textContent = 'Envelope box · burned'; return 300; }
          if (e.stage === 'fanout') {
            setEStep(3);
            eline('exec', 'split', `${e.boxes.length} parts, ${e.boxes.length} new boxes`, e.at);
            for (const k of e.boxes) {
              const card = document.createElement('div'); card.className = 'kid dev live';
              card.innerHTML = `<svg viewBox="-60 -60 120 120" aria-hidden="true"></svg><div><b>${esc(k.name)}</b><span>${k.kind === 'file' ? 'Attachment' : 'Link'} · ${esc(k.id)}</span><span class="k-state">Sealing</span></div>`;
              $('#kids').appendChild(card);
              kids.set(k.id, { card, dial: miniDial(card.querySelector('svg')), n: 0 });
            }
            setTimeout(() => setEStep(4), reduced ? 0 : 500);
            return 700;
          }
          if (e.stage === 'verdict') { setEStep(5); st.querySelector('span').textContent = 'Writing Verdict'; return 300; }
          return 80;
        case 'envelope': $('#env-from').textContent = e.from; $('#env-subject').textContent = e.subject; setEStep(2); if (e.forwardedBy) eline('note', 'forward', `unwrapped, forwarded by ${e.forwardedBy}`, e.at); return 450;
        case 'finding': {
          const li = document.createElement('li'); li.className = e.severity;
          li.innerHTML = `<i></i><b>${esc(e.what)}</b><span>${esc(e.detail)}</span>`;
          $('#flags').appendChild(li);
          eline(e.severity === 'high' ? 'egress' : 'note', 'flag', e.what, e.at);
          return e.severity === 'high' ? 650 : 400;
        }
        case 'extract': eline('exec', 'extract', `${e.kind} ${e.name}`, e.at); return 300;
        case 'child': {
          const k = kids.get(e.child); if (!k) return 0;
          const ev = e.ev; const label = k.card.querySelector('.k-state');
          const STAGE_P = { sealed: .2, canaries: .35, detonate: .5, burning: .85, burned: .92, verdict: .96 };
          if (ev.type === 'stage' && STAGE_P[ev.stage]) { k.dial.progress(STAGE_P[ev.stage]); label.textContent = { sealed: 'Sealed', canaries: 'Canaries planted', detonate: 'Detonating', burning: 'Burning', burned: 'Burned', verdict: 'Writing verdict' }[ev.stage]; return ev.stage === 'detonate' ? 200 : 90; }
          if (ev.type === 'canary') { k.dial.flash(AMBER_B); eline('canary', 'canary', `${e.child} reached for ${ev.canary === 'login' ? 'the fake login' : ev.canary.replace('_', ' ')}`, e.at); return 300; }
          if (ev.type === 'egress' && ev.blocked !== false) { k.dial.flash(HOT); k.n += 1; label.textContent = `Blocked ${k.n} escape${k.n > 1 ? 's' : ''}`; return 120; }
          if (ev.type === 'post') { k.dial.flash(AMBER_B); eline('canary', 'posted', `${e.child} sent the fake login to ${ev.to}`, e.at); return 400; }
          if (ev.type === 'page') { eline('note', 'visit', `${e.child} page opened in the box`, e.at); return 200; }
          if (ev.type === 'write_denied' || ev.type === 'delete_denied') { k.dial.flash('#c4b8ff'); return 120; }
          if (ev.type === 'done') {
            k.dial.progress(1); k.dial.done(ev.verdict); k.card.classList.remove('live');
            label.outerHTML = `<span class="pill ${CLS[ev.verdict]}">${PILL[ev.verdict]}</span>`;
            eline(ev.verdict === 'malicious' ? 'egress' : 'ok', 'verdict', `${e.child} ${PILL[ev.verdict]}, box burned`, e.at); return 500;
          }
          if (ev.type === 'error') { label.textContent = 'Box failed'; return 100; }
          return 0;
        }
        case 'note': eline('note', 'note', e.message, e.at); return 150;
        case 'error': st.querySelector('span').textContent = 'Failed'; eline('deny', 'error', e.message, e.at); toast(e.message); return 0;
        case 'done':
          $('#e-trace .cursor')?.remove(); st.classList.add('done'); st.querySelector('span').textContent = 'Done';
          setTimeout(async () => { try { renderVerdict(await api(`/api/runs/${run.id}`)); } catch (err) { toast(err.message); } }, reduced ? 0 : 900);
          return 0;
        default: return 0;
      }
    };
    const step = () => {
      const ev = q.shift();
      if (!ev) { busy = false; return; }
      let wait = 0;
      try { wait = apply(ev); } catch (err) { console.error(err); }
      setTimeout(step, reduced ? 0 : wait);
    };
    const es = new EventSource(`/api/runs/${run.id}/events`);
    es.onmessage = (m) => { const ev = JSON.parse(m.data); if (ev.type === 'end') { es.close(); return; } q.push(ev); if (!busy) { busy = true; step(); } };
    es.onerror = () => { es.close(); };
  }

  $('#again').addEventListener('click', () => { reset(); show('new'); });
  $('#dl').addEventListener('click', () => { if (current) location.href = `/api/runs/${current.id}/receipt`; });

  // Team view: a shared list of runs behind a secret code kept in this browser. Not an account.
  const TEAM_KEY = 'bb-team';
  let team = null; // { code, name }
  try { const t = JSON.parse(localStorage.getItem(TEAM_KEY) ?? 'null'); if (t && typeof t.code === 'string' && typeof t.name === 'string') team = t; } catch { /* ignore a damaged value */ }
  const saveTeam = () => { try { if (team) localStorage.setItem(TEAM_KEY, JSON.stringify(team)); else localStorage.removeItem(TEAM_KEY); } catch { /* storage may be blocked */ } };
  const postJson = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  function renderTeam() {
    const made = !$('#team-made').hidden;
    $('#team-in').hidden = Boolean(team) || made;
    $('#team-on').hidden = !team || made;
    if (team) $('#team-on-name').textContent = team.name;
    $('#p-eyebrow').textContent = team ? 'Your Team' : 'Recent Public Runs';
  }
  function dropTeam(msg) { team = null; saveTeam(); renderTeam(); if (msg) toast(msg); }
  $('#team-new').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const t = await postJson('/api/teams', { name: $('#team-name').value });
      team = { code: t.code, name: t.name }; saveTeam();
      $('#team-made-code').textContent = t.code; $('#team-made').hidden = false;
      $('#team-name').value = ''; renderTeam(); loadPast();
    } catch (err) { toast(err.message); }
  });
  $('#team-made-copy').addEventListener('click', () => {
    navigator.clipboard?.writeText($('#team-made-code').textContent).then(() => toast('Code copied'), () => { getSelection()?.selectAllChildren($('#team-made-code')); toast('Code selected, copy it from here'); });
  });
  $('#team-made-ok').addEventListener('click', () => { $('#team-made').hidden = true; $('#team-made-code').textContent = ''; renderTeam(); });
  $('#team-join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('#team-code').value.trim();
    try {
      const t = await postJson('/api/teams/join', { code });
      team = { code, name: t.name }; saveTeam(); $('#team-code').value = '';
      renderTeam(); loadPast(); toast(`Joined ${t.name}`);
    } catch (err) { toast(err.message); }
  });
  $('#team-leave').addEventListener('click', () => { dropTeam('You left the team. Its runs are still there for anyone with the code.'); loadPast(); });

  // Past runs. Filters apply to the rows already loaded (at most 50).
  let pastList = [];
  const filterIds = ['f-level', 'f-kind', 'f-date'];
  function drawPast() {
    const lv = $('#f-level').value, kd = $('#f-kind').value, dt = $('#f-date').value;
    const rows = pastList.filter((r) => (!lv || r.verdict === lv) && (!kd || r.kind === kd) && (!dt || String(r.createdAt).slice(0, 10) === dt));
    const empty = pastList.length ? 'No runs match these filters.' : team ? 'No runs in this team yet. Detonate something while the team is joined.' : 'No runs yet. Detonate a test sample to see one here.';
    $('#past').innerHTML = rows.length ? rows.map((r) => `<tr data-id="${esc(r.id)}"><td class="m">${esc(r.id)}</td><td class="m">${esc(r.name)}</td><td>${r.verdict ? `<span class="pill ${CLS[r.verdict]}">${PILL[r.verdict]}</span>` : esc(r.status)}</td><td class="m">${r.canaries} of ${r.canariesPlanted}</td><td class="m">${r.egress}</td><td class="m">${esc(utc(r.destroyedAt).replace(' UTC', ''))}</td></tr>`).join('') : `<tr><td colspan="6">${empty}</td></tr>`;
    $('#p-count').textContent = pastList.length ? `Showing ${rows.length} of the latest ${pastList.length} runs.` : '';
  }
  for (const id of filterIds) $(`#${id}`).addEventListener('input', drawPast);
  $('#f-clear').addEventListener('click', () => { for (const id of filterIds) $(`#${id}`).value = ''; drawPast(); });
  async function loadPast() {
    renderTeam();
    try {
      pastList = await api(team ? `/api/runs?team=${encodeURIComponent(team.code)}` : '/api/runs');
      drawPast();
    } catch (e) {
      if (team && /team code was not found/i.test(e.message)) { dropTeam('This team was not found any more, so you have left it.'); loadPast(); return; }
      toast(e.message);
    }
  }
  renderTeam();
  $('#past').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    try { const r = await api(`/api/runs/${tr.dataset.id}`); current = r; if (r.verdict) renderVerdict(r); else watch(r); } catch (err) { toast(err.message); }
  });

  // Replay plays a finished run's recorded events back through the live view, in their real order.
  $('#replay').addEventListener('click', () => { if (current) watch(current); });

  // Quick check: one link, one verdict card. Same POST /api/runs as the main view, tagged via: 'quick'.
  const qOk = (v) => /^https?:\/\/[^\s/]+\.[^\s]+/.test(v);
  const qSync = () => { $('#q-go').disabled = !qOk($('#q-link').value.trim()); };
  $('#q-link').addEventListener('input', qSync);
  $('#q-link').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('#q-go').disabled) quickCheck(); });
  $('#q-go').addEventListener('click', quickCheck);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  async function quickCheck() {
    const url = $('#q-link').value.trim();
    if (!qOk(url)) return;
    $('#q-go').disabled = true; $('#q-card').hidden = true;
    $('#q-status').textContent = 'Opening the link in a sealed box. This takes about half a minute.';
    try {
      const th = team ? { 'x-team-code': team.code } : {};
      const run = await api('/api/runs', { method: 'POST', headers: { ...th, 'content-type': 'application/json' }, body: JSON.stringify({ url, via: 'quick' }) });
      let r = run;
      for (let i = 0; i < 90 && r.status !== 'done' && r.status !== 'error'; i++) { await wait(2000); r = await api(`/api/runs/${run.id}`); }
      if (r.status !== 'done' && r.status !== 'error') throw new Error('The check is taking too long. Open the run from Past Runs in a minute.');
      quickCard(r);
    } catch (e) {
      if (team && /team code was not found/i.test(e.message)) dropTeam('This team was not found any more, so you have left it.');
      $('#q-status').textContent = e.message;
    }
    qSync();
  }
  function quickCard(r) {
    $('#q-card').hidden = false;
    $('#q-run').textContent = `Run ${r.id}`;
    $('#q-name').textContent = r.name;
    $('#q-detail').setAttribute('href', `#${r.id}`);
    if (!r.verdict) {
      $('#q-head').textContent = 'No verdict.';
      $('#q-summary').textContent = r.error || 'The box could not finish this check. Try again.';
      $('#q-reasons').innerHTML = ''; $('#q-receipt').hidden = true;
      $('#q-status').textContent = 'The check did not finish.';
      return;
    }
    $('#q-head').textContent = r.verdict.headline || WORD[r.verdict.level];
    $('#q-summary').textContent = r.verdict.summary;
    $('#q-reasons').innerHTML = (r.verdict.reasons ?? []).map((t) => `<li><span>${esc(t)}</span></li>`).join('');
    $('#q-receipt').hidden = !r.receipt; $('#q-receipt').setAttribute('href', `/api/runs/${r.id}/receipt`);
    $('#q-status').textContent = `Verdict: ${PILL[r.verdict.level]}.`;
  }
  // Verify a receipt: server check plus a second check in the browser with the public key.
  const MAX_RECEIPT = 64 * 1024;
  const vfSync = () => { $('#vf-go').disabled = !$('#vf-text').value.trim(); };
  $('#vf-text').addEventListener('input', vfSync);
  $('#vf-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    $('#vf-card').hidden = true;
    if (f.size > MAX_RECEIPT) { $('#vf-status').textContent = 'That file is too big to be a receipt. Receipts are under 64 KB.'; return; }
    $('#vf-text').value = await f.text();
    $('#vf-status').textContent = `Loaded ${f.name}. Press Check This Receipt.`;
    vfSync();
  });
  $('#vf-go').addEventListener('click', verifyReceipt);
  // Same rule as the server: keys sorted, undefined members skipped. legacy writes them as text, for receipts signed before the fix.
  const canon = (v, legacy) => {
    if (Array.isArray(v)) return `[${v.map((x) => canon(x, legacy)).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).filter((k) => legacy || v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k], legacy)}`).join(',')}}`;
    return JSON.stringify(v);
  };
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  // true or false from the browser, or null when this browser cannot do the check.
  async function browserVerify(rc) {
    try {
      if (!globalThis.crypto?.subtle) return null;
      const pem = await api('/api/pubkey');
      const key = await crypto.subtle.importKey('spki', b64(pem.replace(/-----[^-]+-----|\s/g, '')), { name: 'Ed25519' }, false, ['verify']);
      const sig = b64(rc.signature);
      const enc = new TextEncoder();
      if (await crypto.subtle.verify('Ed25519', key, sig, enc.encode(canon(rc.body)))) return true;
      if (!('parent' in rc.body)) return await crypto.subtle.verify('Ed25519', key, sig, enc.encode(canon({ ...rc.body, parent: undefined }, true)));
      return false;
    } catch {
      return null; // no Ed25519 in this browser, or the key could not be loaded
    }
  }
  function vfShow(state, word, reason, checks, rc) {
    $('#vf-card').hidden = false;
    $('#vf-top').className = `v-top ${state}`;
    $('#vf-word').textContent = word;
    $('#vf-reason').textContent = reason;
    $('#vf-run').textContent = rc?.body?.run ? `Run ${rc.body.run}` : 'Receipt';
    $('#vf-checks').innerHTML = checks.map((t) => `<li><span>${esc(t)}</span></li>`).join('');
    const b = rc?.body ?? {};
    const has = (k) => b[k] !== undefined && b[k] !== null && b[k] !== '';
    const burned = has('boxesBurned') ? b.boxesBurned : (b.destroyed === true ? 1 : 0);
    const gone = 'not in this receipt';
    $('#vf-label').textContent = state === 'safe' ? 'Details in this receipt' : 'Details in this receipt (not trusted)';
    $('#vf-dl').innerHTML = [
      ['Run id', has('run') ? b.run : gone], ['Verdict', has('verdict') ? (PILL[b.verdict] ?? b.verdict) : gone],
      ['Verdict written by', has('verdictBy') ? b.verdictBy : gone], ['Box destroyed', has('destroyedAt') ? utc(String(b.destroyedAt)) : gone],
      ['Boxes burned', burned],
    ].map(([k, val]) => `<dt>${k}</dt><dd>${esc(val)}</dd>`).join('');
    $('#vf-note').hidden = state !== 'safe';
  }
  async function verifyReceipt() {
    const text = $('#vf-text').value.trim();
    $('#vf-card').hidden = true;
    let rc;
    try { rc = JSON.parse(text); } catch { $('#vf-status').textContent = 'That is not receipt text. Paste the receipt exactly as you downloaded it.'; return; }
    if (!rc || typeof rc !== 'object' || !rc.body || typeof rc.body !== 'object' || Array.isArray(rc.body) || typeof rc.signature !== 'string' || rc.algorithm !== 'ed25519') {
      $('#vf-status').textContent = 'This does not look like a Burn Box receipt. It needs a body, a signature and the ed25519 label.';
      return;
    }
    $('#vf-go').disabled = true;
    $('#vf-status').textContent = 'Checking the signature.';
    try {
      const server = (await api('/api/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: text })).valid === true;
      const local = await browserVerify(rc);
      const checks = [
        `This server says: ${server ? 'the signature is good' : 'the signature does not match'}.`,
        `Your browser says: ${local === null ? 'this check was not available here' : local ? 'the signature is good' : 'the signature does not match'}.`,
      ];
      if (local !== null && local !== server) vfShow('sus', 'Not sure.', 'The two checks disagree. Do not trust this receipt.', checks, rc);
      else if (server) vfShow('safe', 'VALID.', 'This receipt is genuine. Nobody has changed it.', checks, rc);
      else vfShow('mal', 'INVALID.', 'The signature does not match this receipt. It was changed, or it did not come from this Burn Box.', checks, rc);
      $('#vf-status').textContent = server && local !== false ? 'Receipt is valid.' : 'Receipt is not valid.';
    } catch (e) {
      $('#vf-status').textContent = e.message;
    }
    vfSync();
  }

  function route() {
    if (location.hash === '#quick') { show('quick'); $('#q-link').focus(); }
    if (location.hash === '#verify') { show('verify'); $('#vf-text').focus(); }
  }
  addEventListener('hashchange', () => {
    route();
    const h = /^#(BBX-\d{4,})$/.exec(location.hash);
    if (h) api(`/api/runs/${h[1]}`).then((r) => { current = r; if (r.verdict) renderVerdict(r); else watch(r); }).catch(() => {});
  });
  route();

  // A shared link to a run opens it directly; #replay-BBX-0001 plays it back from the start.
  const m = /^#(replay-)?(BBX-\d{4,})$/.exec(location.hash);
  if (m) api(`/api/runs/${m[2]}`).then((r) => { current = r; if (r.verdict && !m[1]) renderVerdict(r); else watch(r); }).catch(() => {});
})();
