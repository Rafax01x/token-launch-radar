// Token Radar's dashboard v3: an achromatic ledger. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, filters, a per-protocol detail view with
// the model's own inputs and the protocol's farm plan. No network: every byte shown is in data.js.
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
  var state = { q: '', category: 'all', chain: 'all', wl: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

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
  // checks the number board.json carries, so the page's code and the board's data are visibly the
  // same arithmetic. Same tiers as lib/model.ts: fee-taking venues earn more per TVL dollar.
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

  // Total implied value per category, from the same rows the board shows.
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

  function navHtml() {
    var top5 = DATA.rows.slice(0, 5).map(function (r) {
      return '<button class="nav-item" type="button" data-slug="' + esc(r.slug) + '"><span class="rank">' + r.rank + '</span><span class="nm">' + esc(r.name) + '</span></button>';
    }).join('');
    return '<aside class="nav" id="nav" aria-label="Sections">' +
      '<div class="nav-brand"><span class="mark" aria-hidden="true">R</span><div><b>Token Radar</b><span>Token launch radar</span></div></div>' +
      '<div class="nav-scope"><b>Snapshot ' + esc(DATA.as_of) + '</b><br>DefiLlama protocol index<br>' + esc(DATA.model_version) + ' model</div>' +
      '<nav class="nav-group" aria-label="Board"><span>Board</span>' +
      '<a class="nav-item" href="#top">Overview</a>' +
      '<a class="nav-item" href="#board-table">The board</a>' +
      '<button class="nav-item" type="button" data-nav-tab="live">Live tokens</button>' +
      '<a class="nav-item" href="#model">How it is computed</a></nav>' +
      '<nav class="nav-group" aria-label="Top 5 by implied value"><span>Top 5 by implied value</span>' + top5 + '</nav>' +
      '<div class="nav-bottom">' +
      '<button class="btn btn-block" type="button" id="nav-palette">Jump to a protocol <span class="kbd">Ctrl K</span></button>' +
      '<button class="btn btn-primary btn-block" type="button" id="nav-insight">Review insight</button>' +
      '<span class="hint">Board total ' + fmtUsd(boardTotal()) + ' implied</span></div>' +
      '</aside>';
  }

  function titleHtml() {
    var top = DATA.rows[0];
    return '<section class="title" id="top"><h1>Token Launch Radar</h1>' +
      '<p class="finding">' + (top ? '<b>' + esc(top.name) + '</b> leads the board at <b>' + fmtUsd(top.implied_value_usd) + '</b> implied, from ' + fmtUsd(top.tvl_usd) + ' of TVL with no token on record.' : 'No rows scored.') + '</p>' +
      '<p class="scope-line">' + DATA.board_size + ' pre-token rows hold ' + fmtUsd(boardTotal()) + ' implied in total. ' +
      'The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL</b> that records no token, plus ' + DATA.early_size + ' more the watchlist leaves out, by TVL.</p></section>';
  }

  function tabsHtml() {
    return '<div class="tabs-row" role="group" aria-label="Token status">' +
      '<button type="button" data-tab="pre-token" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token</button>' +
      '<button type="button" data-tab="live" aria-pressed="' + (state.tab === 'live') + '">Live token</button>' +
      '</div>';
  }

  function stepParts(s) {
    var at = s.indexOf(' Cost: ');
    if (at < 0) return { action: s, tail: '' };
    return { action: s.slice(0, at), tail: s.slice(at + 1) };
  }

  function topPickHtml() {
    var top = DATA.rows[0];
    if (!top) return '';
    var gclass = top.change_7d === null ? '' : top.change_7d >= 0 ? 'pos' : 'neg';
    var firstMoves = farmSteps(top).slice(0, 2).map(function (s) {
      var p = stepParts(s);
      return '<li><b>' + esc(p.action) + '</b><span class="cost">' + esc(p.tail) + '</span></li>';
    }).join('');
    return '<section class="card" aria-label="Top pick"><p class="pick-label">Top pick</p>' +
      '<h2 class="pick-name">' + esc(top.name) + '</h2>' +
      '<p class="pick-sub">' + esc(top.category || 'Other') + ' on ' + esc((top.chains || []).slice(0, 3).join(', ') || 'an unnamed chain') + '</p>' +
      '<p class="pick-value">' + fmtUsd(top.implied_value_usd) + '</p>' +
      '<div class="pick-facts">' +
      '<div><span>TVL</span><b>' + fmtUsd(top.tvl_usd) + '</b></div>' +
      '<div><span>7d growth</span><b class="' + gclass + '">' + fmtPct(top.change_7d) + '</b></div>' +
      '<div><span>Age, no token</span><b>' + fmtAge(top.age_days) + '</b></div>' +
      '</div>' +
      '<div class="pick-steps"><p class="pick-label">First moves</p><ol>' + firstMoves + '</ol></div>' +
      '<button class="btn" type="button" data-slug="' + esc(top.slug) + '">Open its farm plan</button></section>';
  }

  function categoryBarsHtml() {
    var cats = categoryTotals();
    var shown = cats.slice(0, 6);
    var max = shown.length ? shown[0].total : 1;
    var rows = shown.map(function (c) {
      return '<div class="cat-row"><div class="cat-top"><span class="cat-name">' + esc(c.category) + '</span><span class="cat-val">' + fmtUsd(c.total) + '</span></div>' +
        '<div class="cat-bar" aria-hidden="true"><i style="width:' + Math.max(3, Math.round((c.total / max) * 100)) + '%"></i></div>' +
        '<div class="cat-count">' + c.count + ' protocol' + (c.count === 1 ? '' : 's') + '</div></div>';
    }).join('');
    return '<section class="card" aria-label="Where the implied value sits"><h2>Where the implied value sits</h2>' +
      '<p class="card-sub">Total implied value by category, from the ' + DATA.board_size + ' pre-token rows.</p>' +
      rows +
      '<p class="card-foot">Showing ' + shown.length + ' of ' + cats.length + ' categories.</p></section>';
  }

  function controlsHtml() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var opts = function (list, cur, allLabel) {
      return '<option value="all"' + (cur === 'all' ? ' selected' : '') + '>' + esc(allLabel) + '</option>' +
        list.map(function (c) { return '<option value="' + esc(c) + '"' + (cur === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('');
    };
    return '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><div class="search-hint"><input type="search" id="q" placeholder="Search name, category, chain" value="' + esc(state.q) + '" aria-label="Search the board"><span class="kbd" aria-hidden="true">/</span></div></div>' +
      '<div class="field"><label for="category">Category</label><select id="category" aria-label="Filter by category">' + opts(cats, state.category, 'All categories') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain" aria-label="Filter by chain">' + opts(chains, state.chain, 'All chains') + '</select></div>' +
      '<label class="check"><input type="checkbox" id="wl"' + (state.wl ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="count sub" id="row-count">' + (state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : DATA.live.length + ' live-token protocols') + '</span>' +
      '</div>';
  }

  function boardTableHtml() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2>' +
        '<p>Clear the search or pick another category to see the board again.</p>' +
        '<button class="btn btn-primary" type="button" id="clear-filters">Clear filters</button></div></div>';
    }
    var max = list[0].implied_value_usd || 1;
    var rows = list.map(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gclass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var sub = (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? esc(r.chains.slice(0, 2).join(', ')) : 'an unnamed chain');
      return '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '" tabindex="0">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><div class="name"><b>' + esc(r.name) + (r.on_watchlist ? '<span class="watch">WATCHLIST</span>' : '') + '</b><span class="sub">' + sub + '</span></div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + gclass + '">' + growth + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%"></i></div><span class="num">' + fmtUsd(r.implied_value_usd) + '</span></div></td>' +
        '<td><span class="status">records no token</span></td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.</caption>' +
      '<thead><tr><th scope="col" class="num">' + sortBtn('implied', 'Rank') + '</th><th scope="col">' + sortBtn('name', 'Protocol') + '</th><th scope="col" class="num">' + sortBtn('tvl', 'TVL') + '</th><th scope="col" class="num">' + sortBtn('growth', '7d') + '</th><th scope="col" class="num">' + sortBtn('age', 'Age') + '</th><th scope="col" class="num">' + sortBtn('implied', 'Implied value') + '</th><th scope="col">Token</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function liveTableHtml() {
    var rows = DATA.live.map(function (r) {
      return '<tr><td class="num">live</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? esc(r.chains.slice(0, 2).join(', ')) : 'an unnamed chain') + '</span></div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
        '<td><span class="status live">already trades</span></td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.</caption>' +
      '<thead><tr><th scope="col">Status</th><th scope="col">Protocol</th><th scope="col" class="num">TVL</th><th scope="col" class="num">7d</th><th scope="col" class="num">Market cap</th><th scope="col">Token</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function modelPanelHtml() {
    var m = DATA.model;
    return '<section class="panel model" id="model"><h2>How implied value is computed</h2>' +
      '<p class="sub">Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.</p>' +
      '<div class="formula">implied = round( tvl_usd &times; category_multiple &times; (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 &times; ' + m.growth_weight + ') &times; (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' &times; ' + m.maturity_range + ') &times; (1 + min(chains &minus; 1, ' + m.breadth_cap + ') &times; ' + m.breadth_step + ') )</div>' +
      '<table class="tiers"><thead><tr><th scope="col">What the protocol does</th><th scope="col" class="num">Category multiple</th><th scope="col">Why</th></tr></thead><tbody>' +
      '<tr><td>Trading venues (DEX, derivatives, perps, prediction)</td><td class="num">0.45</td><td>Take a cut of every trade</td></tr>' +
      '<tr><td>Lending &amp; borrowing (lending, CDP, collateral)</td><td class="num">0.35</td><td>Take a spread on every loan</td></tr>' +
      '<tr><td>Yield &amp; vaults (yield, curators, allocators)</td><td class="num">0.30</td><td>Take a performance fee</td></tr>' +
      '<tr><td>Asset-backed (RWA, stablecoins, basis trading)</td><td class="num">0.25</td><td>Fees are thin, scale is the moat</td></tr>' +
      '<tr><td>Everything else</td><td class="num">0.22</td><td>Unproven fee capture</td></tr>' +
      '<tr><td>Plumbing (bridges, payments, chains)</td><td class="num">0.20</td><td>Mostly hold assets still</td></tr>' +
      '</tbody></table>' +
      '<p class="sub">TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token on record; an unlisted age uses ' + m.unknown_age_days + ' days. Breadth counts the chains the protocol runs on: more chains, wider distribution. The early radar is every clean pre-token protocol the watchlist leaves out, by TVL, and the live-token protocols are set aside with their market caps shown.</p></section>';
  }

  var dialog = document.createElement('dialog');
  dialog.className = 'detail';
  dialog.id = 'detail';
  dialog.setAttribute('aria-labelledby', 'detail-title');
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  var insight = document.createElement('dialog');
  insight.className = 'detail';
  insight.id = 'insight';
  insight.setAttribute('aria-labelledby', 'insight-title');

  var palette = document.createElement('dialog');
  palette.className = 'palette';
  palette.id = 'palette';
  palette.setAttribute('aria-label', 'Jump to a protocol');
  palette.innerHTML = '<input type="search" id="pal-q" placeholder="Type a protocol name" aria-label="Jump to a protocol" autocomplete="off">' +
    '<div class="pal-list" id="pal-list" role="listbox" aria-label="Matching protocols"></div>' +
    '<div class="pal-foot">Up and Down to move &middot; Enter to open &middot; Esc to close</div>';
  var palState = { q: '', active: 0, results: [] };

  function openInsight() {
    var top = DATA.rows.slice(0, 4);
    var rows = top.map(function (r, i) {
      return '<button class="insight-row" type="button" data-slug="' + esc(r.slug) + '"><span class="rank">#' + (i + 1) + '</span><span class="nm">' + esc(r.name) + '</span><span class="val">' + fmtUsd(r.implied_value_usd) + '</span></button>';
    }).join('');
    insight.innerHTML =
      '<div class="detail-head"><div>' +
      '<h2 id="insight-title">Review insight</h2>' +
      '<p class="sub">Four highest-implied-value protocols on this board, from the sealed snapshot.</p></div>' +
      '<button class="close" type="button" aria-label="Close insight">Close</button></div>' +
      '<section class="detail-section"><div>' + rows + '</div>' +
      '<p class="note">Select a row to open its model breakdown and farm plan. Values are the entry\u2019s own implied-value claim, recomputed from the snapshot figures. No launch is predicted.</p></section>';
    insight.querySelector('.close').addEventListener('click', function () { insight.close(); });
    Array.prototype.forEach.call(insight.querySelectorAll('.insight-row'), function (b) {
      b.addEventListener('click', function () { insight.close(); openDetail(b.getAttribute('data-slug')); });
    });
    if (typeof insight.showModal === 'function') {
      if (!insight.open) insight.showModal();
    } else {
      insight.setAttribute('open', '');
    }
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var match = recomputed === row.implied_value_usd;
    var stepItems = steps.map(function (s) {
      var p = stepParts(s);
      return '<li><b>' + esc(p.action) + '</b><span class="cost">' + esc(p.tail) + '</span></li>';
    }).join('');
    dialog.innerHTML =
      '<div class="detail-head"><div><span class="sub">Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' &middot; watchlist' : ' &middot; early radar') + '</span>' +
      '<h2 id="detail-title">' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc((row.chains || []).join(', ') || 'an unnamed chain') + '</p></div>' +
      '<button class="close" type="button" aria-label="Close details">Close</button></div>' +
      '<section class="detail-section"><h3>Implied value</h3><div class="equation">' +
      '<div><span>TVL</span><b class="num">' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div><span>Category multiple</span><b class="num">' + row.category_multiple.toFixed(2) + '</b></div>' +
      '<div><span>Seven-day growth</span><b class="num">' + fmtPct(row.change_7d) + '</b></div>' +
      '<div><span>Growth multiplier</span><b class="num">' + row.growth_multiplier + '</b></div>' +
      '<div><span>Age with no token on record</span><b class="num">' + fmtAge(row.age_days) + '</b></div>' +
      '<div><span>Maturity multiplier</span><b class="num">' + row.maturity_multiplier + '</b></div>' +
      '<div><span>Chains</span><b class="num">' + (row.chains || []).length + '</b></div>' +
      '<div><span>Breadth multiplier</span><b class="num">' + row.breadth_multiplier + '</b></div>' +
      '<div><span>Implied value</span><b class="num">' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '</div>' +
      '<p class="sub">Model ' + esc(DATA.model_version) + ' scores every protocol with the same function. The page recomputes this row as ' + fmtUsd(recomputed) + (match ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' An estimate, not a price; it never says whether or when a token is issued.</p></section>' +
      '<section class="detail-section"><h3>Farm plan</h3><ol class="steps">' + stepItems + '</ol>' +
      '<p class="note">This protocol records no token in the snapshot. That is DefiLlama\u2019s record, not proof it has none: check the protocol\u2019s own pages before you farm it, and never pay to claim.</p></section>';
    dialog.querySelector('.close').addEventListener('click', function () { dialog.close(); });
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function paletteResults(q) {
    var needle = q.trim().toLowerCase();
    var list = DATA.rows.filter(function (r) {
      if (!needle) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(needle) >= 0;
    });
    return list.slice(0, 8);
  }
  function renderPalette() {
    var list = document.getElementById('pal-list');
    if (!list) return;
    palState.results = paletteResults(palState.q);
    if (palState.active >= palState.results.length) palState.active = Math.max(0, palState.results.length - 1);
    if (palState.results.length === 0) {
      list.innerHTML = '<div class="pal-empty">No protocol matches that name.</div>';
      return;
    }
    list.innerHTML = palState.results.map(function (r, i) {
      return '<button class="pal-row' + (i === palState.active ? ' active' : '') + '" type="button" role="option" aria-selected="' + (i === palState.active) + '" data-slug="' + esc(r.slug) + '">' +
        '<span class="rank">#' + r.rank + '</span><span class="nm">' + esc(r.name) + '</span><span class="cat">' + esc(r.category || 'Other') + '</span><span class="val">' + fmtUsd(r.implied_value_usd) + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(list.querySelectorAll('.pal-row'), function (b, i) {
      b.addEventListener('click', function () { palette.close(); openDetail(b.getAttribute('data-slug')); });
      b.addEventListener('mousemove', function () { palState.active = i; renderPalette(); });
    });
  }
  function openPalette() {
    closeNav();
    palState.q = '';
    palState.active = 0;
    renderPalette();
    var input = document.getElementById('pal-q');
    if (input) input.value = '';
    if (typeof palette.showModal === 'function') {
      if (!palette.open) palette.showModal();
    } else {
      palette.setAttribute('open', '');
    }
    if (input) input.focus();
  }

  function closeNav() { document.body.classList.remove('nav-open'); }

  // Refresh only the table and the row count, so typing in the search box keeps focus.
  function updateTable() {
    var wrap = document.getElementById('board-table');
    if (!wrap) return;
    wrap.innerHTML = state.tab === 'pre-token' ? boardTableHtml() : liveTableHtml();
    var count = document.getElementById('row-count');
    if (count) count.textContent = state.tab === 'pre-token' ? filteredRows().length + ' rows shown' : DATA.live.length + ' live-token protocols';
    wireTableRows();
  }
  function wireTableRows() {
    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; writeHash(); render(); });
    Array.prototype.forEach.call(app.querySelectorAll('[data-sort]'), function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = -1; }
        updateTable();
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(tr.getAttribute('data-slug')); }
      });
    });
  }

  function render() {
    var isLive = state.tab === 'live';
    app.innerHTML = '<div class="app">' +
      '<div class="topbar"><button class="menu-btn" type="button" id="menu-btn" aria-label="Open navigation" aria-expanded="false">Menu</button><b>Token Radar</b></div>' +
      '<div class="scrim" id="scrim" aria-hidden="true"></div>' +
      navHtml() +
      '<div class="main">' + titleHtml() + tabsHtml() +
      (isLive ? '' : '<div class="duo">' + topPickHtml() + categoryBarsHtml() + '</div>') +
      '<h2 class="section-title">' + (isLive ? 'Live tokens' : 'The board') + '</h2>' +
      '<p class="section-sub">' + (isLive ? 'Protocols that already trade, set aside from the pre-token ranking.' : 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.') + '</p>' +
      controlsHtml() +
      '<div id="board-table">' + (isLive ? liveTableHtml() : boardTableHtml()) + '</div>' +
      (isLive ? '' : modelPanelHtml()) +
      '</div></div>';
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (!insight.isConnected) app.appendChild(insight);
    if (!palette.isConnected) app.appendChild(palette);

    var menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    var scrim = document.getElementById('scrim');
    if (scrim) scrim.addEventListener('click', closeNav);
    var navInsight = document.getElementById('nav-insight');
    if (navInsight) navInsight.addEventListener('click', function () { closeNav(); openInsight(); });
    var navPalette = document.getElementById('nav-palette');
    if (navPalette) navPalette.addEventListener('click', openPalette);
    Array.prototype.forEach.call(app.querySelectorAll('.nav-item[href]'), function (a) {
      a.addEventListener('click', closeNav);
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-nav-tab]'), function (btn) {
      btn.addEventListener('click', function () {
        closeNav();
        state.tab = btn.getAttribute('data-nav-tab');
        writeHash();
        render();
        var t = document.getElementById('board-table');
        if (t) t.scrollIntoView();
      });
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-tab]'), function (btn) {
      btn.addEventListener('click', function () { state.tab = btn.getAttribute('data-tab'); writeHash(); render(); });
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-slug]'), function (el) {
      if (el.tagName === 'BUTTON' && !el.classList.contains('pal-row')) {
        el.addEventListener('click', function () { closeNav(); openDetail(el.getAttribute('data-slug')); });
      }
    });
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; writeHash(); updateTable(); });
    var cat = document.getElementById('category');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var wl = document.getElementById('wl');
    if (wl) wl.addEventListener('change', function () { state.wl = wl.checked; writeHash(); render(); });
    wireTableRows();
    if (state.selected) openDetail(state.selected);
  }

  var palInput = palette.querySelector('#pal-q');
  palInput.addEventListener('input', function () { palState.q = palInput.value; palState.active = 0; renderPalette(); });
  palInput.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (palState.active < palState.results.length - 1) { palState.active += 1; renderPalette(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (palState.active > 0) { palState.active -= 1; renderPalette(); } }
    else if (e.key === 'Enter') {
      e.preventDefault();
      var r = palState.results[palState.active];
      if (r) { palette.close(); openDetail(r.slug); }
    }
  });

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
    var tag = (e.target && e.target.tagName) || '';
    var typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    else if (e.key === '/' && !typing) {
      e.preventDefault();
      var q = document.getElementById('q');
      if (q) q.focus();
    }
  });
})();
