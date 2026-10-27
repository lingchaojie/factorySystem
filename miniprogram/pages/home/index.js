const api = require('../../utils/api');
const imageCredits = require('../../assets/company/credits');
const photos = {
  workshop: '/assets/company/workshop.jpg', machining: '/assets/company/five-axis.jpg',
  gears: '/assets/company/gears.jpg', parts: '/assets/company/turned-parts.jpg'
};
Page({
  data: { loggedIn: false, activeSection: 'about', creditsOpen: false, failedImages: {}, photos, imageCredits,
    sections: [{ id: 'about', label: '公司介绍', english: 'ABOUT', number: '01' },
      { id: 'machining', label: '精密加工', english: 'PROCESS', number: '02' },
      { id: 'products', label: '生产件展示', english: 'PARTS', number: '03' }] },
  onShow() {
    const loggedIn = !!api.session();
    this.setData({ loggedIn });
  },
  selectSection(e) {
    const section = e.currentTarget.dataset.section;
    if (!this.data.sections.some(item => item.id === section) || section === this.data.activeSection) return;
    this.setData({ activeSection: section, creditsOpen: false });
  },
  toggleCredits() { this.setData({ creditsOpen: !this.data.creditsOpen }); },
  copyCredit(e) {
    const credit = imageCredits.find(item => item.id === e.currentTarget.dataset.id);
    if (credit) wx.setClipboardData({ data: credit.title + '\n' + credit.author + ' · ' + credit.license + '\n' + credit.source + '\n' + credit.licenseUrl });
  },
  previewPhoto(e) {
    const current = photos[e.currentTarget.dataset.photo];
    if (current) wx.previewImage({ current, urls: Object.values(photos) });
  },
  photoError(e) {
    const key = e.currentTarget.dataset.photo;
    if (photos[key]) this.setData({ ['failedImages.' + key]: true });
  },
  enter() {
    if (api.session()) wx.switchTab({ url: '/pages/workbench/index' });
    else wx.navigateTo({ url: '/pages/login/index' });
  }
});
