/* eslint-disable no-console */

// spell-checker:ignore Mock’s

const groupBy = require('lodash.groupby');
const defaultTo = require('lodash.defaultto');
const dotenv = require('dotenv');

const simulator = require('tplink-smarthome-simulator');
const { Client } = require('../../src');

const envIsTrue = function envIsTrue(value) {
  return !(value == null || value === 0 || value === 'false');
};

dotenv.config();
const clientOptions = { logLevel: process.env.TEST_CLIENT_LOGLEVEL };
const useSimulator = envIsTrue(defaultTo(process.env.TEST_SIMULATOR, true));
const discoveryTimeout = process.env.TEST_DISCOVERY_TIMEOUT || 2000;
const discoveryIpWhitelist = (() => {
  const list = process.env.TEST_DISCOVERY_IP_WHITELIST;
  if (list) return list.split(',');
  return [];
})();

const clientDefaultOptions = (() => {
  let opt = {};
  if (useSimulator) {
    // set low timeout for simulator
    opt = { defaultSendOptions: { timeout: 100 } };
  }
  return Object.assign(opt, clientOptions);
})();

const getTestClient = function getTestClient(options = {}) {
  return new Client({ ...clientDefaultOptions, ...options });
};

const testDevices = [
  { model: 'hs100', deviceType: 'plug', name: 'HS100(plug)' },
  { model: 'hs105', deviceType: 'plug', name: 'HS105(plug)' },
  { model: 'hs110', deviceType: 'plug', name: 'HS110v1(plug)', hw_ver: '1.0' },
  { model: 'hs110', deviceType: 'plug', name: 'HS110v2(plug)', hw_ver: '2.0' },
  { model: 'hs200', deviceType: 'plug', name: 'HS200(plug)' },
  { model: 'hs220', deviceType: 'plug', name: 'HS220(plug)' },
  {
    model: 'hs300',
    deviceType: 'plug',
    name: 'HS300(plug)',
    breakoutChildren: true,
  },
  { model: 'lb100', deviceType: 'bulb', name: 'LB100(bulb)' },
  { model: 'lb120', deviceType: 'bulb', name: 'LB120(bulb)' },
  { model: 'lb130', deviceType: 'bulb', name: 'LB130(bulb)' },
];

Object.entries(groupBy(testDevices, 'deviceType')).forEach(([key, value]) => {
  testDevices[key] = value;
});
Object.entries(groupBy(testDevices, 'model')).forEach(([key, value]) => {
  testDevices[key] = value;
});

testDevices.simulated = useSimulator;
testDevices.anyDevice = { name: 'Device', deviceType: 'device' };
testDevices.anyPlug = { name: 'Plug', deviceType: 'plug' };
testDevices.anyBulb = { name: 'Bulb', deviceType: 'bulb' };
testDevices.unreliable = { name: 'Unreliable Device', deviceType: 'plug' };
testDevices.unreachable = {
  name: 'Unreachable Device',
  deviceOptions: {
    host: '192.0.2.0',
    port: 9999,
    defaultSendOptions: { timeout: 100 },
  },
};
testDevices.plugChildren = [
  { name: 'HS300(plug).0', deviceType: 'plug' },
  { name: 'HS300(plug).1', deviceType: 'plug' },
  { name: 'HS300(plug).2', deviceType: 'plug' },
  { name: 'HS300(plug).3', deviceType: 'plug' },
  { name: 'HS300(plug).4', deviceType: 'plug' },
  { name: 'HS300(plug).5', deviceType: 'plug' },
];

const simulatedDevices = [];
let simulatedUdpServer;

const getSimulatedTestDevices = async function getSimulatedTestDevices() {
  const client = getTestClient();

  simulatedDevices.push({
    device: new simulator.Device({
      model: 'hs100',
      data: { alias: 'Mock HS100', mac: 'aa:aa:aa:00:00:01' },
    }),
  });
  simulatedDevices.push({
    device: new simulator.Device({
      model: 'hs105',
      data: { alias: 'Mock’s “HS105”', mac: 'aa:aa:aa:00:00:02' },
    }),
  });
  simulatedDevices.push({
    device: new simulator.Device({
      model: 'hs110',
      data: { alias: 'Mock😽 HS110', mac: 'aa:aa:aa:00:00:03' },
    }),
  });
  simulatedDevices.push({
    device: new simulator.Device({
      model: 'hs110v2',
      data: { alias: 'Mock HS110v2', mac: 'aa:aa:aa:00:00:04' },
    }),
  });
  simulatedDevices.push({
    device: new simulator.Device({
      model: 'hs200',
      data: { alias: 'Mock HS200', mac: 'aa:aa:aa:00:00:05' },
    }),
  });
  simulatedDevices.push({
    device: new simulator.Device({
      model: 'hs220',
      data: { alias: 'Mock HS220', mac: 'aa:aa:aa:00:00:06' },
    }),
  });
  simulatedDevices.push({
    device: new simulator.Device({
      model: 'hs300',
      data: { alias: 'Mock HS300', mac: 'aa:aa:aa:00:00:07' },
    }),
  });
  simulatedDevices.push({
    device: new simulator.Device({
      model: 'lb100',
      data: { alias: 'Mock LB100', mac: 'aa:aa:aa:00:00:08' },
    }),
  });
  simulatedDevices.push({
    device: new simulator.Device({
      model: 'lb120',
      data: { alias: 'Mock LB120', mac: 'aa:aa:aa:00:00:09' },
    }),
  });
  simulatedDevices.push({
    device: new simulator.Device({
      model: 'lb130',
      data: { alias: 'Mock LB130', mac: 'aa:aa:aa:00:00:10' },
    }),
  });

  simulatedDevices.push({
    testType: 'unreliable',
    device: new simulator.Device({
      model: 'hs100',
      unreliablePercent: 1,
      data: { alias: 'Mock Unreliable 100%', mac: 'aa:aa:aa:00:00:99' },
    }),
  });

  const simulatedTestDevices = [];
  for (let i = 0; i < simulatedDevices.length; i += 1) {
    const d = simulatedDevices[i].device;
    const { testType } = simulatedDevices[i];
    // eslint-disable-next-line no-await-in-loop
    await d.start();

    const process = childId => {
      simulatedTestDevices.push({
        testType,
        model: d.model,
        hw_ver: d.data.system.sysinfo.hw_ver,
        mac: d.data.system.sysinfo.mac,
        childId,
        deviceOptions: { host: d.address, port: d.port, childId },
        getDevice: (deviceOptions, sendOptions) =>
          client.getDevice(
            {
              host: d.address,
              port: d.port,
              childId,
              defaultSendOptions: sendOptions,
              ...deviceOptions,
            },
            sendOptions
          ),
        type: 'simulated',
      });
    };

    if (d.children && d.children.length > 0) {
      d.children.forEach(child => {
        process(child.id);
      });
    } else {
      process();
    }
  }

  simulatedUdpServer = await simulator.UdpServer.start();

  return simulatedTestDevices;
};

const getDiscoveryTestDevices = async function getDiscoveryTestDevices() {
  return new Promise(resolve => {
    const discoveredTestDevices = [];
    const client = getTestClient();
    client.startDiscovery({ discoveryTimeout });

    setTimeout(() => {
      client.stopDiscovery();

      for (const device of client.devices.values()) {
        if (
          discoveryIpWhitelist.length === 0 ||
          discoveryIpWhitelist.includes(device.host)
        ) {
          discoveredTestDevices.push({
            model: device.model,
            mac: device.mac,
            hw_ver: device.sysInfo.hw_ver,
            deviceOptions: { host: device.host, port: device.port },
            getDevice: (deviceOptions, sendOptions) =>
              client.getDevice(
                {
                  host: device.host,
                  port: device.port,
                  defaultSendOptions: sendOptions,
                  ...deviceOptions,
                },
                sendOptions
              ),
            type: 'real',
          });
        } else {
          console.log(
            `Excluding ${device.host}:${device.port} from test, not in whitelist`
          );
        }
      }
      return resolve(discoveredTestDevices);
    }, discoveryTimeout);
  });
};

const getTestDevices = async function getTestDevices() {
  if (useSimulator) {
    return getSimulatedTestDevices();
  }
  return getDiscoveryTestDevices();
};

function testDeviceCleanup() {
  simulatedDevices.forEach(sd => {
    sd.device.stop();
  });
  if (simulatedUdpServer) {
    simulatedUdpServer.stop();
  }
}

(async () => {
  console.log('clientDefaultOptions: %j', clientDefaultOptions);
  const realTestDevices = await getTestDevices();

  const addDevice = function addDevice(target, device) {
    [
      'mac',
      'deviceOptions',
      'getDevice',
      'type',
      'childId',
      'getOtherChildren',
      'getOtherChildrenState',
    ].forEach(prop => {
      // eslint-disable-next-line no-param-reassign
      target[prop] = device[prop];
    });
  };

  testDevices.forEach(testDevice => {
    const device = realTestDevices.find(realDevice => {
      if (realDevice.model.substr(0, 5).toLowerCase() !== testDevice.model)
        return false;
      if (testDevice.hw_ver != null && testDevice.hw_ver !== realDevice.hw_ver)
        return false;
      return true;
    });

    if (device) {
      addDevice(testDevice, device);

      if (!testDevices.anyDevice.mac) {
        addDevice(testDevices.anyDevice, device);
      }
      if (testDevice.deviceType === 'plug' && !testDevices.anyPlug.mac) {
        addDevice(testDevices.anyPlug, device);
      }
      if (testDevice.deviceType === 'bulb' && !testDevices.anyBulb.mac) {
        addDevice(testDevices.anyBulb, device);
      }
    }
  });

  // Loop over devices to break out child devices
  testDevices
    .filter(d => d.breakoutChildren)
    .forEach(testDevice => {
      realTestDevices
        .filter(r => r.mac === testDevice.mac)
        .forEach((realDevice, i) => {
          const testDeviceChild = JSON.parse(JSON.stringify(testDevice));

          // eslint-disable-next-line no-param-reassign
          realDevice.getOtherChildren = function() {
            return testDevices.filter(
              oc => oc.mac === this.mac && oc.childId !== this.childId
            );
          };

          // eslint-disable-next-line no-param-reassign
          realDevice.getOtherChildrenState = async function() {
            return Promise.all(
              this.getOtherChildren().map(async childDevice => {
                const d = await childDevice.getDevice();
                return {
                  mac: d.mac,
                  childId: d.childId,
                  relayState: d.relayState,
                  alias: d.alias,
                };
              })
            );
          };

          addDevice(testDeviceChild, realDevice);
          testDeviceChild.name += `.${i}`;
          testDevices.push(testDeviceChild);
          addDevice(testDevices.plugChildren[i], testDeviceChild);
        });
    });

  const unreliableDevice = realTestDevices.find(
    realDevice => realDevice.testType === 'unreliable'
  );
  if (unreliableDevice) addDevice(testDevices.unreliable, unreliableDevice);

  testDevices.forEach(td => {
    const deviceOptions = td.deviceOptions || {};
    console.log(
      td.model,
      td.deviceType,
      td.name,
      deviceOptions.host,
      deviceOptions.port,
      td.mac,
      deviceOptions.childId || '',
      td.type || ''
    );
  });

  ['anyDevice', 'anyPlug', 'anyBulb', 'unreachable', 'unreliable'].forEach(
    key => {
      const td = testDevices[key];
      const deviceOptions = td.deviceOptions || {};
      console.log(
        key,
        td.deviceType,
        td.name,
        deviceOptions.host,
        deviceOptions.port,
        td.mac,
        deviceOptions.childId || '',
        td.type || ''
      );
    }
  );

  run();
})();

module.exports = {
  getTestClient,
  testDevices,
  testDeviceCleanup,
};
