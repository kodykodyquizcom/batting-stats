/*
 * アプリ全体で使う「決まりごと」をまとめたファイル。
 * 打席結果の種類を増やしたり名前を変えたりするときは、ここだけを直せば
 * 入力ボタンや成績表示にも反映されるようにしています。
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  App.APP_VERSION = '1.2.0';

  /*
   * 打席結果の一覧（入力ボタンはこの順番で並びます）
   *   code       … データとして保存する名前（あとから変えないこと）
   *   label      … 画面に表示する名前
   *   short      … スコアブック風の1文字表記
   *   category   … ボタンの色分け（hit=安打 / walk=四死球 / sac=犠打・犠飛 / out=凡退）
   *   isAtBat    … 打数に数えるか
   *   isHit      … 安打に数えるか
   *   totalBases … 塁打数
   *   inPlay     … 打球が前に飛ぶ結果か（true なら「打球の詳細」を記録できる）
   */
  App.RESULT_TYPES = [
    { code: 'single',          label: '単打',         short: '安', category: 'hit',  isAtBat: true,  isHit: true,  totalBases: 1 },
    { code: 'double',          label: '二塁打',       short: '二', category: 'hit',  isAtBat: true,  isHit: true,  totalBases: 2 },
    { code: 'triple',          label: '三塁打',       short: '三', category: 'hit',  isAtBat: true,  isHit: true,  totalBases: 3 },
    { code: 'homerun',         label: '本塁打',       short: '本', category: 'hit',  isAtBat: true,  isHit: true,  totalBases: 4 },
    { code: 'walk',            label: '四球',         short: '四', category: 'walk', isAtBat: false, isHit: false, totalBases: 0 },
    { code: 'hbp',             label: '死球',         short: '死', category: 'walk', isAtBat: false, isHit: false, totalBases: 0 },
    { code: 'strikeout',       label: '三振',         short: '振', category: 'out',  isAtBat: true,  isHit: false, totalBases: 0 },
    { code: 'sac_bunt',        label: '犠打',         short: '犠', category: 'sac',  isAtBat: false, isHit: false, totalBases: 0, inPlay: true },
    { code: 'sac_fly',         label: '犠飛',         short: '飛', category: 'sac',  isAtBat: false, isHit: false, totalBases: 0, inPlay: true },
    { code: 'error',           label: '失策',         short: '失', category: 'out',  isAtBat: true,  isHit: false, totalBases: 0, inPlay: true },
    { code: 'fielders_choice', label: '野選',         short: '野', category: 'out',  isAtBat: true,  isHit: false, totalBases: 0, inPlay: true },
    { code: 'out',             label: 'その他アウト', short: '凡', category: 'out',  isAtBat: true,  isHit: false, totalBases: 0, inPlay: true }
  ];

  // 1打席で選べる打点
  App.RBI_OPTIONS = [0, 1, 2, 3, 4];

  /*
   * 試合区分（code はデータとして保存する名前。あとから変えないこと）
   * 区分を選んでいない試合（以前に登録した試合など）は null として保存し、「未設定」と表示する。
   */
  App.GAME_CATEGORIES = [
    { code: 'official', label: '公式戦' },
    { code: 'practice', label: '練習試合' }
  ];
  App.GAME_CATEGORY_UNSET_LABEL = '未設定';

  App.getGameCategory = function (code) {
    return App.GAME_CATEGORIES.find(function (category) { return category.code === code; }) || null;
  };

  // 試合区分の表示名（未設定なら「未設定」）
  App.gameCategoryLabel = function (code) {
    const category = App.getGameCategory(code);
    return category ? category.label : App.GAME_CATEGORY_UNSET_LABEL;
  };

  App.getResultType = function (code) {
    return App.RESULT_TYPES.find(function (type) { return type.code === code; });
  };

  function finder(list) {
    return function (code) {
      return list.find(function (item) { return item.code === code; }) || null;
    };
  }

  App.UNSET_LABEL = '未設定';

  /*
   * 守備位置（code はデータとして保存する名前。あとから変えないこと）
   *   number … スコアブックの守備番号（1〜9）。DH は守備につかないので null
   */
  App.POSITIONS = [
    { code: 'P',  number: 1, label: '投手',   short: '投' },
    { code: 'C',  number: 2, label: '捕手',   short: '捕' },
    { code: '1B', number: 3, label: '一塁手', short: '一' },
    { code: '2B', number: 4, label: '二塁手', short: '二' },
    { code: '3B', number: 5, label: '三塁手', short: '三' },
    { code: 'SS', number: 6, label: '遊撃手', short: '遊' },
    { code: 'LF', number: 7, label: '左翼手', short: '左' },
    { code: 'CF', number: 8, label: '中堅手', short: '中' },
    { code: 'RF', number: 9, label: '右翼手', short: '右' },
    { code: 'DH', number: null, label: 'DH',  short: 'DH' }
  ];
  App.getPosition = finder(App.POSITIONS);
  // 打球を処理できる守備位置（DH以外）
  App.FIELDING_POSITIONS = App.POSITIONS.filter(function (p) { return p.number !== null; });

  // ----- 試合ごとの出場情報 -----
  App.APPEARANCE_STATUSES = [
    { code: 'starter', label: 'スタメン' },
    { code: 'sub',     label: '途中出場' },
    { code: 'dnp',     label: '出場なし' }
  ];
  App.getAppearanceStatus = finder(App.APPEARANCE_STATUSES);

  // 途中出場の形
  App.SUB_TYPES = [
    { code: 'pinch_hitter', label: '代打' },
    { code: 'pinch_runner', label: '代走' },
    { code: 'defensive',    label: '守備' }
  ];
  App.getSubType = finder(App.SUB_TYPES);

  App.BATTING_ORDERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  App.MAX_POSITION_CHANGES = 10;

  // ----- 打球の詳細（アウトなど、打球が前に飛んだ打席） -----
  //   suffix … スコアブック風の表記に使う（例：遊＋ゴロ＝遊ゴロ、中＋飛＝中飛、三＋直＝三直）
  App.BATTED_BALL_TYPES = [
    { code: 'ground', label: 'ゴロ',         suffix: 'ゴロ' },
    { code: 'fly',    label: 'フライ',       suffix: '飛' },
    { code: 'liner',  label: 'ライナー',     suffix: '直' },
    { code: 'popup',  label: 'ポップフライ', suffix: 'ポップ' },
    { code: 'other',  label: 'その他',       suffix: '' }
  ];
  App.getBattedBallType = finder(App.BATTED_BALL_TYPES);

  // ----- 打席時の状況 -----
  App.OUT_COUNTS = [0, 1, 2];
  App.RUNNER_STATES = [
    { code: 'none', label: '走者なし' },
    { code: '1',    label: '一塁' },
    { code: '2',    label: '二塁' },
    { code: '3',    label: '三塁' },
    { code: '12',   label: '一・二塁' },
    { code: '13',   label: '一・三塁' },
    { code: '23',   label: '二・三塁' },
    { code: '123',  label: '満塁' }
  ];
  App.getRunnerState = finder(App.RUNNER_STATES);
  App.MAX_INNING = 20; // 延長戦も20回まで入力できる
  App.INNING_HALVES = [
    { code: 'top',    label: '表' },
    { code: 'bottom', label: '裏' }
  ];
  App.getInningHalf = finder(App.INNING_HALVES);
})(window.App);
