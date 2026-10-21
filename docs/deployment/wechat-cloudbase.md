# 微信小程序 Demo：免费云函数与默认 HTTPS 网关

## 部署信息（2026-10-21）

| 项目 | 配置 |
| --- | --- |
| 原站点 | `http://42.194.184.98:18080` |
| 原服务器 | 广州轻量主机 `lhins-8khlj2p9` |
| 正式小程序 AppID | `wxaad3cf2f0c22bfe6` |
| 云环境 | `factory-miniapp-d2f8yb6s0afa796d`（上海，免费体验版，PG 模式） |
| 普通云函数 | `factoryProxy`，Node.js 20.19，256 MB，3 秒 |
| HTTPS 入口 | `https://factory-miniapp-d2f8yb6s0afa796d-1304793564.ap-shanghai.app.tcloudbase.com/factory-proxy` |
| 网关路由 | `/factory-proxy` → 普通云函数 `factoryProxy`，不透传路径，不启用浏览器跨域设置 |
| 代码 | `cloudfunctions/factoryProxy/` |
| 计费 | 免费体验环境已零元开通；未购买付费套餐，无自动续费或超限按量 |

免费 HTTPS 网关路由与普通云函数已部署。网关适配与客户端共 28 项测试、TypeScript 与针对改动文件的 ESLint 检查通过。2026-10-21 19:33 经实际公网网关的完整数据库联调通过（Playwright 1 passed，4.4 秒）：登录、机器/订单查询和搜索、加工 11、出货 4 与网页显示一致，员工不返回单价，非法机器和已完成订单禁止录入，退出后令牌失效且网站会话仍可用。隔离测试工厂已清理；前后业务数据计数均为工厂 2、用户 4、机器 15、订单 244、记录 355，网站 HTTP 200。

管理员已完成腾讯云终端身份验证；OrcaTerm 交互通道仍不稳定，最终通过原服务器的腾讯云自动化助手执行一次性验证，执行 ID `inv-ka6ka20ikt`、命令 ID `cmd-a69lybmv`、退出码 0。原服务器代码已快进更新到 `96fed2c`。日志和前后计数保存在服务器 `/home/ubuntu/factory-backups/gateway-20261021/`；未开启 COS 执行记录上传、定时任务或付费资源。

管理员已手动将上方 HTTPS 主机加入微信 request 合法域名。关闭并重新打开项目后，保持 `urlCheck: true`，真实小程序 `wx.request` 已收到正常 401 JSON。登录页通过官方 miniprogram-automator 实际点击登录按钮，使用不存在的临时账号收到原站点「账号或密码错误」，并正常结束 loading；随后清空测试输入和错误提示。正式 AppID 的新版本预览编译成功，体积 37,343 字节。真实云端完整业务联调已通过；手机扫码后的界面和操作体验仍需持有权限的微信用户验收，未宣称已完成手机实测。

环境类型说明：创建时选用了 PG 模式；微信开发者工具明确提示「暂不支持选择 PostgreSQL 环境」，不能以 `wx.cloud.callFunction` 直接导入。模式创建后不可切换，腾讯云与微信侧新建页目前均仅提供付费套餐。本次保留原免费环境，改用它提供的 HTTP 网关；未购买或删除环境。经管理员明确同意曾生成客户端 Publishable Key，用官方 JS SDK 探测 `/v1/functions/factoryProxy` 后仍返回 `EXCEED_AUTHORITY`，因此当前小程序不使用该 SDK 或公开密钥。未生成服务端管理员密钥。该客户端公开密钥保存在本地忽略目录，未写入仓库或小程序。

## 数据路径

小程序 `wx.request`（POST JSON）→ 腾讯云免费默认 HTTPS 网关 `/factory-proxy` → 普通云函数 `factoryProxy` → 原站点 `/api/miniapp/*` → 原 PostgreSQL。

网站继续使用原服务和原数据库。云环境自带数据库不存放工厂业务数据，不迁移、复制或重新 seed 原生产库。小程序仍使用网站客户账号；平台管理员账号不适用。

此方案不使用 AnyService，不购买域名。小程序到网关使用 HTTPS，需添加腾讯云提供的主机到微信 request 合法域名，保持域名校验开启。云函数到现有服务器仍是公网 HTTP，仅用于当前 Demo，不能声称全链路已加密。

## 函数行为

- 仅转发机器/订单查询、登录/退出和加工/出货这几类现有接口。目标服务器在部署端固定；忽略客户端 URL/Host/Cookie 等字段，不跟随重定向。
- 会话来自原网站签发的 Bearer token。继续由原后端校验工厂归属、角色、机器关联关系和订单状态。
- 只传 JSON，不记录账号、密码和令牌。请求体上限 16 KiB，响应体上限 1 MiB。
- 回源总时限 2.2 秒，为免费函数 3 秒执行上限留余量。回源失败返回 502，超时返回 504。
- 云调用失败不回退 HTTP，不自动重试。写入 5xx、超时或未知结果时，小程序锁定再次提交，必须先在网站核对记录。
- HTTP 网关仅接收外层 POST、JSON 字符串请求体，拒绝 Base64、超长或错误格式；解析后仍经过相同接口白名单与业务鉴权。响应使用集成格式，保留上游 HTTP 状态与 JSON，并设置 `cache-control: no-store`。
- 环境 OPA 策略见 `cloudfunctions/factoryProxy/gateway-policy.rego`：仅允许 `/factory-proxy` 的 POST；匿名/公开客户端对其他路径的访问明确拒绝。已用其他函数入口实测 403。策略不放开 CloudBase 数据库或其他资源，业务数据库始终由原站点鉴权。

## 小程序配置

`miniprogram/config.js` 的 `connection` 为：

```js
{ mode: 'gateway',
  url: 'https://factory-miniapp-d2f8yb6s0afa796d-1304793564.ap-shanghai.app.tcloudbase.com/factory-proxy' }
```

登录页不显示服务器地址。环境或函数变化会清除旧会话，避免向另一环境发送旧令牌。`project.config.json` 已使用正式 AppID，并设置 `urlCheck: true`。

无需反复扫码导入 PG 环境。当前方式只需 request 域名配置及网站客户账号，不需要将 AppSecret 或 CloudBase 管理员密钥写入小程序。模式限制见[官方环境介绍](https://docs.cloudbase.net/quick-start/env-overview)，网关请求/集成响应格式见[通过 HTTP 访问云函数](https://docs.cloudbase.net/service/access-cloud-function)，默认域名测试限制见[网关概述](https://docs.cloudbase.net/service/introduce)。

## 后续更新与验证

函数包根目录应直接包含 `index.js`、`config.js`、`package.json`，策略文件只是部署参考。在控制台上传 ZIP，使用普通云函数、执行方法 `index.main`，关闭自动安装依赖。函数无外部 npm 依赖。也可用已授权的微信 CLI `cloud functions deploy --project <miniprogram绝对路径> --env factory-miniapp-d2f8yb6s0afa796d --paths <factoryProxy绝对路径> --remote-npm-install false` 单独更新代码，不整体部署额外资源。网关与 OPA 在控制台维护，覆盖 OPA 前必须先读取并保留其他已有规则。

发布预览前：

1. 保持免费体验版，确认未开启付费升级、自动续费或超额按量。
2. 验证 request 合法域名已保存，网关路由与函数处于正常状态。
3. 使用隔离的演示工厂登录，验证机器、订单、搜索和详情；员工仍无单价。
4. 经转发函数录入加工/出货，在网站核对同一记录、合计和操作人。
5. 验证退出/过期返回登录，网站浏览器的独立会话仍可用。
6. 在开发者工具用正式 AppID 生成预览二维码，手机关闭调试模式后扫码验收。其他体验者依微信要求加入成员；预览二维码不是长期正式小程序码。

本地检查：

```bash
npx vitest run tests/miniapp/client.test.ts tests/miniapp/proxy.test.ts
npx tsc --noEmit
```

`proxy.test.ts` 使用真实本地 HTTP 验证网关封装、固定回源、登录/写入结果、鉴权、非法路径、重定向、响应大小与超时不重试。它不能代替微信真机联调。`tests/e2e/miniapp-cloud-proxy.spec.ts` 支持设置 `MINIAPP_GATEWAY_URL` 后经真实云端入口执行隔离工厂的登录、加工/出货、网页核对与退出测试；不设置时只验证本地转发逻辑到站点的路径。该测试必须连接已有站点运行，禁止为此重置或 seed 生产库。

## 免费期限

免费环境每月 3000 资源点，普通函数 3 秒上限。免费额度和期限以控制台为准；资源耗尽会影响 Demo。小程序发布后，官方规则会将免费环境到期时间调整为上线后的第 15 天。本次仅做预览，不提交审核或正式发布，也不承诺永久免费。

官方依据：[云函数调用](https://docs.cloudbase.net/cloud-function/how-use)、[控制台部署](https://docs.cloudbase.net/cloud-function/manage)、[免费规则和能力限制](https://cloud.tencent.com/document/product/876/127357)。

## 回退

云接入尚未通过真机验收时保留原 IP 演示包。开发调试可将 `connection.mode` 改回 `http` 并按旧方法开启手机调试；这不等于云函数方案已通过验收。回退不需要修改数据库。不要重置原数据库或执行生产 seed。
