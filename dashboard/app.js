// Token Radar dashboard v4: Nexus Capital dark. Reads window.RADAR and renders the ranked
// board, filters, charts and detail views. No network: every byte shown is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA) {
    app.innerHTML = '<div class="error"><h1>The board data did not load</h1>' +
      '<p>The dashboard could not find its data file. Rebuild the output with main.ts and open the page again.</p></div>';
    app.setAttribute('aria-busy', 'false');
    return;
  }
  var state = { q: '', category: 'all', chain: 'all', wl: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, hideValues: false, heroRange: 198 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function, in the page: it recomputes a row from the snapshot figures and
  // checks the number board.json carries. Same tiers as lib/model.ts.
  function categoryMultiple(category) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('dex') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('option') >= 0 || c.indexOf('prediction') >= 0 || c.indexOf('synthetic') >= 0) return 0.45;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0 || c.indexOf('leveraged farm') >= 0) return 0.35;
    if (c.indexOf('yield') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0 || c.indexOf('farm') >= 0) return 0.30;
    if (c.indexOf('rwa') >= 0 || c.indexOf('stable') >= 0 || c.indexOf('basis') >= 0 || c.indexOf('cedefi') >= 0 || c.indexOf('insurance') >= 0) return 0.25;
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0 || c.indexOf('payment') >= 0 || c === 'chain' || c.indexOf('service') >= 0 || c.indexOf('wallet') >= 0) return 0.20;
    return 0.22;
  }
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_cap) * model.breadth_step;
    return Math.max(1, Math.round(row.tvl_usd * categoryMultiple(row.category) * growthMult * maturity * breadth));
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return 'about $5 of gas';
    if (c.indexOf('base') >= 0 || c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('blast') >= 0 || c.indexOf('zksync') >= 0 || c.indexOf('linea') >= 0 || c.indexOf('scroll') >= 0 || c.indexOf('polygon') >= 0 || c.indexOf('mantle') >= 0 || c.indexOf('mode') >= 0 || c.indexOf('fraxtal') >= 0) return 'under $1 of gas';
    if (c.indexOf('solana') >= 0 || c.indexOf('hyperliquid') >= 0 || c.indexOf('sui') >= 0 || c.indexOf('aptos') >= 0) return 'under $0.10 of fees';
    return 'about $2 of gas';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\u2019s own page.';
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var second = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: gas === 'under $0.10 of fees' ? 'under $0.10 of fees for the first transaction' : gas + ' for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      second === null
        ? { text: 'Open ' + p.name + '\'s own points or rewards page and note which actions earn points before you do more.', cost: 'no fee to check', time: '10 minutes' }
        : { text: 'Repeat the position on ' + second + ' as well, so the farm covers two of the protocol\'s chains.', cost: '$' + capital + ' of capital and ' + gasFor(second), time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.wl = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.wl) params.set('wl', '1');
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function sortBtn(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' \u25bc' : ' \u25b2') : '';
    return '<button type="button" data-sort="' + key + '">' + esc(label) + esc(arrow) + '</button>';
  }
  function categoryTotals() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Other';
      if (!byCat[c]) byCat[c] = { total: 0, count: 0 };
      byCat[c].total += r.implied_value_usd;
      byCat[c].count += 1;
    });
    return Object.keys(byCat).map(function (c) {
      return { category: c, total: byCat[c].total, count: byCat[c].count };
    }).sort(function (a, b) { return b.total - a.total; });
  }
  function boardTotal() {
    return DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
  }

  // Token Radar mark, concept B "Hex Radar": the radar needle inside a crypto hexagon.
  function logoSvg(color) {
    return '<svg viewBox="0 0 256 256" aria-hidden="true"><polygon points="128,28 214.6,78 214.6,178 128,228 41.4,178 41.4,78" fill="none" stroke="' + color + '" stroke-width="20" stroke-linejoin="round"/><line x1="128" y1="128" x2="199" y2="57" stroke="' + color + '" stroke-width="16" stroke-linecap="round"/><circle cx="199" cy="57" r="13" fill="' + color + '"/></svg>';
  }

  // The figures are rendered final; the eye toggle swaps them for dots.
  function formatCount(fmt, n) {
    return fmt === 'usd' ? fmtUsd(n) : Math.round(n).toLocaleString('en-US');
  }
  function setCounts() {
    Array.prototype.forEach.call(document.querySelectorAll('.count-up'), function (el) {
      var target = parseFloat(el.getAttribute('data-target')) || 0;
      el.textContent = state.hideValues ? '\u2022\u2022\u2022\u2022\u2022\u2022' : formatCount(el.getAttribute('data-fmt'), target);
    });
  }

  // Hero area chart: cumulative implied value by rank, from the same rows the board shows.
  function heroChartSvg(n) {
    var rows = DATA.rows.slice(0, n);
    var total = rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var pts = [];
    var sum = 0;
    var step = Math.max(1, Math.ceil(rows.length / 24));
    for (var i = 0; i < rows.length; i++) {
      sum += rows[i].implied_value_usd;
      if (i % step === 0 || i === rows.length - 1) pts.push([i + 1, sum]);
    }
    var W = 760, H = 250, L = 8, R = 8, T = 30, B = 26;
    var max = total || 1;
    var x = function (r) { return L + ((r - 1) / Math.max(1, n - 1)) * (W - L - R); };
    var y = function (v) { return H - B - (v / max) * (H - T - B); };
    var line = pts.map(function (p, i) { return (i === 0 ? 'M' : 'L') + x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1); }).join(' ');
    var area = line + ' L' + x(pts[pts.length - 1][0]).toFixed(1) + ',' + (H - B) + ' L' + x(pts[0][0]).toFixed(1) + ',' + (H - B) + ' Z';
    var grid = '';
    for (var g = 0; g <= 3; g++) {
      var gy = H - B - (g / 3) * (H - T - B);
      grid += '<line class="gridline" x1="' + L + '" y1="' + gy + '" x2="' + (W - R) + '" y2="' + gy + '"/>' +
        '<text class="axis" x="' + L + '" y="' + (gy - 5) + '">' + fmtUsd((max * g) / 3) + '</text>';
    }
    var xl = '<text class="axis" x="' + L + '" y="' + (H - 6) + '">Rank 1</text>' +
      '<text class="axis" x="' + (W / 2) + '" y="' + (H - 6) + '" text-anchor="middle">Rank ' + Math.round(n / 2) + '</text>' +
      '<text class="axis" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">Rank ' + n + '</text>';
    var top = DATA.rows[0];
    var tip = '<circle cx="' + x(1).toFixed(1) + '" cy="' + y(pts[0][1]).toFixed(1) + '" r="4" fill="#2fd6a3"/>' +
      '<text class="chart-tip fade-in" x="' + (x(1) + 10) + '" y="' + (y(pts[0][1]) - 10).toFixed(1) + '">' + esc(top ? top.name + ' ' + fmtUsd(top.implied_value_usd) : '') + '</text>';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Cumulative implied value by rank, top ' + n + ' protocols">' +
      grid + '<path class="chart-area fade-in" d="' + area + '"/>' +
      '<path class="chart-line draw-line" pathLength="1000" d="' + line + '"/>' + tip + xl + '</svg>';
  }

  function catBarsHtml() {
    var cats = categoryTotals().slice(0, 6);
    var max = cats.length ? cats[0].total : 1;
    var top = cats[0];
    var bars = cats.map(function (c, i) {
      var h = Math.max(4, Math.round((c.total / max) * 100));
      return '<div class="bar-col"><span class="bar-val">' + fmtUsd(c.total) + '</span>' +
        '<div class="cbar' + (i === 0 ? '' : ' dim') + '" style="height:' + h + '%;animation-delay:' + (i * 90) + 'ms"></div>' +
        '<span class="bar-name">' + esc(c.category) + '</span></div>';
    }).join('');
    return '<section class="card" aria-label="Implied value by category"><p class="card-label">Top category</p>' +
      '<p class="kpi-value">' + (top ? fmtUsd(top.total) : 'n/a') + '</p>' +
      '<div class="kpi-foot"><span class="pill pill-mint">' + (top ? esc(top.category) : '') + '</span><span class="sub">' + (top ? top.count + ' protocols' : '') + '</span></div>' +
      '<div class="bar-chart">' + bars + '</div>' +
      '<p class="card-foot">Showing 6 of ' + categoryTotals().length + ' categories.</p></section>';
  }

  function donutHtml() {
    var cats = categoryTotals();
    var top = cats.slice(0, 6);
    var otherTotal = cats.slice(6).reduce(function (s, c) { return s + c.total; }, 0);
    var segs = top.map(function (c) { return { name: c.category, total: c.total }; });
    if (otherTotal > 0) segs.push({ name: 'Other categories', total: otherTotal });
    var colors = ['#2fd6a3', '#8fd8b8', '#e8b34b', '#b7cfc5', '#5b8c7b', '#3a4a44', '#7dd8b0'];
    var total = boardTotal();
    var C = 2 * Math.PI * 70;
    var off = 0;
    var circles = segs.map(function (s, i) {
      var frac = s.total / total;
      var len = frac * C;
      var from = C;
      var to = C - len;
      var html = '<circle class="donut-seg" cx="90" cy="90" r="70" stroke="' + colors[i % colors.length] + '" stroke-dasharray="' + len.toFixed(1) + ' ' + C.toFixed(1) + '" style="--from:' + from.toFixed(1) + ';--to:' + to.toFixed(1) + ';transform:rotate(' + (-90 + (off / total) * 360).toFixed(1) + 'deg);transform-origin:90px 90px"/>';
      off += s.total;
      return html;
    }).join('');
    var legend = segs.map(function (s, i) {
      return '<div class="legend-row"><span class="sw" style="background:' + colors[i % colors.length] + '"></span><span class="nm">' + esc(s.name) + '</span><span class="vl">' + fmtUsd(s.total) + '</span></div>';
    }).join('');
    return '<section class="card" aria-label="Where the value sits"><h2>Where the value sits</h2>' +
      '<p class="sub">Share of the board total by category.</p>' +
      '<div class="donut-wrap"><svg class="donut" viewBox="0 0 180 180" width="150" height="150" role="img" aria-label="Board total by category">' + circles +
      '<text class="donut-center" x="90" y="88">' + fmtUsd(total) + '</text><text class="donut-center-sub" x="90" y="106">board total</text></svg>' +
      '<div class="legend">' + legend + '</div></div>' +
      '<p class="card-foot">' + cats.length + ' categories in all.</p></section>';
  }

  function liveChartHtml() {
    var live = DATA.live.slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); }).slice(0, 8);
    if (live.length === 0) return '';
    var max = 1;
    live.forEach(function (r) { max = Math.max(max, r.mcap_usd || 0, r.tvl_usd || 0); });
    var W = 300, H = 110, L = 4, R = 4, T = 8, B = 8;
    var x = function (i) { return L + (i / Math.max(1, live.length - 1)) * (W - L - R); };
    var y = function (v) { return H - B - ((v || 0) / max) * (H - T - B); };
    var line = function (key) {
      return live.map(function (r, i) { return (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(r[key]).toFixed(1); }).join(' ');
    };
    var totalMcap = DATA.live.reduce(function (s, r) { return s + (r.mcap_usd || 0); }, 0);
    return '<section class="card" aria-label="Live tokens"><h2>Live tokens</h2>' +
      '<p class="sub">Top 8 by market cap.</p>' +
      '<svg class="live-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Market cap and TVL of the top live-token protocols">' +
      '<path class="live-line-mcap draw-line" pathLength="1000" d="' + line('mcap_usd') + '"/>' +
      '<path class="live-line-tvl draw-line" pathLength="1000" d="' + line('tvl_usd') + '"/></svg>' +
      '<div class="live-legend"><span><i style="background:#2fd6a3"></i>Market cap</span><span><i style="background:#e8b34b"></i>TVL</span></div>' +
      '<p class="card-foot">' + DATA.live.length + ' live-token protocols &middot; total market cap ' + fmtUsd(totalMcap) + '.</p></section>';
  }

  function navHtml() {
    var top5 = DATA.rows.slice(0, 5);
    return '<div class="nav-brand"><span class="mark">' + logoSvg('#2fd6a3') + '</span><span><b>Token Radar</b><span>Pre-token protocol radar</span></span></div>' +
      '<p class="sub" style="padding:0 10px;margin:0">Snapshot ' + esc(DATA.as_of) + ' &middot; DefiLlama protocol index &middot; radar-2 model</p>' +
      '<nav class="nav-group" aria-label="Board"><span>BOARD</span>' +
      '<a class="nav-item active" href="#top">Overview</a>' +
      '<a class="nav-item" href="#board-table">The board</a>' +
      '<button type="button" class="nav-item" id="nav-live">Live tokens</button>' +
      '<a class="nav-item" href="#model">How it is computed</a></nav>' +
      '<nav class="nav-group" aria-label="Top 5 by implied value"><span>TOP 5</span>' +
      top5.map(function (r, i) {
        return '<button type="button" class="nav-item" data-open="' + esc(r.slug) + '"><span class="rank">' + (i + 1) + '</span><span class="nm">' + esc(r.name) + '</span></button>';
      }).join('') + '</nav>' +
      '<div class="nav-bottom"><div class="promo-mint"><b>Never miss a launch</b>' +
      '<p>The top 5 pre-token protocols, ranked by implied value.</p>' +
      '<button type="button" class="btn btn-white btn-block" id="nav-insight">Review insight</button></div></div>';
  }

  function topbarHtml() {
    return '<div class="topbar"><div class="search-pill">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' +
      '<input type="search" id="q" placeholder="Search name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board">' +
      '<span class="kbd">/</span></div>' +
      '<div class="topbar-right">' +
      '<button type="button" class="icon-btn" id="bell-btn" aria-label="Review insight, top 4 by implied value">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span class="dot"></span></button></div></div>';
  }

  function kpiHtml() {
    var top = DATA.rows[0];
    return '<section class="kpis" aria-label="Board totals">' +
      '<div class="card"><p class="card-label">Board total implied</p>' +
      '<p class="kpi-value"><span class="count-up num" data-target="' + boardTotal() + '" data-fmt="usd">' + fmtUsd(boardTotal()) + '</span></p>' +
      '<div class="kpi-foot"><span class="pill pill-mint">Top ' + fmtUsd(top ? top.implied_value_usd : 0) + '</span><span class="sub">' + DATA.board_size + ' rows</span></div></div>' +
      '<div class="card"><p class="card-label">Top implied value</p>' +
      '<p class="kpi-value"><span class="count-up num" data-target="' + (top ? top.implied_value_usd : 0) + '" data-fmt="usd">' + fmtUsd(top ? top.implied_value_usd : 0) + '</span></p>' +
      '<div class="kpi-foot"><span class="pill ' + ((top && top.change_7d !== null && top.change_7d >= 0) ? 'pill-mint' : 'pill-red') + '">' + (top ? fmtPct(top.change_7d) : 'n/a') + ' 7d</span><span class="sub">' + (top ? esc(top.name) : '') + '</span></div></div>' +
      '<div class="card"><p class="card-label">Pre-token rows</p>' +
      '<p class="kpi-value"><span class="count-up num" data-target="' + DATA.board_size + '" data-fmt="int">' + DATA.board_size + '</span></p>' +
      '<div class="kpi-foot"><span class="pill pill-grey">' + DATA.watchlist_size + ' watchlist</span><span class="sub">of ' + DATA.rows.length + ' rows</span></div></div></section>';
  }

  function heroHtml() {
    var top = DATA.rows[0];
    return '<section class="card" aria-label="Implied value analytics"><div class="hero-head"><div class="grow">' +
      '<p class="card-label">Board total</p>' +
      '<p class="hero-value"><span class="count-up num" data-target="' + boardTotal() + '" data-fmt="usd">' + fmtUsd(boardTotal()) + '</span></p>' +
      '<div class="hero-pills"><span class="pill pill-mint">' + DATA.board_size + ' rows</span>' +
      '<span class="pill pill-grey">Top: ' + (top ? esc(top.name) : '') + '</span></div></div>' +
      '<div class="hero-tools"><button type="button" class="icon-btn" id="eye-btn" aria-pressed="false" aria-label="Hide or show the counted figures">' +
      '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg></button>' +
      '<select id="hero-range" aria-label="Chart range"><option value="10"' + (state.heroRange === 10 ? ' selected' : '') + '>Top 10</option>' +
      '<option value="50"' + (state.heroRange === 50 ? ' selected' : '') + '>Top 50</option>' +
      '<option value="198"' + (state.heroRange === 198 ? ' selected' : '') + '>All 198</option></select></div></div>' +
      '<div id="hero-chart">' + heroChartSvg(state.heroRange) + '</div></section>';
  }

  function promoHtml() {
    var top = DATA.rows[0];
    return '<section class="promo-green" aria-label="Farm the top pick"><h2>Farm the top pick</h2>' +
      '<p>' + (top ? esc(top.name) : 'The top protocol') + ' leads at ' + fmtUsd(top ? top.implied_value_usd : 0) + ' implied.</p>' +
      '<button type="button" class="btn btn-white" id="promo-farm">Open its farm plan</button>' +
      '<div class="coin-wrap big"><div class="coin">' + logoSvg('#6b4e14') + '</div></div>' +
      '<div class="coin-wrap small"><div class="coin">' + logoSvg('#6b4e14') + '</div></div></section>';
  }

  function rowHtml(r) {
    var age = r.age_days === null || r.age_days === undefined ? 'unknown age' : fmtAge(r.age_days);
    var chg = r.change_7d === null || r.change_7d === undefined ? 'n/a' : fmtPct(r.change_7d);
    var chgClass = r.change_7d === null || r.change_7d === undefined ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
    var isLive = r.mcap_usd !== null && r.mcap_usd !== undefined;
    return '<tr data-open="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '">' +
      '<td class="num">' + r.rank + '</td>' +
      '<td class="name"><b>' + esc(r.name) + (r.on_watchlist ? '<span class="watch">WATCHLIST</span>' : '') + '</b>' +
      '<span class="sub">' + esc(r.category || 'Other') + ' &middot; ' + esc((r.chains || []).join(', ') || 'no chain listed') + '</span></td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num ' + chgClass + '">' + chg + '</td>' +
      '<td class="num">' + age + '</td>' +
      '<td class="num"><span class="implied"><span class="num">' + fmtUsd(r.implied_value_usd) + '</span>' +
      '<span class="bar"><i style="width:' + Math.min(100, (r.implied_value_usd / (DATA.rows[0] ? DATA.rows[0].implied_value_usd : 1)) * 100).toFixed(1) + '%"></i></span></span></td>' +
      '<td>' + (isLive ? '<span class="status live">already trades</span>' : '<span class="status">records no token</span>') + '</td></tr>';
  }
  function tableHtml() {
    var rows = state.tab === 'live' ? DATA.live.slice().sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0); }) : sortedRows(filteredRows());
    if (state.tab !== 'live' && rows.length === 0) {
      return '<div class="empty"><h2>Nothing matches those filters</h2>' +
        '<p>Try a different search or clear the filters.</p>' +
        '<button type="button" class="btn" id="clear-filters">Clear filters</button></div>';
    }
    var liveRows = state.tab === 'live' ? rows.map(function (r) {
      return '<tr data-live="' + esc(r.name) + '"><td class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' &middot; ' + esc((r.chains || []).join(', ') || 'no chain listed') + '</span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + fmtUsd(r.mcap_usd) + '</td></tr>';
    }).join('') : rows.map(rowHtml).join('');
    if (state.tab === 'live') {
      return '<div class="panel"><div class="table-wrap"><table><caption>40 protocols by market cap, CEX excluded. These protocols already record a token, so they are not farmable for a launch.</caption>' +
        '<thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th></tr></thead><tbody>' + liveRows + '</tbody></table></div></div>';
    }
    return '<div class="panel"><div class="table-wrap"><table><caption>Implied value is the entry\u2019s own claim, computed from each row\u2019s TVL, 7-day growth and age on the sealed snapshot.</caption>' +
      '<thead><tr><th class="num">' + sortBtn('implied', 'Rank') + '</th><th>' + sortBtn('name', 'Protocol') + '</th>' +
      '<th class="num">' + sortBtn('tvl', 'TVL') + '</th><th class="num">' + sortBtn('growth', '7d') + '</th>' +
      '<th class="num">' + sortBtn('age', 'Age') + '</th><th class="num">' + sortBtn('implied', 'Implied value') + '</th><th>Status</th></tr></thead>' +
      '<tbody>' + liveRows + '</tbody></table></div></div>';
  }

  function modelHtml() {
    return '<section class="card model" id="model"><h2>How it is computed</h2>' +
      '<p class="sub">Every figure on this board comes from the snapshot, not from a name list. The model is in lib/model.ts; the page re-derives it here so you can check any row.</p>' +
      '<div class="formula">implied = TVL &times; category multiple &times; (1 + clamped 7d growth &times; 0.5) &times; maturity &times; breadth</div>' +
      '<table class="tiers"><caption class="sub">Category multiples, from lib/model.ts.</caption><thead><tr><th>Category group</th><th class="num">Multiple</th></tr></thead><tbody>' +
      '<tr><td>Trading: Dexs, Derivatives, Perpetuals, Options, Prediction Markets, Synthetics</td><td class="num">0.45</td></tr>' +
      '<tr><td>Lending, CDP, Collateral, Leveraged Farming</td><td class="num">0.35</td></tr>' +
      '<tr><td>Yield, Curators, Allocators, Vaults, Farm</td><td class="num">0.30</td></tr>' +
      '<tr><td>RWA, Stablecoins, Basis Trading, CeDeFi, Insurance</td><td class="num">0.25</td></tr>' +
      '<tr><td>Bridge, Cross Chain, Payments, Chain, Services, Wallet</td><td class="num">0.20</td></tr>' +
      '<tr><td>Everything else</td><td class="num">0.22</td></tr></tbody></table>' +
      '<p class="note">Growth is clamped to \u221260%..\u002b120% and weighted 0.5. Maturity is 0.6 plus up to 0.4 for age to 1,095 days; a protocol with no listed date is treated as 365 days old. Breadth adds 2% per extra chain, up to 9 extra chains. The implied values are the entry\u2019s own claim about what a launch could be worth; the page never predicts whether or when a token launches.</p></section>';
  }

  function detailHtml(r) {
    var model = DATA.model;
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, r.change_7d === null || r.change_7d === undefined ? 0 : r.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = r.age_days === null || r.age_days === undefined ? model.unknown_age_days : r.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + Math.min(Math.max((r.chains || []).length - 1, 0), model.breadth_cap) * model.breadth_step;
    var recomputed = impliedOf(r, model);
    var match = Math.abs(recomputed - r.implied_value_usd) < Math.max(2, r.implied_value_usd * 0.0005);
    var steps = farmSteps(r);
    return '<div class="detail-head"><div><p class="sub">Rank #' + r.rank + ' &middot; ' + esc(r.category || 'Other') + ' &middot; ' + esc((r.chains || []).join(', ') || 'no chain listed') + '</p>' +
      '<h2>' + esc(r.name) + (r.on_watchlist ? ' <span class="watch">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="sub">Snapshot ' + esc(DATA.as_of) + ' &middot; ' + esc(r.slug) + '</p></div>' +
      '<button type="button" class="close" data-close>Close</button></div>' +
      '<div class="detail-section"><h3>Implied value: ' + fmtUsd(r.implied_value_usd) + '</h3>' +
      '<p class="sub">The entry\u2019s own claim, from this row\u2019s snapshot figures. It never predicts whether or when a token launches.</p>' +
      '<div class="equation"><div><span>TVL</span><b>' + fmtUsd(r.tvl_usd) + '</b></div>' +
      '<div><span>7-day growth</span><b>' + fmtPct(r.change_7d) + '</b></div>' +
      '<div><span>Category multiple (' + esc(r.category || 'Other') + ')</span><b>' + categoryMultiple(r.category).toFixed(2) + '</b></div>' +
      '<div><span>Growth multiplier</span><b>' + growthMult.toFixed(3) + '</b></div>' +
      '<div><span>Maturity multiplier (' + (r.age_days === null || r.age_days === undefined ? 'age unknown, treated as 365 days' : fmtAge(r.age_days)) + ')</span><b>' + maturity.toFixed(3) + '</b></div>' +
      '<div><span>Breadth multiplier (' + (r.chains || []).length + ' chains)</span><b>' + breadth.toFixed(3) + '</b></div></div>' +
      '<p class="note">' + (match ? 'Recomputed from the snapshot figures above, the model gives ' + fmtUsd(recomputed) + ', matching the board figure.' : 'Recomputed from the snapshot figures above, the model gives ' + fmtUsd(recomputed) + ' against the board figure of ' + fmtUsd(r.implied_value_usd) + '.') + '</p></div>' +
      '<div class="detail-section"><h3>Farm plan: 7 steps</h3><p class="sub">The plan is derived from this row\u2019s category, chains, TVL and age, not from its name.</p>' +
      '<ol class="steps">' + steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at < 0 ? s : s.slice(0, at);
        var tail = at < 0 ? '' : s.slice(at + 1);
        return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
      }).join('') + '</ol></div>';
  }

  function insightHtml() {
    var top4 = DATA.rows.slice(0, 4);
    return '<div class="detail-head"><div><h2>AI Radar Brief</h2><p class="sub">Top 4 by implied value.</p></div>' +
      '<button type="button" class="close" data-close>Close</button></div>' +
      '<div class="detail-section">' + top4.map(function (r, i) {
        return '<button type="button" class="insight-row" data-open="' + esc(r.slug) + '"><span class="rank">' + (i + 1) + '</span><span class="nm">' + esc(r.name) + '</span><span class="val">' + fmtUsd(r.implied_value_usd) + '</span></button>';
      }).join('') +
      '<p class="note">Implied value is the entry\u2019s own claim, computed from each row\u2019s TVL, 7-day growth and age on the sealed snapshot. It never predicts whether or when a token launches.</p></div>';
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var dialog = document.querySelector('dialog.detail');
    if (dialog) {
      dialog.innerHTML = detailHtml(row);
      if (!dialog.open) dialog.showModal();
    }
    var tr = document.querySelector('tr[data-selected="true"]');
    if (tr) tr.setAttribute('data-selected', 'true');
  }
  function openInsight() {
    var dialog = document.querySelector('dialog.detail');
    if (dialog) {
      dialog.innerHTML = insightHtml();
      if (!dialog.open) dialog.showModal();
    }
  }
  function closeDialogs() {
    Array.prototype.forEach.call(document.querySelectorAll('dialog[open]'), function (d) { d.close(); });
  }

  function updateTable() {
    var table = document.getElementById('board-table');
    if (table) table.innerHTML = tableHtml();
    var count = document.getElementById('row-count');
    if (count) {
      count.textContent = state.tab === 'live'
        ? DATA.live.length + ' live-token protocols'
        : sortedRows(filteredRows()).length + ' rows shown';
    }
    wireTable();
  }

  function wireTable() {
    Array.prototype.forEach.call(document.querySelectorAll('tbody [data-open]'), function (el) {
      el.addEventListener('click', function () {
        if (el.getAttribute('data-open')) openDetail(el.getAttribute('data-open'));
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('th button[data-sort]'), function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        render();
      });
    });
    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false;
      writeHash();
      render();
    });
  }

  function render() {
    var cats = ['all'].concat(Object.keys(DATA.rows.reduce(function (m, r) { m[r.category || 'Other'] = true; return m; }, {})).sort());
    var chains = ['all'].concat(Object.keys(DATA.rows.reduce(function (m, r) { (r.chains || []).forEach(function (c) { m[c] = true; }); return m; }, {})).sort());
    var catOpts = cats.map(function (c) { return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + (c === 'all' ? 'All categories' : esc(c)) + '</option>'; }).join('');
    var chainOpts = chains.map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + (c === 'all' ? 'All chains' : esc(c)) + '</option>'; }).join('');
    var html = '<a class="skip" href="#board-table">Skip to the board</a>' +
      '<div class="app"><div class="topbar-m"><button type="button" class="menu-btn" id="menu-btn" aria-label="Open navigation">Menu</button><b>Token Radar</b></div>' +
      '<div class="scrim" id="scrim"></div>' +
      '<aside class="nav" aria-label="Navigation">' + navHtml() + '</aside>' +
      '<div class="main"><div class="glow" aria-hidden="true"></div>' +
      topbarHtml() +
      '<h1 id="top" class="page-title">Token Launch Radar</h1>' +
      '<p class="finding">' + esc(DATA.rows[0] ? DATA.rows[0].name + ' leads the board at ' + fmtUsd(DATA.rows[0].implied_value_usd) + ' implied, from ' + fmtUsd(DATA.rows[0].tvl_usd) + ' of TVL with no token on record' : '') + '</p>' +
      '<p class="sub scope">' + DATA.board_size + ' rows &middot; ' + fmtUsd(boardTotal()) + ' total implied &middot; floor ' + fmtUsd(DATA.floor_usd) + ' TVL &middot; snapshot ' + esc(DATA.as_of) + '</p>' +
      kpiHtml() +
      '<div class="grid"><div class="col-main">' + heroHtml() + '<div class="duo2">' + catBarsHtml() + donutHtml() + '</div></div>' +
      '<div class="col-right">' + promoHtml() + liveChartHtml() + '</div></div>' +
      '<h2 class="section-title" id="board-table-anchor">The board</h2>' +
      '<p class="section-sub">198 pre-token protocols, ranked by implied value. The live-token view sits beside it for comparison.</p>' +
      '<div class="tabs-row" role="group" aria-label="Board view">' +
      '<button type="button" id="tab-pre" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token (' + DATA.board_size + ')</button>' +
      '<button type="button" id="tab-live" aria-pressed="' + (state.tab === 'live') + '">Live tokens (' + DATA.live.length + ')</button></div>' +
      '<div class="controls"><div class="field"><label for="category">Category</label><select id="category">' + catOpts + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain">' + chainOpts + '</select></div>' +
      '<label class="check"><input type="checkbox" id="wl" ' + (state.wl ? 'checked' : '') + '> Watchlist only</label>' +
      '<span class="sub count" id="row-count">' + (state.tab === 'live' ? DATA.live.length + ' live-token protocols' : sortedRows(filteredRows()).length + ' rows shown') + '</span></div>' +
      '<div id="board-table">' + tableHtml() + '</div>' +
      modelHtml() +
      '</div></div>' +
      '<dialog class="detail" aria-label="Protocol detail"></dialog>';

    app.innerHTML = html;
    app.setAttribute('aria-busy', 'false');

    document.getElementById('menu-btn').addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
    document.getElementById('scrim').addEventListener('click', function () { document.body.classList.remove('nav-open'); });
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item[data-open]'), function (btn) {
      btn.addEventListener('click', function () { document.body.classList.remove('nav-open'); openDetail(btn.getAttribute('data-open')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('a.nav-item'), function (a) {
      a.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
    });
    document.getElementById('nav-live').addEventListener('click', function () {
      state.tab = 'live'; document.body.classList.remove('nav-open');
      document.getElementById('board-table-anchor').scrollIntoView();
      render();
    });
    document.getElementById('nav-insight').addEventListener('click', openInsight);
    document.getElementById('bell-btn').addEventListener('click', openInsight);
    var q = document.getElementById('q');
    q.addEventListener('input', function () { state.q = q.value; writeHash(); updateTable(); });
    document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; writeHash(); render(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); render(); });
    document.getElementById('wl').addEventListener('change', function (e) { state.wl = e.target.checked; writeHash(); render(); });
    document.getElementById('tab-pre').addEventListener('click', function () { if (state.tab !== 'pre-token') { state.tab = 'pre-token'; writeHash(); render(); } });
    document.getElementById('tab-live').addEventListener('click', function () { if (state.tab !== 'live') { state.tab = 'live'; writeHash(); render(); } });
    document.getElementById('eye-btn').addEventListener('click', function (e) {
      state.hideValues = !state.hideValues;
      e.currentTarget.setAttribute('aria-pressed', String(state.hideValues));
      setCounts();
    });
    document.getElementById('hero-range').addEventListener('change', function (e) {
      state.heroRange = parseInt(e.target.value, 10) || 198;
      document.getElementById('hero-chart').innerHTML = heroChartSvg(state.heroRange);
    });
    document.getElementById('promo-farm').addEventListener('click', function () {
      if (DATA.rows[0]) openDetail(DATA.rows[0].slug);
    });
    app.addEventListener('click', function (e) {
      var closer = e.target.closest('[data-close]');
      if (closer) closeDialogs();
      var opener = e.target.closest('[data-open]');
      if (opener && opener.classList.contains('insight-row')) {
        closeDialogs();
        openDetail(opener.getAttribute('data-open'));
      }
    });
    document.querySelector('dialog.detail').addEventListener('click', function (e) {
      if (e.target === e.currentTarget) e.currentTarget.close();
    });
    document.querySelector('dialog.detail').addEventListener('close', function () {
      state.selected = null; writeHash();
      var tr = document.querySelector('tr[data-selected="true"]');
      if (tr) tr.setAttribute('data-selected', 'false');
    });
    wireTable();
    if (state.selected) {
      var row = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
      if (row) openDetail(state.selected);
    }
    setCounts();
  }

  document.addEventListener('keydown', function (e) {
    var open = document.querySelector('dialog[open]');
    if (e.key === '/' && !open && document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      var q = document.getElementById('q');
      if (q) q.focus();
      return;
    }
    if (e.key === 'Escape') {
      document.body.classList.remove('nav-open');
      return;
    }
  });

  readHash();
  render();
})();
