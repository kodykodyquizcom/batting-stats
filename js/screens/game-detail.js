/*
 * ③ 試合の画面：この試合の成績・打席の記録・打席結果の入力
 *
 *   打席を記録する … 打点を選んで（なければ0のまま）、結果のボタンを押す
 *   打席を直す     … 打席の記録をタップすると、修正・削除のパネルが開く
 */
window.App = window.App || {};
App.screens = App.screens || {};

(function (App) {
  'use strict';

  const ui = App.ui;

  function miniRate(label, value) {
    return (
      '<div class="mini-rate">' +
        '<span class="mini-rate__label">' + label + '</span>' +
        '<span class="mini-rate__value">' + ui.formatRate(value) + '</span>' +
      '</div>'
    );
  }

  function rbiText(rbi) {
    return rbi > 0 ? '（' + rbi + '打点）' : '';
  }

  function paItem(pa, index) {
    const type = App.getResultType(pa.result);
    return (
      '<li>' +
        '<button class="pa-item" type="button" data-pa-index="' + index + '" data-pa-id="' + ui.escapeHtml(pa.id) + '" ' +
          'aria-label="第' + (index + 1) + '打席 ' + type.label + rbiText(pa.rbi) + ' を修正">' +
          '<span class="pa-item__no">第' + (index + 1) + '打席</span>' +
          '<span class="chip chip--' + type.category + '">' + type.label + '</span>' +
          '<span class="pa-item__rbi">' + (pa.rbi > 0 ? pa.rbi + '打点' : '') + '</span>' +
          '<span class="pa-item__chevron">' + ui.icons.chevron + '</span>' +
        '</button>' +
      '</li>'
    );
  }

  // 打点ボタン（0〜4）。selected の数字が選ばれた状態になる
  function rbiButtons(selected) {
    return App.RBI_OPTIONS.map(function (n) {
      const on = n === selected;
      return '<button class="rbi-btn' + (on ? ' is-selected' : '') + '" type="button" ' +
        'role="radio" aria-checked="' + on + '" data-rbi="' + n + '">' + n + '</button>';
    }).join('');
  }

  // 結果ボタン。selected を渡すと、その結果が選ばれた状態になる（修正パネル用）
  function resultButtons(selected) {
    return App.RESULT_TYPES.map(function (type) {
      const on = type.code === selected;
      return '<button class="result-btn result-btn--' + type.category + (on ? ' is-selected' : '') + '" type="button" ' +
        (selected ? 'aria-pressed="' + on + '" ' : '') +
        'data-result="' + type.code + '">' + type.label + '</button>';
    }).join('');
  }

  // 打点ボタンを押したときの切り替え。value() で今の打点を返す
  function createRbiPicker(container, initial) {
    let value = initial;
    container.addEventListener('click', function (event) {
      const button = event.target.closest('.rbi-btn');
      if (!button) return;
      value = Number(button.dataset.rbi);
      container.querySelectorAll('.rbi-btn').forEach(function (btn) {
        const on = btn === button;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-checked', String(on));
      });
    });
    return { value: function () { return value; } };
  }

  // 記録した打席を取り消す（トーストの「取り消し」ボタン）
  async function undoCreate(paId) {
    try {
      await App.store.deletePlateAppearance(paId);
      ui.toast('記録を取り消しました');
    } catch (error) {
      ui.toast(error.message);
    }
    App.refresh();
  }

  // 打席の修正・削除パネル
  function openEditSheet(pa, no) {
    const sheet = ui.openSheet({
      title: '第' + no + '打席を修正',
      body:
        '<div class="rbi-picker">' +
          '<span class="rbi-picker__label">打点</span>' +
          '<div class="rbi-picker__options" role="radiogroup" aria-label="打点">' + rbiButtons(pa.rbi) + '</div>' +
        '</div>' +
        '<div class="result-grid has-selection">' + resultButtons(pa.result) + '</div>' +
        '<div class="sheet__actions">' +
          '<button class="btn btn--primary btn--block btn--lg" type="button" data-action="save">変更を保存する</button>' +
          '<button class="btn btn--danger btn--block" type="button" data-action="delete">この打席を削除</button>' +
        '</div>'
    });

    const rbiPicker = createRbiPicker(sheet.querySelector('.rbi-picker__options'), pa.rbi);
    let result = pa.result;
    let busy = false;

    sheet.querySelector('.result-grid').addEventListener('click', function (event) {
      const button = event.target.closest('.result-btn');
      if (!button) return;
      result = button.dataset.result;
      sheet.querySelectorAll('.result-btn').forEach(function (btn) {
        const on = btn === button;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-pressed', String(on));
      });
    });

    sheet.querySelector('[data-action="save"]').addEventListener('click', async function () {
      if (busy) return;
      busy = true;
      try {
        await App.store.updatePlateAppearance(pa.id, { result: result, rbi: rbiPicker.value() });
        ui.closeSheet();
        await App.refresh({ highlightId: pa.id });
        ui.toast('第' + no + '打席を修正しました');
      } catch (error) {
        ui.toast(error.message);
        busy = false;
      }
    });

    sheet.querySelector('[data-action="delete"]').addEventListener('click', async function () {
      if (busy) return;
      const type = App.getResultType(pa.result);
      if (!window.confirm('第' + no + '打席（' + type.label + rbiText(pa.rbi) + '）を削除します。\n元に戻せません。よろしいですか？')) return;
      busy = true;
      try {
        await App.store.deletePlateAppearance(pa.id);
        ui.closeSheet();
        await App.refresh();
        ui.toast('第' + no + '打席を削除しました');
      } catch (error) {
        ui.toast(error.message);
        busy = false;
      }
    });
  }

  App.screens.gameDetail = {
    load: async function (params) {
      const game = await App.store.getGame(params.gameId);
      if (!game) return null;
      const plateAppearances = await App.store.listPlateAppearances({ gameId: game.id });
      return { game: game, plateAppearances: plateAppearances, summary: App.stats.summarize(plateAppearances) };
    },

    header: function (params, data) {
      if (!data) return { title: '試合が見つかりません', back: '#/' };
      const game = data.game;
      return {
        title: 'vs ' + game.opponent,
        subtitle: ui.formatDateShort(game.date) + '（' + ui.weekday(game.date) + '）',
        back: '#/',
        actions: [{ href: '#/games/' + encodeURIComponent(game.id) + '/edit', label: '編集', text: true }]
      };
    },

    render: function (main, params, data, options) {
      if (!data) {
        main.innerHTML = '<div class="empty">試合が見つかりませんでした。<br><a href="#/">ホームに戻る</a></div>';
        return;
      }

      const game = data.game;
      const plateAppearances = data.plateAppearances;
      const s = data.summary;
      const paList = plateAppearances.length
        ? '<ol class="pa-list">' + plateAppearances.map(paItem).join('') + '</ol>' +
          '<p class="pa-list__hint">打席をタップすると、修正・削除できます</p>'
        : '<div class="empty empty--compact">まだ打席がありません。<br>下のボタンで打席結果を入力しましょう。</div>';

      main.classList.add('has-input-panel');
      main.innerHTML =
        '<section class="game-summary">' +
          '<div class="game-summary__date">' + ui.formatDateLong(game.date) + '</div>' +
          '<div class="game-summary__line">' + ui.statLine(s) + '</div>' +
          '<div class="game-summary__counts">' + ui.keyCounts(s) + '</div>' +
          '<div class="game-summary__rates">' +
            miniRate('打率', s.avg) +
            miniRate('出塁率', s.obp) +
            miniRate('長打率', s.slg) +
            miniRate('OPS', s.ops) +
          '</div>' +
          (game.memo ? '<p class="game-summary__memo">' + ui.escapeHtml(game.memo) + '</p>' : '') +
        '</section>' +

        '<section class="section">' +
          '<h2 class="section-title">打席の記録</h2>' +
          paList +
        '</section>' +

        '<div class="section">' + ui.detailStats(s, 'この試合の詳しい成績を見る') + '</div>' +

        '<div class="input-panel" aria-label="打席結果の入力">' +
          '<div class="rbi-picker">' +
            '<span class="rbi-picker__label">打点</span>' +
            '<div class="rbi-picker__options" role="radiogroup" aria-label="打点">' + rbiButtons(0) + '</div>' +
          '</div>' +
          '<div class="result-grid">' + resultButtons(null) + '</div>' +
        '</div>';

      // ----- 打席を記録する -----
      const rbiPicker = createRbiPicker(main.querySelector('.input-panel .rbi-picker__options'), 0);
      let saving = false;

      main.querySelector('.input-panel .result-grid').addEventListener('click', async function (event) {
        const button = event.target.closest('.result-btn');
        if (!button || saving) return; // 保存中の連打は無視する
        saving = true;
        const no = plateAppearances.length + 1;
        try {
          const created = await App.store.createPlateAppearance({
            gameId: game.id,
            result: button.dataset.result,
            rbi: rbiPicker.value()
          });
          const type = App.getResultType(created.result);
          await App.refresh({ highlightId: created.id }); // 画面を描き直す（打点は0に戻る）
          ui.toast('第' + no + '打席 ' + type.label + rbiText(created.rbi) + 'を記録', {
            actionLabel: '取り消し',
            onAction: function () { undoCreate(created.id); }
          });
        } catch (error) {
          ui.toast(error.message);
          saving = false;
        }
      });

      // ----- 打席を直す -----
      const list = main.querySelector('.pa-list');
      if (list) {
        list.addEventListener('click', function (event) {
          const item = event.target.closest('.pa-item');
          if (!item) return;
          const index = Number(item.dataset.paIndex);
          openEditSheet(plateAppearances[index], index + 1);
        });
      }

      // 記録・修正した打席を目立たせて、見える位置までスクロール
      if (options && options.highlightId) {
        const target = main.querySelector('[data-pa-id="' + options.highlightId + '"]');
        if (target) {
          target.classList.add('is-new');
          requestAnimationFrame(function () {
            target.scrollIntoView({ block: 'nearest' });
          });
        }
      }
    }
  };
})(window.App);
