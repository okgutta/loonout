/**
 * 训记 (trainnote) PRO 解锁 —— Loon / Surge / QX 通用 http-response 脚本
 * 目标：api.xunjiapp.cn
 *   1. /fetch_policy            res.isgrand  false -> true
 *   2. /try_vip_get             vipDay -1 -> 36500 / hasTry true
 *   3. /have_universal_plan_v2  res.pt / res.tn 兜底补空对象
 *
 * 用法（Loon 脚本版插件）：
 *   [Script]
 *   xunji_pro = type=http-response,pattern=^https:\/\/api\.xunjiapp\.cn\/(fetch_policy|try_vip_get|have_universal_plan_v2),requires-body=1,max-size=1048576,script-path=<本文件地址>
 */

const url = $request.url;
let body = $response.body;

function safeParse(t) {
  try { return JSON.parse(t); } catch (e) { return null; }
}

let obj = safeParse(body);

if (obj && typeof obj === "object") {
  if (/\/fetch_policy(\?|$)/.test(url)) {
    if (!obj.res) obj.res = {};
    obj.res.isgrand = true;          // 会员总开关
    if (!obj.res.policyVersion) obj.res.policyVersion = "2099-01-01";
    console.log("[xunji] fetch_policy -> isgrand=true");
  } else if (/\/try_vip_get(\?|$)/.test(url)) {
    obj.res = obj.res || {};
    obj.res.vipDay = 36500;          // 剩余天数拉满
    obj.res.hasTry = true;
    obj.res.showVipTry = false;      // 已开通就别再弹试用
    console.log("[xunji] try_vip_get -> vipDay=36500");
  } else if (/\/have_universal_plan_v2(\?|$)/.test(url)) {
    obj.res = obj.res || {};
    if (!obj.res.pt) obj.res.pt = {};
    if (!obj.res.tn) obj.res.tn = {};
    console.log("[xunji] have_universal_plan_v2 -> 兜底");
  }
  $done({ body: JSON.stringify(obj) });
} else {
  // 非 JSON（理论不会到这），原样放行
  $done({});
}
