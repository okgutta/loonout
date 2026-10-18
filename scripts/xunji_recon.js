/**
 * 训记 响应侦察脚本 —— 用来定位「真正决定 PRO 解锁」的那个接口/字段。
 *
 * 用法：
 *   [Script]
 *   xunji_recon = type=http-response,pattern=^https:\/\/api\.xunjiapp\.cn\/,requires-body=1,max-size=1048576,script-path=<本文件>
 *
 * 然后：打开 Loon -> 脚本 -> 日志，点一次被锁的 PRO 功能，
 * 把日志里带 [XJ-HIT] 的行发我，就能定位到具体门禁字段。
 */

const url = $request.url;
const reqBody = $request.body || "";
let body = $response.body || "";

// 只看可能跟会员相关的关键字
const KEYS = /(vip|grand|pro\b|premium|member|pay|order|purchase|entitle|subscri|trial|policy|limit|quota|auth|plan)/i;

function brief(s, n) {
  s = String(s);
  return s.length > n ? s.slice(0, n) + "…(" + s.length + "B)" : s;
}

const hit = KEYS.test(url) || KEYS.test(body);
if (hit) {
  console.log("[XJ-HIT] " + $request.method + " " + url);
  if (reqBody) console.log("[XJ-HIT]   req  " + brief(reqBody, 800));
  console.log("[XJ-HIT]   resp " + brief(body, 1500));
} else {
  console.log("[XJ] " + $request.method + " " + url + "  " + body.length + "B");
}

$done({});
