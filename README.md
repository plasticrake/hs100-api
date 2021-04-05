<!-- markdownlint-disable MD007 MD012 MD033 -->

# tplink-smarthome-api

[![NPM Version](https://img.shields.io/npm/v/tplink-smarthome-api.svg)](https://www.npmjs.com/package/tplink-smarthome-api)
[![Build Status](https://github.com/plasticrake/tplink-smarthome-api/workflows/CI/badge.svg?branch=master)](https://github.com/plasticrake/tplink-smarthome-api/actions?query=workflow%3ACI+branch%3Amaster)
[![codecov](https://codecov.io/gh/plasticrake/tplink-smarthome-api/branch/master/graph/badge.svg)](https://codecov.io/gh/plasticrake/tplink-smarthome-api)

TP-Link Smarthome API

**[Changelog](https://github.com/plasticrake/tplink-smarthome-api/tree/master/CHANGELOG.md)**

## Known Supported Devices

| Model                                                                                       | Type |
| ------------------------------------------------------------------------------------------- | ---- |
| HS100, HS103, HS105, HS107, HS110,<br/>HS200, HS210, HS220, HS300, KP303, KP400<br/>...etc. | Plug |
| LB100, LB110, LB120, LB130, LB200, LB230, KL120<br/>...etc.                                 | Bulb |

Most other TP-Link Plug and Bulb models may work as well.

## Related Projects

- [TP-Link Smarthome Device Simulator](https://github.com/plasticrake/tplink-smarthome-simulator) - Useful for automated testing
- [TP-Link Smarthome Crypto](https://github.com/plasticrake/tplink-smarthome-crypto)
- [TP-Link Smarthome Homebridge Plugin](https://github.com/plasticrake/homebridge-tplink-smarthome)

## Examples

See more [examples](https://github.com/plasticrake/tplink-smarthome-api/tree/master/examples).

```javascript
const { Client } = require('tplink-smarthome-api');

const client = new Client();
const plug = client.getDevice({ host: '10.0.1.2' }).then((device) => {
  device.getSysInfo().then(console.log);
  device.setPowerState(true);
});

// Look for devices, log to console, and turn them on
client.startDiscovery().on('device-new', (device) => {
  device.getSysInfo().then(console.log);
  device.setPowerState(true);
});
```

## CLI

Install the command line utility with `npm install -g tplink-smarthome-api`. Run `tplink-smarthome-api --help` for help.

## API

[API docs can be found here.](https://plasticrake.github.io/tplink-smarthome-api/)

For functions that send commands, the last argument is `SendOptions` where you can set the `transport` ('tcp','udp') and `timeout`, etc.

Functions that take more than 3 arguments are passed a single options object as the first argument (and if its a network command, SendOptions as the second.)

## Developing / Debugging with VSCode

Project is instrumented for debugging TypeScript source code, compiled JS code and can be installed for running from command line using CLI.

Clone the project to your local disk:

```bash
git clone https://github.com/plasticrake/tplink-smarthome-api.git
cd tplink-smarthome-api
npm install
```

If you plan to submit a PR: fork the project on Github, create new branch for the PR, clone your fork to local disk and checkout your branch:

```bash
git clone https://gihub.com/<your_account>/tplink-smarthome-api.git
cd tplink-smarthome-api
git checkout <your PR branch>
npm install
```

Execute `code .` in the \<project dir\> to start VSCode.

### Debug TypeScript

For fast debugging of TypeScript code, set breakpoints in src/**/*.ts files and use 'Launch TS via npm' configuration that calls `npm run debug-ts`. Actual command is defined in "scripts": "debug-ts" in 'package.json' file.

To quickly jump through different commands replicate 'debug-tsNN' scripts with different commands. To debug them from integrated terminal:

 - F1 (command palette) > Debug: Toggle Auto Attach > smart
 - restart integrated terminal (click exclamation triangle in terminal top-right and restart)
 - To skip certain node/npm commands, modify debug.javascript.autoAttachSmartPattern (defaults are pretty good)

Then just type `npm run debug-tsNN` in the integrated terminal to start the program -  debugger will attach automatically.
### Debug JS

For debugging compiled JS code, after editing source code in src/\*\*/\*.ts, execute `npm run build` and `npm run debug-js` or 'F5' in VSCode to debug JS (choose 'Launch JS via npm'). Breakpoints should be set in lib/\*\*/\*.js files.

### Command Line

To install package for running from command-line, execute commands:

```bash
cd <project dir>
npm install
npm run build
npm link
tplink-smarthome-api help
tplink-smarthome-api ...
```

## Credits

Thanks to George Georgovassilis and Thomas Baust for [figuring out the HS1XX encryption](https://blog.georgovassilis.com/2016/05/07/controlling-the-tp-link-hs100-wi-fi-smart-plug/).

Some design cues for Client based on [node-lifx](https://github.com/MariusRumpf/node-lifx/)
