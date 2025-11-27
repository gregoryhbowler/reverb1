// quadreverb-node.js
// Wrapper class for QuadraVerb reverb AudioWorkletNode

class QuadraVerbNode extends AudioWorkletNode {
  constructor(context, options = {}) {
    super(context, 'quadreverb-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });
    
    // Default parameters
    this._params = {
      mix: 0.5,
      preDelayMs: 20,
      decay: 3.0,
      size: 0.7,
      diffusion: 0.75,
      lowCutHz: 100,
      highCutHz: 6000,
      color: 0.5,
      modRate: 0.5,
      modDepth: 0.3,
      stereoWidth: 0.9,
      vintage: 0.3,
      mode: 0
    };
    
    // Override with provided options
    Object.assign(this._params, options);
    
    // Send initial parameters
    this.updateParameters(this._params);
  }
  
  // ===== PARAMETER GETTERS/SETTERS =====
  
  get mix() { return this._params.mix; }
  set mix(value) {
    this._params.mix = Math.max(0, Math.min(1, value));
    this.updateParameters({ mix: this._params.mix });
  }
  
  get preDelayMs() { return this._params.preDelayMs; }
  set preDelayMs(value) {
    this._params.preDelayMs = Math.max(0, Math.min(200, value));
    this.updateParameters({ preDelayMs: this._params.preDelayMs });
  }
  
  get decay() { return this._params.decay; }
  set decay(value) {
    this._params.decay = Math.max(0.1, Math.min(30, value));
    this.updateParameters({ decay: this._params.decay });
  }
  
  get size() { return this._params.size; }
  set size(value) {
    this._params.size = Math.max(0, Math.min(1, value));
    this.updateParameters({ size: this._params.size });
  }
  
  get diffusion() { return this._params.diffusion; }
  set diffusion(value) {
    this._params.diffusion = Math.max(0, Math.min(1, value));
    this.updateParameters({ diffusion: this._params.diffusion });
  }
  
  get lowCutHz() { return this._params.lowCutHz; }
  set lowCutHz(value) {
    this._params.lowCutHz = Math.max(20, Math.min(1000, value));
    this.updateParameters({ lowCutHz: this._params.lowCutHz });
  }
  
  get highCutHz() { return this._params.highCutHz; }
  set highCutHz(value) {
    this._params.highCutHz = Math.max(500, Math.min(20000, value));
    this.updateParameters({ highCutHz: this._params.highCutHz });
  }
  
  get color() { return this._params.color; }
  set color(value) {
    this._params.color = Math.max(0, Math.min(1, value));
    this.updateParameters({ color: this._params.color });
  }
  
  get modRate() { return this._params.modRate; }
  set modRate(value) {
    this._params.modRate = Math.max(0, Math.min(1, value));
    this.updateParameters({ modRate: this._params.modRate });
  }
  
  get modDepth() { return this._params.modDepth; }
  set modDepth(value) {
    this._params.modDepth = Math.max(0, Math.min(1, value));
    this.updateParameters({ modDepth: this._params.modDepth });
  }
  
  get stereoWidth() { return this._params.stereoWidth; }
  set stereoWidth(value) {
    this._params.stereoWidth = Math.max(0, Math.min(1, value));
    this.updateParameters({ stereoWidth: this._params.stereoWidth });
  }
  
  get vintage() { return this._params.vintage; }
  set vintage(value) {
    this._params.vintage = Math.max(0, Math.min(1, value));
    this.updateParameters({ vintage: this._params.vintage });
  }
  
  get mode() { return this._params.mode; }
  set mode(value) {
    this._params.mode = Math.max(0, Math.min(3, Math.floor(value)));
    this.updateParameters({ mode: this._params.mode });
  }
  
  // ===== MODE PRESETS =====
  setMode(modeName) {
    const modes = {
      'plate': 0,
      'hall': 1,
      'room': 2,
      'ambient': 3
    };
    
    const modeIndex = modes[modeName.toLowerCase()];
    if (modeIndex !== undefined) {
      this.mode = modeIndex;
    }
  }
  
  // ===== PRESET LOADER =====
  loadPreset(presetName) {
    const presets = {
      'small-room': {
        mix: 0.3,
        preDelayMs: 5,
        decay: 1.2,
        size: 0.3,
        diffusion: 0.6,
        lowCutHz: 150,
        highCutHz: 8000,
        color: 0.6,
        modRate: 0.3,
        modDepth: 0.2,
        stereoWidth: 0.7,
        vintage: 0.2,
        mode: 2
      },
      'medium-hall': {
        mix: 0.4,
        preDelayMs: 15,
        decay: 2.5,
        size: 0.7,
        diffusion: 0.75,
        lowCutHz: 100,
        highCutHz: 7000,
        color: 0.5,
        modRate: 0.5,
        modDepth: 0.3,
        stereoWidth: 0.85,
        vintage: 0.3,
        mode: 1
      },
      'large-hall': {
        mix: 0.45,
        preDelayMs: 25,
        decay: 4.5,
        size: 0.9,
        diffusion: 0.8,
        lowCutHz: 80,
        highCutHz: 6500,
        color: 0.45,
        modRate: 0.4,
        modDepth: 0.35,
        stereoWidth: 0.9,
        vintage: 0.35,
        mode: 1
      },
      'bright-plate': {
        mix: 0.5,
        preDelayMs: 10,
        decay: 2.0,
        size: 0.65,
        diffusion: 0.8,
        lowCutHz: 120,
        highCutHz: 9000,
        color: 0.7,
        modRate: 0.6,
        modDepth: 0.4,
        stereoWidth: 0.95,
        vintage: 0.25,
        mode: 0
      },
      'dark-plate': {
        mix: 0.55,
        preDelayMs: 8,
        decay: 2.8,
        size: 0.7,
        diffusion: 0.75,
        lowCutHz: 100,
        highCutHz: 4500,
        color: 0.3,
        modRate: 0.5,
        modDepth: 0.35,
        stereoWidth: 0.9,
        vintage: 0.4,
        mode: 0
      },
      'ambient-wash': {
        mix: 0.6,
        preDelayMs: 40,
        decay: 8.0,
        size: 0.95,
        diffusion: 0.85,
        lowCutHz: 60,
        highCutHz: 5000,
        color: 0.35,
        modRate: 0.3,
        modDepth: 0.45,
        stereoWidth: 0.95,
        vintage: 0.35,
        mode: 3
      },
      'tight-drums': {
        mix: 0.25,
        preDelayMs: 3,
        decay: 0.8,
        size: 0.25,
        diffusion: 0.5,
        lowCutHz: 200,
        highCutHz: 8000,
        color: 0.65,
        modRate: 0.2,
        modDepth: 0.15,
        stereoWidth: 0.6,
        vintage: 0.15,
        mode: 2
      },
      'vocal-shimmer': {
        mix: 0.35,
        preDelayMs: 20,
        decay: 2.2,
        size: 0.6,
        diffusion: 0.8,
        lowCutHz: 150,
        highCutHz: 7500,
        color: 0.6,
        modRate: 0.7,
        modDepth: 0.5,
        stereoWidth: 0.85,
        vintage: 0.3,
        mode: 0
      }
    };
    
    const preset = presets[presetName.toLowerCase()];
    if (preset) {
      Object.assign(this._params, preset);
      this.updateParameters(this._params);
    } else {
      console.warn(`Preset "${presetName}" not found. Available presets:`, Object.keys(presets));
    }
  }
  
  // ===== GET ALL PRESETS =====
  static getAvailablePresets() {
    return [
      'small-room',
      'medium-hall',
      'large-hall',
      'bright-plate',
      'dark-plate',
      'ambient-wash',
      'tight-drums',
      'vocal-shimmer'
    ];
  }
  
  // ===== BULK PARAMETER UPDATE =====
  updateParameters(params) {
    this.port.postMessage({
      type: 'updateParams',
      params: params
    });
  }
  
  // ===== GET ALL PARAMETERS =====
  getParameters() {
    return { ...this._params };
  }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = QuadraVerbNode;
}
