// Fully synthetic data. IDs are confined to this dedicated demo workspace.
const WORKSPACE_ID = 'demo_cnc_20261027';
const WORKSPACE_NAME = '精工 CNC 演示工厂';
const DAY = 86400000;
function buildDemoFactory(asOf = new Date()) {
  const now = new Date(asOf);
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid demo date');
  const today = Date.parse(new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10) + 'T00:00:00+08:00');
  const at = (offset, minute = 540) => new Date(Math.min(today + offset * DAY + minute * 60000, now.getTime() - 3600000));
  const id = (kind, number) => `${WORKSPACE_ID}_${kind}_${String(number).padStart(2, '0')}`;
  const definitions = [
    ['CNC-01', '一号数控车床', 'CK6150', 'active'], ['CNC-02', '二号数控车床', 'CK6140', 'active'],
    ['VMC-01', '立式加工中心一', 'VMC850', 'active'], ['VMC-02', '立式加工中心二', 'VMC1060', 'active'],
    ['TC-01', '车铣复合中心', 'TMC-200', 'active'], ['CNC-03', '备用数控车床', 'CK6136', 'idle'],
    ['VMC-03', '维护中加工中心', 'VMC850', 'maintenance'], ['CNC-04', '停用备机', 'CK6140', 'disabled'],
  ];
  const machines = definitions.map(([code, name, model, status], index) => ({ id: id('machine', index + 1), workspaceId: WORKSPACE_ID,
    code, name, model, status, location: index < 5 ? 'A区精密加工车间' : 'B区辅助车间',
    notes: '虚构演示设备；' + (index === 6 ? '主轴检修，关联订单等待恢复' : '仅供功能演示'), createdAt: at(-29), updatedAt: at(-1) }));
  const parts = ['铝合金法兰', '不锈钢轴套', '定位销', '连接支架', '精密壳体', '传动轴', '铜衬套', '端盖', '阀体', '导向套'];
  const customers = ['示例客户·智航自动化', '示例客户·华星装备', '示例客户·锐科仪器', '示例客户·启辰机械', '示例客户·远拓精密'];
  const orders = [], assignments = [], records = [];
  for (let number = 1; number <= 30; number++) {
    const planned = 160 + ((number * 73) % 15) * 40;
    const category = number <= 6 ? 'completed' : number <= 12 ? 'ready' : number <= 18 ? 'overdue' : number <= 24 ? 'normal' : number <= 27 ? 'pending' : 'development';
    const completed = category === 'completed' || category === 'ready' ? planned : category === 'overdue' ? Math.floor(planned * (0.35 + (number % 4) * 0.1)) : category === 'normal' ? Math.floor(planned * (0.25 + (number % 4) * 0.1)) : 0;
    const shipped = category === 'completed' ? planned : category === 'ready' && number >= 10 ? Math.floor(planned * .35) : category === 'overdue' ? Math.floor(planned * .15) : category === 'normal' && number % 2 === 0 ? Math.floor(planned * .1) : 0;
    const endDay = category === 'completed' ? -13 + number : category === 'ready' ? -1 - number % 3 : category === 'overdue' ? (number === 18 ? -4 : -2) : 0;
    const workdays = Array.from({ length: 29 }, (_, i) => i - 28).filter(day => day <= endDay && new Date(today + day * DAY + 12 * 3600000).getUTCDay() !== 0).slice(-8);
    const dueDay = category === 'completed' ? endDay + (number <= 2 ? -2 : 2) : category === 'overdue' ? -(number % 5 + 1) : category === 'ready' ? 1 + number % 3 : 3 + number % 8;
    const status = category === 'completed' ? 'completed' : category === 'pending' ? 'processing_pending' : category === 'development' ? 'development_pending' : 'in_progress';
    const order = { id: id('order', number), workspaceId: WORKSPACE_ID, orderNo: `DEMO-CNC-${String(number).padStart(3, '0')}`,
      customerName: customers[(number - 1) % customers.length], partName: parts[(number - 1) % parts.length], plannedQuantity: planned,
      unitPriceCents: 2800 + (number % 9) * 1250, dueDate: new Date(today + dueDay * DAY + 17 * 3600000), status,
      notes: `完全虚构的 CNC 演示订单；场景：${{completed:'历史完成',ready:'加工完成待出货',overdue:'逾期未交',normal:'正常加工',pending:'待加工/等待毛坯',development:'图纸工艺评审'}[category]}`,
      closedAt: category === 'completed' ? at(endDay, 900) : null,
      createdByUserId: id('user', 1), updatedByUserId: id('user', 1), createdAt: at((workdays[0] ?? -1) - 1), updatedAt: at(endDay, 900) };
    orders.push(order);
    const machineIndex = number === 18 ? 6 : number === 6 ? 5 : (number - 1) % 5;
    const assigned = number === 22 ? [machineIndex, 3] : [machineIndex];
    if (status === 'in_progress') for (const index of [...new Set(assigned)]) assignments.push({ workspaceId: WORKSPACE_ID, machineId: machines[index].id, orderId: order.id, createdAt: order.createdAt });
    if (!completed) continue;
    for (let chunk = 0; chunk < 8; chunk++) {
      const quantity = Math.floor(completed * (chunk + 1) / 8) - Math.floor(completed * chunk / 8);
      const recordedAt = at(workdays[chunk], 510 + number % 20);
      const machineId = machines[assigned[chunk % assigned.length]].id;
      const actor = id('user', 2 + chunk % 3);
      records.push({ id: id(`record_${number}_completed`, chunk + 1), workspaceId: WORKSPACE_ID, machineId, orderId: order.id,
        recordedAt, type: 'completed', quantity, notes: '虚构演示：加工报工', createdByUserId: actor, updatedByUserId: actor, createdAt: recordedAt, updatedAt: recordedAt });
      if (shipped && chunk % 2 === 1) {
        const shipment = (chunk - 1) / 2;
        const shipAt = new Date(Math.min(recordedAt.getTime() + 15 * 60000, now.getTime() - 1000));
        records.push({ id: id(`record_${number}_shipped`, shipment + 1), workspaceId: WORKSPACE_ID, machineId, orderId: order.id,
          recordedAt: shipAt, type: 'shipped', quantity: Math.floor(shipped * (shipment + 1) / 4) - Math.floor(shipped * shipment / 4),
          notes: '虚构演示：分批出货', createdByUserId: id('user', 1), updatedByUserId: id('user', 1), createdAt: shipAt, updatedAt: shipAt });
      }
    }
  }
  return { workspace: { id: WORKSPACE_ID, name: WORKSPACE_NAME }, machines, orders, assignments, records };
}
module.exports = { WORKSPACE_ID, WORKSPACE_NAME, buildDemoFactory };
