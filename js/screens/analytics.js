/*
 * ⑤ 打撃分析（BATTER ANALYTICS）
 *   上の「全試合・公式戦・練習試合」で対象を切り替えると、画面のすべての数字が切り替わる。
 *   計算式は js/stats.js にあります。この画面はデータを読むだけで、変更はしません。
 */
window.App = window.App || {};
App.screens = App.screens || {};

(function (App) {
  'use strict';

  const ui = App.ui;

  // 選んでいる切り替え（ほかの画面へ移動して戻ってきても同じものを表示する）
  let currentFilter = 'all';

  // 分析の5指標（value … 表示する文字 / parts … 計算のもとになった数字）
  const METRICS = [
    {
      key: 'bbPct', label: 'BB%', name: '四球率', format: 'percent',
      parts: function (s) { return s.bb + ' / ' + s.pa; },
      explain: '打席のうち四球の割合。選球眼の目安。死球は含みません。',
      formula: '四球 ÷ 打席'
    },
    {
      key: 'kPct', label: 'K%', name: '三振率', format: 'percent',
      parts: function (s) { return s.so + ' / ' + s.pa; },
      explain: '打席のうち三振の割合。低いほど三振が少ない。',
      formula: '三振 ÷ 打席'
    },
    {
      key: 'iso', label: 'ISO', name: '長打力', format: 'rate',
      parts: function (s) { return (s.tb - s.h) + ' / ' + s.ab; },
      explain: '長打率から打率を引いた値。単打を除いた「長打の力」を表します。',
      formula: '長打率 − 打率 ＝ (塁打 − 安打) ÷ 打数'
    },
    {
      key: 'babip', label: 'BABIP', name: 'インプレー打率', format: 'rate',
      parts: function (s) { return (s.h - s.hr) + ' / ' + (s.ab - s.so - s.hr + s.sf); },
      explain: '前に飛んだ打球（本塁打を除く）がヒットになった割合。失策・野選での出塁はアウトとして数えます。',
      formula: '(安打 − 本塁打) ÷ (打数 − 三振 − 本塁打 ＋ 犠飛)'
    },
    {
      key: 'xbhPct', label: 'XBH%', name: '長打割合', format: 'percent',
      parts: function (s) { return s.xbh + ' / ' + s.h; },
      explain: '安打のうち長打（二塁打・三塁打・本塁打）の割合。',
      formula: '(二塁打 ＋ 三塁打 ＋ 本塁打) ÷ 安打'
    }
  ];

  const BASIC_RATES = [
    { key: 'avg', label: '打率' },
    { key: 'obp', label: '出塁率' },
    { key: 'slg', label: '長打率' },
    { key: 'ops', label: 'OPS' }
  ];

  function formatValue(metric, summary) {
    const value = summary[metric.key];
    return metric.format === 'percent' ? ui.formatPercent(value) : ui.formatRate(value);
  }

  function filterLabel(code) {
    return App.ANALYTICS_FILTERS.find(function (f) { return f.code === code; }).label;
  }

  function filterButtons() {
    return App.ANALYTICS_FILTERS.map(function (filter) {
      const selected = filter.code === currentFilter;
      return '<button type="button" class="segmented__btn analytics-filter__btn analytics-filter__btn--' + filter.code +
        (selected ? ' is-selected' : '') + '" data-filter="' + filter.code + '" aria-pressed="' + selected + '">' +
        filter.label + '</button>';
    }).join('');
  }

  function metricTile(metric, summary) {
    return (
      '<div class="metric" data-metric="' + metric.key + '">' +
        '<span class="metric__label">' + metric.label + '</span>' +
        '<span class="metric__name">' + metric.name + '</span>' +
        '<span class="metric__value">' + formatValue(metric, summary) + '</span>' +
        '<span class="metric__parts">' + metric.parts(summary) + '</span>' +
      '</div>'
    );
  }

  function board(group) {
    const s = group.summary;
    return (
      '<section class="scoreboard analytics-board" aria-label="打撃分析の指標">' +
        '<div class="scoreboard__head">' +
          '<span class="scoreboard__title">BATTER ANALYTICS</span>' +
          '<span class="analytics-board__filter analytics-board__filter--' + group.code + '">' + filterLabel(group.code) + '</span>' +
        '</div>' +
        '<div class="metric-grid">' +
          METRICS.map(function (metric) { return metricTile(metric, s); }).join('') +
          '<div class="metric metric--sample">' +
            '<span class="metric__label">SAMPLE</span>' +
            '<span class="metric__name">集計の対象</span>' +
            '<span class="metric__sample"><b>' + group.games.length + '</b>試合</span>' +
            '<span class="metric__sample"><b>' + s.pa + '</b>打席</span>' +
          '</div>' +
        '</div>' +
      '</section>'
    );
  }

  function basicRates(summary) {
    return (
      '<section class="card analytics-basic" aria-label="基本の成績">' +
        '<h2 class="analytics-card__title">基本の成績</h2>' +
        '<div class="analytics-rates">' +
          BASIC_RATES.map(function (rate) {
            return '<div class="analytics-rate" data-rate="' + rate.key + '">' +
              '<span class="analytics-rate__label">' + rate.label + '</span>' +
              '<span class="analytics-rate__value">' + ui.formatRate(summary[rate.key]) + '</span>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="analytics-basic__line">' + ui.statLine(summary) + '</div>' +
        '<div class="analytics-basic__counts">' + ui.keyCounts(summary) + '</div>' +
      '</section>'
    );
  }

  // 全試合・公式戦・練習試合を横に並べて比べる表（今選んでいる列を強調）
  function compareTable(groups) {
    const rows = BASIC_RATES.map(function (rate) {
      return { label: rate.label, value: function (s) { return ui.formatRate(s[rate.key]); } };
    }).concat(METRICS.map(function (metric) {
      return { label: metric.label, value: function (s) { return formatValue(metric, s); } };
    })).concat([
      { label: '打席', value: function (s) { return String(s.pa); } }
    ]);

    function cellClass(code) {
      return code === currentFilter ? ' class="is-current"' : '';
    }

    return (
      '<section class="card analytics-compare" aria-label="区分別の比較">' +
        '<h2 class="analytics-card__title">区分別の比較</h2>' +
        '<div class="analytics-compare__scroll">' +
          '<table class="compare-table">' +
            '<thead><tr><th scope="col"></th>' +
              groups.map(function (g) { return '<th scope="col"' + cellClass(g.code) + '>' + filterLabel(g.code) + '</th>'; }).join('') +
            '</tr></thead>' +
            '<tbody>' +
              rows.map(function (row) {
                return '<tr><th scope="row">' + row.label + '</th>' +
                  groups.map(function (g) { return '<td' + cellClass(g.code) + '>' + row.value(g.summary) + '</td>'; }).join('') +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</section>'
    );
  }

  function guide() {
    return (
      '<details class="card stat-details analytics-guide">' +
        '<summary>指標の見方と計算方法</summary>' +
        '<dl class="guide-list">' +
          METRICS.map(function (metric) {
            return '<div class="guide-item">' +
              '<dt><span class="guide-item__label">' + metric.label + '</span>' + metric.name + '</dt>' +
              '<dd>' + metric.explain + '<br><span class="guide-item__formula">' + metric.formula + '</span></dd>' +
            '</div>';
          }).join('') +
        '</dl>' +
        '<p class="stat-note">' +
          '％の指標は小数第2位、そのほかは小数第4位を四捨五入して表示します。<br>' +
          '計算できないとき（分母が0のとき）は「-」と表示します。<br>' +
          '「出場なし」の試合や打席を記録していない試合は、打席の数に影響しません。<br>' +
          '試合区分が「未設定」の試合は「全試合」にだけ含まれます。' +
        '</p>' +
      '</details>'
    );
  }

  function notice(group) {
    if (group.summary.pa > 0) return '';
    const text = group.code === 'all'
      ? 'まだ打席が記録されていません。試合の画面で打席を記録すると、ここに分析が表示されます。'
      : filterLabel(group.code) + 'の打席はまだ記録されていません。';
    return '<p class="analytics-notice">' + text + '</p>';
  }

  function unsetNote(data) {
    if (currentFilter === 'all' || !data.unsetGames) return '';
    return '<p class="analytics-hint">試合区分が「未設定」の試合（' + data.unsetGames + '試合）は含まれていません。</p>';
  }

  function renderContent(container, data) {
    const group = data.groups.find(function (g) { return g.code === currentFilter; });
    container.innerHTML =
      unsetNote(data) +
      board(group) +
      notice(group) +
      basicRates(group.summary) +
      compareTable(data.groups) +
      ui.detailStats(group.summary, '集計のもとになった数字') +
      guide();
  }

  App.screens.analytics = {
    load: async function () {
      const games = await App.store.listGames();
      const plateAppearances = await App.store.listPlateAppearances();
      return {
        unsetGames: games.filter(function (game) { return !App.getGameCategory(game.category); }).length,
        groups: App.ANALYTICS_FILTERS.map(function (filter) {
          const target = App.stats.filterByCategory(games, plateAppearances, filter.code);
          return { code: filter.code, games: target.games, summary: App.stats.summarize(target.plateAppearances) };
        })
      };
    },

    header: function () {
      return { back: '#/', title: '打撃分析', subtitle: 'BATTER ANALYTICS' };
    },

    render: function (main, params, data) {
      main.innerHTML =
        '<div class="analytics-filter" role="group" aria-label="集計する試合">' +
          '<div class="segmented analytics-filter__buttons">' + filterButtons() + '</div>' +
        '</div>' +
        '<div id="analytics-content"></div>';

      const content = main.querySelector('#analytics-content');
      const buttons = main.querySelector('.analytics-filter__buttons');
      renderContent(content, data);

      // 切り替え：読み込み済みの集計結果を使うので、タップするとすぐに切り替わる
      buttons.addEventListener('click', function (event) {
        const button = event.target.closest('[data-filter]');
        if (!button || button.dataset.filter === currentFilter) return;
        currentFilter = button.dataset.filter;
        buttons.innerHTML = filterButtons();
        const details = content.querySelectorAll('details');
        const openStates = Array.prototype.map.call(details, function (d) { return d.open; });
        renderContent(content, data);
        // 開いていた「詳しい数字」「指標の見方」は開いたままにする
        content.querySelectorAll('details').forEach(function (d, i) { d.open = Boolean(openStates[i]); });
      });
    }
  };
})(window.App);
