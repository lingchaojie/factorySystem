const api = require('../../utils/api');
const format = require('../../utils/format');
Page({
  data: { order: null, manager: false, loading: false, error: '' },
  onLoad(options) { this.orderId = options.id; },
  onShow() { if (api.requireAuth()) this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    if (!api.requireAuth()) return;
    this.setData({ loading: true, error: '', manager: api.session().user.role === 'manager' });
    try {
      const result = await api.request('/orders/' + encodeURIComponent(this.orderId));
      const order = format.order(result.order);
      order.records = order.records.map(r => Object.assign({}, r, {
        typeLabel: r.type === 'completed' ? '加工' : '出货', timeLabel: format.date(r.recordedAt, true)
      }));
      this.setData({ order });
    } catch (error) { this.setData({ error: error.message, order: null }); }
    finally { this.setData({ loading: false }); }
  },
  openMachine(e) { wx.navigateTo({ url: '/pages/machine/index?id=' + encodeURIComponent(e.currentTarget.dataset.id) + '&orderId=' + encodeURIComponent(this.orderId) }); }
});
