# 小程序指派事项

经理在今日工作台点击“员工指派事项”，创建标题、说明、负责人、可选截止日期和可选关联订单。员工在同一入口查看“我的指派事项”，可标记完成或重新打开。经理查看本工厂全部事项。列表支持未完成/已完成/全部筛选及分页，显示负责人、截止日期、逾期和关联订单。

这是持久化的经理指派事项，与工作台按订单计算的系统自动待办分别展示。不会自动发送微信通知，也不会自动修改生产记录或订单状态。

## 权限与一致性

- 所有接口使用现有 Bearer 会话；workspaceId 和创建/完成人由服务端确定。
- 创建、员工与订单选项仅经理可用；负责人必须是本工厂员工，订单必须属于本工厂。
- 员工列表、详情、完成/重开均限定自己的 assigneeUserId；经理限定本工厂。
- 创建使用按工厂唯一的 requestId 和请求内容摘要，相同请求重复提交返回原事项；换内容或创建人不能复用该编号。
- 完成/重开按目标状态处理，重复“完成”不会覆盖原完成时间。所有写入条件保留工厂和负责人限制。
- DTO 不返回密码、单价、客户资料或请求摘要。删除员工账号或订单时，仅将对应引用置空，事项历史保留。
- 助手已有“今日待办”仍指订单自动待办；指派事项通过本页操作，不新增模型写入能力。

## 接口

- GET /api/miniapp/tasks?status=pending|completed|all&page=1
- POST /api/miniapp/tasks
- GET /api/miniapp/tasks/options（经理）
- GET /api/miniapp/tasks/:id
- POST /api/miniapp/tasks/:id/status，body 为 status: pending|completed

免费 factoryProxy 添加以上路径白名单。没有删除接口，没有批量或跨工厂接口。

## 数据库与部署

新增 WorkItemStatus 和 WorkItem 表，迁移 20261027080000_work_items。迁移只新增结构，不更新既有业务行。生产构建复用现有字体；先备份数据库，核验待执行迁移仅此一项，再显式执行 prisma migrate deploy，使用覆盖后的 npm run start 启动，不执行 seed。

用 scripts/audit-factory-business.cjs 核对原有七类业务表部署前后摘要相同。联调仅用 demo_cnc_20261027 演示工厂，新增标注“演示”的事项用于经理/不同员工隔离和订单关联验证，不在锦强创建或修改事项。

## 2026-10-27 部署验收

- 后台 33188b4 已部署，免费 factoryProxy 已更新；小程序开发版 1.3.0 已上传，最终包 694,081 字节。未提交审核或正式发布，体验成员使用新版需在微信后台将 1.3.0 设为体验版。
- 89 项相关测试通过，TypeScript、ESLint、Prisma schema 校验和生产构建通过。
- HTTPS 网关验证经理创建、可选关联订单、员工完成、经理重开、重复创建去重、重复完成保留时间，以及不同员工和跨工厂访问拒绝。
- 微信原生工具实际完成经理创建 → 退出登录 → 员工登录 → 查看自己的事项 → 标记完成 → 跳转关联订单；订单加工/出货数量未变化。演示工厂共保留 4 条标注“演示”的事项，未在锦强写入事项。
- 原网站登录及机器、订单、经营页面回归通过。原有七类业务表摘要仍为 ee0d8981f37c727a9a200b13857971f2a10841efa6d81c2e4164ceeebb1433d5，计数 [3,8,23,286,624,40,128]。
- 仅执行新增表迁移，未执行 seed；服务器备份及审计位于 /home/ubuntu/factory-backups/assignments-20261027/。执行记录 inv-rae85mg8xk，退出码 0。
- 本机证据在忽略目录 dist/assigned-tasks-api-verification.json、dist/assigned-tasks-native-verification.json、dist/assigned-tasks-deployed-verified.png。
