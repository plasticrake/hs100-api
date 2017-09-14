'use strict';

const Device = require('./device');

class Bulb extends Device {
  constructor (options) {
    super(options);
    if (typeof options === 'undefined') options = {};

    this.log.warn('Bulb support is not tested');

    this.lastState = Object.assign(this.lastState, { powerOn: null, inUse: null });
  }

  get sysInfo () {
    return super.sysInfo;
  }

  set sysInfo (sysInfo) {
    super.sysInfo = sysInfo;
    try {
      this.supportsConsumption = (sysInfo.feature.includes('ENE'));
    } catch (e) {
      this.supportsConsumption = false;
    }
    this.emitEvents();
  }

  get consumption () { return this._consumption; }

  set consumption (consumption) {
    this._consumption = consumption;
    if (this.supportsConsumption) {
      this.emitEvents();
    }
  }

  emitEvents () {
    super.emitEvents();
    let powerOn = (this.lightState.on_off === 1);

    this.log.debug('emitEvents() powerOn: %s lastState: %j', powerOn, this.lastState);

    if (this.lastState.powerOn !== powerOn) {
      this.lastState.powerOn = powerOn;
      if (powerOn) {
        this.emit('power-on', this);
        this.emit('bulb-on', this);
      } else {
        this.emit('power-off', this);
        this.emit('bulb-off', this);
      }
    }

    // using JSON.stringify for now, need device to test actual results
    if (JSON.stringify(this.lastState.lightState) !== JSON.stringify(this.lightState)) {
      this.lastState.lightState = this.lightState;
      this.emit('bulb-change');
    }
  }

  async getInfo () {
    let infoPayload = '{"system":{"get_sysinfo":{}}}';
    let data = await this.send(infoPayload);
    this.sysInfo = data.system.get_sysinfo;
    // this.cloudInfo = data.cnCloud.get_info;
    // this.consumption = data.emeter;
    // this.scheduleNextAction = data.schedule.get_next_action;
    // return {sysInfo: this.sysInfo, cloudInfo: this.cloudInfo, consumption: this.consumption, scheduleNextAction: this.scheduleNextAction};
    return {sysInfo: this.sysInfo};
  }

  async getLightState () {
    let errCode;
    let data = await this.send("{'smartlife.iot.smartbulb.lightingservice': {'get_light_details': {}}}");
    try {
      let lightState = data['smartlife.iot.smartbulb.lightingservice'].get_light_details;
      errCode = lightState.err_code;
      if (errCode === 0) { this.lightState = lightState; }
      this.emitEvents();
      return (errCode === 0);
    } catch (e) {}
    if (errCode !== 0) { throw data; }
  }

  async setLightState (options) {
    let state = {};
    state.ignore_default = options.ignore_default || 1;
    state.on_off = options.on_off;
    state.transition_period = options.transition_period || 0;
    state.mode = options.mode;
    state.hue = options.hue;// hue: 0-360
    state.saturation = options.saturation; // saturation: 0-100
    state.brightness = options.brightness; // brightness: 0-100
    state.color_temp = options.colorTemp;

    const payload = {
      'smartlife.iot.smartbulb.lightingservice': {
        'transition_light_state': state
      }
    };

    let errCode;
    let data = await this.send(payload);
    try {
      let lightState = data['smartlife.iot.smartbulb.lightingservice'].transition_light_state;
      errCode = lightState.err_code;
      if (errCode === 0) { this.lightState = lightState; }
      this.emitEvents();
      return (errCode === 0);
    } catch (e) {}
    if (errCode !== 0) { throw data; }
  }

  async getScheduleRules () {
    let data = await this.send("{'smartlife.iot.common.schedule': {'get_rules': {}}}");
    return data['smartlife.iot.common.schedule'].get_rules;
  }

  async getCloudInfo () {
    let data = await this.send("{'smartlife.iot.common.cloud': {'get_info': {}}}");
    this.cloudInfo = data['smartlife.iot.common.cloud'].get_info;
    return this.cloudInfo;
  }

  async getPowerState () {
    let lightState = await this.getLightState();
    return (lightState.on_off === 1);
  }

  async setPowerState (value) {
    return this.setLightState({on_off: value});
  }
}

module.exports = Bulb;
