/*
 * ③ 試合の画面：この試合の成績・出場情報・打席の記録・打席結果の入力
 *
 *   打席を記録する … 画面下の「＋ 第N打席を記録」でパネルを開く
 *                    安打・四死球・三振などは、結果のボタンを押すとすぐ記録してパネルを閉じる
 *                    アウトなど打球が前に飛んだ結果は、打球の種類・処理した守備位置を選んで（任意）
 *                    「この内容で記録する」を押す
 *                    打席の状況（イニング・アウト・走者）は、必要なときだけ開いて入力する
 *                    パネルを閉じても、入力途中の内容は残る（記録すると消える）
 *   打席を直す     … 打席の記録をタップすると、修正・削除のパネルが開く
 */
window.App = window.App || {};
App.screens = App.screens || {};

(function (App) {
  'use strict';

  const ui = App.ui;

  // 試合ごとの入力途中の内容（パネルを閉じても残す）
  const drafts = {};
  // 「打席の状況」を開いていたかどうか（次にパネルを開いたときも同じにする）
  let situationOpen = false;

  function emptySituation() {
    return { outs: null, runners: null, inning: null, half: null };
  }

  function emptyDraft() {
    return { rbi: 0, result: null, battedBall: { type: null, fielder: null }, situation: emptySituation() };
  }

  function hasSituation(situation) {
    return situation.outs !== null || situation.runners !== null || situation.inning !== null || situation.half !== null;
  }

  function isDraftDirty(draft) {
    return draft.rbi !== 0 || draft.result !== null || draft.battedBall.type !== null ||
      draft.battedBall.fielder !== null || hasSituation(draft.situation);
  }

  function isInPlay(resultCode) {
    const type = App.getResultType(resultCode);
    return Boolean(type && type.inPlay);
  }

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
    const label = ui.plateAppearanceLabel(pa);
    const situation = ui.situationText(pa.situation);
    return (
      '<li>' +
        '<button class="pa-item" type="button" data-pa-index="' + index + '" data-pa-id="' + ui.escapeHtml(pa.id) + '" ' +
          'aria-label="第' + (index + 1) + '打席 ' + label + rbiText(pa.rbi) + ' を修正">' +
          '<span class="pa-item__no">第' + (index + 1) + '打席</span>' +
          '<span class="pa-item__main">' +
            '<span class="chip chip--' + type.category + '">' + label + '</span>' +
            (situation ? '<span class="pa-item__situation">' + situation + '</span>' : '') +
          '</span>' +
          '<span class="pa-item__rbi">' + (pa.rbi > 0 ? pa.rbi + '打点' : '') + '</span>' +
          '<span class="pa-item__chevron">' + ui.icons.chevron + '</span>' +
        '</button>' +
      '</li>'
    );
  }

  // 出場情報の表示（試合の成績の上）
  function appearanceHtml(appearance) {
    const text = ui.appearanceText(appearance);
    if (!text) return '<span class="game-tag game-tag--unset">出場 ' + App.UNSET_LABEL + '</span>';
    const details = [text.order, text.positions].filter(Boolean).join('・');
    return '<span class="game-tag game-tag--appearance">' + text.status + '</span>' +
      (details ? '<span class="game-summary__appearance-detail">' + details + '</span>' : '');
  }

  // ---------- 打席入力パネルの部品 ----------

  // 打点ボタン（0〜4）
  function rbiButtons(selected) {
    return App.RBI_OPTIONS.map(function (n) {
      const on = n === selected;
      return '<button class="rbi-btn' + (on ? ' is-selected' : '') + '" type="button" ' +
        'role="radio" aria-checked="' + on + '" data-rbi="' + n + '">' + n + '</button>';
    }).join('');
  }

  // 結果ボタン
  function resultButtons(selected) {
    return App.RESULT_TYPES.map(function (type) {
      const on = type.code === selected;
      return '<button class="result-btn result-btn--' + type.category + (on ? ' is-selected' : '') + '" type="button" ' +
        'aria-pressed="' + on + '" data-result="' + type.code + '">' + type.label + '</button>';
    }).join('');
  }

  // 「未設定」つきの選択ボタン
  function choiceButtons(items, selected, attr) {
    return items.concat([{ code: '', label: App.UNSET_LABEL }]).map(function (item) {
      const value = item.code === '' ? null : item.code;
      const on = value === selected;
      return '<button class="choice-btn' + (value === null ? ' choice-btn--unset' : '') + (on ? ' is-selected' : '') + '" ' +
        'type="button" aria-pressed="' + on + '" data-' + attr + '="' + item.code + '">' + item.label + '</button>';
    }).join('');
  }

  function inningOptions(selected) {
    let html = '<option value="">' + App.UNSET_LABEL + '</option>';
    for (let i = 1; i <= App.MAX_INNING; i++) {
      html += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + i + '回' + (i >= 10 ? '（延長）' : '') + '</option>';
    }
    return html;
  }

  // 走者：一・二・三塁を押して切り替える（「なし」「未設定」も選べる）
  function runnerButtons(runners) {
    const bases = runners && runners !== 'none' ? runners.split('') : [];
    return '<button class="choice-btn' + (runners === 'none' ? ' is-selected' : '') + '" type="button" ' +
        'aria-pressed="' + (runners === 'none') + '" data-runner="none">なし</button>' +
      ['1', '2', '3'].map(function (base) {
        const on = bases.indexOf(base) !== -1;
        return '<button class="choice-btn choice-btn--base' + (on ? ' is-selected' : '') + '" type="button" aria-pressed="' + on + '" ' +
          'data-runner="' + base + '">' + ['', '一塁', '二塁', '三塁'][Number(base)] + '</button>';
      }).join('') +
      '<button class="choice-btn choice-btn--unset' + (runners === null ? ' is-selected' : '') + '" type="button" ' +
        'aria-pressed="' + (runners === null) + '" data-runner="">' + App.UNSET_LABEL + '</button>';
  }

  function nextRunners(current, pressed) {
    if (pressed === '') return null;
    if (pressed === 'none') return 'none';
    const bases = current && current !== 'none' ? current.split('') : [];
    const index = bases.indexOf(pressed);
    if (index === -1) bases.push(pressed); else bases.splice(index, 1);
    return bases.length ? bases.sort().join('') : 'none';
  }

  function situationSummary(situation) {
    return hasSituation(situation) ? ui.situationText(situation) : App.UNSET_LABEL;
  }

  function situationHtml(situation, open) {
    return '<details class="pa-section" data-part="situation"' + (open ? ' open' : '') + '>' +
      '<summary class="pa-section__summary">' +
        '<span class="pa-section__title">打席の状況<span class="field__optional">任意</span></span>' +
        '<span class="pa-section__value" data-part="situation-value">' + situationSummary(situation) + '</span>' +
      '</summary>' +
      '<div class="pa-section__body">' +
        '<div class="opt-row">' +
          '<span class="opt-row__label">イニング</span>' +
          '<div class="inning-row">' +
            '<select class="input select inning-select" aria-label="イニング">' + inningOptions(situation.inning) + '</select>' +
            '<div class="choice-row" data-part="half">' + choiceButtons(App.INNING_HALVES, situation.half, 'half') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="opt-row">' +
          '<span class="opt-row__label">アウト</span>' +
          '<div class="choice-row" data-part="outs">' +
            choiceButtons(App.OUT_COUNTS.map(function (n) { return { code: String(n), label: n + 'アウト' }; }),
              situation.outs === null ? null : String(situation.outs), 'outs') +
          '</div>' +
        '</div>' +
        '<div class="opt-row">' +
          '<span class="opt-row__label">走者</span>' +
          '<div class="choice-row choice-row--runners" data-part="runners">' + runnerButtons(situation.runners) + '</div>' +
        '</div>' +
        '<button class="link-btn" type="button" data-action="clear-situation">状況をすべて未設定に戻す</button>' +
      '</div>' +
    '</details>';
  }

  function battedBallPreview(state) {
    if (!state.result) return '';
    const fielders = state.battedBall.fielder ? [state.battedBall.fielder] : [];
    return ui.battedBallText(state.result, { type: state.battedBall.type, fielders: fielders }) || App.UNSET_LABEL;
  }

  function battedBallHtml(state, withRecordButton) {
    return '<div class="batted-ball" data-part="batted-ball"' + (isInPlay(state.result) ? '' : ' hidden') + '>' +
      '<div class="batted-ball__head">' +
        '<span class="batted-ball__title">打球の詳細<span class="field__optional">任意</span></span>' +
        '<span class="batted-ball__preview" data-part="bb-preview">' + battedBallPreview(state) + '</span>' +
      '</div>' +
      '<div class="opt-row">' +
        '<span class="opt-row__label">打球の種類</span>' +
        '<div class="choice-grid" data-part="bb-type">' + choiceButtons(App.BATTED_BALL_TYPES, state.battedBall.type, 'bbtype') + '</div>' +
      '</div>' +
      '<div class="opt-row">' +
        '<span class="opt-row__label">処理した守備位置</span>' +
        '<div class="choice-grid" data-part="bb-fielder">' +
          App.FIELDING_POSITIONS.map(function (p) {
            const on = p.code === state.battedBall.fielder;
            return '<button class="choice-btn choice-btn--fielder' + (on ? ' is-selected' : '') + '" type="button" ' +
              'aria-pressed="' + on + '" aria-label="' + p.label + '（' + p.number + '）" data-fielder="' + p.code + '">' +
              '<b>' + p.short + '</b><small>' + p.number + '</small></button>';
          }).join('') +
          '<button class="choice-btn choice-btn--unset choice-btn--wide' + (state.battedBall.fielder === null ? ' is-selected' : '') + '" ' +
            'type="button" aria-pressed="' + (state.battedBall.fielder === null) + '" data-fielder="">' + App.UNSET_LABEL + '</button>' +
        '</div>' +
      '</div>' +
      (withRecordButton
        ? '<button class="btn btn--primary btn--block btn--lg" type="button" data-action="record-in-play">この内容で記録する</button>'
        : '') +
    '</div>';
  }

  function paFormHtml(state, mode) {
    return situationHtml(state.situation, mode === 'edit' ? hasSituation(state.situation) : situationOpen) +
      '<div class="rbi-picker">' +
        '<span class="rbi-picker__label">打点</span>' +
        '<div class="rbi-picker__options" role="radiogroup" aria-label="打点">' + rbiButtons(state.rbi) + '</div>' +
      '</div>' +
      '<div class="result-grid' + (state.result ? ' has-selection' : '') + '" data-part="results">' + resultButtons(state.result) + '</div>' +
      battedBallHtml(state, mode === 'record');
  }

  function setPressed(container, attr, value) {
    container.querySelectorAll('[data-' + attr + ']').forEach(function (btn) {
      const on = (btn.dataset[attr] || null) === value;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-pressed', String(on));
    });
  }

  /*
   * パネルの中の操作（打点・結果・打球の詳細・状況）を state に反映する
   *   onResult(code) … 結果ボタンを押したとき
   */
  function bindPaForm(sheet, state, onResult) {
    const q = function (part) { return sheet.querySelector('[data-part="' + part + '"]'); };
    const situationSection = q('situation');

    function refreshSituation() {
      q('situation-value').textContent = situationSummary(state.situation);
      setPressed(q('half'), 'half', state.situation.half);
      setPressed(q('outs'), 'outs', state.situation.outs === null ? null : String(state.situation.outs));
      q('runners').innerHTML = runnerButtons(state.situation.runners);
      sheet.querySelector('.inning-select').value = state.situation.inning === null ? '' : String(state.situation.inning);
    }

    function refreshBattedBall() {
      q('batted-ball').hidden = !isInPlay(state.result);
      setPressed(q('bb-type'), 'bbtype', state.battedBall.type);
      setPressed(q('bb-fielder'), 'fielder', state.battedBall.fielder);
      q('bb-preview').textContent = battedBallPreview(state);
    }

    situationSection.addEventListener('toggle', function () {
      if (sheet.dataset.mode === 'record') situationOpen = situationSection.open;
    });

    sheet.querySelector('.rbi-picker__options').addEventListener('click', function (event) {
      const button = event.target.closest('.rbi-btn');
      if (!button) return;
      state.rbi = Number(button.dataset.rbi);
      sheet.querySelectorAll('.rbi-btn').forEach(function (btn) {
        const on = btn === button;
        btn.classList.toggle('is-selected', on);
        btn.setAttribute('aria-checked', String(on));
      });
    });

    q('results').addEventListener('click', function (event) {
      const button = event.target.closest('.result-btn');
      if (button) onResult(button.dataset.result);
    });

    q('half').addEventListener('click', function (event) {
      const button = event.target.closest('[data-half]');
      if (!button) return;
      state.situation.half = button.dataset.half || null;
      refreshSituation();
    });
    q('outs').addEventListener('click', function (event) {
      const button = event.target.closest('[data-outs]');
      if (!button) return;
      state.situation.outs = button.dataset.outs === '' ? null : Number(button.dataset.outs);
      refreshSituation();
    });
    q('runners').addEventListener('click', function (event) {
      const button = event.target.closest('[data-runner]');
      if (!button) return;
      state.situation.runners = nextRunners(state.situation.runners, button.dataset.runner);
      refreshSituation();
    });
    sheet.querySelector('.inning-select').addEventListener('change', function (event) {
      state.situation.inning = event.target.value ? Number(event.target.value) : null;
      refreshSituation();
    });
    sheet.querySelector('[data-action="clear-situation"]').addEventListener('click', function () {
      state.situation = emptySituation();
      refreshSituation();
    });

    q('bb-type').addEventListener('click', function (event) {
      const button = event.target.closest('[data-bbtype]');
      if (!button) return;
      state.battedBall.type = button.dataset.bbtype || null;
      refreshBattedBall();
    });
    q('bb-fielder').addEventListener('click', function (event) {
      const button = event.target.closest('[data-fielder]');
      if (!button) return;
      state.battedBall.fielder = button.dataset.fielder || null;
      refreshBattedBall();
    });

    return {
      selectResult: function (code) {
        state.result = code;
        const grid = q('results');
        grid.classList.toggle('has-selection', Boolean(code));
        setPressed(grid, 'result', code);
        refreshBattedBall();
      }
    };
  }

  // パネルで選んだ内容 → 保存する形
  function toInput(state, originalBattedBall) {
    let fielders = state.battedBall.fielder ? [state.battedBall.fielder] : [];
    // 将来、守備位置が複数記録された打席を直すときは、最初の守備位置を変えない限り元の並びを残す
    if (originalBattedBall && originalBattedBall.fielders && originalBattedBall.fielders[0] === state.battedBall.fielder) {
      fielders = originalBattedBall.fielders.slice();
    }
    return {
      result: state.result,
      rbi: state.rbi,
      battedBall: isInPlay(state.result) ? { type: state.battedBall.type, fielders: fielders } : null,
      situation: hasSituation(state.situation) ? Object.assign({}, state.situation) : null
    };
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

  // ---------- 打席を記録するパネル ----------

  function openRecordSheet(game, no, onClosed) {
    const draft = drafts[game.id] || (drafts[game.id] = emptyDraft());
    let saving = false;

    const sheet = ui.openSheet({
      title: '第' + no + '打席を記録',
      className: 'sheet--pa',
      body: paFormHtml(draft, 'record'),
      onClose: onClosed // 入力途中の内容は drafts に残る
    });
    sheet.dataset.mode = 'record';

    async function save() {
      if (saving) return;
      saving = true;
      try {
        const created = await App.store.createPlateAppearance(Object.assign({ gameId: game.id }, toInput(draft)));
        delete drafts[game.id];
        ui.closeSheet();
        await App.refresh({ highlightId: created.id });
        ui.toast('第' + no + '打席 ' + ui.plateAppearanceLabel(created) + rbiText(created.rbi) + 'を記録', {
          actionLabel: '取り消し',
          onAction: function () { undoCreate(created.id); }
        });
      } catch (error) {
        ui.toast(error.message);
        saving = false;
      }
    }

    const form = bindPaForm(sheet, draft, function (code) {
      if (isInPlay(code)) {
        // アウトなど：打球の詳細を選んでから記録する
        form.selectResult(code);
        const section = sheet.querySelector('[data-part="batted-ball"]');
        requestAnimationFrame(function () { section.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
      } else {
        // 安打・四死球・三振：すぐ記録してパネルを閉じる
        draft.result = code;
        save();
      }
    });
    sheet.querySelector('[data-action="record-in-play"]').addEventListener('click', save);
  }

  // ---------- 打席を修正するパネル ----------

  function openEditSheet(pa, no) {
    const original = {
      rbi: pa.rbi,
      result: pa.result,
      battedBall: {
        type: pa.battedBall ? pa.battedBall.type : null,
        fielder: pa.battedBall && pa.battedBall.fielders.length ? pa.battedBall.fielders[0] : null
      },
      situation: Object.assign(emptySituation(), pa.situation || {})
    };
    const state = JSON.parse(JSON.stringify(original));
    let busy = false;

    function isDirty() {
      return JSON.stringify(toInput(state, pa.battedBall)) !== JSON.stringify(toInput(original, pa.battedBall));
    }

    // 変更を保存せずに閉じようとしたときの確認
    function askDiscard(sheet) {
      if (sheet.querySelector('.discard-bar')) return;
      const bar = document.createElement('div');
      bar.className = 'discard-bar';
      bar.setAttribute('role', 'alert');
      bar.innerHTML = '<p>変更がまだ保存されていません。</p>' +
        '<div class="discard-bar__actions">' +
          '<button class="btn btn--ghost" type="button" data-action="keep">編集を続ける</button>' +
          '<button class="btn btn--danger" type="button" data-action="discard">保存せずに閉じる</button>' +
        '</div>';
      sheet.querySelector('.sheet__body').prepend(bar);
      sheet.scrollTop = 0;
      bar.querySelector('[data-action="keep"]').addEventListener('click', function () { bar.remove(); });
      bar.querySelector('[data-action="discard"]').addEventListener('click', function () { ui.closeSheet(); });
    }

    const sheet = ui.openSheet({
      title: '第' + no + '打席を修正',
      className: 'sheet--pa',
      body: paFormHtml(state, 'edit') +
        '<div class="sheet__actions">' +
          '<button class="btn btn--primary btn--block btn--lg" type="button" data-action="save">変更を保存する</button>' +
          '<button class="btn btn--danger btn--block" type="button" data-action="delete">この打席を削除</button>' +
        '</div>',
      onBeforeClose: function () {
        if (busy || !isDirty()) return true;
        askDiscard(sheet);
        return false;
      }
    });
    sheet.dataset.mode = 'edit';

    const form = bindPaForm(sheet, state, function (code) { form.selectResult(code); });

    sheet.querySelector('[data-action="save"]').addEventListener('click', async function () {
      if (busy) return;
      busy = true;
      try {
        await App.store.updatePlateAppearance(pa.id, toInput(state, pa.battedBall));
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
      if (!window.confirm('第' + no + '打席（' + ui.plateAppearanceLabel(pa) + rbiText(pa.rbi) + '）を削除します。\n元に戻せません。よろしいですか？')) return;
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
      const venue = await App.store.getVenue(game.venueId);
      const appearance = await App.store.getAppearance(game.id);
      return {
        game: game,
        venue: venue,
        appearance: appearance,
        plateAppearances: plateAppearances,
        summary: App.stats.summarize(plateAppearances)
      };
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
      const nextNo = plateAppearances.length + 1;
      const paList = plateAppearances.length
        ? '<ol class="pa-list">' + plateAppearances.map(paItem).join('') + '</ol>' +
          '<p class="pa-list__hint">打席をタップすると、修正・削除できます</p>'
        : '<div class="empty empty--compact">まだ打席がありません。<br>下の「＋ 第1打席を記録」から入力しましょう。</div>';

      main.classList.add('has-record-bar');
      main.innerHTML =
        '<section class="game-summary">' +
          '<div class="game-summary__date">' + ui.formatDateLong(game.date) + '</div>' +
          '<div class="game-summary__meta">' +
            (App.getGameCategory(game.category)
              ? '<span class="game-tag game-tag--' + game.category + '">' + App.gameCategoryLabel(game.category) + '</span>'
              : '<span class="game-tag game-tag--unset">区分 ' + App.GAME_CATEGORY_UNSET_LABEL + '</span>') +
            '<span class="game-summary__venue' + (data.venue ? '' : ' is-empty') + '">' +
              ui.icons.pin + (data.venue ? ui.escapeHtml(data.venue.name) : '球場 未登録') +
            '</span>' +
          '</div>' +
          '<div class="game-summary__appearance">' + appearanceHtml(data.appearance) + '</div>' +
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

        '<div class="record-bar">' +
          '<p class="record-bar__draft" hidden>入力途中の内容があります</p>' +
          '<button class="btn btn--primary btn--block btn--lg" type="button" id="open-record">＋ 第' + nextNo + '打席を記録</button>' +
        '</div>';

      // ----- 打席を記録する -----
      const draftNote = main.querySelector('.record-bar__draft');
      function syncDraftNote() {
        draftNote.hidden = !(drafts[game.id] && isDraftDirty(drafts[game.id]));
      }
      syncDraftNote();
      main.querySelector('#open-record').addEventListener('click', function () {
        openRecordSheet(game, nextNo, syncDraftNote);
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
