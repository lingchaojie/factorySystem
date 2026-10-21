const api = require('../../utils/api');
const format = require('../../utils/format');
Page({
  data: { orders: [], query: '', statuses: ['全部状态', '待开发', '待加工', '进行中', '已完成'], statusIndex: 0, loading: false, error: '' },
  onShow() { if (api.requireAuth()) this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  query(e) { this.setData({ query: e.detail.value }); },
  status(e) { this.setData({ statusIndex: Number(e.detail.value) }); this.load(); },
  async load() {
    if (!api.requireAuth()) return;
    const sequence = this.sequence = (this.sequence || 0) + 1;
    this.setData({ loading: true, error: '' });
    const statuses = ['', 'development_pending', 'processing_pending', 'in_progress', 'completed'];
    const query = '?query=' + encodeURIComponent(this.data.query) + '&status=' + statuses[this.data.statusIndex];
    try {
      const result = await api.request('/orders' + query);
      if (sequence === this.sequence) this.setData({ orders: result.orders.map(format.order) });
    } catch (error) { if (sequence === this.sequence) this.setData({ error: error.message, orders: [] }); }
    finally { if (sequence === this.sequence) this.setData({ loading: false }); }
  },
  open(e) { wx.navigateTo({ url: '/pages/order/index?id=' + encodeURIComponent(e.currentTarget.dataset.id) }); }
});
