/* eslint-disable no-underscore-dangle */
import type { SendOptions } from '../client';
import Device, { isPlugSysinfo } from '../device';
import type {
  CommonSysinfo,
  DeviceConstructorOptions,
  Sysinfo,
} from '../device';
import Away from './away';
import Cloud, { isCloudInfo } from '../shared/cloud';
import type { CloudInfo } from '../shared/cloud';
import Dimmer from './dimmer';
import Emeter from '../shared/emeter';
import Schedule from './schedule';
import Timer from './timer';
import Time from '../shared/time';
import {
  extractResponse,
  hasErrCode,
  HasErrCode,
  isDefinedAndNotNull,
  isObjectLike,
  ResponseError,
} from '../utils';

type PlugChild = { id: string; alias: string; state: number };

type SysinfoChildren = {
  children?: [{ id: string; alias: string; state: number }];
};

export type PlugSysinfo = CommonSysinfo &
  SysinfoChildren &
  (
    | { type: 'IOT.SMARTPLUGSWITCH' | 'IOT.RANGEEXTENDER.SMARTPLUG' }
    | { mic_type: 'IOT.SMARTPLUGSWITCH' }
  ) &
  ({ mac: string } | { ethernet_mac: string }) & {
    feature: string;
    led_off: 0 | 1;
    relay_state?: 0 | 1;
    dev_name?: string;
    brightness?: number;
  };

export function hasSysinfoChildren(
  candidate: Sysinfo
): candidate is Sysinfo & Required<SysinfoChildren> {
  return (
    isObjectLike(candidate) &&
    'children' in candidate &&
    candidate.children !== undefined &&
    isObjectLike(candidate.children) &&
    candidate.children.length > 0
  );
}

export interface PlugConstructorOptions extends DeviceConstructorOptions {
  sysInfo: PlugSysinfo;
  /**
   * Watts
   * @defaultValue 0.1
   */
  inUseThreshold?: number;
  /**
   * If passed a string between 0 and 99 it will prepend the deviceId
   */
  childId?: string;
}

/**
 * Plug Device.
 *
 * TP-Link models: HS100, HS105, HS107, HS110, HS200, HS210, HS220, HS300.
 *
 * Models with multiple outlets (HS107, HS300) will have a children property.
 * If Plug is instantiated with a childId it will control the outlet associated with that childId.
 * Some functions only apply to the entire device, and are noted below.
 *
 * Emits events after device status is queried, such as {@link #getSysInfo} and {@link #getEmeterRealtime}.
 * @extends Device
 * @extends EventEmitter
 * @fires  Plug#power-on
 * @fires  Plug#power-off
 * @fires  Plug#power-update
 * @fires  Plug#in-use
 * @fires  Plug#not-in-use
 * @fires  Plug#in-use-update
 * @fires  Plug#emeter-realtime-update
 */
export default class Plug extends Device {
  // private get _sysInfo(): PlugSysinfo {
  //   // eslint-disable-next-line no-underscore-dangle
  //   return super._sysInfo as PlugSysinfo;
  // }

  protected _sysInfo: PlugSysinfo;

  #children: Map<string, PlugChild> = new Map();

  #child?: PlugChild;

  #childId?: string;

  inUseThreshold = 0.1;

  emitEventsEnabled = true;

  lastState = { inUse: false, relayState: false, brightness: undefined };

  static readonly apiModules = {
    system: 'system',
    cloud: 'cnCloud',
    schedule: 'schedule',
    timesetting: 'time',
    emeter: 'emeter',
    netif: 'netif',
    lightingservice: '',
  };

  away: Away;

  cloud: Cloud;

  dimmer: Dimmer;

  emeter: Emeter;

  schedule: Schedule;

  time: Time;

  timer: Timer;

  /**
   * Created by {@link Client} - Do not instantiate directly.
   *
   * See [Device constructor]{@link Device} for common options.
   */
  constructor(options: PlugConstructorOptions) {
    super({
      client: options.client,
      _sysInfo: options.sysInfo,
      host: options.host,
      port: options.port,
      logger: options.logger,
      defaultSendOptions: options.defaultSendOptions,
    });

    const { sysInfo, inUseThreshold = 0.1, childId } = options;

    this.log.debug('plug.constructor()');

    /**
     * @borrows Away#getRules as Plug.away#getRules
     * @borrows Away#addRule as Plug.away#addRule
     * @borrows Away#editRule as Plug.away#editRule
     * @borrows Away#deleteAllRules as Plug.away#deleteAllRules
     * @borrows Away#deleteRule as Plug.away#deleteRule
     * @borrows Away#setOverallEnable as Plug.away#setOverallEnable
     */
    this.away = new Away(this, 'anti_theft', this.#childId);

    /**
     * @borrows Cloud#getInfo as Plug.cloud#getInfo
     * @borrows Cloud#bind as Plug.cloud#bind
     * @borrows Cloud#unbind as Plug.cloud#unbind
     * @borrows Cloud#getFirmwareList as Plug.cloud#getFirmwareList
     * @borrows Cloud#setServerUrl as Plug.cloud#setServerUrl
     */
    this.cloud = new Cloud(this, 'cnCloud');

    /**
     * @borrows Dimmer#setBrightness as Plug.dimmer#setBrightness
     * @borrows Dimmer#getDefaultBehavior as Plug.dimmer#getDefaultBehavior
     * @borrows Dimmer#getDimmerParameters as Plug.dimmer#getDimmerParameters
     * @borrows Dimmer#setDimmerTransition as Plug.dimmer#setDimmerTransition
     * @borrows Dimmer#setDoubleClickAction as Plug.dimmer#setDoubleClickAction
     * @borrows Dimmer#setFadeOffTime as Plug.dimmer#setFadeOffTime
     * @borrows Dimmer#setFadeOnTime as Plug.dimmer#setFadeOnTime
     * @borrows Dimmer#setGentleOffTime as Plug.dimmer#setGentleOffTime
     * @borrows Dimmer#setGentleOnTime as Plug.dimmer#setGentleOnTime
     * @borrows Dimmer#setLongPressAction as Plug.dimmer#setLongPressAction
     * @borrows Dimmer#setSwitchState as Plug.dimmer#setSwitchState
     */
    this.dimmer = new Dimmer(this, 'smartlife.iot.dimmer');

    /**
     * @borrows Emeter#realtime as Plug.emeter#realtime
     * @borrows Emeter#getRealtime as Plug.emeter#getRealtime
     * @borrows Emeter#getDayStats as Plug.emeter#getDayStats
     * @borrows Emeter#getMonthStats as Plug.emeter#getMonthStats
     * @borrows Emeter#eraseStats as Plug.emeter#eraseStats
     */
    this.emeter = new Emeter(this, 'emeter', this.#childId);

    /**
     * @borrows Schedule#getNextAction as Plug.schedule#getNextAction
     * @borrows Schedule#getRules as Plug.schedule#getRules
     * @borrows Schedule#getRule as Plug.schedule#getRule
     * @borrows PlugSchedule#addRule as Plug.schedule#addRule
     * @borrows PlugSchedule#editRule as Plug.schedule#editRule
     * @borrows Schedule#deleteAllRules as Plug.schedule#deleteAllRules
     * @borrows Schedule#deleteRule as Plug.schedule#deleteRule
     * @borrows Schedule#setOverallEnable as Plug.schedule#setOverallEnable
     * @borrows Schedule#getDayStats as Plug.schedule#getDayStats
     * @borrows Schedule#getMonthStats as Plug.schedule#getMonthStats
     * @borrows Schedule#eraseStats as Plug.schedule#eraseStats
     */
    this.schedule = new Schedule(this, 'schedule', this.#childId);

    /**
     * @borrows Time#getTime as Plug.time#getTime
     * @borrows Time#getTimezone as Plug.time#getTimezone
     */
    this.time = new Time(this, 'time');

    /**
     * @borrows Timer#getRules as Plug.timer#getRules
     * @borrows Timer#addRule as Plug.timer#addRule
     * @borrows Timer#editRule as Plug.timer#editRule
     * @borrows Timer#deleteAllRules as Plug.timer#deleteAllRules
     */
    this.timer = new Timer(this, 'count_down', this.#childId);

    this._sysInfo = sysInfo;
    this.setSysInfo(sysInfo);

    this.inUseThreshold = inUseThreshold;

    if (isDefinedAndNotNull(childId)) this.setChildId(childId);

    if (this.sysInfo) {
      this.lastState.inUse = this.inUse;
      this.lastState.relayState = this.relayState;
      if (this.supportsDimmer) this.lastState.brightness = this.brightness;
    }
  }

  get sysInfo(): PlugSysinfo {
    return this._sysInfo;
  }

  /**
   * @internal
   */
  setSysInfo(sysInfo: PlugSysinfo): void {
    super.setSysInfo(sysInfo);
    if (sysInfo.children) {
      this.setChildren(sysInfo.children);
    }
    this.log.debug('[%s] plug sysInfo set', this.alias);
    this.emitEvents();
  }

  /**
   * Returns children as a map keyed by childId. From cached results from last retrieval of `system.sysinfo.children`.
   */
  get children(): Map<string, PlugChild> {
    return this.#children;
  }

  private setChildren(children: PlugChild[] | Map<string, PlugChild>): void {
    if (Array.isArray(children)) {
      this.#children = new Map(
        children.map((child) => {
          // eslint-disable-next-line no-param-reassign
          child.id = this.normalizeChildId(child.id);
          return [child.id, child];
        })
      );
    } else if (children instanceof Map) {
      this.#children = children;
    }
    if (this.#childId && this.#children) {
      if (this.#childId !== undefined) this.setChildId(this.#childId);
      // this.#child = this.#children.get(this.normalizeChildId(this.#childId));
    }
  }

  /**
   * Returns childId.
   */
  get childId(): string | undefined {
    return this.#childId;
  }

  private setChildId(childId: string): void {
    this.#childId = this.normalizeChildId(childId);
    if (this.#childId && this.#children) {
      this.#child = this.#children.get(this.#childId);
    }
    if (this.#childId && this.#child == null) {
      throw new Error(`Could not find child with childId ${childId}`);
    }
  }

  /**
   * Cached value of `sysinfo.alias` or `sysinfo.children[childId].alias` if childId set.
   */
  get alias(): string {
    if (this.#childId && this.#child !== undefined) {
      return this.#child.alias;
    }
    if (this.sysInfo === undefined) return '';
    return this.sysInfo.alias;
  }

  protected setAliasProperty(alias: string): void {
    if (this.#childId && this.#child !== undefined) {
      this.#child.alias = alias;
    }
    this.sysInfo.alias = alias;
  }

  /**
   * Cached value of `sysinfo.dev_name`.
   */
  get description(): string | undefined {
    return this.sysInfo.dev_name;
  }

  // eslint-disable-next-line class-methods-use-this
  get deviceType(): 'plug' {
    return 'plug';
  }

  /**
   * Cached value of `sysinfo.deviceId` or `childId` if set.
   */
  get id(): string {
    if (this.#childId && this.#child !== undefined) {
      return this.#childId;
    }
    return this.sysInfo.deviceId;
  }

  /**
   * Determines if device is in use based on cached `emeter.get_realtime` results.
   *
   * If device supports energy monitoring (e.g. HS110): `power > inUseThreshold`. `inUseThreshold` is specified in Watts
   *
   * Otherwise fallback on relay state: `relay_state === 1` or `sysinfo.children[childId].state === 1`.
   *
   * Supports childId.
   */
  get inUse(): boolean {
    if (
      this.supportsEmeter &&
      'power' in this.emeter.realtime &&
      this.emeter.realtime.power !== undefined
    ) {
      return this.emeter.realtime.power > this.inUseThreshold;
    }
    return this.relayState;
  }

  /**
   * Cached value of `sysinfo.relay_state === 1` or `sysinfo.children[childId].state === 1`.
   * Supports childId.
   * If device supports childId, but childId is not set, then it will return true if any child has `state === 1`.
   * @returns On (true) or Off (false)
   */
  get relayState(): boolean {
    if (this.#childId && this.#child !== undefined) {
      return this.#child.state === 1;
    }
    if (this.#children && this.#children.size > 0) {
      return (
        Array.from(this.#children.values()).findIndex((child) => {
          return child.state === 1;
        }) !== -1
      );
    }
    return this.sysInfo.relay_state === 1;
  }

  protected setRelayState(relayState: boolean): void {
    if (this.#childId && this.#child !== undefined) {
      this.#child.state = relayState ? 1 : 0;
      return;
    }
    if (this.#children && this.#children.size > 0) {
      for (const child of this.#children.values()) {
        child.state = relayState ? 1 : 0;
      }
      return;
    }
    this.sysInfo.relay_state = relayState ? 1 : 0;
  }

  /**
   * True if cached value of `sysinfo` has `brightness` property.
   * @returns `true` if cached value of `sysinfo` has `brightness` property.
   */
  get supportsDimmer(): boolean {
    return 'brightness' in this.sysInfo;
  }

  /**
   * Cached value of `sysinfo.brightness`.
   * @returns value between 0 and 100, inclusive, only if `supportsDimmer` is true.
   */
  get brightness() {
    return this.supportsDimmer ? this.sysInfo.brightness : undefined;
  }

  /**
   * True if cached value of `sysinfo` has `feature` property that contains 'ENE'.
   * @returns `true` if cached value of `sysinfo` has `feature` property that contains 'ENE'
   */
  get supportsEmeter(): boolean {
    return this.sysInfo.feature && typeof this.sysInfo.feature === 'string'
      ? this.sysInfo.feature.indexOf('ENE') >= 0
      : false;
  }

  /**
   * Gets plug's SysInfo.
   *
   * Requests `system.sysinfo` from device. Does not support childId.

   */
  async getSysInfo(sendOptions?: SendOptions): Promise<PlugSysinfo> {
    const response = await super.getSysInfo(sendOptions);

    if (!isPlugSysinfo(response)) {
      throw new Error(`Unexpected Response: ${response}`);
    }
    return this.sysInfo;
  }

  /**
   * Requests common Plug status details in a single request.
   * - `system.get_sysinfo`
   * - `cloud.get_sysinfo`
   * - `emeter.get_realtime`
   * - `schedule.get_next_action`
   *
   * This command is likely to fail on some devices when using UDP transport.
   * This defaults to TCP transport unless overridden in sendOptions.
   *
   * Supports childId.
   * @returns parsed JSON response
   * @throws {@link ResponseError}
   */
  async getInfo(
    sendOptions?: SendOptions
  ): Promise<{
    sysInfo: Record<string, unknown>;
    cloud: { info: Record<string, unknown> };
    emeter: { realtime: Record<string, unknown> };
    schedule: { nextAction: Record<string, unknown> };
  }> {
    // force TCP unless overridden here
    const sendOptionsForGetInfo: SendOptions =
      sendOptions == null ? {} : sendOptions;
    if (!('transport' in sendOptionsForGetInfo))
      sendOptionsForGetInfo.transport = 'tcp';

    let data: unknown;
    try {
      data = await this.sendCommand(
        '{"emeter":{"get_realtime":{}},"schedule":{"get_next_action":{}},"system":{"get_sysinfo":{}},"cnCloud":{"get_info":{}}}',
        this.#childId,
        sendOptionsForGetInfo
      );
    } catch (err) {
      // Ignore emeter section errors as not all devices support it
      if (
        err instanceof ResponseError &&
        err.modules.length === 1 &&
        err.modules[0] === 'emeter'
      ) {
        data = JSON.parse(err.response);
      } else {
        throw err;
      }
    }

    const sysinfo = extractResponse(
      data,
      'system.get_sysinfo',
      isPlugSysinfo
    ) as PlugSysinfo;
    this.setSysInfo(sysinfo);

    const cloudInfo = extractResponse<CloudInfo & HasErrCode>(
      data,
      'cnCloud.get_info',
      (c) => isCloudInfo(c) && hasErrCode(c)
    );
    this.cloud.info = cloudInfo;

    if (
      isObjectLike(data) &&
      'emeter' in data &&
      isObjectLike(data.emeter) &&
      'get_realtime' in data.emeter &&
      isObjectLike(data.emeter.get_realtime)
    ) {
      this.emeter.realtime = data.emeter.get_realtime;
    }

    const scheduleNextAction = extractResponse(
      data,
      'schedule.get_next_action',
      hasErrCode
    ) as HasErrCode;
    this.schedule.nextAction = scheduleNextAction;

    return {
      sysInfo: this.sysInfo,
      cloud: { info: this.cloud.info },
      emeter: { realtime: this.emeter.realtime },
      schedule: { nextAction: this.schedule.nextAction },
    };
  }

  /**
   * Same as {@link #inUse}, but requests current `emeter.get_realtime`. Supports childId.
   * @returns parsed JSON response
   * @throws {@link ResponseError}
   */
  async getInUse(sendOptions?: SendOptions): Promise<boolean> {
    if (this.supportsEmeter) {
      await this.emeter.getRealtime(sendOptions);
    } else {
      await this.getSysInfo(sendOptions);
    }
    return this.inUse;
  }

  /**
   * Get Plug LED state (night mode).
   *
   * Requests `system.sysinfo` and returns true if `led_off === 0`. Does not support childId.
   * @param  {SendOptions} [sendOptions]
   * @returns LED State, true === on
   * @throws {@link ResponseError}
   */
  async getLedState(sendOptions?: SendOptions): Promise<boolean> {
    const sysInfo = await this.getSysInfo(sendOptions);
    return sysInfo.led_off === 0;
  }

  /**
   * Turn Plug LED on/off (night mode). Does not support childId.
   *
   * Sends `system.set_led_off` command.
   * @param   value - LED State, true === on
   * @throws {@link ResponseError}
   */
  async setLedState(value: boolean, sendOptions?: SendOptions): Promise<true> {
    await this.sendCommand(
      `{"system":{"set_led_off":{"off":${value ? 0 : 1}}}}`,
      undefined,
      sendOptions
    );
    this.sysInfo.led_off = value ? 0 : 1;
    return true;
  }

  /**
   * Get Plug relay state (on/off).
   *
   * Requests `system.get_sysinfo` and returns true if On. Calls {@link #relayState}. Supports childId.
   * @throws {@link ResponseError}
   */
  async getPowerState(sendOptions?: SendOptions): Promise<boolean> {
    await this.getSysInfo(sendOptions);
    return this.relayState;
  }

  /**
   * Turns Plug relay on/off.
   *
   * Sends `system.set_relay_state` command. Supports childId.
   * @throws {@link ResponseError}
   */
  async setPowerState(
    value: boolean,
    sendOptions?: SendOptions
  ): Promise<true> {
    await this.sendCommand(
      `{"system":{"set_relay_state":{"state":${value ? 1 : 0}}}}`,
      this.#childId,
      sendOptions
    );
    this.setRelayState(value);
    this.emitEvents();
    return true;
  }

  /**
   * Toggles Plug relay state.
   *
   * Requests `system.get_sysinfo` sets the power state to the opposite `relay_state === 1 and returns the new power state`. Supports childId.
   * @throws {@link ResponseError}
   */
  async togglePowerState(sendOptions?: SendOptions): Promise<boolean> {
    const powerState = await this.getPowerState(sendOptions);
    await this.setPowerState(!powerState, sendOptions);
    return !powerState;
  }

  /**
   * Blink Plug LED.
   *
   * Sends `system.set_led_off` command alternating on and off number of `times` at `rate`,
   * then sets the led to its pre-blink state. Does not support childId.
   *
   * Note: `system.set_led_off` is particularly slow, so blink rate is not guaranteed.
   * @throws {@link ResponseError}
   */
  async blink(
    times = 5,
    rate = 1000,
    sendOptions?: SendOptions
  ): Promise<boolean> {
    const delay = (t: number): Promise<void> => {
      return new Promise((resolve) => {
        setTimeout(resolve, t);
      });
    };

    const origLedState = await this.getLedState(sendOptions);
    let lastBlink: number;

    let currLedState = false;
    for (let i = 0; i < times * 2; i += 1) {
      currLedState = !currLedState;
      lastBlink = Date.now();
      // eslint-disable-next-line no-await-in-loop
      await this.setLedState(currLedState, sendOptions);
      const timeToWait = rate / 2 - (Date.now() - lastBlink);
      if (timeToWait > 0) {
        // eslint-disable-next-line no-await-in-loop
        await delay(timeToWait);
      }
    }
    if (currLedState !== origLedState) {
      await this.setLedState(origLedState, sendOptions);
    }
    return true;
  }

  /**
   * Plug's relay was turned on.
   * @event Plug#power-on
   */
  /**
   * Plug's relay was turned off.
   * @event Plug#power-off
   */
  /**
   * Plug's relay state was updated from device. Fired regardless if status was changed.
   * @event Plug#power-update
   * @property {boolean} value Relay State
   */
  /**
   * Plug's relay was turned on _or_ power draw exceeded `inUseThreshold` for HS110
   * @event Plug#in-use
   */
  /**
   * Plug's relay was turned off _or_ power draw fell below `inUseThreshold` for HS110
   * @event Plug#not-in-use
   */
  /**
   * Plug's in-use state was updated from device. Fired regardless if status was changed.
   * @event Plug#in-use-update
   * @property {boolean} value In Use State
   */
  /**
   * Plug's Energy Monitoring Details were updated from device. Fired regardless if status was changed.
   * @event Plug#emeter-realtime-update
   * @property {Object} value emeterRealtime
   */
  private emitEvents(): void {
    if (!this.emitEventsEnabled) {
      return;
    }

    const { inUse } = this;
    const { relayState } = this;
    const { brightness } = this;

    this.log.debug(
      '[%s] plug.emitEvents() inUse: %s relayState: %s lastState: %j',
      this.alias,
      inUse,
      relayState,
      this.lastState
    );
    if (this.lastState.inUse !== inUse) {
      this.lastState.inUse = inUse;
      if (inUse) {
        this.emit('in-use');
      } else {
        this.emit('not-in-use');
      }
    }
    this.emit('in-use-update', inUse);

    if (this.lastState.relayState !== relayState) {
      this.lastState.relayState = relayState;
      if (relayState) {
        this.emit('power-on');
      } else {
        this.emit('power-off');
      }
    }
    this.emit('power-update', relayState);

    if (this.supportsDimmer && this.lastState.brightness !== brightness) {
      this.lastState.brightness = brightness;
      this.emit('brightness-change', brightness);
    }
  }
}
