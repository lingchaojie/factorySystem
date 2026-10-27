const api = require('../../utils/api');
const { decorate } = require('../../utils/tasks');
Page({
  data: { manager: false, items: [], summary: null, scope: '', statuses: ['未完成', '已完成', '全部事项'], statusIndex: 0,
    page: 1, total: 0, hasMore: false, loading: false, error: '', showCreate: false, optionsLoading: false, creating: false,
    title: '', description: '', dueDate: '', today: '', employees: [], employeeLabels: [], employeeIndex: 0,
    orders: [], orderLabels: ['不关联订单'], orderIndex: 0 },
  onShow() {
    if (!api.requireAuth()) return;
    const session = api.session();
    if (this.owner !== session.token) { this.owner = session.token; this.submission = null; this.setData({ items: [], summary: null, showCreate: false, title: '', description: '', employees: [], orders: [], creating: false, statusIndex: 0 }); }
    this.setData({ manager: session.user.role === 'manager', today: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10) });
    this.load();
  },
  owns(token) { return !this.disposed && api.session() && api.session().token === token && this.owner === token; },
  onUnload() { this.disposed = true; this.sequence = (this.sequence || 0) + 1; },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  choose(e) { this.setData({ statusIndex: Number(e.detail.value) }); this.load(); },
  async load() { return this.fetchPage(1); },
  async more() { if (!this.data.loading && this.data.hasMore) return this.fetchPage(this.data.page + 1); },
  async fetchPage(page) {
    if (!api.requireAuth()) return;
    const token = this.owner, sequence = this.sequence = (this.sequence || 0) + 1;
    this.setData({ loading: true, error: '', ...(page === 1 ? { items: [] } : {}) });
    try {
      const result = await api.request('/tasks?status=' + ['pending', 'completed', 'all'][this.data.statusIndex] + '&page=' + page);
      if (!this.owns(token) || sequence !== this.sequence) return;
      this.setData({ items: page === 1 ? result.items.map(decorate) : this.data.items.concat(result.items.map(decorate)), summary: result.summary,
        scope: result.scope, page, total: result.total, hasMore: result.hasMore });
    } catch (error) { if (this.owns(token) && sequence === this.sequence) this.setData({ error: error.message }); }
    finally { if (this.owns(token) && sequence === this.sequence) this.setData({ loading: false }); }
  },
  async createForm() {
    if (!this.data.manager || this.data.optionsLoading || this.data.creating) return;
    if (this.data.showCreate) { this.setData({ showCreate: false }); return; }
    const token = this.owner; this.setData({ optionsLoading: true, error: '' });
    try {
      const result = await api.request('/tasks/options');
      if (!this.owns(token)) return;
      if (!result.employees.length) throw new Error('请先在网站为本工厂创建员工账号');
      this.setData({ showCreate: true, employees: result.employees, employeeLabels: result.employees.map(e => e.displayName + '（' + e.username + '）'),
        orders: result.orders, orderLabels: ['不关联订单'].concat(result.orders.map(o => o.orderNo + ' · ' + o.partName)), employeeIndex: 0, orderIndex: 0 });
    } catch (error) { if (this.owns(token)) this.setData({ error: error.message }); }
    finally { if (this.owns(token)) this.setData({ optionsLoading: false }); }
  },
  field(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  employee(e) { this.setData({ employeeIndex: Number(e.detail.value) }); },
  order(e) { this.setData({ orderIndex: Number(e.detail.value) }); },
  due(e) { this.setData({ dueDate: e.detail.value }); },
  clearDue() { this.setData({ dueDate: '' }); },
  async submit() {
    if (!this.data.manager || this.data.creating || !api.requireAuth()) return;
    const employee = this.data.employees[this.data.employeeIndex];
    if (!this.data.title.trim() || !employee) { this.setData({ error: '请填写标题并选择员工' }); return; }
    const token = this.owner;
    const payload = { title: this.data.title.trim(), description: this.data.description.trim(), assigneeUserId: employee.id,
      orderId: this.data.orderIndex ? this.data.orders[this.data.orderIndex - 1].id : null, dueDate: this.data.dueDate || null };
    const fingerprint = JSON.stringify(payload);
    if (!this.submission || this.submission.fingerprint !== fingerprint) this.submission = { fingerprint, requestId: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14) };
    this.setData({ creating: true, error: '' });
    try {
      await api.request('/tasks', { method: 'POST', data: Object.assign({}, payload, { requestId: this.submission.requestId }) });
      if (!this.owns(token)) return;
      this.submission = null; this.setData({ showCreate: false, title: '', description: '', dueDate: '', statusIndex: 0 });
      wx.showToast({ title: '事项已指派', icon: 'success' }); await this.load();
    } catch (error) { if (this.owns(token)) this.setData({ error: error.uncertain ? '创建结果待确认，请刷新事项列表核对；再次提交相同内容会复用请求编号。' : error.message }); }
    finally { if (this.owns(token)) this.setData({ creating: false }); }
  },
  open(e) { wx.navigateTo({ url: '/pages/task/index?id=' + encodeURIComponent(e.currentTarget.dataset.id) }); }
});
