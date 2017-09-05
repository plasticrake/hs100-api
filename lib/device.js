'use strict';

const EventEmitter = require('events');

class Device extends EventEmitter {
  constructor (options) {
    super();
    if (typeof options === 'undefined') options = {};
    this.client = options.client;
    this.deviceId = options.deviceId;
    this.host = options.host;
    this.port = options.port || 9999;
    this.seenOnDiscovery = options.seenOnDiscovery || null;
    this.timeout = options.timeout || 5000;
    this.debug = options.debug || false;

    this.model = null;
    this.type = null;

    this._sysInfo = {};
    this._consumption = {};
  }

  send (payload, timeout = 0) {
    if (this.debug) { console.log('DEBUG: device send'); }
    return this.client.send({host: this.host, port: this.port, payload, timeout, debug: this.debug});
  }

  getSysInfo ({timeout} = {}) {
    return this.send('{"system":{"get_sysinfo":{}}}', timeout).then((data) => {
      this.sysInfo = data.system.get_sysinfo;
      return this.sysInfo;
    });
  }

  get sysInfo () {
    if (this.debug) { console.log('DEBUG: device get sysInfo()'); }
    return this._sysInfo;
  }

  set sysInfo (sysInfo) {
    if (this.debug) { console.log('DEBUG: device set sysInfo()'); }
    this._sysInfo = sysInfo;
    this.name = sysInfo.alias;
    this.deviceId = sysInfo.deviceId;
    this.deviceName = sysInfo.dev_name;
    this.model = sysInfo.model;
    this.type = sysInfo.type || sysInfo.mic_type;
    this.softwareVersion = sysInfo.sw_ver;
    this.hardwareVersion = sysInfo.hw_ver;
    this.mac = sysInfo.mac;
    this.latitude = sysInfo.latitude;
    this.longitude = sysInfo.longitude;
    try {
      this.supportsConsumption = (sysInfo.feature.includes('ENE'));
    } catch (e) {
      this.supportsConsumption = false;
    }
    this.emitEvents();
  }

  get type () {
    return this._type;
  }

  set type (type) {
    switch (type) {
      case 'IOT.SMARTPLUGSWITCH':
      case 'plug':
        type = 'plug';
        break;
      case 'IOT.SMARTBULB':
      case 'bulb':
        type = 'bulb';
        break;
      default:
        type = 'device';
        break;
    }
    this._type = type;
  }

  emitEvents () {
    if (this.debug) { console.log('DEBUG: device emitEvents()'); }
  }

  startPolling (interval) {
    this.pollingTimer = setInterval(() => {
      this.getInfo();
    }, interval);
    return this;
  }

  stopPolling () {
    clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  }

  getModel () {
    return this.getSysInfo().then((sysInfo) => {
      return (sysInfo.model);
    });
  }
}

module.exports = Device;
