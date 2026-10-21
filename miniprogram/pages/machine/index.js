const api = require('../../utils/api');
const format = require('../../utils/format');
Page({
  data: { machine: null, orderIndex: 0, selectedOrder: null, completedQuantity: '', shippedQuantity: '', notes: '', loading: false, submitting: false, error: '', uncertain: false },
  onLoad(options) { this.machineId = options.id; this.initialOrderId = options.orderId; },
  onShow() { if (api.requireAuth()) this.load(); },
  onPullDownRefresh() { this.load().finally(() => wx.stopPullDownRefresh()); },
  async load() {
    if (!api.requireAuth() || this.data.submitting) return;
    this.setData({ loading: true, error: '' });
    try {
      const result = await api.request('/machines/' + encodeURIComponent(this.machineId));
      const machine = format.machine(result.machine);
      const previousId = this.data.selectedOrder && this.data.selectedOrder.id || this.initialOrderId;
      const orderIndex = Math.max(0, machine.orders.findIndex(o => o.id === previousId));
      this.setData({ machine, orderIndex, selectedOrder: machine.orders[orderIndex] || null });
    } catch (error) { this.setData({ error: error.message, machine: null, selectedOrder: null }); }
    finally { this.setData({ loading: false }); }
  },
  selectOrder(e) {
    const orderIndex = Number(e.detail.value);
    this.setData({ orderIndex, selectedOrder: this.data.machine.orders[orderIndex] });
  },
  field(e) { this.setData({ [e.currentTarget.dataset.key]: e.detail.value }); },
  async submit() {
    if (this.data.submitting || this.data.loading || this.data.uncertain || !this.data.selectedOrder) return;
    // Lock before confirmation, so rapid taps cannot open multiple confirmation dialogs.
    this.setData({ submitting: true, error: '' });
    try {
      const parse = (value, label) => {
        if (!/^\d*$/.test(String(value))) throw new Error(label + '必须是非负整数');
        const quantity = Number(value || 0);
        if (!Number.isSafeInteger(quantity) || quantity > 2147483647) throw new Error(label + '过大');
        return quantity;
      };
      const completedQuantity = parse(this.data.completedQuantity, '加工数量');
      const shippedQuantity = parse(this.data.shippedQuantity, '出货数量');
      if (!completedQuantity && !shippedQuantity) throw new Error('请至少填写一项大于 0 的数量');
      const input = { machineId: this.machineId, orderId: this.data.selectedOrder.id,
        completedQuantity, shippedQuantity, notes: this.data.notes };
      const confirmed = await new Promise(resolve => wx.showModal({ title: '确认生产记录',
        content: this.data.selectedOrder.title + '\n加工 ' + completedQuantity + ' 件，出货 ' + shippedQuantity + ' 件',
        success: result => resolve(result.confirm), fail: () => resolve(false) }));
      if (!confirmed) return;
      try { await api.request('/records', { method: 'POST', data: input }); }
      catch (error) {
        if (error.uncertain || error.status >= 500) {
          this.setData({ uncertain: true });
          throw new Error('提交结果暂未确认，请先到网站核对记录；不要直接重复提交。核对后可退出此页重新录入。');
        }
        throw error;
      }
      this.setData({ completedQuantity: '', shippedQuantity: '', notes: '' });
      wx.showToast({ title: '记录已保存', icon: 'success' });
      // Save and refresh are separate: a failed refresh must not re-submit a saved record.
      this.setData({ submitting: false });
      await this.load();
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ submitting: false }); }
  },
  openOrder() { if (this.data.selectedOrder) wx.navigateTo({ url: '/pages/order/index?id=' + encodeURIComponent(this.data.selectedOrder.id) }); }
});
