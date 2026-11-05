/*
 * ① ホーム画面：通算成績と試合一覧
 */
window.App = window.App || {};
App.screens = App.screens || {};

(function (App) {
  'use strict';

  const ui = App.ui;

  function rateCell(label, value) {
    return (
      '<div class="rate">' +
        '<span class="rate__label">' + label + '</span>' +
        '<span class="rate__value">' + ui.formatRate(value) + '</span>' +
      '</div>'
    );
  }

  // 打席結果を1文字のマークで並べる（例：安 二 振 四）
  function paMarks(plateAppearances) {
    if (!plateAppearances.length) return '<span class="pa-marks__empty">打席未入力</span>';
    return plateAppearances.map(function (pa) {
      const type = App.getResultType(pa.result);
      return '<span class="pa-mark pa-mark--' + type.category + '" title="' + type.label + '">' + type.short + '</span>';
    }).join('');
  }

  function gameCard(item) {
    const game = item.game;
    return (
      '<li>' +
        '<a class="game-card" href="#/games/' + encodeURIComponent(game.id) + '">' +
          '<div class="game-card__date' + (game.category === 'official' ? ' game-card__date--official' : '') + '">' +
            '<span class="game-card__md">' + ui.formatDateShort(game.date) + '</span>' +
            '<span class="game-card__dow">' + ui.weekday(game.date) + '</span>' +
          '</div>' +
          '<div class="game-card__body">' +
            '<div class="game-card__title">' +
              '<span class="game-card__opponent">vs ' + ui.escapeHtml(game.opponent) + '</span>' +
              ui.categoryPill(game.category) +
            '</div>' +
            '<div class="game-card__line">' + ui.statLine(item.summary) + '</div>' +
            '<div class="pa-marks">' + paMarks(item.plateAppearances) + '</div>' +
          '</div>' +
          '<span class="game-card__chevron">' + ui.icons.chevron + '</span>' +
        '</a>' +
      '</li>'
    );
  }

  App.screens.home = {
    load: async function () {
      const games = await App.store.listGames();
      const plateAppearances = await App.store.listPlateAppearances();

      const byGame = {};
      plateAppearances.forEach(function (pa) {
        (byGame[pa.gameId] = byGame[pa.gameId] || []).push(pa);
      });

      return {
        career: App.stats.summarize(plateAppearances),
        items: games.map(function (game) {
          const list = byGame[game.id] || [];
          return { game: game, plateAppearances: list, summary: App.stats.summarize(list) };
        })
      };
    },

    header: function () {
      return {
        brand: true,
        actions: [{ href: '#/settings', icon: ui.icons.gear, label: '設定' }]
      };
    },

    render: function (main, params, data) {
      const career = data.career;
      const items = data.items;

      const gameList = items.length
        ? '<ul class="game-list">' + items.map(gameCard).join('') + '</ul>'
        : '<div class="empty">まだ試合がありません。<br>下のボタンから最初の試合を追加しましょう。</div>';

      main.innerHTML =
        '<section class="scoreboard" aria-label="通算成績">' +
          '<div class="scoreboard__head">' +
            '<span class="scoreboard__title">通算成績</span>' +
            '<span class="scoreboard__games">' + items.length + '試合</span>' +
          '</div>' +
          '<div class="scoreboard__rates">' +
            rateCell('打率', career.avg) +
            rateCell('出塁率', career.obp) +
            rateCell('長打率', career.slg) +
            rateCell('OPS', career.ops) +
          '</div>' +
          '<div class="scoreboard__line">' + ui.statLine(career) + '</div>' +
          '<div class="scoreboard__counts">' + ui.keyCounts(career) + '</div>' +
        '</section>' +

        '<a class="analytics-link" href="#/analytics">' +
          '<span class="analytics-link__icon">' + ui.icons.chart + '</span>' +
          '<span class="analytics-link__text">' +
            '<span class="analytics-link__title">BATTER ANALYTICS</span>' +
            '<span class="analytics-link__sub">打撃分析　BB%・K%・ISO・BABIP・XBH%</span>' +
          '</span>' +
          '<span class="analytics-link__chevron">' + ui.icons.chevron + '</span>' +
        '</a>' +

        ui.detailStats(career, '通算の詳しい成績を見る') +

        '<section class="section">' +
          '<h2 class="section-title">試合一覧<span class="section-title__count">' + items.length + '試合</span></h2>' +
          gameList +
        '</section>' +

        '<div class="bottom-bar">' +
          '<a class="btn btn--primary btn--block btn--lg" href="#/games/new">＋ 試合を追加</a>' +
        '</div>';
    }
  };
})(window.App);
