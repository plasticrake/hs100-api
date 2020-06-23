/* eslint camelcase: ["off"] */

const isEqual = require('lodash.isequal');

/**
 * Lighting
 */
class Lighting {
  lastState;

  #lightState = {};

  constructor(device, apiModuleName) {
    this.device = device;
    this.apiModuleName = apiModuleName;

    this.lastState = { powerOn: null, lightState: null };
  }

  /**
   * Returns cached results from last retrieval of `lightingservice.get_light_state`.
   * @return {Object}
   */
  get lightState() {
    return this.#lightState;
  }

  /**
   * @private
   */
  set lightState(lightState) {
    this.#lightState = lightState;
    this.emitEvents();
  }

  /**
   * Bulb was turned on (`lightstate.on_off`).
   * @event Bulb#lightstate-on
   * @property {Object} value lightstate
   */
  /**
   * Bulb was turned off (`lightstate.on_off`).
   * @event Bulb#lightstate-off
   * @property {Object} value lightstate
   */
  /**
   * Bulb's lightstate was changed.
   * @event Bulb#lightstate-change
   * @property {Object} value lightstate
   */
  /**
   * Bulb's lightstate state was updated from device. Fired regardless if status was changed.
   * @event Bulb#lightstate-update
   * @property {Object} value lightstate
   */
  /**
   * @private
   */
  emitEvents() {
    if (!this.#lightState) return;
    const powerOn = this.#lightState.on_off === 1;

    if (this.lastState.powerOn !== powerOn) {
      this.lastState.powerOn = powerOn;
      if (powerOn) {
        this.device.emit('lightstate-on', this.#lightState);
      } else {
        this.device.emit('lightstate-off', this.#lightState);
      }
    }

    if (!isEqual(this.lastState.lightState, this.#lightState)) {
      this.lastState.lightState = this.#lightState;
      this.device.emit('lightstate-change', this.#lightState);
    }
    this.device.emit('lightstate-update', this.#lightState);
  }

  /**
   * Get Bulb light state.
   *
   * Requests `lightingservice.get_light_state`.
   * @param  {SendOptions} [sendOptions]
   * @return {Promise<Object, ResponseError>} parsed JSON response
   */
  async getLightState(sendOptions) {
    this.lightState = await this.device.sendCommand(
      {
        [this.apiModuleName]: { get_light_state: {} },
      },
      null,
      sendOptions
    );
    return this.lightState;
  }

  /**
   * Sets Bulb light state (on/off, brightness, color, etc).
   *
   * Sends `lightingservice.transition_light_state` command.
   * @param  {Object}       options
   * @param  {number}      [options.transition_period] (ms)
   * @param  {boolean}     [options.on_off]
   * @param  {string}      [options.mode]
   * @param  {number}      [options.hue]               0-360
   * @param  {number}      [options.saturation]        0-100
   * @param  {number}      [options.brightness]        0-100
   * @param  {number}      [options.color_temp]        Kelvin (LB120:2700-6500 LB130:2500-9000)
   * @param  {boolean}     [options.ignore_default=true]
   * @param  {SendOptions} [sendOptions]
   * @return {Promise<boolean, ResponseError>}
   */
  async setLightState(
    {
      transition_period,
      on_off,
      mode,
      hue,
      saturation,
      brightness,
      color_temp,
      ignore_default = true,
    },
    sendOptions
  ) {
    const state = {};
    if (ignore_default !== undefined)
      state.ignore_default = ignore_default ? 1 : 0;
    if (transition_period !== undefined)
      state.transition_period = transition_period;
    if (on_off !== undefined) state.on_off = on_off ? 1 : 0;
    if (mode !== undefined) state.mode = mode;
    if (hue !== undefined) state.hue = hue;
    if (saturation !== undefined) state.saturation = saturation;
    if (brightness !== undefined) state.brightness = brightness;
    if (color_temp !== undefined) state.color_temp = color_temp;

    this.lightState = await this.device.sendCommand(
      {
        [this.apiModuleName]: { transition_light_state: state },
      },
      null,
      sendOptions
    );
    return true;
  }
}

module.exports = Lighting;
