/**
 * 训记 调试脚本：只打日志不改包。
 * 用来确认「Loon 到底有没有对 api.xunjiapp.cn 执行脚本」。
 *
 * 预期日志（Loon → 脚本 → 日志）：
 *   [XJ-DBG] POST https://api.xunjiapp.cn/fetch_policy 200 69B
 *   [XJ-DBG] body {"success":true,"res":{...}}
 */
const url = $request.url;
const body = $response.body || "";
console.log("[XJ-DBG] " + ($request.method || "?") + " " + url + " " + ($response.status || "") + " " + body.length + "B");
if (body) console.log("[XJ-DBG] body " + body.slice(0, 500));
$done({});
