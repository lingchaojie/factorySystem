// 免费环境的默认 HTTPS 网关仅转发到 factoryProxy，业务数据仍在原服务器。
module.exports = {
  defaultServer: 'http://42.194.184.98:18080',
  connection: { mode: 'gateway',
    url: 'https://factory-miniapp-d2f8yb6s0afa796d-1304793564.ap-shanghai.app.tcloudbase.com/factory-proxy' }
};
