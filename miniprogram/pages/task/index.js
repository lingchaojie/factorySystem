const api = require('../../utils/api');
const { decorate } = require('../../utils/tasks');
Page({
  data: { id: '', item: null, loading: false, updating: false, error: '' },
  onLoad(options) { this.setData({ id: options.id || '' }); },
  onShow() { if (api.requireAuth()) this.load(); },
  onUnload() { this.disposed = true; },
  owns(token) { return !this.disposed && api.session() && api.session().token === token; },
  async load() {
    if (!api.requireAuth()) return;
    const token = api.session().token; this.setData({ loading: true, error: '', item: null });
    try { const result = await api.request('/tasks/' + encodeURIComponent(this.data.id)); if (this.owns(token)) this.setData({ item: decorate(result.item) }); }
    catch (error) { if (this.owns(token)) this.setData({ error: error.message }); }
    finally { if (this.owns(token)) this.setData({ loading: false }); }
  },
  async setStatus(e) {
    if (this.data.updating || !this.data.item || !api.requireAuth()) return;
    const status = e.currentTarget.dataset.status;
    if (!['pending', 'in_progress', 'completed'].includes(status) || status === this.data.item.status) return;
    const token = api.session().token;
    this.setData({ updating: true, error: '' });
    try {
      const result = await api.request('/tasks/' + encodeURIComponent(this.data.id) + '/status', { method: 'POST', data: { status } });
      if (this.owns(token)) { this.setData({ item: decorate(result.item) }); wx.showToast({ title: '已设为' + decorate(result.item).statusLabel, icon: 'success' }); }
    } catch (error) { if (this.owns(token)) this.setData({ error: error.uncertain ? '操作结果待确认，请刷新事项核对状态。' : error.message }); }
    finally { if (this.owns(token)) this.setData({ updating: false }); }
  },
  openOrder() { if (this.data.item && this.data.item.order) wx.navigateTo({ url: '/pages/order/index?id=' + encodeURIComponent(this.data.item.order.id) }); }
});
