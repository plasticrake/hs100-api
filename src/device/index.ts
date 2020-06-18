/* eslint-disable no-underscore-dangle */
import castArray from 'lodash.castarray';
import { EventEmitter } from 'events';
import type log from 'loglevel';

import type { BulbSysinfo } from '../bulb';
// eslint-disable-next-line import/no-duplicates
import type Client from '../client';
// eslint-disable-next-line import/no-duplicates
import type { SendOptions } from '../client';
import type { Logger } from '../logger';
import Netif from './netif';
import TcpConnection from '../network/tcp-connection';
import UdpConnection from '../network/udp-connection';
import type { PlugSysinfo } from '../plug';
import { isObjectLike, processResponse, extractResponse } from '../utils';

interface ApiModuleNamespace {
  system: string;
  cloud: string;
  schedule: string;
  timesetting: string;
  emeter: string;
  netif: string;
  lightingservice: string;
}

export type Sysinfo = BulbSysinfo | PlugSysinfo;

export type DeviceConstructorParameters = [
  {
    client: Client;
    host: string;
    port?: number;
    logger?: log.RootLogger;
    defaultSendOptions?: SendOptions;
  }
];

// type SysinfoTypeValues =
//   | 'IOT.SMARTPLUGSWITCH'
//   | 'IOT.SMARTBULB'
//   | 'IOT.RANGEEXTENDER.SMARTPLUG';

export type CommonSysinfo = {
  alias: string;
  deviceId: string;
  model: string;
  sw_ver: string;
  hw_ver: string;
};

export function isCommonSysinfo(
  candidate: unknown
): candidate is CommonSysinfo {
  return (
    isObjectLike(candidate) &&
    'alias' in candidate &&
    'deviceId' in candidate &&
    'model' in candidate &&
    'sw_ver' in candidate &&
    'hw_ver' in candidate
  );
}

export function isBulbSysinfo(candidate: unknown): candidate is BulbSysinfo {
  return (
    isCommonSysinfo(candidate) &&
    'mic_type' in candidate &&
    'mic_mac' in candidate &&
    'description' in candidate &&
    'light_state' in candidate &&
    'is_dimmable' in candidate &&
    'is_color' in candidate &&
    'is_variable_color_temp' in candidate
  );
}

export function isPlugSysinfo(candidate: unknown): candidate is PlugSysinfo {
  return (
    isCommonSysinfo(candidate) &&
    ('type' in candidate || 'mic_type' in candidate) &&
    ('mac' in candidate || 'ethernet_mac' in candidate) &&
    'feature' in candidate &&
    ('relay_state' in candidate || 'children' in candidate)
  );
}

function isSysinfo(candidate: unknown): candidate is Sysinfo {
  return isPlugSysinfo(candidate) || isBulbSysinfo(candidate);
}

/**
 * TP-Link Device.
 *
 * Shared behavior for {@link Plug} and {@link Bulb}.
 * @abstract
 * @extends EventEmitter
 * @emits  Device#emeter-realtime-update
 */
export default abstract class Device extends EventEmitter {
  client: Client;

  host: string;

  port: number;

  netif = new Netif(this, 'netif');

  protected log: Logger;

  readonly defaultSendOptions: SendOptions;

  private readonly udpConnection = new UdpConnection(this);

  private readonly tcpConnection = new TcpConnection(this);

  private pollingTimer: NodeJS.Timeout | null = null;

  protected _sysInfo: Sysinfo;

  protected static apiModuleNamespace: ApiModuleNamespace;

  protected abstract supportsEmeter = false;

  childId?: string;

  /**
   * Created by {@link Client#getCommonDevice} - Do not instantiate directly
   * @param   options
   * @param   options.client
   * @param   options.host
   * @param  [options.port=9999]
   * @param  [options.logger]
   * @param  [options.defaultSendOptions]
   */
  constructor({
    client,
    _sysInfo,
    host,
    port = 9999,
    logger,
    defaultSendOptions,
  }: DeviceConstructorParameters[0] & { _sysInfo: Sysinfo }) {
    super();

    // Log first as methods below may call `log`
    this.log = logger || client.log;
    this.log.debug('device.constructor(%j)', {
      // eslint-disable-next-line prefer-rest-params
      ...arguments[0],
      client: 'not shown',
    });

    this.client = client;
    this._sysInfo = _sysInfo;
    this.host = host;
    this.port = port;

    this.defaultSendOptions = {
      ...client.defaultSendOptions,
      ...defaultSendOptions,
    };
  }

  get apiModule(): ApiModuleNamespace {
    return (this.constructor as typeof Device).apiModuleNamespace;
  }

  /**
   * Returns cached results from last retrieval of `system.sysinfo`.
   * @returns system.sysinfo
   */
  get sysInfo(): Sysinfo {
    return this._sysInfo;
  }

  /**
   * @internal
   */
  setSysInfo(sysInfo: Sysinfo): void {
    this.log.debug('[%s] device sysInfo set', sysInfo.alias || this.alias);
    this._sysInfo = sysInfo;
  }

  /**
   * Cached value of `sysinfo.alias`.
   */
  get alias(): string {
    return this.sysInfo !== undefined ? this.sysInfo.alias : '';
  }

  /**
   * Cached value of `sysinfo.deviceId`.
   */
  get id(): string {
    return this.deviceId;
  }

  /**
   * Cached value of `sysinfo.deviceId`.
   */
  get deviceId(): string {
    return this.sysInfo.deviceId;
  }

  /**
   * Cached value of `sysinfo.[description|dev_name]`.
   */
  abstract get description(): string | undefined;

  /**
   * Cached value of `sysinfo.model`.
   * @return {string}
   */
  get model(): string {
    return this.sysInfo.model;
  }

  /**
   * Cached value of `sysinfo.alias`.
   * @return {string}
   */
  get name(): string {
    return this.alias;
  }

  /**
   * Cached value of `sysinfo.[type|mic_type]`.
   * @return {string}
   */
  get type(): string {
    if ('type' in this.sysInfo && this.sysInfo.type !== undefined)
      return this.sysInfo.type;
    if ('mic_type' in this.sysInfo && this.sysInfo.mic_type !== undefined)
      return this.sysInfo.mic_type;
    return '';
  }

  /**
   * Type of device (or `device` if unknown).
   *
   * Based on cached value of `sysinfo.[type|mic_type]`
   * @return {string} 'plug'|'bulb'|'device'
   */
  get deviceType(): 'plug' | 'bulb' | 'device' {
    const { type } = this;
    switch (true) {
      case /plug/i.test(type):
        return 'plug';
      case /bulb/i.test(type):
        return 'bulb';
      default:
        return 'device';
    }
  }

  /**
   * Cached value of `sysinfo.sw_ver`.
   * @return {string}
   */
  get softwareVersion(): string {
    return this.sysInfo.sw_ver;
  }

  /**
   * Cached value of `sysinfo.hw_ver`.
   * @return {string}
   */
  get hardwareVersion(): string {
    return this.sysInfo.hw_ver;
  }

  /**
   * Cached value of `sysinfo.[mac|mic_mac|ethernet_mac]`.
   * @return {string}
   */
  get mac(): string {
    if ('mac' in this.sysInfo && this.sysInfo.mac !== undefined)
      return this.sysInfo.mac;
    if ('mic_mac' in this.sysInfo && this.sysInfo.mic_mac !== undefined)
      return this.sysInfo.mic_mac;
    if (
      'ethernet_mac' in this.sysInfo &&
      this.sysInfo.ethernet_mac !== undefined
    )
      return this.sysInfo.ethernet_mac;
    return '';
  }

  /**
   * Normalized cached value of `sysinfo.[mac|mic_mac|ethernet_mac]`
   *
   * Removes all non alphanumeric characters and makes uppercase
   * `aa:bb:cc:00:11:22` will be normalized to `AABBCC001122`
   * @return {string}
   */
  get macNormalized(): string {
    const mac = this.mac || '';
    return mac.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  /**
   * Closes any open network connections including any shared sockets.
   */
  closeConnection(): void {
    this.udpConnection.close();
    this.tcpConnection.close();
  }

  /**
   * Sends `payload` to device (using {@link Client#send})
   * @param   payload
   * @param   sendOptions
   * @returns parsed JSON response
   */
  async send(
    payload: string | object,
    sendOptions?: SendOptions
  ): Promise<string> {
    this.log.debug('[%s] device.send()', this.alias);

    try {
      const thisSendOptions = {
        ...this.defaultSendOptions,
        ...sendOptions,
      } as Required<SendOptions>;
      const payloadString = !(typeof payload === 'string')
        ? JSON.stringify(payload)
        : payload;

      if (thisSendOptions.transport === 'udp') {
        return await this.udpConnection.send(payloadString, thisSendOptions);
      }
      return await this.tcpConnection.send(payloadString, thisSendOptions);
    } catch (err) {
      this.log.error('[%s] device.send() %s', this.alias, err);
      throw err;
    }
  }

  /**
   * Sends command(s) to device.
   *
   * Calls {@link #send} and processes the response.
   *
   * - Adds context.child_ids:[] to the command.
   *   - If `childIds` parameter is set. _or_
   *   - If device was instantiated with a childId it will default to that value.
   *
   * - If only one operation was sent:
   *   - Promise fulfills with specific parsed JSON response for command.\
   *     Example: `{system:{get_sysinfo:{}}}`
   *     - resolves to: `{err_code:0,...}`\
   *     - instead of: `{system:{get_sysinfo:{err_code:0,...}}}` (as {@link #send} would)
   * - If more than one operation was sent:
   *   - Promise fulfills with full parsed JSON response (same as {@link #send})
   *
   * Also, the response's `err_code`(s) are checked, if any are missing or != `0` the Promise is rejected with {@link ResponseError}.
   * @param  {Object|string}    command
   * @param  {string[]|string} [childIds]
   * @param  {SendOptions}     [sendOptions]
   * @return {Promise<Object, ResponseError>} parsed JSON response
   * @throws {ResponseError}
   */
  async sendCommand(
    command: string | object,
    childIds: string[] | string | undefined = this.childId,
    sendOptions?: SendOptions
  ): Promise<unknown> {
    // TODO allow certain err codes (particularly emeter for non HS110 devices)
    const commandObj =
      typeof command === 'string' ? JSON.parse(command) : command;

    if (childIds) {
      const childIdsArray = castArray(childIds).map(
        this.normalizeChildId,
        this
      );
      commandObj.context = { child_ids: childIdsArray };
    }

    const response = await this.send(commandObj, sendOptions);
    const results = processResponse(commandObj, JSON.parse(response));
    return results;
  }

  /**
   * @internal
   */
  protected normalizeChildId(childId: string): string {
    if (childId.length === 1) {
      return `${this.deviceId}0${childId}`;
    }
    if (childId.length === 2) {
      return this.deviceId + childId;
    }

    return childId;
  }

  /**
   * Polls the device every `interval`.
   *
   * Returns `this` (for chaining) that emits events based on state changes.
   * Refer to specific device sections for event details.
   * @emits  Device#polling-error
   * @param  {number} interval (ms)
   * @return {Device|Bulb|Plug}          this
   */
  startPolling(interval: number): this {
    const fn = async (): Promise<void> => {
      try {
        await this.getInfo();
      } catch (err) {
        this.log.debug(
          '[%s] device.startPolling(): getInfo(): error:',
          this.alias,
          err
        );
        /**
         * @event Device#polling-error
         * @property {Error} error
         */
        this.emit('polling-error', err);
      }
    };
    this.pollingTimer = setInterval(fn, interval);
    fn();
    return this;
  }

  /**
   * Stops device polling.
   */
  stopPolling(): void {
    if (this.pollingTimer === null) return;
    clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  }

  /**
   * Gets device's SysInfo.
   *
   * Requests `system.sysinfo` from device. Does not support childId.
   * @param  {SendOptions}  [sendOptions]
   * @return {Promise<Object, ResponseError>} parsed JSON response
   */
  async getSysInfo(sendOptions?: SendOptions): Promise<Sysinfo> {
    this.log.debug('[%s] device.getSysInfo()', this.alias);
    const response = extractResponse(
      await this.sendCommand(
        '{"system":{"get_sysinfo":{}}}',
        undefined,
        sendOptions
      ),
      '',
      isSysinfo
    ) as Sysinfo;

    this.setSysInfo(response);
    return this.sysInfo;
  }

  /**
   * Change device's alias (name).
   *
   * Sends `system.set_dev_alias` command. Supports childId.
   * @param  {string}       alias
   * @param  {SendOptions} [sendOptions]
   * @return {Promise<boolean, ResponseError>}
   */
  async setAlias(alias: string, sendOptions?: SendOptions): Promise<boolean> {
    await this.sendCommand(
      {
        [this.apiModule.system]: {
          set_dev_alias: { alias },
        },
      },
      this.childId,
      sendOptions
    );
    this.setAliasProperty(alias);
    return true;
  }

  protected abstract setAliasProperty(alias: string): void;

  /**
   * Set device's location.
   *
   * Sends `system.set_dev_location` command. Does not support childId.
   * @param  {number}       latitude
   * @param  {number}       longitude
   * @param  {SendOptions} [sendOptions]
   * @return {Promise<Object, ResponseError>} parsed JSON response
   */
  async setLocation(
    latitude: number,
    longitude: number,
    sendOptions?: SendOptions
  ): Promise<object> {
    // eslint-disable-next-line @typescript-eslint/camelcase
    const latitude_i = Math.round(latitude * 10000);
    // eslint-disable-next-line @typescript-eslint/camelcase
    const longitude_i = Math.round(longitude * 10000);
    const response = await this.sendCommand(
      {
        [this.apiModule.system]: {
          set_dev_location: { latitude, longitude, latitude_i, longitude_i },
        },
      },
      undefined,
      sendOptions
    );
    if (isObjectLike(response)) return response;
    throw new Error('Unexpected Response');
  }

  /**
   * Gets device's model.
   *
   * Requests `system.sysinfo` and returns model name. Does not support childId.
   * @param  {SendOptions} [sendOptions]
   * @return {Promise<string, ResponseError>} parsed JSON response
   */
  async getModel(sendOptions?: SendOptions): Promise<string> {
    const sysInfo = await this.getSysInfo(sendOptions);
    return sysInfo.model;
  }

  /**
   * Reboot device.
   *
   * Sends `system.reboot` command. Does not support childId.
   * @param  {number}       delay
   * @param  {SendOptions} [sendOptions]
   * @return {Promise<Object, ResponseError>} parsed JSON response
   */
  async reboot(delay: number, sendOptions?: SendOptions): Promise<unknown> {
    return this.sendCommand(
      {
        [this.apiModule.system]: { reboot: { delay } },
      },
      undefined,
      sendOptions
    );
  }

  /**
   * Reset device.
   *
   * Sends `system.reset` command. Does not support childId.
   * @param  {number}       delay
   * @param  {SendOptions} [sendOptions]
   * @return {Promise<Object, ResponseError>} parsed JSON response
   */
  async reset(delay: number, sendOptions?: SendOptions): Promise<unknown> {
    return this.sendCommand(
      {
        [this.apiModule.system]: { reset: { delay } },
      },
      undefined,
      sendOptions
    );
  }

  abstract async getInfo(sendOptions?: SendOptions): Promise<object>;
}