// ZitaReverb AudioWorklet Processor
// Translated from Faust-generated C++ code

class ZitaReverbProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    
    this.sampleRate = sampleRate;
    
    // Parameters
    this.params = {
      preDel: 20.0,      // ms
      lfFc: 200.0,       // Hz
      lowRt60: 1.0,      // seconds
      midRt60: 1.0,      // seconds
      hfDamp: 6000.0     // Hz
    };
    
    // Initialize constants
    this.initConstants();
    
    // Initialize state
    this.initState();
    
    // Handle parameter messages
    this.port.onmessage = (e) => {
      if (e.data.type === 'setParam') {
        this.params[e.data.param] = e.data.value;
      }
    };
  }
  
  initConstants() {
    const SR = this.sampleRate;
    
    this.fConst0 = Math.min(192000.0, Math.max(1.0, SR));
    this.fConst1 = 6.283185307179586 / this.fConst0;
    this.fConst2 = Math.floor(0.125 * this.fConst0 + 0.5);
    this.fConst3 = (0.0 - (6.907755278982137 * this.fConst2)) / this.fConst0;
    this.fConst4 = 3.141592653589793 / this.fConst0;
    
    // Pre-delay
    this.fConst5 = Math.floor(0.0134579996 * this.fConst0 + 0.5);
    this.iConst6 = Math.min(8192, Math.max(0, this.fConst2 - this.fConst5));
    this.fConst7 = 0.001 * this.fConst0;
    this.iConst8 = Math.min(1024, Math.max(0, this.fConst5 - 1));
    
    // Delay line lengths and constants for 8 comb filters
    this.delayConsts = [
      { // Filter 0
        main: Math.floor(0.219990999 * this.fConst0 + 0.5),
        apf: Math.floor(0.0191229992 * this.fConst0 + 0.5)
      },
      { // Filter 1
        main: Math.floor(0.192303002 * this.fConst0 + 0.5),
        apf: Math.floor(0.0292910002 * this.fConst0 + 0.5)
      },
      { // Filter 2
        main: Math.floor(0.174713001 * this.fConst0 + 0.5),
        apf: Math.floor(0.0229039993 * this.fConst0 + 0.5)
      },
      { // Filter 3
        main: Math.floor(0.256891012 * this.fConst0 + 0.5),
        apf: Math.floor(0.0273330007 * this.fConst0 + 0.5)
      },
      { // Filter 4
        main: Math.floor(0.127837002 * this.fConst0 + 0.5),
        apf: Math.floor(0.0316039994 * this.fConst0 + 0.5)
      },
      { // Filter 5
        main: Math.floor(0.210389003 * this.fConst0 + 0.5),
        apf: Math.floor(0.0244210009 * this.fConst0 + 0.5)
      },
      { // Filter 6
        main: Math.floor(0.153128996 * this.fConst0 + 0.5),
        apf: Math.floor(0.0203460008 * this.fConst0 + 0.5)
      },
      { // Filter 7 (same as filter 0 structure)
        main: this.fConst2,
        apf: this.fConst5
      }
    ];
    
    // Calculate decay constants for each filter
    this.decayConsts = this.delayConsts.map(dc => ({
      main: (0.0 - (6.907755278982137 * dc.main)) / this.fConst0,
      apf: dc.apf
    }));
  }
  
  initState() {
    const maxDelay = 32768;
    
    // Input buffers
    this.inputL = new Float32Array(maxDelay);
    this.inputR = new Float32Array(maxDelay);
    
    // Main delay lines for 8 filters
    this.delays = [];
    for (let i = 0; i < 8; i++) {
      this.delays.push({
        main: new Float32Array(maxDelay),
        apf: new Float32Array(4096)
      });
    }
    
    // Filter states
    this.filterStates = [];
    for (let i = 0; i < 8; i++) {
      this.filterStates.push({
        damping: [0, 0],      // 2-pole damping filter
        lowpass: [0, 0],      // Low-pass filter for RT60
        combOut: [0, 0],      // Comb filter output
        rec: [0, 0, 0]        // Feedback state (3 samples)
      });
    }
    
    // Global filter states
    this.lfFilter = [0, 0];  // Low-frequency crossover filter
    
    this.IOTA = 0;
  }
  
  power2(x) {
    return x * x;
  }
  
  updateCoefficients() {
    const params = this.params;
    
    // High-frequency damping coefficients
    const fSlow0 = Math.cos(this.fConst1 * params.hfDamp);
    
    // Calculate coefficients for each of the 8 filters
    this.coeffs = [];
    
    for (let i = 0; i < 8; i++) {
      const decayConst = this.decayConsts[i].main;
      
      // Mid RT60 coefficients
      const fSlow2 = Math.exp(decayConst / params.midRt60);
      const fSlow3 = this.power2(fSlow2);
      const fSlow4 = 1.0 - (fSlow0 * fSlow3);
      const fSlow5 = 1.0 - fSlow3;
      const fSlow6 = fSlow4 / fSlow5;
      const fSlow7 = Math.sqrt(Math.max(0.0, 
        (this.power2(fSlow4) / this.power2(fSlow5)) - 1.0));
      const fSlow8 = fSlow6 - fSlow7;
      const fSlow9 = fSlow2 * (fSlow7 + (1.0 - fSlow6));
      
      // Low RT60 coefficients
      const fSlow11 = (Math.exp(decayConst / params.lowRt60) / fSlow2) - 1.0;
      
      this.coeffs.push({
        b0: fSlow8,
        a1: fSlow9,
        lowMult: fSlow11
      });
    }
    
    // Low-frequency crossover filter
    const fSlow12 = 1.0 / Math.tan(this.fConst4 * params.lfFc);
    const fSlow13 = fSlow12 + 1.0;
    this.lfCoeff = {
      scale: 1.0 / fSlow13,
      feedback: (1.0 - fSlow12) / fSlow13
    };
    
    // Pre-delay in samples
    this.preDelaySamples = Math.min(8192, Math.max(0, 
      Math.floor(this.fConst7 * params.preDel)));
  }
  
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || !input[0]) {
      return true;
    }
    
    // Update coefficients
    this.updateCoefficients();
    
    const blockSize = input[0].length;
    const inputL = input[0];
    const inputR = input.length > 1 ? input[1] : input[0];
    const outputL = output[0];
    const outputR = output.length > 1 ? output[1] : output[0];
    
    for (let i = 0; i < blockSize; i++) {
      const idx = this.IOTA & 16383;
      
      // Store inputs with pre-delay
      this.inputL[idx] = inputL[i];
      this.inputR[idx] = inputR[i];
      
      // Get delayed inputs
      const delayedL = this.inputL[(this.IOTA - this.preDelaySamples) & 16383];
      const delayedR = this.inputR[(this.IOTA - this.preDelaySamples) & 16383];
      
      const fTemp0 = 0.3 * delayedL;
      const fTemp2 = 0.3 * delayedR;
      
      // Process 8 parallel comb filters with feedback matrix
      const combOuts = new Array(8);
      
      // Filter 0 (using rec6 feedback)
      {
        const f = this.filterStates[0];
        const coeff = this.coeffs[0];
        
        // Low-frequency filter
        f.lowpass[0] = (this.lfCoeff.scale * (f.rec[1] + f.rec[2])) + 
                       (this.lfCoeff.feedback * f.lowpass[1]);
        
        // Damping filter
        f.damping[0] = (coeff.b0 * f.damping[1]) + 
                       (coeff.a1 * (f.rec[1] + (coeff.lowMult * f.lowpass[0])));
        
        // Main delay line
        const delayIdx = (this.IOTA - this.iConst6) & 16383;
        this.delays[0].main[idx] = (0.353553385 * f.damping[0]) + 9.99999968e-21;
        
        // Allpass filter in feedback path
        const apfInput = this.delays[0].main[delayIdx] - 
                         (0.6 * f.combOut[1]) - fTemp0;
        const apfIdx = (this.IOTA - this.iConst8) & 2047;
        this.delays[0].apf[(this.IOTA & 2047)] = apfInput;
        f.combOut[0] = this.delays[0].apf[apfIdx];
        
        combOuts[0] = 0.6 * apfInput;
      }
      
      // Filter 1 (using rec7 feedback)
      {
        const f = this.filterStates[1];
        const coeff = this.coeffs[1];
        
        f.lowpass[0] = (this.lfCoeff.scale * (f.rec[1] + f.rec[2])) + 
                       (this.lfCoeff.feedback * f.lowpass[1]);
        f.damping[0] = (coeff.b0 * f.damping[1]) + 
                       (coeff.a1 * (f.rec[1] + (coeff.lowMult * f.lowpass[0])));
        
        const delayIdx = (this.IOTA - Math.min(16384, Math.max(0, 
          this.delayConsts[1].main - this.delayConsts[1].apf))) & 32767;
        this.delays[1].main[(this.IOTA & 32767)] = 
          (0.353553385 * f.damping[0]) + 9.99999968e-21;
        
        const apfInput = (0.6 * f.combOut[1]) + 
                         this.delays[1].main[delayIdx] - fTemp2;
        const apfIdx = (this.IOTA - Math.min(1024, Math.max(0, 
          this.delayConsts[1].apf - 1))) & 2047;
        this.delays[1].apf[(this.IOTA & 2047)] = apfInput;
        f.combOut[0] = this.delays[1].apf[apfIdx];
        
        combOuts[1] = -0.6 * apfInput;
      }
      
      // Filter 2 (using rec5 feedback)
      {
        const f = this.filterStates[2];
        const coeff = this.coeffs[2];
        
        f.lowpass[0] = (this.lfCoeff.scale * (f.rec[1] + f.rec[2])) + 
                       (this.lfCoeff.feedback * f.lowpass[1]);
        f.damping[0] = (coeff.b0 * f.damping[1]) + 
                       (coeff.a1 * (f.rec[1] + (coeff.lowMult * f.lowpass[0])));
        
        const delayIdx = (this.IOTA - Math.min(8192, Math.max(0, 
          this.delayConsts[2].main - this.delayConsts[2].apf))) & 16383;
        this.delays[2].main[idx] = (0.353553385 * f.damping[0]) + 9.99999968e-21;
        
        const apfInput = (0.6 * f.combOut[1]) + 
                         this.delays[2].main[delayIdx] + fTemp2;
        const apfIdx = (this.IOTA - Math.min(2048, Math.max(0, 
          this.delayConsts[2].apf - 1))) & 4095;
        this.delays[2].apf[(this.IOTA & 4095)] = apfInput;
        f.combOut[0] = this.delays[2].apf[apfIdx];
        
        combOuts[2] = -0.6 * apfInput;
      }
      
      // Filter 3 (using rec4 feedback)
      {
        const f = this.filterStates[3];
        const coeff = this.coeffs[3];
        
        f.lowpass[0] = (this.lfCoeff.scale * (f.rec[1] + f.rec[2])) + 
                       (this.lfCoeff.feedback * f.lowpass[1]);
        f.damping[0] = (coeff.b0 * f.damping[1]) + 
                       (coeff.a1 * (f.rec[1] + (coeff.lowMult * f.lowpass[0])));
        
        const delayIdx = (this.IOTA - Math.min(8192, Math.max(0, 
          this.delayConsts[3].main - this.delayConsts[3].apf))) & 16383;
        this.delays[3].main[idx] = (0.353553385 * f.damping[0]) + 9.99999968e-21;
        
        const apfInput = this.delays[3].main[delayIdx] + fTemp0 - 
                         (0.6 * f.combOut[1]);
        const apfIdx = (this.IOTA - Math.min(2048, Math.max(0, 
          this.delayConsts[3].apf - 1))) & 4095;
        this.delays[3].apf[(this.IOTA & 4095)] = apfInput;
        f.combOut[0] = this.delays[3].apf[apfIdx];
        
        combOuts[3] = 0.6 * apfInput;
      }
      
      // Filter 4 (using rec3 feedback)
      {
        const f = this.filterStates[4];
        const coeff = this.coeffs[4];
        
        f.lowpass[0] = (this.lfCoeff.scale * (f.rec[1] + f.rec[2])) + 
                       (this.lfCoeff.feedback * f.lowpass[1]);
        f.damping[0] = (coeff.b0 * f.damping[1]) + 
                       (coeff.a1 * (f.rec[1] + (coeff.lowMult * f.lowpass[0])));
        
        const delayIdx = (this.IOTA - Math.min(16384, Math.max(0, 
          this.delayConsts[4].main - this.delayConsts[4].apf))) & 32767;
        this.delays[4].main[(this.IOTA & 32767)] = 
          (0.353553385 * f.damping[0]) + 9.99999968e-21;
        
        const apfInput = (0.6 * f.combOut[1]) + 
                         this.delays[4].main[delayIdx] - fTemp2;
        const apfIdx = (this.IOTA - Math.min(2048, Math.max(0, 
          this.delayConsts[4].apf - 1))) & 4095;
        this.delays[4].apf[(this.IOTA & 4095)] = apfInput;
        f.combOut[0] = this.delays[4].apf[apfIdx];
        
        combOuts[4] = -0.6 * apfInput;
      }
      
      // Filter 5 (using rec2 feedback)
      {
        const f = this.filterStates[5];
        const coeff = this.coeffs[5];
        
        f.lowpass[0] = (this.lfCoeff.scale * (f.rec[1] + f.rec[2])) + 
                       (this.lfCoeff.feedback * f.lowpass[1]);
        f.damping[0] = (coeff.b0 * f.damping[1]) + 
                       (coeff.a1 * (f.rec[1] + (coeff.lowMult * f.lowpass[0])));
        
        const delayIdx = (this.IOTA - Math.min(8192, Math.max(0, 
          this.delayConsts[5].main - this.delayConsts[5].apf))) & 16383;
        this.delays[5].main[idx] = (0.353553385 * f.damping[0]) + 9.99999968e-21;
        
        const apfInput = this.delays[5].main[delayIdx] - 
                         (0.6 * f.combOut[1]) - fTemp0;
        const apfIdx = (this.IOTA - Math.min(2048, Math.max(0, 
          this.delayConsts[5].apf - 1))) & 4095;
        this.delays[5].apf[(this.IOTA & 4095)] = apfInput;
        f.combOut[0] = this.delays[5].apf[apfIdx];
        
        combOuts[5] = 0.6 * apfInput;
      }
      
      // Filter 6 (using rec1 feedback)
      {
        const f = this.filterStates[6];
        const coeff = this.coeffs[6];
        
        f.lowpass[0] = (this.lfCoeff.scale * (f.rec[1] + f.rec[2])) + 
                       (this.lfCoeff.feedback * f.lowpass[1]);
        f.damping[0] = (coeff.b0 * f.damping[1]) + 
                       (coeff.a1 * (f.rec[1] + (coeff.lowMult * f.lowpass[0])));
        
        const delayIdx = (this.IOTA - Math.min(16384, Math.max(0, 
          this.delayConsts[6].main - this.delayConsts[6].apf))) & 32767;
        this.delays[6].main[(this.IOTA & 32767)] = 
          (0.353553385 * f.damping[0]) + 9.99999968e-21;
        
        const apfInput = (0.6 * f.combOut[1]) + 
                         this.delays[6].main[delayIdx] + fTemp2;
        const apfIdx = (this.IOTA - Math.min(2048, Math.max(0, 
          this.delayConsts[6].apf - 1))) & 4095;
        this.delays[6].apf[(this.IOTA & 4095)] = apfInput;
        f.combOut[0] = this.delays[6].apf[apfIdx];
        
        combOuts[6] = -0.6 * apfInput;
      }
      
      // Filter 7 (using rec0 feedback)
      {
        const f = this.filterStates[7];
        const coeff = this.coeffs[7];
        
        f.lowpass[0] = (this.lfCoeff.scale * (f.rec[1] + f.rec[2])) + 
                       (this.lfCoeff.feedback * f.lowpass[1]);
        f.damping[0] = (coeff.b0 * f.damping[1]) + 
                       (coeff.a1 * (f.rec[1] + (coeff.lowMult * f.lowpass[0])));
        
        const delayIdx = (this.IOTA - Math.min(8192, Math.max(0, 
          this.delayConsts[7].main - this.delayConsts[7].apf))) & 16383;
        this.delays[7].main[idx] = (0.353553385 * f.damping[0]) + 9.99999968e-21;
        
        const apfInput = this.delays[7].main[delayIdx] + fTemp0 - 
                         (0.6 * f.combOut[1]);
        const apfIdx = (this.IOTA - Math.min(1024, Math.max(0, 
          this.delayConsts[7].apf - 1))) & 2047;
        this.delays[7].apf[(this.IOTA & 2047)] = apfInput;
        f.combOut[0] = this.delays[7].apf[apfIdx];
        
        combOuts[7] = 0.6 * apfInput;
      }
      
      // Sum comb outputs with previous state
      const fTemp10 = this.filterStates[7].combOut[1] + combOuts[7];
      const fTemp11 = combOuts[6] + (this.filterStates[6].combOut[1] + fTemp10);
      const fTemp12 = combOuts[4] + (this.filterStates[4].combOut[1] + 
                      (combOuts[5] + (this.filterStates[5].combOut[1] + fTemp11)));
      
      // Calculate feedback matrix (8x8 Hadamard-like transformation)
      const fRec0 = combOuts[0] + (combOuts[1] + 
                    (this.filterStates[1].combOut[1] + 
                    (this.filterStates[0].combOut[1] + 
                    (combOuts[2] + (this.filterStates[2].combOut[1] + 
                    (combOuts[3] + (this.filterStates[3].combOut[1] + fTemp12)))))));
      
      const fTemp13 = combOuts[5] + (this.filterStates[5].combOut[1] + fTemp10);
      const fTemp14 = this.filterStates[6].combOut[1] + combOuts[6];
      const fTemp15 = combOuts[4] + (this.filterStates[4].combOut[1] + fTemp14);
      
      const fRec1 = (combOuts[0] + (this.filterStates[0].combOut[1] + 
                    (combOuts[3] + (this.filterStates[3].combOut[1] + fTemp13)))) - 
                    (combOuts[1] + (this.filterStates[1].combOut[1] + 
                    (combOuts[2] + (this.filterStates[2].combOut[1] + fTemp15))));
      
      const fTemp16 = combOuts[4] + (this.filterStates[4].combOut[1] + 
                      (this.filterStates[5].combOut[1] + combOuts[5]));
      
      const fRec2 = (combOuts[2] + (this.filterStates[2].combOut[1] + 
                    (combOuts[3] + (this.filterStates[3].combOut[1] + fTemp11)))) - 
                    (combOuts[0] + (combOuts[1] + 
                    (this.filterStates[1].combOut[1] + 
                    (this.filterStates[0].combOut[1] + fTemp16))));
      
      const fTemp17 = combOuts[4] + (this.filterStates[4].combOut[1] + fTemp10);
      const fTemp18 = combOuts[5] + (this.filterStates[5].combOut[1] + fTemp14);
      
      const fRec3 = (combOuts[1] + (this.filterStates[1].combOut[1] + 
                    (combOuts[3] + (this.filterStates[3].combOut[1] + fTemp17)))) - 
                    (combOuts[0] + (this.filterStates[0].combOut[1] + 
                    (combOuts[2] + (this.filterStates[2].combOut[1] + fTemp18))));
      
      const fRec4 = fTemp12 - (combOuts[0] + (combOuts[1] + 
                    (this.filterStates[1].combOut[1] + 
                    (this.filterStates[0].combOut[1] + 
                    (combOuts[2] + (this.filterStates[2].combOut[1] + 
                    (this.filterStates[3].combOut[1] + combOuts[3])))))));
      
      const fRec5 = (combOuts[1] + (this.filterStates[1].combOut[1] + 
                    (combOuts[2] + (this.filterStates[2].combOut[1] + fTemp13)))) - 
                    (combOuts[0] + (this.filterStates[0].combOut[1] + 
                    (combOuts[3] + (this.filterStates[3].combOut[1] + fTemp15))));
      
      const fRec6 = (combOuts[0] + (combOuts[1] + 
                    (this.filterStates[1].combOut[1] + 
                    (this.filterStates[0].combOut[1] + fTemp11)))) - 
                    (combOuts[2] + (this.filterStates[2].combOut[1] + 
                    (combOuts[3] + (this.filterStates[3].combOut[1] + fTemp16))));
      
      const fRec7 = (combOuts[0] + (this.filterStates[0].combOut[1] + 
                    (combOuts[2] + (this.filterStates[2].combOut[1] + fTemp17)))) - 
                    (combOuts[1] + (this.filterStates[1].combOut[1] + 
                    (combOuts[3] + (this.filterStates[3].combOut[1] + fTemp18))));
      
      // Output stereo signal
      outputL[i] = 0.37 * (fRec1 + fRec2);
      outputR[i] = 0.37 * (fRec1 - fRec2);
      
      // Update filter states
      for (let j = 0; j < 8; j++) {
        const f = this.filterStates[j];
        f.lowpass[1] = f.lowpass[0];
        f.damping[1] = f.damping[0];
        f.combOut[1] = f.combOut[0];
      }
      
      // Store feedback values for next iteration
      this.filterStates[0].rec[2] = this.filterStates[0].rec[1];
      this.filterStates[0].rec[1] = this.filterStates[0].rec[0];
      this.filterStates[0].rec[0] = fRec0;
      
      this.filterStates[1].rec[2] = this.filterStates[1].rec[1];
      this.filterStates[1].rec[1] = this.filterStates[1].rec[0];
      this.filterStates[1].rec[0] = fRec1;
      
      this.filterStates[2].rec[2] = this.filterStates[2].rec[1];
      this.filterStates[2].rec[1] = this.filterStates[2].rec[0];
      this.filterStates[2].rec[0] = fRec2;
      
      this.filterStates[3].rec[2] = this.filterStates[3].rec[1];
      this.filterStates[3].rec[1] = this.filterStates[3].rec[0];
      this.filterStates[3].rec[0] = fRec3;
      
      this.filterStates[4].rec[2] = this.filterStates[4].rec[1];
      this.filterStates[4].rec[1] = this.filterStates[4].rec[0];
      this.filterStates[4].rec[0] = fRec4;
      
      this.filterStates[5].rec[2] = this.filterStates[5].rec[1];
      this.filterStates[5].rec[1] = this.filterStates[5].rec[0];
      this.filterStates[5].rec[0] = fRec5;
      
      this.filterStates[6].rec[2] = this.filterStates[6].rec[1];
      this.filterStates[6].rec[1] = this.filterStates[6].rec[0];
      this.filterStates[6].rec[0] = fRec6;
      
      this.filterStates[7].rec[2] = this.filterStates[7].rec[1];
      this.filterStates[7].rec[1] = this.filterStates[7].rec[0];
      this.filterStates[7].rec[0] = fRec7;
      
      this.IOTA++;
    }
    
    return true;
  }
}

registerProcessor('zita-reverb-processor', ZitaReverbProcessor);
