/* ---------------------------------------------------------------
   Skella & Co, Proposal microsite runtime
   - Decrypts payload with passphrase (AES-GCM, PBKDF2)
   - Renders proposal content
   - Wires interactive pricing, Gantt, risk flips, accept CTA
   --------------------------------------------------------------- */
(function () {
  'use strict';

  // ---------- Helpers ----------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const fmtAUD = (n) => '$' + Math.round(n).toLocaleString('en-AU');

  function el(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === 'class') node.className = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (k === 'hidden' && v) node.hidden = true;
        else node.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
    }
    return node;
  }

  const b64ToBuf = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  // ---------- Decryption ------------------------------------------------
  async function deriveKey(passphrase, salt, iterations) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(passphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
  }

  async function decryptPayload(passphrase) {
    const cipherEl = $('#proposal-cipher');
    const pkg = JSON.parse(cipherEl.textContent);
    const salt = b64ToBuf(pkg.salt);
    const iv = b64ToBuf(pkg.iv);
    const ct = b64ToBuf(pkg.ct);
    const key = await deriveKey(passphrase, salt, pkg.iters || 200000);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(plain));
  }

  // ---------- Lock screen wiring ---------------------------------------
  const lockEl = $('#lock');
  const lockForm = $('#lock-form');
  const lockMsg = $('#lock-msg');
  const lockBtn = $('#unlock-btn');
  const passEl = $('#passphrase');
  const root = $('#proposal-root');

  lockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const passphrase = passEl.value.trim();
    if (!passphrase) return;
    lockBtn.disabled = true;
    lockMsg.textContent = 'Unlocking...';
    lockMsg.classList.add('is-info');
    try {
      const data = await decryptPayload(passphrase);
      lockMsg.textContent = '';
      lockMsg.classList.remove('is-info');
      renderProposal(data);
      lockEl.hidden = true;
      root.hidden = false;
      window.scrollTo(0, 0);
    } catch (err) {
      lockMsg.classList.remove('is-info');
      lockMsg.textContent = 'Wrong passphrase. Try again.';
      passEl.select();
    } finally {
      lockBtn.disabled = false;
    }
  });

  // Autofocus passphrase field
  setTimeout(() => passEl.focus(), 100);

  // ---------- Renderers -------------------------------------------------
  function renderProposal(data) {
    document.title = `${data.meta.title} - Skella & Co`;

    root.appendChild(renderTopBar(data));
    root.appendChild(renderHero(data));

    const main = el('div', { class: 'p-shell' });
    main.appendChild(renderOverview(data));
    main.appendChild(renderPrinciples(data));
    main.appendChild(renderParticipantModel(data));
    main.appendChild(renderStages(data));
    main.appendChild(renderCadence(data));
    main.appendChild(renderRisks(data));
    main.appendChild(renderPricing(data));
    /* Accept section removed; conversation continues out-of-band */ // main.appendChild(renderAccept(data));
    root.appendChild(main);

    root.appendChild(renderFooter(data));
  }

  function renderTopBar(data) {
    return el('header', { class: 'p-bar' },
      el('a', { class: 'p-bar__logo', href: '/', 'aria-label': 'Skella & Co' },
        el('img', { src: '/skella-co-logo-310px.png', alt: 'Skella & Co' })
      ),
      el('div', { class: 'p-bar__meta' },
        el('div', null, `Prepared for ${data.meta.prepared_for}`),
        el('div', null, formatDate(data.meta.date_iso))
      )
    );
  }

  function renderHero(data) {
    return el('section', { class: 'p-hero p-shell' },
      el('p', { class: 'p-hero__eyebrow' }, `Proposal · ${data.meta.client}`),
      el('h1', null, data.meta.title),
      el('p', { class: 'p-hero__sub' }, data.meta.subtitle),
      el('dl', { class: 'p-hero__facts' },
        fact('Prepared by', data.meta.prepared_by),
        fact('Cadence', '3 days/week'),
        fact('Start date', '25 May 2026')
      )
    );
  }

  function fact(label, value) {
    return el('div', { class: 'p-hero__fact' },
      el('dt', null, label),
      el('dd', null, value)
    );
  }

  function renderOverview(data) {
    return section('Engagement overview',
      null,
      el('div', { class: 'p-prose' },
        el('p', null, data.overview.intro),
        el('p', null, data.overview.cadence),
        el('p', null, data.overview.deliverable_scope),
        el('p', null, data.overview.responsibility)
      )
    );
  }

  function renderPrinciples(data) {
    return section('Guiding principles', null,
      el('div', { class: 'principles' },
        ...data.principles.map(p =>
          el('div', { class: 'principle' },
            el('h3', null, p.title),
            el('p', null, p.body)
          )
        )
      )
    );
  }

  function renderParticipantModel(data) {
    const m = data.participant_model;
    return section('Participant engagement model', m.intro,
      el('table', { class: 'tier-table' },
        el('thead', null, el('tr', null,
          el('th', null, 'Tier'),
          el('th', null, 'Mode'),
          el('th', null, 'Confidence'),
          el('th', null, 'Cost')
        )),
        el('tbody', null,
          ...m.tiers.map(t =>
            el('tr', null,
              el('td', { 'data-label': 'Tier' }, t.tier),
              el('td', { 'data-label': 'Mode' }, t.mode),
              el('td', { 'data-label': 'Confidence' }, t.confidence),
              el('td', { 'data-label': 'Cost' }, t.cost)
            )
          )
        )
      ),
      el('p', { class: 'tier-callout' }, m.posture)
    );
  }

  function renderStages(data) {
    return section('Staged scope', 'Each stage delivers standalone value. Stages 1, 2 and 3 are the minimum viable path to a meaningfully better native app.',
      el('div', { class: 'stages' },
        ...data.stages.map(s =>
          el('article', { class: 'stage' },
            el('div', { class: 'stage__head' },
              el('div', { class: 'stage__id' }, `Stage ${s.id.slice(1)}`),
              el('h3', { class: 'stage__name' }, s.name)
            ),
            el('div', { class: 'stage__body' },
              el('p', null, s.summary),
              s.note ? el('p', { class: 'stage__note' }, s.note) : null,
              el('div', null,
                el('div', { class: 'stage__id', style: 'margin-bottom:0.3rem' }, 'Deliverables'),
                el('ul', { class: 'stage__deliv' },
                  ...s.deliverables.map(d => el('li', null, d))
                )
              )
            )
          )
        )
      )
    );
  }

  // Gantt: live timeline. Rendered inline beneath the option grid (not a section of its own).
  function buildGanttHost() {
    return el('div', { class: 'gantt-block' },
      el('p', { class: 'gantt-block__label' }, 'Timeline for the selected scope'),
      el('div', { class: 'gantt', id: 'gantt-host' })
    );
  }

  function paintGantt(data, selectedStageIds, stageWeeksOverride) {
    const host = $('#gantt-host');
    if (!host) return;
    host.innerHTML = '';

    // Compute bar geometry. All stages run in series.
    const totalWeeks = data.stages.reduce((sum, s) => {
      if (!selectedStageIds.includes(s.id)) return sum;
      return sum + (stageWeeksOverride?.[s.id] ?? s.weeks);
    }, 0);

    const weeks = Math.max(totalWeeks, 1);

    const grid = el('div', { class: 'gantt__grid', style: `--gantt-weeks:${weeks}` });

    // Header row
    grid.appendChild(el('div', { class: 'gantt__header' },
      el('div', null, 'Stage'),
      el('div', null, `${weeks} week timeline`)
    ));

    // One row per stage. Inactive stages render greyed but show their natural length
    // (sized against the SELECTED total to keep proportion sensible).
    let cursor = 0;
    for (const s of data.stages) {
      const active = selectedStageIds.includes(s.id);
      const w = stageWeeksOverride?.[s.id] ?? s.weeks;
      const widthPct = active ? (w / weeks) * 100 : 0;
      const leftPct = active ? (cursor / weeks) * 100 : 0;

      const row = el('div', { class: 'gantt__row' },
        el('div', { class: 'gantt__label' }, `${s.id}. ${s.name.replace(/XLM\s+/g, '')}`),
        el('div', { class: 'gantt__track' },
          active
            ? el('div', {
                class: 'gantt__bar',
                style: `left:${leftPct}%; width:${widthPct}%`,
                title: `${s.name}, ${w} weeks`
              }, `${w} wk`)
            : el('div', { class: 'gantt__bar gantt__bar--inactive', style: 'left:0; width:100%' }, 'not in scope')
        )
      );
      grid.appendChild(row);
      if (active) cursor += w;
    }

    // Week scale
    const weekScale = el('div', { class: 'gantt__weekscale' },
      el('div', null, ''),
      el('div', { class: 'gantt__weeks', style: `--gantt-weeks:${weeks}` },
        ...(function(){
          var out = [];
          var start = new Date(Date.UTC(2026, 4, 25));
          var totalDays = weeks * 7;
          // Anchor labels to the first of each month within range. If the program starts mid-month, also emit a label at offset 0 for the starting month, but only if it won't collide with the next first-of-month label.
          var firstDayOfStartMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
          var daysUntilNextMonth = Math.round((firstDayOfStartMonth - start) / 86400000);
          if (daysUntilNextMonth >= 14) {
            out.push(el('span', { style: 'left:0%' }, ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][start.getUTCMonth()]));
          }
          var y = start.getUTCFullYear();
          var m = start.getUTCMonth() + 1;
          for (var i = 0; i < 24; i++) {
            var first = new Date(Date.UTC(y, m, 1));
            var dayOffset = Math.round((first - start) / 86400000);
            if (dayOffset >= totalDays) break;
            var pct = (dayOffset / totalDays) * 100;
            out.push(el('span', { style: 'left:' + pct + '%' }, ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][first.getUTCMonth()]));
            m += 1;
            if (m > 11) { m = 0; y += 1; }
          }
          return out;
        })()
      )
    );
    grid.appendChild(weekScale);

    host.appendChild(grid);
  }

  function renderCadence(data) {
    const c = data.cadence;
    return section('Cadence and working model', null,
      el('div', { class: 'principles' },
        el('div', { class: 'principle' }, el('h3', null, 'Commitment'), el('p', null, c.commitment)),
        el('div', { class: 'principle' }, el('h3', null, 'Rhythm'), el('p', null, c.rhythm)),
        el('div', { class: 'principle' }, el('h3', null, 'Michelle'), el('p', null, c.michelle)),
        el('div', { class: 'principle' }, el('h3', null, 'Billing'), el('p', null, 'Charged via Stripe each 4 weeks in advance, standard consultancy convention.'))
      )
    );
  }

  // ---------- Pricing builder (the interactive heart) -------------------
  let state = null; // { optionId, retainer }

  function renderPricing(data) {
    state = {
      optionId: data.default_option || data.pricing.options[0].id,
      retainer: !!data.default_retainer
    };

    const optToggle = el('div', { class: 'opt-toggle', id: 'opt-toggle' },
      ...data.pricing.options.map(o => buildOption(o))
    );

    const retainerBlock = el('div', { id: 'retainer-block', class: 'retainer' },
      el('h3', { class: 'retainer__title' }, data.pricing.retainer.name),
      el('p', { class: 'retainer__explainer' }, 'A part-time executive engagement focused on the experience layer of your product, available to you and the team on a defined cadence.'),
      el('p', { class: 'retainer__price' },
        el('span', { class: 'retainer__line' }, `${data.pricing.retainer.day_equivalent}, starting after the program completes.`),
        el('small', null, 'Billed ' + data.pricing.retainer.billed + ' via Stripe. ' + data.pricing.retainer.discount_note)
      ),
      el('ul', { class: 'retainer__includes' },
        ...data.pricing.retainer.includes.map(i => el('li', null, i))
      ),
      el('p', { class: 'retainer__value' }, data.pricing.retainer.value_line)
    );

    const ratesTable = el('table', { class: 'rates' },
      el('thead', null, el('tr', null,
        el('th', null, 'Engagement shape'),
        el('th', { style: 'text-align: right' }, 'Day rate (AUD)')
      )),
      el('tbody', null,
        ...data.pricing.day_rates.map(r => el('tr', null,
          el('td', null, r.shape),
          el('td', { style: 'text-align: right' }, fmtAUD(r.rate))
        ))
      )
    );

    const quote = el('dl', { class: 'quote', id: 'quote' });

    const sec = section('Pricing', null,
      el('div', { class: 'pricing' },
        ratesTable,
        optToggle,
        buildGanttHost(),
        quote,
        retainerBlock
      )
    );

    // First paint of the summary (which builds the retainer toggle).
    setTimeout(() => update(data), 0);

    return sec;

    function buildOption(o) {
      const stageCount = o.stages.length;
      const optEl = el('label', { class: 'opt', 'data-id': o.id },
        el('input', { type: 'radio', name: 'opt', value: o.id }),
        el('div', { class: 'opt__check' }),
        el('div', { class: 'opt__id' }, `Option ${o.id}`),
        el('div', { class: 'opt__name' }, o.name),
        el('div', { class: 'opt__meta' }, `${stageCount} stage${stageCount === 1 ? '' : 's'}`),
        el('p', { class: 'opt__sum' }, o.summary)
      );
      optEl.addEventListener('click', (e) => {
        e.preventDefault();
        state.optionId = o.id;
        update(data);
      });
      return optEl;
    }
  }

  function computeQuote(data) {
    const opt = data.pricing.options.find(o => o.id === state.optionId);
    const retainer = data.pricing.retainer;

    // Compute the discounted program cost when retainer is added: switch from the
    // standard day-rate to the long-program rate ($1,800 -> $1,450) and keep the
    // same effective weeks * 3 days/week. For "compressed" Option D we recompute
    // stage by stage using its weeks override.
    const standardRate = data.pricing.day_rates.find(r => /standard/i.test(r.shape)).rate;
    const retainerRate = data.pricing.day_rates.find(r => /long program/i.test(r.shape)).rate;

    // Effective weeks: walk the option's stages, apply overrides if present
    const stageWeeks = opt.stages.map(sid => opt.stage_weeks_override?.[sid] ?? data.stages.find(s => s.id === sid).weeks);
    const totalWeeks = stageWeeks.reduce((a, b) => a + b, 0);
    const days = totalWeeks * 3;

    const baseProgram = opt.cost; // canonical figure from source
    const discountedProgram = days * retainerRate;

    const retainerMonthly = retainer.monthly;
    // Retainer span: assume retainer begins month 1 of the engagement and continues
    // for the engagement duration. Quote shows monthly figure separately; total
    // engagement-period cost adds 3 months of retainer as a quarterly cycle indicator.
    const months = Math.ceil(totalWeeks / 4);
    const retainerForEngagement = months * retainerMonthly;

    return {
      opt,
      totalWeeks,
      dayRate: state.retainer ? retainerRate : standardRate,
      standardWeeklyRate: state.retainer ? standardRate * 3 : null,
      baseProgram,
      discountedProgram,
      programCost: state.retainer ? discountedProgram : baseProgram,
      programSaving: state.retainer ? (baseProgram - discountedProgram) : 0,
      retainer: state.retainer ? retainerMonthly : 0,
      retainerMonths: state.retainer ? months : 0,
      retainerForEngagement: state.retainer ? retainerForEngagement : 0,
      grandThroughEngagement: state.retainer ? discountedProgram : baseProgram
    };
  }

  function update(data) {
    // Option highlight
    $$('.opt').forEach(o => o.classList.toggle('is-selected', o.dataset.id === state.optionId));

    const q = computeQuote(data);
    const weeklyRate = q.dayRate * 3; // 3 days/week

    // Repaint summary card
    const quote = $('#quote');
    quote.innerHTML = '';
    quote.append(
      qrow('Selected', `Option ${q.opt.id} · ${q.opt.name}`),
      qrow('Stages', q.opt.stages.join(', ')),
      qrow('Max duration', `${q.totalWeeks} weeks`),
      el('p', { class: 'quote__note' },
        'Week counts are conservative. They build in padding for collaboration, review cycles, and dependencies on your end. Where workstreams move faster, the timeline compresses with them.'
      ),
      el('div', { class: 'quote__sep' }),
      qrow('Daily rate', `${fmtAUD(q.dayRate)}/day`),
      buildWeeklyRow(q, weeklyRate),
      buildRetainerToggleRow(q),
      el('p', { class: 'quote__note quote__note--rateinfo' },
        state.retainer
          ? `Reduced program rate (${fmtAUD(q.dayRate)}/day).`
          : `Standard program rate (${fmtAUD(q.dayRate)}/day).`
      )
    );

    // Wire the toggle in the summary
    const cb = $('#retainer-check');
    if (cb) {
      cb.checked = state.retainer;
      cb.addEventListener('change', () => {
        state.retainer = cb.checked;
        update(data);
      });
    }

    // Repaint Gantt
    paintGantt(data, q.opt.stages, q.opt.stage_weeks_override);

    // Stash for accept CTA
    window.__quote = q;
  }

  function buildWeeklyRow(q, weeklyRate) {
    const label = el('dt', null,
      'Weekly rate ',
      el('span', { class: 'quote__dt-meta' }, '(3 days/week)')
    );
    return el('div', { class: 'quote__row quote__row--weekly' },
      label,
      el('dd', null, `${fmtAUD(weeklyRate)}/week`)
    );
  }

  function buildRetainerToggleRow(q) {
    const row = el('div', { class: 'quote__row quote__row--toggle' });
    const dt = el('dt', null, '');
    const label = el('label', { class: 'retainer__toggle' },
      el('input', { type: 'checkbox', id: 'retainer-check' }),
      el('span', { class: 'retainer__switch' }),
      el('span', { class: 'retainer__toggle-label' }, 'Fractional CXO')
    );
    const dd = el('dd', null, label);
    const moreInfo = el('a', { class: 'quote__moreinfo', href: '#retainer-block' }, 'More info ↓');
    moreInfo.addEventListener('click', (e) => { e.preventDefault(); const t = document.getElementById('retainer-block'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    dd.appendChild(moreInfo);
    row.append(dt, dd);
    return row;
  }

  function qrow(label, value) {
    const row = el('div', { class: 'quote__row' });
    row.appendChild(el('dt', null, label));
    if (typeof value === 'string' && value.startsWith('<')) {
      const dd = el('dd', null);
      dd.innerHTML = value;
      row.appendChild(dd);
    } else if (value instanceof Node) {
      row.appendChild(el('dd', null, value));
    } else {
      // value may include HTML strike-through text, render raw
      const dd = el('dd', null);
      dd.innerHTML = value;
      row.appendChild(dd);
    }
    return row;
  }

  function qrowTotal(label, value) {
    return el('div', { class: 'quote__row quote__row--total' },
      el('dt', null, label),
      el('dd', null, value)
    );
  }

  function strike(s) {
    return `<span class="quote__strike">${s}</span>`;
  }

  // ---------- Risks (static list) --------------------------------------
  function renderRisks(data) {
    return section('Key risks and mitigations', null,
      el('ul', { class: 'risks' },
        ...data.risks.map((r) =>
          el('li', { class: 'risk' },
            el('p', { class: 'risk__title' }, r.risk),
            el('p', { class: 'risk__body' }, r.mitigation)
          )
        )
      )
    );
  }

  // ---------- Accept CTA ------------------------------------------------
  function renderAccept(data) {
    const msg = el('p', { class: 'accept__msg', id: 'accept-msg' });
    const btn = el('button', { class: 'accept__btn', id: 'accept-btn' }, 'Email Jamie to accept');

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      msg.classList.remove('is-error', 'is-ok');
      msg.textContent = 'Sending...';
      const q = window.__quote;
      const payload = {
        slug: data.meta.slug,
        client: data.meta.client,
        title: data.meta.title,
        accepted_at: new Date().toISOString(),
        option_id: q.opt.id,
        option_name: q.opt.name,
        retainer: state.retainer,
        weeks: q.totalWeeks,
        program_cost: q.programCost,
        retainer_monthly: q.retainer,
        retainer_min_post: q.retainer ? q.retainer * 3 : 0,
        total: q.grandThroughEngagement,
        to_email: data.meta.accept_to_email
      };

      try {
        const url = (window.PROPOSAL_RELAY_URL || '').trim();
        if (!url) throw new Error('no-relay');
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('relay-failed');
        msg.textContent = 'Thanks, Jamie has been notified and will be in touch shortly.';
        msg.classList.add('is-ok');
      } catch (e) {
        // Fall back to mailto:
        window.location.href = buildMailto(data, payload);
        msg.textContent = 'Opening your email client...';
      } finally {
        setTimeout(() => { btn.disabled = false; }, 3000);
      }
    });

    return section('Ready to move forward', null,
      el('div', { class: 'accept' },
        el('h3', null, 'Accept this proposal'),
        el('div', { class: 'accept__row' }, btn),
        msg
      )
    );
  }

  function buildMailto(data, p) {
    const to = data.meta.accept_to_email;
    const subj = encodeURIComponent(`${data.meta.client}, accepting proposal (${p.option_id || ''})`);
    const lines = [
      `Hi Jamie,`,
      ``,
      `We're moving forward with the proposal.`,
      ``,
      `Selected: Option ${p.option_id || ''}, ${p.option_name || ''}`,
      `Fractional CXO: ${p.retainer ? 'yes' : 'no'}`,
      `Approx. max duration: ${p.weeks || ''} weeks`,
      ``,
      `Next steps from your end, please.`,
      ``
    ];
    return `mailto:${to}?subject=${subj}&body=${encodeURIComponent(lines.join('\n'))}`;
  }

  // ---------- Footer ----------------------------------------------------
  function renderFooter(data) {
    return el('footer', { class: 'p-foot' },
      el('div', null, `Prepared by ${data.meta.prepared_by} · ${formatDate(data.meta.date_iso)}`),
      el('div', { style: 'margin-top:0.35rem' },
        el('a', { href: '/' }, 'skella.com.au'),
        ' · ',
        el('a', { href: `mailto:${data.meta.accept_to_email}` }, data.meta.accept_to_email)
      )
    );
  }

  // ---------- Section helper -------------------------------------------
  function section(title, sub, ...content) {
    const s = el('section', { class: 'p-section' },
      el('h2', null, title),
      sub ? el('p', { class: 'p-section__sub' }, sub) : null
    );
    for (const c of content) if (c) s.appendChild(c);
    return s;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  }

})();
