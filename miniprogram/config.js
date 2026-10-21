// 小程序通过免费云函数访问原工厂接口，网站和小程序共用原数据库。
// 云模式使用免费普通云函数 factoryProxy，业务数据仍在原服务器。
module.exports = {
  defaultServer: 'http://42.194.184.98:18080',
  connection: { mode: 'cloud', env: 'factory-miniapp-d2f8yb6s0afa796d', functionName: 'factoryProxy' }
};
