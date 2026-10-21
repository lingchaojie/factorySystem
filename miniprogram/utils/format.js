const orderLabels = { development_pending: '待开发', processing_pending: '待加工', in_progress: '进行中', completed: '已完成' };
const machineLabels = { active: '正常', idle: '空闲', maintenance: '维护中', disabled: '停用' };
function date(value, withTime) {
  if (!value) return '未填写';
  const d = new Date(new Date(value).getTime() + 8 * 3600000);
  const pad = n => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
    (withTime ? ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) : '');
}
function order(value) {
  return Object.assign({}, value, {
    title: value.customerName + ' / ' + value.partName,
    statusLabel: orderLabels[value.status], dueDateLabel: date(value.dueDate),
    planLabel: value.plannedQuantity == null ? '未设定' : value.plannedQuantity,
    priceLabel: value.unitPriceCents == null ? '未定价' : '¥' + (value.unitPriceCents / 100).toFixed(2)
  });
}
function machine(value) {
  return Object.assign({}, value, { statusLabel: machineLabels[value.status], orders: value.orders.map(order) });
}
module.exports = { date, order, machine };
