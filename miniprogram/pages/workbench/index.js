const api = require('../../utils/api');
const { queryTime } = require('../../utils/chat');
Page({
  data: { view: 'risks', items: [], summary: null, query: '', scope: '', page: 1, total: 0, hasMore: false, loading: false, error: '', time: '', factory: '', rules: false },
  onShow() {
    if (!api.requireAuth()) return;
    const owner = api.session().token;
    if (this.owner !== owner) { this.owner = owner; this.setData({ items: [], summary: null, query: '', view: 'risks' }); }
    this.setData({ factory: api.session().user.workspaceName });
    this.load();
  },
  onUnload() { this.sequence = (this.sequence || 0) + 1; },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  field(e) { this.setData({ query: e.detail.value }); },
  choose(e) { this.setData({ view: e.currentTarget.dataset.view }); this.load(); },
  toggleRules() { this.setData({ rules: !this.data.rules }); },
  async load() { this.search = this.data.query.trim(); return this.fetchPage(1); },
  async more() { if (!this.data.loading && this.data.hasMore) return this.fetchPage(this.data.page + 1); },
  async fetchPage(page) {
    if (!api.requireAuth()) return;
    const owner = api.session().token;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    this.setData({ loading: true, error: '', ...(page === 1 ? { items: [], summary: null, scope: '', total: 0, hasMore: false, time: '' } : {}) });
    try {
      const result = await api.request('/workbench?view=' + this.data.view + '&page=' + page + '&query=' + encodeURIComponent(this.search || ''));
      if (sequence !== this.sequence || !api.session() || api.session().token !== owner) return;
      const items = result.items.map(o => Object.assign({}, o, { machineLabel: o.machines.map(m => m.code).join(' / ') || '尚未排机' }));
      this.setData({ items: page === 1 ? items : this.data.items.concat(items), summary: result.summary,
        page: result.page, total: result.total, hasMore: result.hasMore, scope: result.scope || '', time: queryTime(result.queriedAt) });
    } catch (error) { if (sequence === this.sequence) this.setData({ error: error.message }); }
    finally { if (sequence === this.sequence) this.setData({ loading: false }); }
  },
  open(e) { wx.navigateTo({ url: '/pages/order/index?id=' + encodeURIComponent(e.currentTarget.dataset.id) }); },
  ask() { wx.switchTab({ url: '/pages/assistant/index' }); }
});
