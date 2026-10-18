/**
 * 训记 (trainnote) PRO 解锁 v2 —— Loon http-response 脚本
 *
 * 目标主机：api.xunjiapp.cn
 *   /fetch_policy                                 res.isgrand   false -> true   （会员总开关）
 *   /try_vip_get                                  res.vipDay    -1    -> 36500  （剩余天数）
 *   /have_universal_plan_v2                       res.pt/tn     兜底补空对象
 *
 * Loon 插件里用法：
 *   [Script]
 *   http-response ^https?:\/\/api\.xunjiapp\.cn\/(fetch_policy|try_vip_get|have_universal_plan_v2) script-path=<本文件>,requires-body=1,max-size=1048576
 */

const url = $request.url;
const raw = $response.body || "";
console.log("[XJ-PRO] hit " + ($request.method || "?") + " " + url + " len=" + raw.length);

function done(body) {
  console.log("[XJ-PRO] out " + (body || "").slice(0, 240));
  $done({ body: body });
}

let obj = null;
try { obj = JSON.parse(raw); } catch (e) { obj = null; }

if (!obj || typeof obj !== "object") {
  console.log("[XJ-PRO] 非 JSON，原样放行");
  $done({});
} else {
  if (/\/fetch_policy(\?|$)/.test(url)) {
    obj.res = obj.res || {};
    obj.res.isgrand = true;
    if (!obj.res.policyVersion) obj.res.policyVersion = "2099-01-01";
    done(JSON.stringify(obj));
  } else if (/\/try_vip_get(\?|$)/.test(url)) {
    obj.res = obj.res || {};
    obj.res.vipDay = 36500;
    obj.res.hasTry = true;
    obj.res.showVipTry = false;
    done(JSON.stringify(obj));
  } else if (/\/have_universal_plan_v2(\?|$)/.test(url)) {
    // 服务端两种形态：{"res":0} 或 {"res":{"pt":{},"tn":{}}}
    if (typeof obj.res === "number") {
      obj.res = { pt: {}, tn: {} };
    } else if (obj.res && typeof obj.res === "object") {
      if (!obj.res.pt) obj.res.pt = {};
      if (!obj.res.tn) obj.res.tn = {};
    }
    done(JSON.stringify(obj));
  } else {
    $done({});
  }
}
