/*
 * ② 試合の登録・編集画面
 *
 *   試合区分 … 公式戦 / 練習試合 / 未設定 から選ぶ
 *   球場     … 登録済みの球場をタップして選ぶか、新しい球場名を入力する
 *              （新しい球場は、試合を保存したときに一覧へ追加される）
 *   出場情報 … 出場区分（スタメン / 途中出場 / 出場なし / 未設定）、途中出場の形、打順、守備位置
 *              守備位置は「変更を追加」で試合途中の変更も順番に記録できる
 */
window.App = window.App || {};
App.screens = App.screens || {};

(function (App) {
  'use strict';

  const ui = App.ui;
  const MAX_VENUE_CHIPS = 12;

  function detailPath(gameId) {
    return '#/games/' + encodeURIComponent(gameId);
  }

  // 球場名を比べるための形（保存の窓口と同じ考え方：空白・全角半角・大文字小文字の違いは同じとみなす）
  function venueKey(name) {
    return String(name || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function categoryButtons(selected) {
    const options = App.GAME_CATEGORIES.map(function (c) { return { code: c.code, label: c.label }; })
      .concat([{ code: '', label: App.GAME_CATEGORY_UNSET_LABEL }]);
    return options.map(function (option) {
      const on = option.code === (selected || '');
      return '<button class="segmented__btn segmented__btn--' + (option.code || 'unset') + (on ? ' is-selected' : '') + '" ' +
        'type="button" role="radio" aria-checked="' + on + '" data-category="' + option.code + '">' + option.label + '</button>';
    }).join('');
  }

  // 「未設定」つきの切り替えボタン（出場区分・途中出場の形）
  function choiceButtons(options, selected, attr) {
    return options.concat([{ code: '', label: App.UNSET_LABEL }]).map(function (option) {
      const on = option.code === (selected || '');
      return '<button class="segmented__btn ' + (option.code ? 'segmented__btn--choice' : 'segmented__btn--unset') +
        (on ? ' is-selected' : '') + '" type="button" role="radio" aria-checked="' + on + '" ' +
        'data-' + attr + '="' + option.code + '">' + option.label + '</button>';
    }).join('');
  }

  // 切り替えボタンを押したときの見た目の更新。onChange に選んだ値（未設定なら null）を渡す
  function bindChoice(container, attr, onChange) {
    container.addEventListener('click', function (event) {
      const button = event.target.closest('.segmented__btn');
      if (!button) return;
      container.querySelectorAll('.segmented__btn').forEach(function (btn) {
        const on = btn === button;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-checked', String(on));
      });
      onChange(button.dataset[attr] || null);
    });
  }

  function orderOptions(selected) {
    return '<option value="">' + App.UNSET_LABEL + '</option>' +
      App.BATTING_ORDERS.map(function (n) {
        return '<option value="' + n + '"' + (n === selected ? ' selected' : '') + '>' + n + '番</option>';
      }).join('');
  }

  function positionRow(code, index) {
    return '<div class="position-row">' +
      '<span class="position-row__label">' + (index === 0 ? '守備位置' : '↓ 変更後') + '</span>' +
      '<select class="input select position-select" data-index="' + index + '" aria-label="' +
        (index === 0 ? '守備位置' : (index + '回目の守備位置の変更')) + '">' +
        '<option value="">' + App.UNSET_LABEL + '</option>' +
        App.POSITIONS.map(function (p) {
          return '<option value="' + p.code + '"' + (p.code === code ? ' selected' : '') + '>' + p.label + '</option>';
        }).join('') +
      '</select>' +
      (index > 0
        ? '<button class="position-row__remove" type="button" data-index="' + index + '" aria-label="この変更を削除">×</button>'
        : '') +
    '</div>';
  }

  App.screens.gameForm = {
    load: async function (params) {
      const venues = await App.store.listVenues();
      const empty = { game: null, venue: null, venues: venues, appearance: null, paCount: 0 };
      if (params.mode !== 'edit') return empty;
      const game = await App.store.getGame(params.gameId);
      if (!game) return empty;
      const plateAppearances = await App.store.listPlateAppearances({ gameId: game.id });
      const venue = await App.store.getVenue(game.venueId);
      const appearance = await App.store.getAppearance(game.id);
      return { game: game, venue: venue, venues: venues, appearance: appearance, paCount: plateAppearances.length };
    },

    header: function (params) {
      const isEdit = params.mode === 'edit';
      return {
        title: isEdit ? '試合を編集' : '試合を追加',
        back: isEdit ? detailPath(params.gameId) : '#/'
      };
    },

    render: function (main, params, data) {
      const isEdit = params.mode === 'edit';
      const game = data.game;

      if (isEdit && !game) {
        main.innerHTML = '<div class="empty">試合が見つかりませんでした。<br><a href="#/">ホームに戻る</a></div>';
        return;
      }

      const values = game || { date: ui.todayIso(), opponent: '', memo: '', category: null };
      const venueName = data.venue ? data.venue.name : '';
      const cancelHref = isEdit ? detailPath(game.id) : '#/';
      const venues = data.venues;
      const appearance = data.appearance || { status: null, subType: null, battingOrder: null, positions: [] };
      // 守備位置の欄（最初の1つは常に表示）
      let positions = appearance.positions.map(function (p) { return p.position; });
      if (!positions.length) positions = [''];

      const venueChips = venues.length
        ? '<div class="venue-chips" aria-label="登録済みの球場">' +
            '<span class="venue-chips__label">登録済みの球場（タップで選択）</span>' +
            venues.slice(0, MAX_VENUE_CHIPS).map(function (venue) {
              return '<button class="venue-chip" type="button" data-venue="' + ui.escapeHtml(venue.name) + '">' +
                ui.escapeHtml(venue.name) + '</button>';
            }).join('') +
          '</div>'
        : '';

      main.innerHTML =
        '<form class="card form" id="game-form" novalidate>' +
          '<div class="field">' +
            '<label class="field__label" for="game-date">日付</label>' +
            '<input class="input" type="date" id="game-date" name="date" required value="' + ui.escapeHtml(values.date) + '">' +
            '<p class="field__error" id="date-error" hidden>日付を選んでください</p>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field__label" for="game-opponent">対戦相手</label>' +
            '<input class="input" type="text" id="game-opponent" name="opponent" required maxlength="40" ' +
              'placeholder="例：青葉クラブ" autocomplete="off" value="' + ui.escapeHtml(values.opponent) + '">' +
            '<p class="field__error" id="opponent-error" hidden>対戦相手を入力してください</p>' +
          '</div>' +
          '<div class="field">' +
            '<span class="field__label" id="category-label">試合区分</span>' +
            '<div class="segmented" role="radiogroup" aria-labelledby="category-label">' + categoryButtons(values.category) + '</div>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field__label" for="game-venue">球場<span class="field__optional">任意</span></label>' +
            '<input class="input" type="text" id="game-venue" name="venue" maxlength="40" list="venue-options" ' +
              'placeholder="例：市民球場" autocomplete="off" value="' + ui.escapeHtml(venueName) + '">' +
            '<datalist id="venue-options">' +
              venues.map(function (venue) { return '<option value="' + ui.escapeHtml(venue.name) + '"></option>'; }).join('') +
            '</datalist>' +
            venueChips +
            '<p class="field__hint" id="venue-hint"></p>' +
          '</div>' +
          '<div class="form__section" id="appearance-section">' +
            '<h3 class="form__section-title">出場情報<span class="field__optional">任意</span></h3>' +
            '<div class="field">' +
              '<span class="field__label" id="status-label">出場区分</span>' +
              '<div class="segmented segmented--4" id="status-picker" role="radiogroup" aria-labelledby="status-label">' +
                choiceButtons(App.APPEARANCE_STATUSES, appearance.status, 'status') +
              '</div>' +
            '</div>' +
            '<div class="field" id="subtype-field">' +
              '<span class="field__label" id="subtype-label">出場の形</span>' +
              '<div class="segmented segmented--4" id="subtype-picker" role="radiogroup" aria-labelledby="subtype-label">' +
                choiceButtons(App.SUB_TYPES, appearance.subType, 'subtype') +
              '</div>' +
            '</div>' +
            '<div id="played-fields">' +
              '<div class="field">' +
                '<label class="field__label" for="batting-order" id="order-label">打順</label>' +
                '<select class="input select" id="batting-order">' + orderOptions(appearance.battingOrder) + '</select>' +
              '</div>' +
              '<div class="field">' +
                '<div class="position-list" id="position-list"></div>' +
                '<button class="btn btn--ghost btn--small" type="button" id="add-position">＋ 守備位置の変更を追加</button>' +
                '<p class="field__hint">例：代打のあと一塁の守備についたら「途中出場・代打」を選び、守備位置を「一塁手」に。' +
                  '試合の途中で守備位置が変わったら「変更を追加」で順番に記録できます。</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="field">' +
            '<label class="field__label" for="game-memo">メモ<span class="field__optional">任意</span></label>' +
            '<textarea class="input textarea" id="game-memo" name="memo" rows="3" maxlength="200" ' +
              'placeholder="例：天気、打順など">' + ui.escapeHtml(values.memo) + '</textarea>' +
          '</div>' +
          '<p class="form__error" id="form-error" role="alert" hidden></p>' +
          '<div class="form__actions">' +
            '<button class="btn btn--primary btn--block btn--lg" type="submit" id="save-game">' +
              (isEdit ? '変更を保存する' : 'この試合を登録する') +
            '</button>' +
            '<a class="btn btn--ghost btn--block" href="' + cancelHref + '">キャンセル</a>' +
          '</div>' +
        '</form>' +
        (isEdit
          ? '<div class="danger-zone">' +
              '<button class="btn btn--danger btn--block" type="button" id="delete-game">この試合を削除</button>' +
            '</div>'
          : '');

      const form = main.querySelector('#game-form');
      const dateInput = form.querySelector('#game-date');
      const opponentInput = form.querySelector('#game-opponent');
      const venueInput = form.querySelector('#game-venue');
      const venueHint = form.querySelector('#venue-hint');
      const memoInput = form.querySelector('#game-memo');
      const dateError = form.querySelector('#date-error');
      const opponentError = form.querySelector('#opponent-error');
      const formError = form.querySelector('#form-error');
      const saveButton = form.querySelector('#save-game');

      // 入力し直したらエラー表示を消す
      dateInput.addEventListener('input', function () { dateError.hidden = true; });
      opponentInput.addEventListener('input', function () { opponentError.hidden = true; });

      // ----- 試合区分 -----
      let category = values.category || null;
      form.querySelector('.segmented').addEventListener('click', function (event) {
        const button = event.target.closest('.segmented__btn');
        if (!button) return;
        category = button.dataset.category || null;
        form.querySelectorAll('.segmented__btn').forEach(function (btn) {
          const on = btn === button;
          btn.classList.toggle('is-selected', on);
          btn.setAttribute('aria-checked', String(on));
        });
      });

      // ----- 球場 -----
      const knownVenues = {};
      venues.forEach(function (venue) { knownVenues[venueKey(venue.name)] = venue.name; });

      // 入力中の球場名に合わせて、ボタンの選択状態と説明を更新する
      function syncVenue() {
        const key = venueKey(venueInput.value);
        form.querySelectorAll('.venue-chip').forEach(function (chip) {
          const on = key !== '' && venueKey(chip.dataset.venue) === key;
          chip.classList.toggle('is-selected', on);
          chip.setAttribute('aria-pressed', String(on));
        });
        if (key === '') {
          venueHint.textContent = venues.length ? '' : '球場名を入力すると、次からは一覧から選べるようになります。';
          venueHint.classList.remove('is-new');
        } else if (knownVenues[key]) {
          venueHint.textContent = '';
          venueHint.classList.remove('is-new');
        } else {
          venueHint.textContent = '「' + venueInput.value.trim() + '」を新しい球場として登録します';
          venueHint.classList.add('is-new');
        }
      }

      const chips = form.querySelector('.venue-chips');
      if (chips) {
        chips.addEventListener('click', function (event) {
          const chip = event.target.closest('.venue-chip');
          if (!chip) return;
          // 選択中のボタンをもう一度押すと、球場なしに戻す
          venueInput.value = chip.classList.contains('is-selected') ? '' : chip.dataset.venue;
          syncVenue();
        });
      }
      venueInput.addEventListener('input', syncVenue);
      syncVenue();

      // ----- 出場情報 -----
      let status = appearance.status || null;
      let subType = appearance.subType || null;
      const subtypeField = form.querySelector('#subtype-field');
      const playedFields = form.querySelector('#played-fields');
      const orderLabel = form.querySelector('#order-label');
      const orderSelect = form.querySelector('#batting-order');
      const positionList = form.querySelector('#position-list');
      const addPositionButton = form.querySelector('#add-position');

      // 出場区分に合わせて、必要な欄だけを見せる（隠した欄の入力は消さずに残しておく）
      function syncAppearance() {
        subtypeField.hidden = status !== 'sub';
        playedFields.hidden = status !== 'starter' && status !== 'sub';
        orderLabel.textContent = status === 'sub' ? '打順（途中から入った打順）' : '打順（先発打順）';
      }

      function renderPositions() {
        positionList.innerHTML = positions.map(positionRow).join('');
        addPositionButton.hidden = positions.length >= App.MAX_POSITION_CHANGES;
      }

      positionList.addEventListener('change', function (event) {
        const select = event.target.closest('.position-select');
        if (select) positions[Number(select.dataset.index)] = select.value;
      });
      positionList.addEventListener('click', function (event) {
        const remove = event.target.closest('.position-row__remove');
        if (!remove) return;
        positions.splice(Number(remove.dataset.index), 1);
        renderPositions();
      });
      addPositionButton.addEventListener('click', function () {
        positions.push('');
        renderPositions();
        const selects = positionList.querySelectorAll('.position-select');
        selects[selects.length - 1].focus();
      });

      bindChoice(form.querySelector('#status-picker'), 'status', function (value) {
        status = value;
        syncAppearance();
      });
      bindChoice(form.querySelector('#subtype-picker'), 'subtype', function (value) { subType = value; });
      renderPositions();
      syncAppearance();

      let saving = false;

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        if (saving) return; // 二重に押しても1回だけ保存する

        const input = {
          date: dateInput.value,
          opponent: opponentInput.value.trim(),
          memo: memoInput.value.trim(),
          category: category,
          venueName: venueInput.value.trim(),
          appearance: {
            status: status,
            subType: subType,
            battingOrder: orderSelect.value ? Number(orderSelect.value) : null,
            positions: positions.filter(Boolean).map(function (code) { return { position: code }; })
          }
        };

        dateError.hidden = input.date !== '';
        opponentError.hidden = input.opponent !== '';
        formError.hidden = true;
        if (!input.date) {
          dateInput.focus();
          return;
        }
        if (!input.opponent) {
          opponentInput.focus();
          return;
        }

        saving = true;
        saveButton.disabled = true;
        try {
          if (isEdit) {
            await App.store.updateGame(game.id, input);
            ui.toast('試合の情報を保存しました');
            location.hash = detailPath(game.id);
          } else {
            const created = await App.store.createGame(input);
            ui.toast('試合を登録しました');
            // 登録したら、そのまま打席を入力できる試合の画面へ
            location.hash = detailPath(created.id);
          }
        } catch (error) {
          formError.textContent = error.message;
          formError.hidden = false;
          saving = false;
          saveButton.disabled = false;
        }
      });

      const deleteButton = main.querySelector('#delete-game');
      if (deleteButton) {
        deleteButton.addEventListener('click', async function () {
          const message = 'vs ' + game.opponent + '（' + ui.formatDateShort(game.date) + '）を削除します。' +
            (data.paCount > 0 ? '\nこの試合の打席の記録（' + data.paCount + '打席）も削除されます。' : '') +
            '\n元に戻せません。よろしいですか？';
          if (!window.confirm(message)) return;

          deleteButton.disabled = true;
          try {
            await App.store.deleteGame(game.id);
            ui.toast('試合を削除しました');
            location.hash = '#/';
          } catch (error) {
            ui.toast(error.message);
            deleteButton.disabled = false;
          }
        });
      }
    }
  };
})(window.App);
