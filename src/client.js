'use strict';

const dgram = require('dgram');
const net = require('net');
const EventEmitter = require('events');
const util = require('util');

const Device = require('./device');
const Plug = require('./plug');
const Bulb = require('./bulb');

const encryptWithHeader = require('./utils').encryptWithHeader;
const encrypt = require('./utils').encrypt;
const decrypt = require('./utils').decrypt;

class Client extends EventEmitter {
  constructor ({timeout = 5000, logLevel, logger} = {}) {
    super();
    this.timeout = timeout;
    this.log = require('./logger')({level: logLevel, logger: logger});

    this.devices = new Map();
    this.discoveryTimer = null;
    this.discoveryPacketSequence = 0;
  }

  send ({host, port = 9999, payload, timeout = this.timeout}) {
    this.log.debug('client.send(%j)', arguments[0]);
    return new Promise((resolve, reject) => {
      let payloadString = (!(typeof payload === 'string' || payload instanceof String) ? JSON.stringify(payload) : payload);

      this.log.debug('client.send: socket: attempting to open. host:%s, port:%s', host, port);
      let socket = net.connect(port, host);
      socket.setKeepAlive(false);

      let timer;
      if (timeout > 0) {
        socket.setTimeout(timeout);
        timer = setTimeout(() => {
          this.log.debug('client.send: timeout');
          socket.end();
          socket.destroy(new Error('client.send: timeout'));
        }, timeout);
      }

      let deviceData = '';

      socket.on('connect', () => {
        this.log.debug('client.send: socket on connect');
        if (timer) { clearTimeout(timer); }
        socket.write(encryptWithHeader(payloadString));
      });

      socket.on('data', (data) => {
        this.log.debug('client.send: socket on data');
        deviceData += decrypt(data.slice(4)).toString('ascii');
        socket.end();
      });

      socket.on('end', () => {
        this.log.debug('client.send: socket on end');
        let data;
        try {
          data = JSON.parse(deviceData);
        } catch (e) {
          data = deviceData;
        }
        if (!data.err_code || data.err_code === 0) {
          resolve(data);
        } else {
          let errMsg = util.format('client.send: invalid response: %s', data);
          this.log.error(errMsg);
          reject(new Error(errMsg));
        }
      });

      socket.on('timeout', () => {
        this.log.debug('client.send: socket on timeout');
        if (timer) { clearTimeout(timer); }
        socket.destroy(new Error('client.send: socket on timeout'));
      });

      socket.on('error', (err) => {
        this.log.debug('client.send: socket on error');
        this.log.error('TPLink Device TCP Error: %s', err);
        if (timer) { clearTimeout(timer); }
        socket.destroy();
        reject(err);
      });

      return socket;
    });
  }

  async getSysInfo ({host, port, timeout}) {
    this.log.debug('client.getSysInfo(%j)', {host, port, timeout});
    let data = await this.send({host, port, payload: '{"system":{"get_sysinfo":{}}}', timeout});
    return data.system.get_sysinfo;
  }

  emit (eventName, ...args) {
    // Add device- / plug- / bulb- to eventName
    if (args[0] instanceof Device) {
      super.emit('device-' + eventName, ...args);
      if (args[0].type !== 'device') {
        super.emit(args[0].type + '-' + eventName, ...args);
      }
    } else {
      super.emit(eventName, ...args);
    }
  }

  getGeneralDevice (options) {
    options = Object.assign({}, options, {client: this});
    return new Device(options);
  }

  getPlug (options) {
    options = Object.assign({}, options, {client: this});
    return new Plug(options);
  }

  getBulb (options) {
    options = Object.assign({}, options, {client: this});
    return new Bulb(options);
  }

  async getDevice (options) {
    options = Object.assign({}, options, {client: this});
    let sysInfo = await this.getSysInfo(options);
    return this.getDeviceFromSysInfo(sysInfo, options);
  }

  getDeviceFromSysInfo (sysInfo, options) {
    options = Object.assign({}, options, {sysInfo: sysInfo});
    const deviceType = sysInfo.type || sysInfo.mic_type;
    switch (deviceType) {
      case 'IOT.SMARTPLUGSWITCH': return this.getPlug(options);
      case 'IOT.SMARTBULB': return this.getBulb(options);
      default: return this.getPlug(options);
    }
  }

  getTypeFromSysInfo (sysInfo) {
    const deviceType = sysInfo.type || sysInfo.mic_type;
    switch (deviceType) {
      case 'IOT.SMARTPLUGSWITCH': return 'plug';
      case 'IOT.SMARTBULB': return 'bulb';
      default: return 'device';
    }
  }

  startDiscovery ({address, port, broadcast = '255.255.255.255', discoveryInterval = 10000, discoveryTimeout = 0, offlineTolerance = 3, deviceTypes, deviceOptions, devices} = {}) {
    this.log.debug('client.startDiscovery(%j)', arguments[0]);
    this.socket = dgram.createSocket('udp4');

    this.socket.on('error', (err) => {
      this.isSocketBound = false;
      this.log.error('client.startDiscovery: UDP Error: %s', err);
      this.socket.close();
      this.emit('error', err);
      // TODO
    });

    this.socket.on('message', (msg, rinfo) => {
      const decryptedMsg = decrypt(msg).toString('ascii');

      this.log.debug('client.startDiscovery(): from: %s message: %s', decryptedMsg, rinfo.address);

      let jsonMsg;
      try {
        jsonMsg = JSON.parse(decryptedMsg);
      } catch (err) {
        this.log.error('client.startDiscovery(): Error parsing JSON: %s\nFrom: [%s] Original: [%s] Decrypted: [%s]', err, rinfo.address, msg, decryptedMsg);
        return;
      }

      const sysInfo = jsonMsg.system.get_sysinfo;

      if (deviceTypes) {
        const deviceType = this.getTypeFromSysInfo(sysInfo);
        if (!deviceTypes.includes(deviceType)) {
          this.log.debug('client.startDiscovery(): Filtered out: %s (%s), allowed device types: (%j)', sysInfo.alias, deviceType, deviceTypes);
          return;
        }
      }

      if (this.devices.has(sysInfo.deviceId)) {
        const device = this.devices.get(sysInfo.deviceId);
        device.host = rinfo.address;
        device.port = rinfo.port;
        device.sysInfo = sysInfo;
        device.status = 'online';
        device.seenOnDiscovery = this.discoveryPacketSequence;
        this.emit('online', device);
      } else {
        deviceOptions = Object.assign({},
          deviceOptions,
          {client: this, deviceId: sysInfo.deviceId, host: rinfo.address, port: rinfo.port, seenOnDiscovery: this.discoveryPacketSequence});
        const device = this.getDeviceFromSysInfo(sysInfo, deviceOptions);
        device.sysInfo = sysInfo;
        device.status = 'online';
        this.devices.set(device.deviceId, device);
        this.emit('new', device);
      }
    });

    this.socket.bind(port, address, () => {
      const address = this.socket.address();
      this.log.debug(`client.socket: UDP ${address.family} listening on ${address.address}:${address.port}`);
      this.socket.setBroadcast(true);
    });

    this.discoveryTimer = setInterval(() => {
      this.sendDiscovery(broadcast, devices, offlineTolerance);
    }, discoveryInterval);

    if (discoveryTimeout > 0) {
      setTimeout(() => {
        this.stopDiscovery();
      }, discoveryTimeout);
    }

    return this.sendDiscovery(broadcast, devices, offlineTolerance);
  }

  stopDiscovery () {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
      this.socket.close();
    }
  }

  sendDiscovery (address, devices, offlineTolerance) {
    devices = devices || [];

    this.devices.forEach((device) => {
      if (device.status !== 'offline') {
        let diff = this.discoveryPacketSequence - device.seenOnDiscovery;
        if (diff >= offlineTolerance) {
          device.status = 'offline';
          this.emit('offline', device);
        }
      }
    });

    let msgBuf = encrypt('{"system":{"get_sysinfo":{}}}');
    this.socket.send(msgBuf, 0, msgBuf.length, 9999, address);

    devices.forEach((d) => {
      this.socket.send(msgBuf, 0, msgBuf.length, d.port || 9999, d.host);
    });

    if (this.discoveryPacketSequence >= Number.MAX_VALUE) {
      this.discoveryPacketSequence = 0;
    } else {
      this.discoveryPacketSequence += 1;
    }

    return this;
  }
}

module.exports = Client;
