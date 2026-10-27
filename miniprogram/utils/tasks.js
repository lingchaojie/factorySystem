const { queryTime } = require('./chat');
function decorate(item) {
  return Object.assign({}, item, { statusLabel: item.status === 'completed' ? '已完成' : item.overdue ? '已逾期' : '待完成',
    assigneeLabel: item.assignee ? item.assignee.displayName : '员工账号已移除',
    dueDateLabel: item.dueDate || '无截止日期', createdAtLabel: queryTime(item.createdAt), completedAtLabel: item.completedAt ? queryTime(item.completedAt) : '' });
}
module.exports = { decorate };
