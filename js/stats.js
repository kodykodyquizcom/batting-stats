/*
 * 打席の記録から成績を計算する。
 * 計算のルール（打数に数えるか、安打か、塁打数）は js/constants.js にあります。
 *
 * 計算式
 *   打数   ＝ 打席 − 四球 − 死球 − 犠打 − 犠飛
 *            （失策・野選・三振・その他アウトは打数に含む）
 *   打率   ＝ 安打 ÷ 打数
 *   出塁率 ＝ (安打 ＋ 四球 ＋ 死球) ÷ (打数 ＋ 四球 ＋ 死球 ＋ 犠飛)
 *            （犠打は分母にも分子にも入れない。失策・野選での出塁は出塁に数えない）
 *   長打率 ＝ 塁打 ÷ 打数（単打1・二塁打2・三塁打3・本塁打4）
 *   OPS    ＝ 出塁率 ＋ 長打率（四捨五入する前の値どうしを足す）
 * 分母が0のときは計算できないので null（画面では「-」と表示）
 */
window.App = window.App || {};

(function (App) {
  'use strict';

  function ratio(numerator, denominator) {
    return denominator > 0 ? numerator / denominator : null;
  }

  /**
   * 打席の配列 → 成績
   *   pa=打席 ab=打数 h=安打 rbi=打点 tb=塁打 xbh=長打（二塁打＋三塁打＋本塁打）
   *   singles=単打 doubles=二塁打 triples=三塁打 hr=本塁打
   *   bb=四球 hbp=死球 so=三振 sh=犠打 sf=犠飛 roe=失策 fc=野選 otherOuts=その他アウト
   *   avg=打率 obp=出塁率 slg=長打率 ops=OPS
   *   counts=結果ごとの回数（例：counts.homerun）
   */
  function summarize(plateAppearances) {
    const counts = {};
    App.RESULT_TYPES.forEach(function (type) { counts[type.code] = 0; });

    let pa = 0;
    let ab = 0;
    let h = 0;
    let tb = 0;
    let rbi = 0;

    plateAppearances.forEach(function (record) {
      const type = App.getResultType(record.result);
      if (!type) return; // 知らない結果は数えない
      pa += 1;
      counts[type.code] += 1;
      if (type.isAtBat) ab += 1;
      if (type.isHit) h += 1;
      tb += type.totalBases;
      rbi += Number(record.rbi) || 0;
    });

    const bb = counts.walk;
    const hbp = counts.hbp;
    const sf = counts.sac_fly;

    const avg = ratio(h, ab);
    const obp = ratio(h + bb + hbp, ab + bb + hbp + sf);
    const slg = ratio(tb, ab);
    const ops = obp != null && slg != null ? obp + slg : null;

    return {
      pa: pa,
      ab: ab,
      h: h,
      rbi: rbi,
      tb: tb,
      singles: counts.single,
      doubles: counts.double,
      triples: counts.triple,
      hr: counts.homerun,
      xbh: counts.double + counts.triple + counts.homerun,
      bb: bb,
      hbp: hbp,
      so: counts.strikeout,
      sh: counts.sac_bunt,
      sf: sf,
      roe: counts.error,
      fc: counts.fielders_choice,
      otherOuts: counts.out,
      avg: avg,
      obp: obp,
      slg: slg,
      ops: ops,
      counts: counts
    };
  }

  App.stats = { summarize: summarize };
})(window.App);
