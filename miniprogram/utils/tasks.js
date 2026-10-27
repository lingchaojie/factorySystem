const { queryTime } = require('./chat');
function decorate(item) {
  return Object.assign({}, item, { statusLabel: { pending: '待处理', in_progress: '处理中', completed: '已完成' }[item.status] || '未知状态',
    assigneeLabel: item.assignee ? item.assignee.displayName : '员工账号已移除',
    dueDateLabel: item.dueDate || '无截止日期', createdAtLabel: queryTime(item.createdAt), completedAtLabel: item.completedAt ? queryTime(item.completedAt) : '' });
}
module.exports = { decorate };
