# 微信小程序 Demo（免费云函数转发）

原生微信小程序，无需安装前端依赖或编译。支持网站客户账号登录、机器和订单查询、订单详情与记录、按机器关联订单录入加工/出货、退出登录。经理可以看订单单价，员工接口不返回价格。平台管理员 `/admin` 账号不用于这里登录。

当前默认通过免费普通云函数 `factoryProxy` 访问原服务器，与网站使用同一数据库。使用正式 AppID `wxaad3cf2f0c22bfe6`，云环境为 `factory-miniapp-d2f8yb6s0afa796d`。云环境和函数已零元开通，仍需完成小程序关联及真机联调后才可宣称扫码可用。部署与免费期限见 [云函数接入文档](../docs/deployment/wechat-cloudbase.md)。以下 IP 调试步骤仅在主动将 `config.js` 中 `connection.mode` 改为 `http` 时适用。

## 1. 启动 / 更新同一个后台

小程序访问本仓库新增的 `/api/miniapp/*`，数据库、账号及生产记录与网站完全共用。无数据库结构变更。

- 本地开发：按根目录 README 启动 PostgreSQL 和 `npm run dev`（本项目默认监听 `0.0.0.0:3000`）。
- 已有服务器：将本次代码更新到服务器，沿用 `scripts/deploy-production.sh` 重建启动。仅导入小程序、没有更新服务器会出现接口 404。
- 保留已有数据库和客户账号。不要为了小程序重新 seed 生产库。
- 通过网站经理账号创建机器和订单，并把未完成订单关联到机器。也可使用已有业务数据。

## 2. 导入微信开发者工具

1. 导入本仓库的 `miniprogram` 目录，而不是仓库根目录。
2. `project.config.json` 使用 `touristappid` 方便先在工具中查看；真实手机预览/调试请使用你自己的、具备对应预览权限的小程序 AppID 或工具提供的测试 AppID。游客模式的真机能力不能保证。
3. 确认“详情 / 本地设置”中的“不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书”已勾选。本项目设置 `urlCheck: false`，工具的个人设置仍可能覆盖它。
4. 无需“构建 npm”。登录页输入服务器地址及网站客户账号密码。

地址示例：

当前 Demo 默认连接 `http://42.194.184.98:18080`；登录页仍可改为其他服务器或本地地址。

| 环境 | 输入地址 |
| --- | --- |
| 开发工具和后台同一电脑 | `http://127.0.0.1:3000` |
| 手机与开发电脑同一局域网 | `http://192.168.1.10:3000`（换成电脑真实 IP） |
| 已有公网服务器 | `http://服务器公网IP:18080` |

地址只能包含协议、主机和可选端口，不要加 `/login`、`/api` 或其他路径。小程序会记住地址，不保存密码。

## 3. 手机扫码调试

- 使用开发者工具的“真机调试”或有权限的“预览”扫码，在手机的小程序菜单中开启调试；必要时退出再进入。
- 电脑上关闭域名校验不代表手机会自动关闭。IP + HTTP 方案仅用于开发调试，不是正式发布配置；请用目标手机验证。
- 手机的 `127.0.0.1` 指向手机自身，不是电脑或云服务器。
- 本地调试确保手机和电脑可互访、端口未被防火墙拦截；WSL 开发时还需确保 Windows 到 WSL 的局域网转发可用。
- 公网调试确保服务器安全组放行现有网站端口（默认 18080）。先用手机浏览器访问同一个地址的 `/login`，确认连通。

## 4. 双端演示流程

1. 网站：经理创建订单和机器，关联订单。
2. 小程序：同一工厂账号登录 → 机器 → 选择机器 → 选择关联订单。
3. 输入本次加工 / 出货数量，核对弹窗后提交。两项可同时录入，至少一项大于零。
4. 网站：刷新 `/records`、订单详情或机器详情，确认数量与操作人。
5. 网站录入或修改数据后，小程序下拉刷新；切回列表 / 详情也会刷新。没有实时推送。
6. 已完成订单无法继续录入；关联关系或订单状态发生变化时，以服务端校验为准。

提交不会自动重试。点击期间按钮锁定；若超时或服务器错误，结果可能未知，页面锁定再次提交，请先在网站核对是否已写入，再退出页面决定是否重录。本 Demo 未实现跨请求幂等键。

## 接口

所有返回均为 JSON、`Cache-Control: no-store`。业务请求使用 `Authorization: Bearer <token>`，不依赖浏览器 Cookie。

- `POST /api/miniapp/auth/login`：`{ username, password }` → `{ token, user }`
- `GET /api/miniapp/auth/me`：当前账号
- `POST /api/miniapp/auth/logout`：撤销当前令牌
- `GET /api/miniapp/machines` / `GET /api/miniapp/machines/:id`
- `GET /api/miniapp/orders?query=&status=` / `GET /api/miniapp/orders/:id`
- `POST /api/miniapp/records`：`{ machineId, orderId, completedQuantity, shippedQuantity, notes? }`

工厂归属和操作人来自服务端登录态，不能由客户端指定。录入时间采用服务器当前时间。过期 / 撤销令牌返回 401 并返回登录页。网站继续使用原 Cookie 登录。

HTTP 调试会明文传输凭据，只使用演示账号和演示数据。云模式通过 `wx.cloud.callFunction` 调用普通云函数，不使用 AnyService；云函数到当前 HTTP 源站的链路仍未加密，不能视为全链路加密。

## 开发验证

在仓库根目录运行。数据库测试应指向专用测试库，不要指向业务库。

```bash
npm run test:run
npx tsc --noEmit
npm run build
# HTTP 联调（启动本地网站，验证小程序录入后网页能显示记录）：
npm run test:e2e -- tests/e2e/miniapp-api.spec.ts --project=chromium-desktop
```

`tests/integration/miniapp-flow.test.ts` 使用真实 PostgreSQL 验证双端业务层数据、权限和令牌失效；`tests/miniapp/client.test.ts` 验证原生页面逻辑与网络处理。这些检查不能代替微信开发者工具编译和真实手机预览。
