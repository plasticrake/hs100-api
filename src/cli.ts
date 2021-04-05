#!/usr/bin/env node
/* eslint-disable no-console */

import castArray from 'lodash.castarray';
import program from 'commander';
import type { LogLevelDesc } from 'loglevel';
import * as tplinkCrypto from 'tplink-smarthome-crypto';
import type { PickProperties } from 'ts-essentials';
import util from 'util';

import { Client, ResponseError } from '.';
import { SendOptions, AnyDevice } from './client';

let logLevel: LogLevelDesc;

function outputError(err: Error): void {
  if (err instanceof ResponseError) {
    console.log('Response Error:');
    console.log(err.response);
  } else {
    console.error('Error:');
    console.error(err);
  }
}

function getClient(): Client {
  const defaultSendOptions: SendOptions = {};
  const options = program.opts();
  if (options.udp) defaultSendOptions.transport = 'udp';
  if (options.timeout) defaultSendOptions.timeout = options.timeout;
  return new Client({ logLevel, defaultSendOptions });
}

function search(
  sysInfo: boolean,
  breakoutChildren: boolean,
  discoveryTimeout: number,
  broadcast: string,
  params: Parameters<Client['startDiscovery']>[0]
): void {
  try {
    console.log('Searching...');

    const commandParams = {
      discoveryInterval: 2000,
      discoveryTimeout,
      breakoutChildren,
      broadcast,
      ...params,
    };
    console.log(`startDiscovery(${util.inspect(commandParams)})`);
    getClient()
      .startDiscovery(commandParams)
      .on('device-new', (device) => {
        console.log(
          `${device.model} ${device.deviceType} ${device.type} ${device.host} ${device.port} ${device.macNormalized} ${device.deviceId} ${device.alias}`
        );
        if (sysInfo) {
          console.dir(device.sysInfo, {
            colors: program.opts().color === 'on',
            depth: 10,
          });
        }
      });
  } catch (err) {
    outputError(err);
  }
}

async function send(
  host: string,
  port: number,
  payload: string
): Promise<void> {
  try {
    const client = getClient();
    console.log(
      `Sending to ${host}:${port || ''} via ${
        client.defaultSendOptions.transport
      }...`
    );
    const data = await client.send(payload, host, port);
    console.log('response:');
    console.dir(data, { colors: program.opts().color === 'on', depth: 10 });
  } catch (err) {
    outputError(err);
  }
}

async function sendCommand(
  host: string,
  port: number,
  childId: string,
  payload: string
): Promise<void> {
  try {
    const client = getClient();
    console.log(
      `Sending to ${host}:${port || ''} ${
        childId ? `childId: ${childId}` : ''
      } via ${client.defaultSendOptions.transport}...`
    );
    const device = await client.getDevice({ host, port, childId });
    const results = await device.sendCommand(payload);
    console.log('response:');
    console.dir(results, { colors: program.opts().color === 'on', depth: 10 });
  } catch (err) {
    outputError(err);
  }
}

async function sendCommandDynamic(
  host: string,
  port: number,
  // eslint-disable-next-line @typescript-eslint/ban-types
  command: Exclude<keyof PickProperties<AnyDevice, Function>, undefined>,
  commandParams: Array<boolean | number | string> = [],
  sendOptions: SendOptions,
  childId?: string
): Promise<void> {
  try {
    const client = getClient();
    console.log(
      `Sending ${command} command to ${host}:${port || ''} ${
        childId ? `childId: ${childId}` : ''
      } via ${
        sendOptions && sendOptions.transport
          ? sendOptions.transport
          : client.defaultSendOptions.transport
      }...`
    );
    const device = await client.getDevice({ host, port, childId });

    // This line gets "TypeError: Found non-callable @@iterator" error
    // // @ts-ignore: ignoring for now
    // const results = await device[command](...commandParams);

    // Use (...args:any) typecast to pass the call-by-name that otherwise picks up
    // collection of all call signatures and failing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const func = device[command] as (...args: any) => Promise<any>;
    const results = await func.apply(device, [
      ...commandParams,
      { ...sendOptions },
    ]);

    console.log('response:');
    console.dir(results, { colors: program.opts().color === 'on', depth: 10 });
  } catch (err) {
    outputError(err);
  }
}

async function details(host: string, port: number): Promise<void> {
  try {
    console.log(`Getting details from ${host}:${port || ''}...`);
    const device = await getClient().getDevice({ host, port });
    console.dir(
      {
        alias: device.alias,
        deviceId: device.deviceId,
        description: device.description,
        model: device.model,
        deviceType: device.deviceType,
        type: device.type,
        softwareVersion: device.softwareVersion,
        hardwareVersion: device.hardwareVersion,
        mac: device.mac,
      },
      { colors: program.opts().color === 'on', depth: 10 }
    );
  } catch (err) {
    outputError(err);
  }
}

async function blink(
  host: string,
  port: number,
  times: number,
  rate: number
): Promise<void> {
  console.log(`Sending blink commands to ${host}:${port || ''}...`);
  getClient()
    .getDevice({ host, port })
    .then((device) => {
      // @ts-ignore: ignoring for now, need to implement blink on bulb
      return device.blink(times, rate).then(() => {
        console.log('Blinking complete');
      });
    })
    .catch((reason) => {
      outputError(reason);
    });
}

async function getScanInfo(
  host: string,
  port: number,
  refresh?: boolean,
  timeoutInSeconds?: number
) {
  console.log(`Sending getScanInfo command to ${host}:${port || ''}...`);
  getClient()
    .getDevice({ host, port })
    .then((device) => {
      // @ts-ignore: ignoring for now, need to implement blink on bulb
      return device.netif
        .getScanInfo(refresh, timeoutInSeconds)
        .then((value) => {
          console.dir(value);
        });
    })
    .catch((reason) => {
      outputError(reason);
    });
}

function toInt(s: string): number {
  return parseInt(s, 10);
}

function toBoolean(s: string): boolean {
  return s === 'true' || s === '1';
}

function setParamTypes(
  params: string[] | undefined,
  commandSetup: CommandSetup
): Array<boolean | number | string> | undefined {
  if (
    params &&
    params.length > 0 &&
    commandSetup.params &&
    commandSetup.params.length > 0
  ) {
    const sParams = commandSetup.params;
    return castArray(params).map((el, i) => {
      switch (sParams[i]?.type) {
        case 'number':
          return +el;
        case 'boolean':
          return toBoolean(el);
        default:
          return el;
      }
    });
  }
  return params;
}

program
  .option('-D, --debug', 'turn on debug level logging', () => {
    logLevel = 'debug';
  })
  .option('-t, --timeout <ms>', 'timeout (ms)', toInt, 10000)
  .option('-u, --udp', 'send via UDP')
  .option(
    '-c, --color [on]',
    'output will be styled with ANSI color codes',
    'on'
  );

program
  .command('search [params]')
  .description('Search for devices')
  .option('--broadcast <address>', 'broadcast address', '255.255.255.255')
  .option('-s, --sysinfo', 'output sysInfo')
  .option(
    '-b, --breakout-children',
    'output children (multi-outlet plugs)',
    true
  )
  .action((params, options) => {
    let paramsObj;
    if (params) {
      console.dir(params);
      paramsObj = JSON.parse(params);
    }
    search(
      options.sysinfo,
      options.breakoutChildren || false,
      program.opts().timeout,
      options.broadcast,
      paramsObj
    );
  });

program
  .command('send <host> <payload>')
  .description('Send payload to device (using Client.send)')
  .action((host, payload) => {
    const [hostOnly, port] = host.split(':');
    send(hostOnly, port, payload);
  });

program
  .command('sendCommand <host> <payload>')
  .description('Send payload to device (using Device#sendCommand)')
  .option('--childId [childId]', 'childId')
  .action((host, payload, options) => {
    const [hostOnly, port] = host.split(':');
    sendCommand(hostOnly, port, options.childId, payload);
  });

program.command('details <host>').action((host) => {
  const [hostOnly, port] = host.split(':');
  details(hostOnly, port);
});

program
  .command('blink <host> [times] [rate]')
  .action((host, times = 5, rate = 500) => {
    const [hostOnly, port] = host.split(':');
    blink(hostOnly, port, times, rate);
  });

program
  .command('getScanInfo <host> [refresh] [timeoutInSeconds]')
  .action((host, refresh = true, timeoutInSeconds = 5) => {
    const [hostOnly, port] = host.split(':');
    getScanInfo(
      hostOnly,
      port,
      refresh !== undefined ? toBoolean(refresh) : undefined,
      timeoutInSeconds
    );
  });

type CommandSetup = {
  name: Parameters<typeof sendCommandDynamic>[2];
  params?: {
    name: string;
    type: 'boolean' | 'number' | 'string';
    optional?: boolean;
  }[];
  supportsChildId?: boolean;
  action?: (device: AnyDevice, ...args: unknown[]) => Promise<unknown>;
};

const commandSetup: CommandSetup[] = [
  { name: 'getSysInfo', supportsChildId: true },
  { name: 'getInfo', supportsChildId: true },
  {
    name: 'setAlias',
    params: [{ name: 'alias', type: 'string' }],
    supportsChildId: true,
  },
  { name: 'getModel', supportsChildId: true },
  {
    name: 'setPowerState',
    params: [{ name: 'state', type: 'boolean', optional: true }],
    supportsChildId: true,
  },
  {
    name: 'setLocation',
    params: [
      { name: 'latitude', type: 'number' },
      { name: 'longitude', type: 'number' },
    ],
  },
  { name: 'reboot', params: [{ name: 'delay', type: 'number' }] },
  { name: 'reset', params: [{ name: 'delay', type: 'number' }] },
];

for (const command of commandSetup) {
  const paramsString = command.params
    ? command.params
        .map((p) => (p.optional ? `[${p.name}]` : `<${p.name}>`))
        .join(' ')
    : '';

  const cmd = program
    .command(`${command.name} <host> ${paramsString}`)
    .description(
      `Send ${command.name} to device (using Device#${command.name})`
    )
    .option('-t, --timeout [timeout]', 'timeout (ms)', toInt, 10000);
  if (command.supportsChildId) {
    cmd.option('-c, --childId [childId]', 'childId');
  }

  // From commander README:
  // The action handler gets passed a parameter for each command-argument you
  // declared, and two additional parameters which are the parsed options and
  // the command object itself.
  cmd.action((...paramsInput) => {
    // To deal with arbitrary counbt of command-arguments, we take all into
    // variadic paramsInput to sort out last two into optionsInput and
    // (UNUSED) thisCommand:
    const [optionsInput /* UNUSED: , thisCommand */] = paramsInput.splice(
      paramsInput.length - 2
    );
    const host = paramsInput.shift();
    const [hostOnly, port] = host.split(':');

    const commandParams = setParamTypes(paramsInput, command);
    const { childId, ...sendOptions } = optionsInput;
    sendCommandDynamic(
      hostOnly,
      port,
      command.name,
      commandParams,
      sendOptions,
      childId
    );
  });
}

program
  .command('encrypt <outputEncoding> <input> [firstKey=0xAB]')
  .action((outputEncoding, input, firstKey = 0xab) => {
    const outputBuf = tplinkCrypto.encrypt(input, firstKey);
    console.log(outputBuf.toString(outputEncoding));
  });

program
  .command('encryptWithHeader <outputEncoding> <input> [firstKey=0xAB]')
  .action((outputEncoding, input, firstKey = 0xab) => {
    const outputBuf = tplinkCrypto.encryptWithHeader(input, firstKey);
    console.log(outputBuf.toString(outputEncoding));
  });

program
  .command('decrypt <inputEncoding> <input> [firstKey=0xAB]')
  .action((inputEncoding, input, firstKey = 0xab) => {
    const inputBuf = Buffer.from(input, inputEncoding);
    const outputBuf = tplinkCrypto.decrypt(inputBuf, firstKey);
    console.log(outputBuf.toString());
  });

program
  .command('decryptWithHeader <inputEncoding> <input> [firstKey=0xAB]')
  .action((inputEncoding, input, firstKey = 0xab) => {
    const inputBuf = Buffer.from(input, inputEncoding);
    const outputBuf = tplinkCrypto.decryptWithHeader(inputBuf, firstKey);
    console.log(outputBuf.toString());
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
