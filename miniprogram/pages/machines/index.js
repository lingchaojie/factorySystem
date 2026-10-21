const api = require('../../utils/api');
const format = require('../../utils/format');
Page({
  data: { machines: [], loading: false, error: '', workspaceName: '' },
  onShow() { if (api.requireAuth()) this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    if (!api.requireAuth()) return;
    this.setData({ loading: true, error: '', workspaceName: api.session().user.workspaceName });
    try {
      const result = await api.request('/machines');
      this.setData({ machines: result.machines.map(format.machine) });
    } catch (error) { this.setData({ error: error.message, machines: [] }); }
    finally { this.setData({ loading: false }); }
  },
  open(e) { wx.navigateTo({ url: '/pages/machine/index?id=' + encodeURIComponent(e.currentTarget.dataset.id) }); }
});
