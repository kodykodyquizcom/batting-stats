/*
 * どの画面でも使う小さな道具（日付や数字の表示、お知らせ、アイコン）
 */
(function (App) {
  'use strict';

  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  // 入力された文字をそのまま画面に出しても安全なように変換する
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // '2026-10-04' → 日付（時差でずれないよう端末の時刻として扱う）
  function parseDate(iso) {
    const parts = iso.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // 10/4
  function formatDateShort(iso) {
    const d = parseDate(iso);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  // 土
  function weekday(iso) {
    return WEEKDAYS[parseDate(iso).getDay()];
  }

  // 2026年10月4日（土）
  function formatDateLong(iso) {
    const d = parseDate(iso);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WEEKDAYS[d.getDay()] + '）';
  }

  // 日時（'2026-10-09T09:30:00.000Z' など）→ 2026年10月9日 18:30（端末の時刻で表示）
  function formatDateTime(isoTimestamp) {
    const d = new Date(isoTimestamp);
    if (isNaN(d.getTime())) return '-';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  // 今日の日付を '2026-10-04' の形で
  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /*
   * 率の表示：小数第4位を四捨五入して3桁で表示
   *   0.3333 → .333 / 0.0375 → .038 / 1.25 → 1.250 / 計算できないときは「-」
   * コンピューターの小数は 0.0375 を 0.03749999… のように持っていることがあり、
   * そのまま四捨五入すると .037 になってしまうため、ごくわずかな補正を足している。
   */
  function formatRate(value) {
    if (value == null || !Number.isFinite(value)) return '-';
    const thousandths = Math.round(value * 1000 + 1e-7);
    const text = (thousandths / 1000).toFixed(3);
    return text.charAt(0) === '0' ? text.slice(1) : text;
  }

  /*
   * ％の表示：小数第2位を四捨五入して1桁で表示（0.125 → 12.5%）。計算できないときは「-」
   */
  function formatPercent(value) {
    if (value == null || !Number.isFinite(value)) return '-';
    const tenths = Math.round(value * 1000 + 1e-7);
    return (tenths / 10).toFixed(1) + '%';
  }

  // 「4打席 3打数 2安打 1打点」の表示
  function statLine(summary) {
    return '<span class="stat-line">' +
      '<span><b>' + summary.pa + '</b>打席</span>' +
      '<span><b>' + summary.ab + '</b>打数</span>' +
      '<span><b>' + summary.h + '</b>安打</span>' +
      '<span><b>' + summary.rbi + '</b>打点</span>' +
      '</span>';
  }

  // 試合区分の小さなラベル（未設定なら何も出さない）
  function categoryPill(code) {
    const category = App.getGameCategory(code);
    if (!category) return '';
    return '<span class="category-pill category-pill--' + category.code + '">' + category.label + '</span>';
  }

  // 主な記録（本塁打・四球・死球・三振）を1行で
  function keyCounts(summary) {
    return '<span class="key-counts">' +
      '<span>本塁打<b>' + summary.hr + '</b></span>' +
      '<span>四球<b>' + summary.bb + '</b></span>' +
      '<span>死球<b>' + summary.hbp + '</b></span>' +
      '<span>三振<b>' + summary.so + '</b></span>' +
      '</span>';
  }

  // 「詳しい成績」の表（試合ごと・通算で共通）
  const DETAIL_ITEMS = [
    ['打席', 'pa'], ['打数', 'ab'], ['安打', 'h'],
    ['打点', 'rbi'], ['塁打', 'tb'], ['長打', 'xbh'],
    ['単打', 'singles'], ['二塁打', 'doubles'], ['三塁打', 'triples'],
    ['本塁打', 'hr'], ['四球', 'bb'], ['死球', 'hbp'],
    ['三振', 'so'], ['犠打', 'sh'], ['犠飛', 'sf'],
    ['失策', 'roe'], ['野選', 'fc'], ['その他アウト', 'otherOuts']
  ];

  function detailStats(summary, title) {
    return '<details class="card stat-details">' +
      '<summary>' + escapeHtml(title) + '</summary>' +
      '<dl class="stat-grid">' +
        DETAIL_ITEMS.map(function (item) {
          return '<div class="stat-cell"><dt>' + item[0] + '</dt><dd>' + summary[item[1]] + '</dd></div>';
        }).join('') +
      '</dl>' +
      '<p class="stat-note">' +
        '打数には四球・死球・犠打・犠飛を含みません（失策・野選は含みます）。<br>' +
        '出塁率＝(安打＋四球＋死球)÷(打数＋四球＋死球＋犠飛)<br>' +
        '長打率＝塁打÷打数　OPS＝出塁率＋長打率' +
      '</p>' +
    '</details>';
  }

  /*
   * 画面上部に短いお知らせを出す
   *   options.actionLabel / options.onAction を渡すと「取り消し」などのボタンが付く
   *   options.duration で表示する時間（ミリ秒）を変えられる
   */
  let toastTimer = null;
  function hideToast() {
    clearTimeout(toastTimer);
    document.getElementById('toast').classList.remove('is-visible');
  }

  function toast(message, options) {
    options = options || {};
    const el = document.getElementById('toast');
    el.textContent = '';

    const text = document.createElement('span');
    text.className = 'toast__text';
    text.textContent = message;
    el.appendChild(text);

    const hasAction = Boolean(options.actionLabel && options.onAction);
    if (hasAction) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast__action';
      button.textContent = options.actionLabel;
      button.addEventListener('click', function () {
        hideToast();
        options.onAction();
      }, { once: true });
      el.appendChild(button);
    }
    el.classList.toggle('has-action', hasAction);

    el.classList.remove('is-visible');
    void el.offsetWidth; // 連続で出したときもアニメーションさせるため
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, options.duration || (hasAction ? 5000 : 2600));
  }

  /*
   * 画面の下からせり上がるパネル（打席の記録・修正、バックアップの確認などに使う）
   *   openSheet({ title, body, className, onBeforeClose, onClose }) … body はHTML。パネルの要素を返す
   *       onBeforeClose … 閉じる前に呼ばれる。false を返すと閉じない（入力途中の確認などに使う）
   *       onClose       … 閉じたあとに呼ばれる
   *   requestCloseSheet() … 「閉じる操作」をしたとき（×・背景・Esc・下へスワイプ）。onBeforeClose を確認してから閉じる
   *   closeSheet()        … 確認せずに閉じる（保存が終わったときなど）
   *
   * パネルの中は縦にスクロールできる。中身が一番上までスクロールされているときに
   * 下へスワイプするとパネルが閉じる（スクロールの途中ならスクロールが優先）。
   * 上のつまみ・見出し部分は、いつでも下へスワイプして閉じられる。
   */
  let current = null; // { backdrop, sheet, options }

  function onSheetKeydown(event) {
    if (event.key === 'Escape') requestCloseSheet();
  }

  function closeSheet(closeOptions) {
    if (!current) return;
    const closing = current;
    current = null;
    document.body.classList.remove('has-sheet');
    document.removeEventListener('keydown', onSheetKeydown);
    closing.backdrop.classList.add('is-closing');
    closing.backdrop.setAttribute('aria-hidden', 'true');
    if (closeOptions && closeOptions.immediate) {
      closing.backdrop.remove();
    } else {
      setTimeout(function () { closing.backdrop.remove(); }, 220);
    }
    if (closing.options.onClose) closing.options.onClose();
  }

  function requestCloseSheet() {
    if (!current) return;
    if (current.options.onBeforeClose && current.options.onBeforeClose() === false) {
      current.sheet.style.transform = ''; // 閉じないときは元の位置に戻す
      return;
    }
    closeSheet();
  }

  // 下へのスワイプで閉じる（中身のスクロールとぶつからないようにする）
  function enableSwipeToClose(sheet) {
    let startY = null;
    let lastY = 0;
    let startTime = 0;
    let dragging = false;
    let fromHead = false;

    function begin(y, target) {
      fromHead = Boolean(target.closest('.sheet__top'));
      // 中身を下までスクロールしている途中なら、スワイプではなくスクロールとして扱う
      if (!fromHead && sheet.scrollTop > 0) { startY = null; return; }
      if (target.closest('select, input, textarea')) { startY = null; return; }
      startY = y;
      lastY = y;
      startTime = Date.now();
      dragging = false;
    }

    function move(y, event) {
      if (startY === null) return;
      const dy = y - startY;
      lastY = y;
      if (!dragging) {
        if (dy > 10 && (fromHead || sheet.scrollTop <= 0)) {
          dragging = true;
          sheet.classList.add('is-dragging');
        } else if (Math.abs(dy) > 10) {
          startY = null; // 上へのスワイプはスクロールに任せる
          return;
        } else {
          return;
        }
      }
      if (event.cancelable) event.preventDefault();
      sheet.style.transform = 'translateY(' + Math.max(0, dy) + 'px)';
    }

    function end() {
      if (startY === null) return;
      const dy = lastY - startY;
      const velocity = dy / Math.max(1, Date.now() - startTime);
      const wasDragging = dragging;
      startY = null;
      dragging = false;
      sheet.classList.remove('is-dragging');
      if (wasDragging && (dy > 100 || (dy > 40 && velocity > 0.5))) {
        requestCloseSheet();
      } else {
        sheet.style.transform = '';
      }
    }

    sheet.addEventListener('touchstart', function (event) {
      if (event.touches.length === 1) begin(event.touches[0].clientY, event.target);
    }, { passive: true });
    sheet.addEventListener('touchmove', function (event) {
      if (event.touches.length === 1) move(event.touches[0].clientY, event);
    }, { passive: false });
    sheet.addEventListener('touchend', end);
    sheet.addEventListener('touchcancel', end);

    // パソコンで確認するとき用：つまみ・見出しをマウスでドラッグ
    sheet.querySelector('.sheet__top').addEventListener('mousedown', function (event) {
      if (event.target.closest('button')) return;
      begin(event.clientY, event.target);
      function onMove(e) { move(e.clientY, e); }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        end();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function openSheet(options) {
    closeSheet({ immediate: true });
    hideToast();
    const backdrop = document.createElement('div');
    backdrop.className = 'sheet-backdrop';
    backdrop.innerHTML =
      '<div class="sheet' + (options.className ? ' ' + options.className : '') + '" role="dialog" aria-modal="true" aria-labelledby="sheet-title">' +
        '<div class="sheet__top">' +
          '<div class="sheet__grab" aria-hidden="true"></div>' +
          '<div class="sheet__head">' +
            '<h2 class="sheet__title" id="sheet-title">' + escapeHtml(options.title) + '</h2>' +
            '<button class="sheet__close" type="button" aria-label="閉じる">×</button>' +
          '</div>' +
        '</div>' +
        '<div class="sheet__body">' + options.body + '</div>' +
      '</div>';
    const sheet = backdrop.querySelector('.sheet');
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop || event.target.closest('.sheet__close')) requestCloseSheet();
    });
    document.body.appendChild(backdrop);
    document.body.classList.add('has-sheet');
    document.addEventListener('keydown', onSheetKeydown);
    current = { backdrop: backdrop, sheet: sheet, options: options };
    enableSwipeToClose(sheet);
    return sheet;
  }

  // ----- 野球の表記 -----

  function positionLabel(code) {
    const position = App.getPosition(code);
    return position ? position.label : '';
  }

  /**
   * 出場情報の表示用の文字
   *   { status: 'スタメン' / '途中出場（代打）' など, order: '4番' / '', positions: '遊撃手 → 二塁手' / '' }
   *   未設定なら null
   */
  function appearanceText(appearance) {
    if (!appearance || !App.getAppearanceStatus(appearance.status)) return null;
    const status = App.getAppearanceStatus(appearance.status).label;
    const subType = App.getSubType(appearance.subType);
    return {
      status: subType ? status + '（' + subType.label + '）' : status,
      order: appearance.battingOrder ? appearance.battingOrder + '番' : '',
      positions: (appearance.positions || []).map(function (p) { return positionLabel(p.position); }).join(' → ')
    };
  }

  /*
   * 打球の詳細をスコアブック風に（例：遊ゴロ、中飛、三直、二ポップ、中犠飛、遊失、遊野選）
   * 記録がなければ空文字
   */
  function battedBallText(resultCode, battedBall) {
    if (!battedBall) return '';
    const fielders = battedBall.fielders || [];
    const position = fielders.length ? App.getPosition(fielders[0]) : null;
    const ball = App.getBattedBallType(battedBall.type);
    let text = '';
    if (resultCode === 'out') {
      if (position && ball) text = ball.code === 'other' ? position.short + '（その他）' : position.short + ball.suffix;
      else if (position) text = position.label + '処理';
      else if (ball) text = ball.code === 'other' ? '' : ball.label + 'アウト';
    } else if (position) {
      const suffix = { sac_bunt: '犠打', sac_fly: '犠飛', error: '失', fielders_choice: '野選' }[resultCode] || '';
      text = position.short + suffix;
    }
    // 複数の守備位置が関わったとき（将来の併殺など）は守備番号も添える（例：6-4-3）
    if (text && fielders.length > 1) {
      text += '（' + fielders.map(function (code) { return App.getPosition(code).number; }).join('-') + '）';
    }
    return text;
  }

  // 打席の結果の表示（打球の詳細があればスコアブック風、なければ結果の名前）
  function plateAppearanceLabel(pa) {
    return battedBallText(pa.result, pa.battedBall) || App.getResultType(pa.result).label;
  }

  // 打席の状況（例：3回表 1アウト 一・二塁）。記録がなければ空文字
  function situationText(situation) {
    if (!situation) return '';
    const parts = [];
    const half = App.getInningHalf(situation.half);
    if (situation.inning || half) parts.push((situation.inning ? situation.inning + '回' : '') + (half ? half.label : ''));
    if (situation.outs !== null && situation.outs !== undefined) parts.push(situation.outs + 'アウト');
    const runners = App.getRunnerState(situation.runners);
    if (runners) parts.push(runners.label);
    return parts.join(' ');
  }

  const icons = {
    ball:
      '<svg class="icon-ball" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="10" fill="#fff"/>' +
      '<path d="M6.6 4.4c2.2 2.1 3.3 4.6 3.3 7.6s-1.1 5.5-3.3 7.6M17.4 4.4c-2.2 2.1-3.3 4.6-3.3 7.6s1.1 5.5 3.3 7.6" ' +
      'fill="none" stroke="#d7263d" stroke-width="1.6" stroke-dasharray="2 1.6" stroke-linecap="round"/>' +
      '</svg>',
    back:
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M15 18l-6-6 6-6"/></svg>',
    chevron:
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9 18l6-6-6-6"/></svg>',
    pin:
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    chart:
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    gear:
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="3"/>' +
      '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>' +
      '</svg>'
  };

  App.ui = {
    escapeHtml: escapeHtml,
    formatDateShort: formatDateShort,
    formatDateLong: formatDateLong,
    formatDateTime: formatDateTime,
    weekday: weekday,
    todayIso: todayIso,
    formatRate: formatRate,
    formatPercent: formatPercent,
    statLine: statLine,
    keyCounts: keyCounts,
    categoryPill: categoryPill,
    detailStats: detailStats,
    toast: toast,
    openSheet: openSheet,
    closeSheet: closeSheet,
    requestCloseSheet: requestCloseSheet,
    positionLabel: positionLabel,
    appearanceText: appearanceText,
    battedBallText: battedBallText,
    plateAppearanceLabel: plateAppearanceLabel,
    situationText: situationText,
    icons: icons
  };
})(window.App);
