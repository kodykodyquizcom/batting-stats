/*
 * 打撃分析（BATTER ANALYTICS）の計算テスト
 *   tests/test.html をダブルクリックで開くと、結果が画面に表示されます。
 *   計算の部品（js/stats.js など）だけを使い、保存されているデータには一切触れません。
 *
 *   期待する値は手で計算したものです（コメントに計算式を書いています）。
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  const results = [];

  function check(name, actual, expected) {
    const ok = actual === expected;
    results.push({ name: name, ok: ok, detail: ok ? '' : '期待：' + String(expected) + '　実際：' + String(actual) });
  }

  // 結果コードの並び → 打席の配列
  function pas(codes, gameId) {
    return codes.map(function (code, i) {
      return { id: (gameId || 'g') + '-' + i, gameId: gameId || 'g', result: code, rbi: 0 };
    });
  }

  function repeat(code, n) {
    return Array.apply(null, Array(n)).map(function () { return code; });
  }

  const ui = App.ui;
  const summarize = App.stats.summarize;

  function shown(summary) {
    return {
      bbPct: ui.formatPercent(summary.bbPct),
      kPct: ui.formatPercent(summary.kPct),
      iso: ui.formatRate(summary.iso),
      babip: ui.formatRate(summary.babip),
      xbhPct: ui.formatPercent(summary.xbhPct),
      avg: ui.formatRate(summary.avg),
      obp: ui.formatRate(summary.obp),
      slg: ui.formatRate(summary.slg),
      ops: ui.formatRate(summary.ops)
    };
  }

  // ----- 1. いろいろな結果が混ざった例 -----
  // 単打2 二塁打1 三塁打1 本塁打1 四球2 死球1 三振3 犠打1 犠飛1 失策1 野選1 その他アウト2
  // 打席17 打数12（17−四球2−死球1−犠打1−犠飛1） 安打5 塁打11 長打3
  (function () {
    const list = pas(['single', 'single', 'double', 'triple', 'homerun', 'walk', 'walk', 'hbp',
      'strikeout', 'strikeout', 'strikeout', 'sac_bunt', 'sac_fly', 'error', 'fielders_choice', 'out', 'out']);
    const s = summarize(list);
    const v = shown(s);
    check('混合：打席', s.pa, 17);
    check('混合：打数', s.ab, 12);
    check('混合：BB% ＝ 2÷17 ＝ 11.76…%', v.bbPct, '11.8%');
    check('混合：BB%に死球を含めない（割合 2/17）', s.bbPct, 2 / 17);
    check('混合：K% ＝ 3÷17 ＝ 17.64…%', v.kPct, '17.6%');
    check('混合：ISO ＝ (11−5)÷12', v.iso, '.500');
    check('混合：BABIP ＝ (5−1)÷(12−3−1＋1) ＝ 4÷9', v.babip, '.444');
    check('混合：XBH% ＝ 3÷5', v.xbhPct, '60.0%');
    check('混合：打率 ＝ 5÷12', v.avg, '.417');
    check('混合：出塁率 ＝ 8÷16', v.obp, '.500');
    check('混合：長打率 ＝ 11÷12', v.slg, '.917');
    check('混合：OPS ＝ .5＋.91666…', v.ops, '1.417');
  })();

  // ----- 2. ISO は四捨五入する前の値で計算する -----
  // 二塁打・アウト・アウト：打率 .3333…（表示 .333）長打率 .6666…（表示 .667）
  // 表示どうしの引き算だと .334 になるが、正しい ISO は 1÷3 ＝ .333
  (function () {
    const s = summarize(pas(['double', 'out', 'out']));
    check('ISO：丸める前の値で計算（.334 にならない）', ui.formatRate(s.iso), '.333');
    check('ISO：長打率−打率 と同じ値', Math.abs(s.iso - (s.slg - s.avg)) < 1e-12, true);
  })();

  // ----- 3. 分母が0のときは「-」 -----
  (function () {
    const empty = shown(summarize([]));
    ['bbPct', 'kPct', 'iso', 'babip', 'xbhPct', 'avg', 'obp', 'slg', 'ops'].forEach(function (key) {
      check('打席0：' + key + ' は「-」', empty[key], '-');
    });

    // 計算できない値は、Infinity や NaN ではなく「計算できない（null）」として持つ
    const zero = summarize([]);
    check('打席0：計算結果は null（Infinity・NaN にならない）',
      ['bbPct', 'kPct', 'iso', 'babip', 'xbhPct'].every(function (key) { return zero[key] === null; }), true);

    // 四球だけ：打数0・安打0 → ISO・BABIP・XBH%・打率・長打率は計算できない
    const walks = shown(summarize(pas(['walk', 'walk'])));
    check('四球だけ：BB%', walks.bbPct, '100.0%');
    check('四球だけ：K%', walks.kPct, '0.0%');
    check('四球だけ：ISO は「-」', walks.iso, '-');
    check('四球だけ：BABIP は「-」', walks.babip, '-');
    check('四球だけ：XBH% は「-」（安打0）', walks.xbhPct, '-');
    check('四球だけ：出塁率', walks.obp, '1.000');

    // 本塁打と三振だけ：BABIP の分母 ＝ 2−1−1＋0 ＝ 0
    const hrSo = shown(summarize(pas(['homerun', 'strikeout'])));
    check('本塁打と三振：BABIP は「-」（分母0）', hrSo.babip, '-');
    check('本塁打と三振：XBH% ＝ 1÷1', hrSo.xbhPct, '100.0%');

    // 犠打だけ：打数0（打席1）
    const bunt = shown(summarize(pas(['sac_bunt'])));
    check('犠打だけ：BB% ＝ 0÷1', bunt.bbPct, '0.0%');
    check('犠打だけ：BABIP は「-」', bunt.babip, '-');
  })();

  // ----- 4. BABIP の失策・野選・犠打・犠飛の扱い -----
  (function () {
    // 単打・失策・野選：打数3 → 1÷3（失策・野選はアウトとして分母に入る）
    check('BABIP：失策・野選は分母に入る', ui.formatRate(summarize(pas(['single', 'error', 'fielders_choice'])).babip), '.333');
    // 犠打を足しても変わらない
    check('BABIP：犠打は入れない', ui.formatRate(summarize(pas(['single', 'error', 'fielders_choice', 'sac_bunt'])).babip), '.333');
    // 犠飛は分母に入る → 1÷4
    check('BABIP：犠飛は分母に入る', ui.formatRate(summarize(pas(['single', 'error', 'fielders_choice', 'sac_fly'])).babip), '.250');
    // 死球は BABIP にも BB% にも入らない
    const hbp = summarize(pas(['single', 'hbp']));
    check('死球：BB% は 0.0%', ui.formatPercent(hbp.bbPct), '0.0%');
    check('死球：BABIP ＝ 1÷1', ui.formatRate(hbp.babip), '1.000');
  })();

  // ----- 5. ％の表示 -----
  check('％表示：0.0375 → 3.8%', ui.formatPercent(0.0375), '3.8%');
  // 201÷400 はコンピューターの中で 0.50249999… になるため、補正しないと 50.2% になってしまう
  check('％表示：201÷400 → 50.3%（四捨五入のずれがない）', ui.formatPercent(201 / 400), '50.3%');
  check('％表示：1 → 100.0%', ui.formatPercent(1), '100.0%');
  check('％表示：1/3 → 33.3%', ui.formatPercent(1 / 3), '33.3%');
  check('％表示：null → -', ui.formatPercent(null), '-');
  check('％表示：Infinity → -', ui.formatPercent(Infinity), '-');
  check('％表示：NaN → -', ui.formatPercent(NaN), '-');

  // ----- 6. 大量の打席でも Infinity や NaN が出ない -----
  (function () {
    const codes = App.RESULT_TYPES.map(function (t) { return t.code; });
    let bad = 0;
    // 結果の組み合わせ（各結果を0〜2回）をたくさん試す
    for (let n = 0; n < 2000; n++) {
      const list = [];
      let x = n;
      codes.forEach(function (code) { const k = x % 3; x = Math.floor(x / 3) + n % 7; for (let i = 0; i < k; i++) list.push(code); });
      const s = summarize(pas(list));
      ['bbPct', 'kPct', 'iso', 'babip', 'xbhPct', 'avg', 'obp', 'slg', 'ops'].forEach(function (key) {
        const value = s[key];
        if (value !== null && !(Number.isFinite(value) && value >= 0)) bad++;
        const text = key.indexOf('Pct') > 0 ? ui.formatPercent(value) : ui.formatRate(value);
        if (/Infinity|NaN|undefined/.test(text)) bad++;
      });
    }
    check('2000通りの組み合わせで Infinity・NaN・マイナスが出ない', bad, 0);
  })();

  // ----- 7. 全試合・公式戦・練習試合の切り替え -----
  (function () {
    const games = [
      { id: 'A', category: 'official' },
      { id: 'B', category: 'practice' },
      { id: 'C', category: null },          // 試合区分が未設定
      { id: 'D', category: 'official' }     // 出場なし（打席の記録なし）
    ];
    const list = pas(repeat('single', 3), 'A')
      .concat(pas(['walk', 'strikeout'], 'B'))
      .concat(pas(['homerun', 'out', 'out', 'out'], 'C'));
    const before = JSON.stringify({ games: games, list: list });

    const all = App.stats.filterByCategory(games, list, 'all');
    const official = App.stats.filterByCategory(games, list, 'official');
    const practice = App.stats.filterByCategory(games, list, 'practice');

    check('全試合：未設定を含めて4試合', all.games.length, 4);
    check('全試合：打席は 3＋2＋4 ＝ 9', summarize(all.plateAppearances).pa, 9);
    check('公式戦：2試合（出場なしの試合も試合数には入る）', official.games.length, 2);
    check('公式戦：打席3（出場なしの試合で打席は増えない）', summarize(official.plateAppearances).pa, 3);
    check('公式戦：打率 3÷3', ui.formatRate(summarize(official.plateAppearances).avg), '1.000');
    check('練習試合：1試合・打席2', practice.games.length + '・' + summarize(practice.plateAppearances).pa, '1・2');
    check('練習試合：BB% ＝ 1÷2', ui.formatPercent(summarize(practice.plateAppearances).bbPct), '50.0%');
    check('未設定の試合は公式戦にも練習試合にも入らない',
      official.plateAppearances.concat(practice.plateAppearances).some(function (pa) { return pa.gameId === 'C'; }), false);
    check('全試合の本塁打には未設定の試合の分が入る', summarize(all.plateAppearances).hr, 1);
    check('集計してもデータは変わらない', JSON.stringify({ games: games, list: list }), before);
  })();

  // ----- 8. 試合がまったくないとき -----
  (function () {
    const none = App.stats.filterByCategory([], [], 'official');
    check('試合0：試合数0', none.games.length, 0);
    check('試合0：BABIP は「-」', ui.formatRate(summarize(none.plateAppearances).babip), '-');
  })();

  App.testResults = results;
})(window.App);
