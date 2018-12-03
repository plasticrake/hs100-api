#! /usr/bin/env node
'use strict';

const util = require('util');
const program = require('commander');
const tplinkCrypto = require('tplink-smarthome-crypto');

const { Client, ResponseError } = require('./');

let logLevel;
let client;

let outputError = function (err) {
  if (err instanceof ResponseError) {
    console.log(err.response);
  } else {
    console.error(err);
  }
};

let search = function (sysInfo, timeout, params) {
  try {
    console.log('Searching...');

    let commandParams = Object.assign({}, {discoveryInterval: 2000, discoveryTimeout: timeout}, params); // {discoveryInterval: 2000, discoveryTimeout: timeout, ...params};
    console.log(`startDiscovery(${util.inspect(commandParams)})`);
    client.startDiscovery(commandParams)
      .on('device-new', (device) => {
        console.log(`${device.model} ${device.deviceType} ${device.type} ${device.host} ${device.port} ${device.macNormalized} ${device.deviceId} ${device.alias}`);
        if (sysInfo) {
          console.dir(device.sysInfo, {colors: program.color === 'on', depth: 10});
        }
      });
  } catch (err) {
    outputError(err);
  }
};

let send = async function (host, port, payload) {
  try {
    console.log(`Sending to ${host}:${port}...`);
    let data = await client.send(payload, host, port);
    console.log('response:');
    console.dir(data, {colors: program.color === 'on', depth: 10});
  } catch (err) {
    outputError(err);
  }
};

let sendCommand = async function (host, port, payload) {
  try {
    console.log(`Sending to ${host}:${port}...`);
    let device = await client.getDevice({host, port});
    let results = await device.sendCommand(payload);
    console.log('response:');
    console.dir(results, {colors: program.color === 'on', depth: 10});
  } catch (err) {
    outputError(err);
  }
};

let sendCommandDynamic = async function (host, port, command, commandParams = []) {
  try {
    console.log(`Sending ${command} command to ${host}:${port}...`);
    let device = await client.getDevice({host, port});
    let results = await device[command](...commandParams);
    console.log('response:');
    console.dir(results, {colors: program.color === 'on', depth: 10});
  } catch (err) {
    outputError(err);
  }
};

let details = async function (host, port, timeout) {
  try {
    console.log(`Getting details from ${host}:${port}...`);
    let device = await client.getDevice({host, port});
    console.dir({
      alias: device.alias,
      deviceId: device.deviceId,
      description: device.description,
      model: device.model,
      deviceType: device.deviceType,
      type: device.type,
      softwareVersion: device.softwareVersion,
      hardwareVersion: device.hardwareVersion,
      mac: device.mac
    }, {colors: program.color === 'on', depth: 10});
  } catch (err) {
    outputError(err);
  }
};

let blink = function (host, port, times, rate, timeout) {
  console.log(`Sending blink commands to ${host}:${port}...`);
  client.getDevice({host, port}).then((device) => {
    return device.blink(times, rate).then(() => {
      console.log('Blinking complete');
    });
  }).catch((reason) => {
    outputError(reason);
  });
};

let setBrightness = function(host, port, intensity, timeout) {
  console.log(`Setting brightness=${intensity} command to ${host}:${port}...`);
  client.getDevice({host, port}).then((device) => {
    return device.lighting.setLightState({
      brightness: parseInt(intensity),
      sendOptions: {
        timeout: timeout
      }
    }).then(() => {
      device.lighting.getLightState().then((ls) => {
        console.log('Brightness set\n', ls);
      });
    });
  }).catch((reason) => {
    outputError(reason);
  });
}

let setOnOff = function(host, port, onOff, timeout) {
  console.log(`Setting on_off=${onOff} command to ${host}:${port}...`);
  client.getDevice({host, port}).then((device) => {
    return device.lighting.setLightState({
      on_off: parseInt(onOff),
      sendOptions: {
        timeout: timeout
      }
    }).then(() => {
      device.lighting.getLightState().then((ls) => {
        console.log('Bulb State:\n', ls);
      });
    });
  }).catch((reason) => {
    outputError(reason);
  });
}

let toInt = (s) => {
  return parseInt(s);
};

let setupClient = function () {
  let defaultSendOptions = {};
  if (program.udp) defaultSendOptions.transport = 'udp';
  if (program.timeout) defaultSendOptions.timeout = program.timeout;
  let client = new Client({ logLevel, defaultSendOptions });
  return client;
};

let setParamTypes = function setParamTypes (params, types) {
  if (params && params.length > 0 && types && types.length > 0) {
    return Array.from(params).map((el, i) => {
      if (types[i] === 'number') {
        return +el;
      }
      return el;
    });
  }
  return params;
};

program
  .option('-D, --debug', 'turn on debug level logging', () => { logLevel = 'debug'; })
  .option('-t, --timeout <ms>', 'timeout (ms)', toInt, 5000)
  .option('-u, --udp', 'send via UDP')
  .option('-c, --color [on]', 'output will be styled with ANSI color codes', 'on');

program
  .command('search [params]')
  .description('Search for devices')
  .option('-s, --sysinfo', 'output sysInfo')
  .action(function (params, options) {
    client = setupClient();
    if (params) {
      console.dir(params);
      params = JSON.parse(params);
    }
    search(options.sysinfo, program.timeout, params);
  });

program
  .command('send <host> <payload>')
  .description('Send payload to device (using Client.send)')
  .action(function (host, payload, options) {
    client = setupClient();
    let [hostOnly, port] = host.split(':');
    send(hostOnly, port, payload);
  });

program
  .command('sendCommand <host> <payload>')
  .description('Send payload to device (using Device#sendCommand)')
  .action(function (host, payload, options) {
    client = setupClient();
    let [hostOnly, port] = host.split(':');
    sendCommand(hostOnly, port, payload);
  });

program
  .command('details <host>')
  .action(function (host, options) {
    client = setupClient();
    let [hostOnly, port] = host.split(':');
    details(hostOnly, port, program.timeout);
  });

program
  .command('blink <host> [times] [rate]')
  .action(function (host, times = 5, rate = 500, options) {
    client = setupClient();
    let [hostOnly, port] = host.split(':');
    blink(hostOnly, port, times, rate);
  });

program
  .command('brightness <host> [intensity]')
  .action(function (host, brightness = 100, options) {
    client = setupClient();
    let [hostOnly, port] = host.split(':');
    setBrightness(hostOnly, port, brightness);
  });

program
  .command('on <host>')
  .action(function (host, brightness = 100, options) {
    client = setupClient();
    let [hostOnly, port] = host.split(':');
    setOnOff(hostOnly, port, 1);
  });

program
  .command('off <host>')
  .action(function (host, brightness = 100, options) {
    client = setupClient();
    let [hostOnly, port] = host.split(':');
    setOnOff(hostOnly, port, 0);
  });

[ 'getSysInfo', 'getInfo', 'setAlias', 'getModel',
  { fnName: 'setLocation', paramTypes: ['number', 'number'] },
  { fnName: 'reboot', paramTypes: ['number'] },
  { fnName: 'reset', paramTypes: ['number'] }
].forEach((command) => {
  let commandName;
  let paramTypes;
  if (command.fnName) {
    commandName = command.fnName;
    paramTypes = command.paramTypes;
  } else {
    commandName = command;
  }
  program
    .command(`${commandName} <host> [params]`)
    .description(`Send ${commandName} to device (using Device#${commandName})`)
    .option('-t, --timeout [timeout]', 'timeout (ms)', toInt, 5000)
    .action(function (host, params, options) {
      client = setupClient();
      let [hostOnly, port] = host.split(':');
      sendCommandDynamic(hostOnly, port, commandName, setParamTypes(params, paramTypes));
    });
});

program
  .command('encrypt <outputEncoding> <input> [firstKey=0xAB]')
  .action(function (outputEncoding, input, firstKey = 0xAB) {
    let outputBuf = tplinkCrypto.encrypt(input, firstKey);
    console.log(outputBuf.toString(outputEncoding));
  });
program
  .command('encryptWithHeader <outputEncoding> <input> [firstKey=0xAB]')
  .action(function (outputEncoding, input, firstKey = 0xAB) {
    let outputBuf = tplinkCrypto.encryptWithHeader(input, firstKey);
    console.log(outputBuf.toString(outputEncoding));
  });
program
  .command('decrypt <inputEncoding> <input> [firstKey=0xAB]')
  .action(function (inputEncoding, input, firstKey = 0xAB) {
    let inputBuf = Buffer.from(input, inputEncoding);
    let outputBuf = tplinkCrypto.decrypt(inputBuf, firstKey);
    console.log(outputBuf.toString());
  });
program
  .command('decryptWithHeader <inputEncoding> <input> [firstKey=0xAB]')
  .action(function (inputEncoding, input, firstKey = 0xAB) {
    let inputBuf = Buffer.from(input, inputEncoding);
    let outputBuf = tplinkCrypto.decryptWithHeader(inputBuf, firstKey);
    console.log(outputBuf.toString());
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
