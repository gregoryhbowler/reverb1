// quadreverb-processor.js
// High-quality algorithmic reverb inspired by Alesis Midiverb/Quadraverb and Lexicon PCM-70
// Hybrid delay network with heavy diffusion, modulation, and vintage character

class QuadraVerbProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    
    // ===== PARAMETER DEFAULTS =====
    this.params = {
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
      mode: 0 // 0=plate, 1=hall, 2=room, 3=ambient
    };
    
    // ===== INITIALIZE BUFFERS =====
    this.initializeBuffers();
    
    // ===== FDN FEEDBACK MATRIX (8x8 Hadamard-style) =====
    this.fdnMatrix = this.createHadamardMatrix(8);
    this.fdnFeedback = 0.7;
    
    // ===== LFO SYSTEM =====
    this.lfos = [
      { phase: 0, rate: 0.37, amp: 1.0 },
      { phase: Math.PI * 0.5, rate: 0.53, amp: 0.8 },
      { phase: Math.PI, rate: 0.71, amp: 0.9 },
      { phase: Math.PI * 1.5, rate: 0.29, amp: 0.7 }
    ];
    
    // ===== OUTPUT FILTERING =====
    // Simple 1-pole filters for color control
    this.outputLP = { coeff: 0.8, stateL: 0, stateR: 0 };
    this.outputHP = { coeff: 0.05, stateL: 0, stateR: 0 };
    
    // ===== INPUT FILTERING =====
    this.inputHP = { coeff: 0.05, stateL: 0, stateR: 0 };
    
    // ===== SAFETY LIMITING =====
    this.safetyThreshold = 0.95;
    this.safetyGain = 1.0;
    
    // ===== VINTAGE NOISE/DITHER =====
    this.noiseGen = 0;
    
    // ===== MESSAGE HANDLER =====
    this.port.onmessage = (e) => {
      if (e.data.type === 'updateParams') {
        Object.assign(this.params, e.data.params);
        this.updateInternalParams();
      }
    };
    
    // Initial parameter update
    this.updateInternalParams();
  }
  
  initializeBuffers() {
    const sr = sampleRate; // sampleRate is available from AudioWorkletGlobalScope
    
    // ===== DELAY LINE BUFFERS =====
    this.maxPreDelay = Math.floor(sr * 0.2); // 200ms max
    this.preDelayBuffer = new Float32Array(this.maxPreDelay);
    this.preDelayIndex = 0;
    
    // Early reflections - irregular multitap
    this.earlyTaps = [
      { delayMs: 5.1, gain: 0.8 },
      { delayMs: 8.7, gain: 0.65 },
      { delayMs: 12.3, gain: 0.55 },
      { delayMs: 17.9, gain: 0.45 },
      { delayMs: 22.4, gain: 0.38 },
      { delayMs: 29.6, gain: 0.32 },
      { delayMs: 35.8, gain: 0.25 },
      { delayMs: 41.2, gain: 0.18 }
    ];
    
    // Convert to samples and create buffers
    this.earlyDelays = this.earlyTaps.map(tap => ({
      buffer: new Float32Array(Math.ceil(sr * tap.delayMs / 1000) + 1),
      size: Math.ceil(sr * tap.delayMs / 1000),
      gain: tap.gain,
      index: 0
    }));
    
    // Stereo offset for early reflections
    this.earlyDelaysR = this.earlyTaps.map(tap => ({
      buffer: new Float32Array(Math.ceil(sr * (tap.delayMs * 1.07) / 1000) + 1),
      size: Math.ceil(sr * (tap.delayMs * 1.07) / 1000),
      gain: tap.gain * 0.93,
      index: 0
    }));
    
    // ===== DIFFUSION STAGE A: Allpass Filters =====
    // Prime-like delay lengths in samples at 48kHz
    const diffusionADelays = [142, 107, 379, 277]; // ~3-8ms
    this.diffusionA = diffusionADelays.map(size => ({
      buffer: new Float32Array(size + 1),
      size: size,
      index: 0,
      gain: 0.7,
      modPhase: Math.random() * Math.PI * 2,
      modDepth: 0
    }));
    
    // Stereo decorrelation
    this.diffusionAR = diffusionADelays.map((size, i) => ({
      buffer: new Float32Array(Math.floor(size * 1.11) + 1),
      size: Math.floor(size * 1.11),
      index: 0,
      gain: 0.68,
      modPhase: Math.random() * Math.PI * 2,
      modDepth: 0
    }));
    
    // ===== DIFFUSION STAGE B: More Allpass Filters =====
    const diffusionBDelays = [617, 457, 829]; // ~10-17ms
    this.diffusionB = diffusionBDelays.map(size => ({
      buffer: new Float32Array(size + 1),
      size: size,
      index: 0,
      gain: 0.6,
      modPhase: Math.random() * Math.PI * 2,
      modDepth: 0
    }));
    
    this.diffusionBR = diffusionBDelays.map((size, i) => ({
      buffer: new Float32Array(Math.floor(size * 1.13) + 1),
      size: Math.floor(size * 1.13),
      index: 0,
      gain: 0.58,
      modPhase: Math.random() * Math.PI * 2,
      modDepth: 0
    }));
    
    // ===== MAIN FDN (8 lines) =====
    // Prime-like delay lengths scaled by size parameter
    const fdnBaseSizes = [1453, 1789, 2099, 2423, 2789, 3167, 3547, 3989];
    
    this.fdnLines = fdnBaseSizes.map((baseSize, i) => ({
      buffer: new Float32Array(8192), // Will resize dynamically
      size: baseSize,
      baseSize: baseSize,
      index: 0,
      // Per-line damping (1-pole lowpass)
      dampCoeff: 0.9,
      dampState: 0,
      // Per-line highpass (1-pole)
      hpCoeff: 0.05,
      hpState: 0,
      // Modulation
      modPhase: (i / 8) * Math.PI * 2,
      modDepth: 0
    }));
    
    // Allocate FDN buffers
    this.resizeFDNBuffers();
  }
  
  // ===== HADAMARD MATRIX GENERATION =====
  createHadamardMatrix(size) {
    // Simplified Hadamard-style unitary matrix
    const matrix = [];
    const scale = 1.0 / Math.sqrt(size);
    
    for (let i = 0; i < size; i++) {
      matrix[i] = [];
      for (let j = 0; j < size; j++) {
        const sign = (this.popCount(i & j) & 1) ? -1 : 1;
        matrix[i][j] = sign * scale;
      }
    }
    
    // Slight perturbation for less clinical sound
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        matrix[i][j] *= (0.95 + Math.random() * 0.1);
      }
    }
    
    return matrix;
  }
  
  popCount(n) {
    let count = 0;
    while (n) {
      count += n & 1;
      n >>= 1;
    }
    return count;
  }
  
  // ===== RESIZE FDN BUFFERS =====
  resizeFDNBuffers() {
    const maxSize = Math.max(...this.fdnLines.map(line => line.baseSize * 2));
    this.fdnLines.forEach(line => {
      if (line.buffer.length < maxSize) {
        const newBuffer = new Float32Array(maxSize);
        newBuffer.set(line.buffer);
        line.buffer = newBuffer;
      }
    });
  }
  
  // ===== PARAMETER UPDATE =====
  updateInternalParams() {
    const p = this.params;
    const sr = sampleRate;
    
    // Mode presets
    const modes = [
      // Plate: bright, dense, metallic shimmer
      { sizeScale: 0.9, diffGain: 0.75, dampBase: 0.88, hpBase: 0.06 },
      // Hall: large, smooth, natural decay
      { sizeScale: 1.4, diffGain: 0.7, dampBase: 0.92, hpBase: 0.04 },
      // Room: small, intimate, clear
      { sizeScale: 0.5, diffGain: 0.65, dampBase: 0.85, hpBase: 0.08 },
      // Ambient: huge, lush, dark
      { sizeScale: 2.0, diffGain: 0.8, dampBase: 0.95, hpBase: 0.03 }
    ];
    
    const mode = modes[Math.floor(p.mode) % modes.length];
    
    // Update FDN sizes
    const sizeMultiplier = (0.3 + p.size * 1.7) * mode.sizeScale;
    this.fdnLines.forEach(line => {
      line.size = Math.floor(line.baseSize * sizeMultiplier);
    });
    
    // Update diffusion gains
    const diffGain = p.diffusion * mode.diffGain;
    this.diffusionA.forEach(apf => apf.gain = diffGain * 0.7);
    this.diffusionAR.forEach(apf => apf.gain = diffGain * 0.68);
    this.diffusionB.forEach(apf => apf.gain = diffGain * 0.6);
    this.diffusionBR.forEach(apf => apf.gain = diffGain * 0.58);
    
    // Update FDN feedback
    const decaySeconds = p.decay;
    const avgDelaySeconds = (this.fdnLines.reduce((sum, line) => sum + line.size, 0) / this.fdnLines.length) / sr;
    const targetRT60 = decaySeconds;
    let feedbackGain = Math.pow(10, -3 * avgDelaySeconds / targetRT60);
    feedbackGain = Math.min(feedbackGain, 0.985);
    this.fdnFeedback = feedbackGain;
    
    // Update damping filters
    const dampCutoff = p.highCutHz;
    const dampCoeff = this.onePoleCoeff(dampCutoff, sr) * mode.dampBase;
    this.fdnLines.forEach(line => {
      line.dampCoeff = dampCoeff * (0.95 + Math.random() * 0.1);
    });
    
    // Update highpass filters
    const hpCutoff = p.lowCutHz;
    const hpCoeff = this.onePoleCoeff(hpCutoff, sr) * mode.hpBase;
    this.fdnLines.forEach(line => {
      line.hpCoeff = hpCoeff;
    });
    
    this.inputHP.coeff = this.onePoleCoeff(hpCutoff, sr) * 0.05;
    
    // Update modulation depths
    const modDepth = p.modDepth * 0.5;
    this.diffusionA.forEach(apf => apf.modDepth = modDepth * 2);
    this.diffusionAR.forEach(apf => apf.modDepth = modDepth * 2);
    this.diffusionB.forEach(apf => apf.modDepth = modDepth * 3);
    this.diffusionBR.forEach(apf => apf.modDepth = modDepth * 3);
    this.fdnLines.forEach(line => line.modDepth = modDepth * 5);
    
    // Update LFO rates
    const baseRate = p.modRate * 0.003;
    this.lfos.forEach((lfo, i) => {
      lfo.rate = baseRate * (0.8 + i * 0.2);
    });
    
    // Update output color filter
    const colorCutoff = 2000 + (p.color - 0.5) * 8000;
    this.outputLP.coeff = this.onePoleCoeff(Math.max(colorCutoff, 200), sr);
  }
  
  // ===== ONE-POLE FILTER COEFFICIENT =====
  onePoleCoeff(cutoffHz, sr) {
    const omega = (2.0 * Math.PI * cutoffHz) / sr;
    return 1.0 - Math.exp(-omega);
  }
  
  // ===== ALLPASS FILTER =====
  processAllpass(apf, input, lfoValue) {
    const modAmount = apf.modDepth * lfoValue;
    const readPos = apf.index - apf.size - modAmount;
    const readIdx = Math.floor(readPos);
    const frac = readPos - readIdx;
    
    const idx1 = (readIdx % apf.size + apf.size) % apf.size;
    const idx2 = ((readIdx + 1) % apf.size + apf.size) % apf.size;
    
    const delayed = apf.buffer[idx1] * (1 - frac) + apf.buffer[idx2] * frac;
    const output = -apf.gain * input + delayed + apf.gain * (input - apf.gain * delayed);
    
    apf.buffer[apf.index] = input + apf.gain * delayed;
    apf.index = (apf.index + 1) % apf.size;
    
    return output;
  }
  
  // ===== ONE-POLE LOWPASS =====
  processOnePoleLP(coeff, state, input) {
    return state + coeff * (input - state);
  }
  
  // ===== ONE-POLE HIGHPASS =====
  processOnePoleHP(coeff, state, input) {
    const output = input - state;
    state = state + coeff * output;
    return { output, state };
  }
  
  // ===== SOFT SATURATION =====
  softClip(x) {
    const threshold = 1.5;
    if (x > threshold) return threshold + (x - threshold) / (1 + Math.pow((x - threshold) / 0.5, 2));
    if (x < -threshold) return -threshold + (x + threshold) / (1 + Math.pow((x + threshold) / 0.5, 2));
    return x;
  }
  
  // ===== VINTAGE NOISE/DITHER =====
  getVintageNoise() {
    this.noiseGen = (this.noiseGen * 1103515245 + 12345) & 0x7fffffff;
    return ((this.noiseGen / 0x7fffffff) - 0.5) * 0.00001;
  }
  
  // ===== MAIN PROCESS =====
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !input[0]) {
      return true;
    }
    
    const inputL = input[0];
    const inputR = input[1] || input[0];
    const outputL = output[0];
    const outputR = output[1] || output[0];
    
    const p = this.params;
    const blockSize = inputL.length;
    const sr = sampleRate;
    
    // Update LFOs
    this.lfos.forEach(lfo => {
      lfo.phase += lfo.rate * blockSize;
      if (lfo.phase > Math.PI * 2) lfo.phase -= Math.PI * 2;
    });
    
    // Process each sample
    for (let i = 0; i < blockSize; i++) {
      let inL = inputL[i];
      let inR = inputR[i];
      
      // Input highpass
      const hpL = this.processOnePoleHP(this.inputHP.coeff, this.inputHP.stateL, inL);
      inL = hpL.output;
      this.inputHP.stateL = hpL.state;
      
      const hpR = this.processOnePoleHP(this.inputHP.coeff, this.inputHP.stateR, inR);
      inR = hpR.output;
      this.inputHP.stateR = hpR.state;
      
      // Pre-delay
      const preDelayTime = Math.floor((p.preDelayMs / 1000) * sr);
      const preDelayIdx = (this.preDelayIndex - preDelayTime + this.maxPreDelay) % this.maxPreDelay;
      const preDelayed = this.preDelayBuffer[preDelayIdx];
      this.preDelayBuffer[this.preDelayIndex] = (inL + inR) * 0.5;
      this.preDelayIndex = (this.preDelayIndex + 1) % this.maxPreDelay;
      
      // Early reflections
      let earlyL = 0;
      let earlyR = 0;
      
      this.earlyDelays.forEach((delay, idx) => {
        const readIdx = (delay.index - delay.size + delay.buffer.length) % delay.buffer.length;
        earlyL += delay.buffer[readIdx] * delay.gain;
        delay.buffer[delay.index] = preDelayed;
        delay.index = (delay.index + 1) % delay.buffer.length;
      });
      
      this.earlyDelaysR.forEach((delay, idx) => {
        const readIdx = (delay.index - delay.size + delay.buffer.length) % delay.buffer.length;
        earlyR += delay.buffer[readIdx] * delay.gain;
        delay.buffer[delay.index] = preDelayed;
        delay.index = (delay.index + 1) % delay.buffer.length;
      });
      
      // Get LFO values
      const lfo0 = Math.sin(this.lfos[0].phase) * this.lfos[0].amp;
      const lfo1 = Math.sin(this.lfos[1].phase) * this.lfos[1].amp;
      const lfo2 = Math.sin(this.lfos[2].phase) * this.lfos[2].amp;
      const lfo3 = Math.sin(this.lfos[3].phase) * this.lfos[3].amp;
      
      // Diffusion Stage A
      let diffL = preDelayed + earlyL * 0.5;
      let diffR = preDelayed + earlyR * 0.5;
      
      this.diffusionA.forEach((apf, idx) => {
        diffL = this.processAllpass(apf, diffL, [lfo0, lfo1, lfo2, lfo3][idx % 4]);
      });
      
      this.diffusionAR.forEach((apf, idx) => {
        diffR = this.processAllpass(apf, diffR, [lfo1, lfo2, lfo3, lfo0][idx % 4]);
      });
      
      // Diffusion Stage B
      this.diffusionB.forEach((apf, idx) => {
        diffL = this.processAllpass(apf, diffL, [lfo2, lfo3, lfo0][idx % 3]);
      });
      
      this.diffusionBR.forEach((apf, idx) => {
        diffR = this.processAllpass(apf, diffR, [lfo3, lfo0, lfo1][idx % 3]);
      });
      
      // FDN input
      const fdnInput = (diffL + diffR) * 0.5;
      
      // FDN processing - Read delayed values
      const fdnOutputs = [];
      this.fdnLines.forEach((line, idx) => {
        const modAmount = line.modDepth * [lfo0, lfo1, lfo2, lfo3, lfo0, lfo1, lfo2, lfo3][idx];
        const readPos = line.index - line.size - modAmount;
        const readIdx = Math.floor(readPos);
        const frac = readPos - readIdx;
        
        const idx1 = (readIdx % line.size + line.size) % line.size;
        const idx2 = ((readIdx + 1) % line.size + line.size) % line.size;
        
        const delayed = line.buffer[idx1] * (1 - frac) + line.buffer[idx2] * frac;
        fdnOutputs[idx] = delayed;
      });
      
      // Apply feedback matrix
      const matrixOut = new Array(8).fill(0);
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          matrixOut[row] += this.fdnMatrix[row][col] * fdnOutputs[col];
        }
      }
      
      // Write back to delay lines
      this.fdnLines.forEach((line, idx) => {
        let feedback = matrixOut[idx] * this.fdnFeedback;
        
        if (idx < 4) {
          feedback += fdnInput * 0.5;
        }
        
        // Damping (lowpass)
        line.dampState = this.processOnePoleLP(line.dampCoeff, line.dampState, feedback);
        feedback = line.dampState;
        
        // Highpass
        const hp = this.processOnePoleHP(line.hpCoeff, line.hpState, feedback);
        feedback = hp.output;
        line.hpState = hp.state;
        
        // Soft saturation + vintage noise
        feedback = this.softClip(feedback * 1.2) * 0.9;
        if (p.vintage > 0) {
          feedback += this.getVintageNoise() * p.vintage;
        }
        
        line.buffer[line.index] = feedback;
        line.index = (line.index + 1) % line.size;
      });
      
      // Output taps (decorrelated stereo)
      let wetL = (fdnOutputs[0] + fdnOutputs[2] + fdnOutputs[4] + fdnOutputs[6]) * 0.25;
      let wetR = (fdnOutputs[1] + fdnOutputs[3] + fdnOutputs[5] + fdnOutputs[7]) * 0.25;
      
      wetL += earlyL * 0.3;
      wetR += earlyR * 0.3;
      
      // Stereo width control
      const mid = (wetL + wetR) * 0.5;
      const side = (wetL - wetR) * 0.5;
      wetL = mid + side * p.stereoWidth;
      wetR = mid - side * p.stereoWidth;
      
      // Output filtering (color)
      this.outputLP.stateL = this.processOnePoleLP(this.outputLP.coeff, this.outputLP.stateL, wetL);
      wetL = this.outputLP.stateL;
      
      this.outputLP.stateR = this.processOnePoleLP(this.outputLP.coeff, this.outputLP.stateR, wetR);
      wetR = this.outputLP.stateR;
      
      // Safety limiting
      const wetPeak = Math.max(Math.abs(wetL), Math.abs(wetR));
      if (wetPeak > this.safetyThreshold) {
        const reduction = this.safetyThreshold / wetPeak;
        wetL *= reduction;
        wetR *= reduction;
      }
      
      // Mix
      outputL[i] = inL * (1 - p.mix) + wetL * p.mix;
      outputR[i] = inR * (1 - p.mix) + wetR * p.mix;
      
      // Final safety clip
      outputL[i] = Math.max(-1, Math.min(1, outputL[i]));
      outputR[i] = Math.max(-1, Math.min(1, outputR[i]));
    }
    
    return true;
  }
  
  static get parameterDescriptors() {
    return [];
  }
}

registerProcessor('quadreverb-processor', QuadraVerbProcessor);
