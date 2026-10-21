# 微信小程序 Demo：免费云函数转发

## 部署信息（2026-10-21）

| 项目 | 配置 |
| --- | --- |
| 原站点 | `http://42.194.184.98:18080` |
| 原服务器 | 广州轻量主机 `lhins-8khlj2p9` |
| 正式小程序 AppID | `wxaad3cf2f0c22bfe6` |
| 云环境 | `factory-miniapp-d2f8yb6s0afa796d`（上海，免费体验版） |
| 普通云函数 | `factoryProxy`，Node.js 20.19，256 MB，3 秒 |
| 代码 | `cloudfunctions/factoryProxy/` |
| 计费 | 免费体验环境已零元开通；未购买付费套餐，无自动续费或超限按量 |

云环境与函数已创建，控制台真实调用已收到原服务器的正常 401 鉴权响应。小程序关联、授权账号登录/写入联调和正式 AppID 的扫码预览尚需完成，不能把函数部署成功等同于已能扫码使用。

## 数据路径

小程序 `wx.cloud.callFunction` → `factoryProxy` → 原站点 `/api/miniapp/*` → 原 PostgreSQL。

网站继续使用原服务和原数据库。云环境自带数据库不存放工厂业务数据，不迁移、复制或重新 seed 原生产库。小程序仍使用网站客户账号；平台管理员账号不适用。

此方案不使用 AnyService，不购买域名。小程序到云开发通过 SDK 调用，手机不需要关闭域名校验。云函数到现有服务器仍是公网 HTTP，仅用于当前 Demo，不能声称全链路已加密。

## 函数行为

- 仅转发机器/订单查询、登录/退出和加工/出货这几类现有接口。目标服务器在部署端固定；忽略客户端 URL/Host/Cookie 等字段，不跟随重定向。
- 会话来自原网站签发的 Bearer token。继续由原后端校验工厂归属、角色、机器关联关系和订单状态。
- 只传 JSON，不记录账号、密码和令牌。请求体上限 16 KiB，响应体上限 1 MiB。
- 回源总时限 2.2 秒，为免费函数 3 秒执行上限留余量。回源失败返回 502，超时返回 504。
- 云调用失败不回退 HTTP，不自动重试。写入 5xx、超时或未知结果时，小程序锁定再次提交，必须先在网站核对记录。

## 小程序配置

`miniprogram/config.js` 的 `connection` 为：

```js
{ mode: 'cloud', env: 'factory-miniapp-d2f8yb6s0afa796d', functionName: 'factoryProxy' }
```

登录页不显示服务器地址。环境或函数变化会清除旧会话，避免向另一环境发送旧令牌。`project.config.json` 已使用正式 AppID，并设置 `urlCheck: true`。

在云开发后台的环境管理中关联此正式小程序，按平台要求完成管理员扫码。无需向小程序或仓库写入 AppSecret。没有授权或关联时，不能通过关闭域名校验修复云调用。

## 后续更新与验证

函数包根目录应直接包含 `index.js`、`config.js`、`package.json`。在控制台上传 ZIP，使用普通云函数、执行方法 `index.main`，关闭自动安装依赖。函数无外部 npm 依赖。也可在已授权的 CLI 中按仓库 `cloudbaserc.json` 部署该函数，不要整体部署额外资源。

发布预览前：

1. 保持免费体验版，确认未开启付费升级、自动续费或超额按量。
2. 验证新 AppID 已关联环境，函数处于正常状态。
3. 使用隔离的演示工厂登录，验证机器、订单、搜索和详情；员工仍无单价。
4. 经转发函数录入加工/出货，在网站核对同一记录、合计和操作人。
5. 验证退出/过期返回登录，网站浏览器的独立会话仍可用。
6. 在开发者工具用正式 AppID 生成预览二维码，手机关闭调试模式后扫码验收。其他体验者依微信要求加入成员；预览二维码不是长期正式小程序码。

本地检查：

```bash
npx vitest run tests/miniapp/client.test.ts tests/miniapp/proxy.test.ts
npx tsc --noEmit
```

`proxy.test.ts` 使用真实本地 HTTP 验证固定回源、登录/写入结果、鉴权、非法路径、重定向、响应大小与超时不重试。它不能代替微信 SDK 真机联调。

## 免费期限

免费环境每月 3000 资源点，普通函数 3 秒上限。免费额度和期限以控制台为准；资源耗尽会影响 Demo。小程序发布后，官方规则会将免费环境到期时间调整为上线后的第 15 天。本次仅做预览，不提交审核或正式发布，也不承诺永久免费。

官方依据：[云函数调用](https://docs.cloudbase.net/cloud-function/how-use)、[控制台部署](https://docs.cloudbase.net/cloud-function/manage)、[免费规则和能力限制](https://cloud.tencent.com/document/product/876/127357)。

## 回退

云接入尚未通过真机验收时保留原 IP 演示包。开发调试可将 `connection.mode` 改回 `http` 并按旧方法开启手机调试；这不等于云函数方案已通过验收。回退不需要修改数据库。不要重置原数据库或执行生产 seed。
