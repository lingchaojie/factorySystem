# Factory System Current State

本文档记录当前已实现功能、开发调试经验和生产部署约定。

## 已实现功能

### 平台运维后台

- 入口：`/admin`，登录页：`/admin/login`。
- 平台管理员可以创建 workspace，也就是客户工厂。
- 每个 workspace 可以创建多个客户账号。
- 客户账号有 `manager` 和 `employee` 两种角色。
- 平台管理员账号和客户账号使用独立 session cookie。

### 客户登录和权限

- 客户从 `/login` 登录，账号由平台管理员创建，不开放自助注册。
- 客户登录后左上角显示 workspace 名称。
- `manager` 可以使用当前全部业务功能。
- `employee` 不能创建或修改订单，不能上传或覆盖订单图纸。
- `employee` 在订单列表和订单详情中看不到单价、金额和经营面板。

### 机器管理

- 机器创建只需要机器名称和备注，历史上的编号字段现在作为机器名称使用。
- 机器可维护状态：正常、空闲、维护中、停用。
- 机器可以关联订单；关联待开发或待加工订单后，订单会进入进行中。
- 机器详情页录入生产数据，支持一次同时录入加工数量和出货数量。
- 机器列表显示当前订单、今日加工和今日出货。

### 订单管理

- 订单号自动生成，用户不需要手动填写。
- 订单包含客户名称、工件名称、计划数量、单价、交期和备注。
- 计划数量和单价可以为空。
- 订单状态：待开发、待加工、进行中、完成。
- 新订单默认待开发。
- 上传图纸后，未关联机器的订单进入待加工。
- 关联机器后订单进入进行中。
- 订单支持编辑基础信息和状态，状态修改不再单独入口。
- 完成订单不能再关联机器，也不能新增、修改或删除生产记录。

### 图纸文件

- 订单详情页支持一个按钮上传单个文件或整个文件夹。
- 重新上传会覆盖该订单原有图纸。
- 上传后按目录树展示文件夹结构。
- 点击文件可下载单文件，点击文件夹可下载该目录的 zip 包。

### 生产记录

- 生产记录从机器详情页录入。
- 后端会把加工和出货拆成独立记录行保存，方便后续统计。
- 记录页可以按记录类型、订单、订单状态、客户和日期筛选。
- 记录编辑入口在每条记录右侧的修改弹窗里。
- 记录显示录入人和修改人。

### 筛选和搜索

- 机器、订单、记录等核心面板支持多选筛选。
- 搜索使用模糊匹配，例如客户名、订单号、工件名、机器名称。
- 记录页不再按机器筛选，改为按加工/出货类型筛选。

### 经营面板

- 入口：`/analytics`，仅 `manager` 可见。
- 支持按日期范围查看营业额、加工数量、出货数量和未定价出货提醒。
- 包含客户营业额占比、每日趋势、订单状态分布和异常提示。
- 营业额按出货数量乘订单单价计算。

## 本地调试经验

本地开发优先直接在 WSL 中跑 Node.js 和 PostgreSQL，不启用 Docker。Docker 主要用于生产部署或需要验证生产 compose 栈时使用。

推荐本地流程：

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

如果本地 PostgreSQL 跑在 WSL 的 `5432`，把 `.env` 中的 `DATABASE_URL` 改成：

```env
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public"
```

Windows 浏览器访问：

```text
http://localhost:3000
```

常用排查：

- 看 3000 是否被旧 Next 进程占用：`ss -ltnp | rg ':3000'`
- 停掉旧进程：`kill <pid>`
- 如果先跑了 `npm run build` 再继续跑 dev，出现 Next manifest 或 devtools 相关 500，可以停 dev server 后执行 `rm -rf .next`，再重新 `npm run dev`。
- 登录后如果跳到 `0.0.0.0:3000`，说明重定向 host 配置有问题；当前代码已修复为优先使用浏览器请求的 host。
- 本地烟测账号可通过 seed 或脚本创建；生产客户账号必须从 `/admin` 创建。

## 生产部署约定

生产环境使用 Docker Compose，包含：

- `db`：PostgreSQL
- `web`：Next.js 应用
- `caddy`：HTTP/HTTPS 入口

服务器上部署：

```bash
cd ~/FactorySystem
git checkout main
git pull --ff-only
scripts/deploy-production.sh
```

部署脚本只使用当前 checkout，不会自动拉代码或切分支。需要部署其他分支时，先在服务器上切到目标分支，再运行同一个脚本：

```bash
git checkout some-branch
git pull --ff-only origin some-branch
scripts/deploy-production.sh
```

生产环境变量保存在服务器本地：

```text
~/FactorySystem/deploy/production/.env.production
```

该文件不会提交到 git。重复部署会保留已有 `.env.production`，不会重置生产密码。

无域名、同机部署多个项目时，FactorySystem 生产入口默认让出 `80/443`，使用宿主机 `18080`：

```env
APP_SITE_ADDRESS=:80
APP_ORIGIN=http://服务器公网IP:18080
APP_HTTP_PORT=18080
APP_HTTPS_PORT=18443
SESSION_COOKIE_SECURE=false
```

腾讯云安全组需要放行 `18080/tcp`，访问地址是 `http://服务器公网IP:18080/login`。
这次端口隔离的背景、涉及文件和后续拆分部署时的调整方式记录在 `docs/deployment/production-port-isolation.md`。

数据库迁移由容器入口自动执行：

```bash
npx prisma migrate deploy
```

这意味着生产部署时会自动应用已提交的 Prisma migration，但不会自动清空业务数据。

## 生产数据维护

清库脚本：

```bash
scripts/clear-production-db.sh --confirm CLEAR_PRODUCTION_DB
```

跳过备份：

```bash
scripts/clear-production-db.sh --skip-backup --confirm CLEAR_PRODUCTION_DB
```

完全清空 workspace、用户和业务数据：

```bash
scripts/clear-production-db.sh --mode all --confirm CLEAR_PRODUCTION_DB
```

默认会先备份数据库，并清理图纸文件卷。更多命令见 `docs/deployment/tencent-cvm.md`。

## 验证命令

常用本地验证：

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm test -- --run
npm run lint
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run build
```
