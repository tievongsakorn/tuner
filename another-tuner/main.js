class GuitarTuner {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.dataArray = null;
    this.isListening = false;
    this.animationId = null;
    this.selectedString = null;
    this.lastDetectedString = null;
    this.detectionHistory = [];
    this.maxHistoryLength = 10;

    // Guitar string frequencies (standard tuning)
    this.strings = [
      { note: 'E', frequency: 82.41, number: 6 },   // Low E
      { note: 'A', frequency: 110.00, number: 5 },  // A
      { note: 'D', frequency: 146.83, number: 4 },  // D
      { note: 'G', frequency: 196.00, number: 3 },  // G
      { note: 'B', frequency: 246.94, number: 2 },  // B
      { note: 'E', frequency: 329.63, number: 1 }   // High E
    ];

    this.initializeElements();
    this.setupEventListeners();
  }

  initializeElements() {
    this.startBtn = document.getElementById('startBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.status = document.getElementById('status');
    this.currentNote = document.getElementById('currentNote');
    this.currentFreq = document.getElementById('currentFreq');
    this.meterFill = document.getElementById('meterFill');
    this.meterNeedle = document.getElementById('meterNeedle');
    this.stringItems = document.querySelectorAll('.string-item');
  }

  setupEventListeners() {
    this.startBtn.addEventListener('click', () => this.startTuning());
    this.stopBtn.addEventListener('click', () => this.stopTuning());

    // String selection (optional - auto-detection is primary)
    this.stringItems.forEach((item, index) => {
      item.addEventListener('click', () => this.selectString(index));
    });
  }

  selectString(index) {
    // Remove active class from all strings
    this.stringItems.forEach(item => item.classList.remove('active'));
    
    // Add active class to selected string
    this.stringItems[index].classList.add('active');
    this.selectedString = index;

    if (this.isListening) {
      this.updateStatus(`Manually selected ${this.strings[index].note} string (${this.strings[index].frequency.toFixed(1)} Hz)`);
    }
  }

  async startTuning() {
    try {
      this.updateStatus('Requesting microphone access...');
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false
        }
      });

      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.microphone = this.audioContext.createMediaStreamSource(stream);

      // Configure analyser
      this.analyser.fftSize = 8192;
      this.analyser.smoothingTimeConstant = 0.3;
      this.microphone.connect(this.analyser);

      // Setup data array
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      this.isListening = true;
      this.startBtn.disabled = true;
      this.stopBtn.disabled = false;

      this.updateStatus('🎸 Play a string to start tuning...');
      this.startAnalysis();

    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.updateStatus('Microphone access denied. Please allow microphone access and try again.', 'error');
    }
  }

  stopTuning() {
    this.isListening = false;
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    if (this.microphone) {
      this.microphone.disconnect();
    }

    if (this.audioContext) {
      this.audioContext.close();
    }

    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;

    this.resetDisplay();
    this.updateStatus('Tap "Start Tuning" to begin');
    this.detectionHistory = [];
    this.lastDetectedString = null;
  }

  startAnalysis() {
    if (!this.isListening) return;

    this.analyser.getByteFrequencyData(this.dataArray);
    
    const frequency = this.detectPitch();
    
    if (frequency > 0) {
      this.updateDisplay(frequency);
    } else {
      // No strong signal detected
      this.updateStatus('🎸 Play a string to start tuning...');
      this.resetStringHighlights();
    }

    this.animationId = requestAnimationFrame(() => this.startAnalysis());
  }

  detectPitch() {
    const bufferLength = this.analyser.frequencyBinCount;
    const sampleRate = this.audioContext.sampleRate;
    const dataArray = new Float32Array(bufferLength);
    
    this.analyser.getFloatFrequencyData(dataArray);

    // Find the frequency with the highest magnitude
    let maxMagnitude = -Infinity;
    let maxIndex = 0;

    for (let i = 0; i < bufferLength; i++) {
      if (dataArray[i] > maxMagnitude) {
        maxMagnitude = dataArray[i];
        maxIndex = i;
      }
    }

    // Convert bin index to frequency
    const frequency = maxIndex * sampleRate / (bufferLength * 2);

    // Only return frequencies in guitar range (70-400 Hz) and above threshold
    if (frequency >= 70 && frequency <= 400 && maxMagnitude > -50) {
      return frequency;
    }

    return 0;
  }

  updateDisplay(frequency) {
    this.currentFreq.textContent = `${frequency.toFixed(1)} Hz`;

    // Find closest note and auto-detect string
    const { note, cents, stringIndex, confidence } = this.findClosestNote(frequency);
    this.currentNote.textContent = note;

    // Auto-detect string with confidence tracking
    this.updateStringDetection(stringIndex, confidence);

    // Update meter
    this.updateMeter(cents);

    // Update string indicators
    this.updateStringIndicators(stringIndex, cents);

    // Generate tuning instructions
    this.generateTuningInstructions(stringIndex, cents, frequency);
  }

  findClosestNote(frequency) {
    let closestDiff = Infinity;
    let closestNote = '';
    let closestStringIndex = -1;

    this.strings.forEach((string, index) => {
      const diff = Math.abs(frequency - string.frequency);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestNote = string.note;
        closestStringIndex = index;
      }
    });

    // Calculate cents (1200 cents = 1 octave)
    const targetFreq = this.strings[closestStringIndex].frequency;
    const cents = 1200 * Math.log2(frequency / targetFreq);

    // Calculate confidence based on how close the frequency is to the target
    const maxDiff = 30; // Hz
    const confidence = Math.max(0, 1 - (Math.abs(frequency - targetFreq) / maxDiff));

    return { note: closestNote, cents, stringIndex: closestStringIndex, confidence };
  }

  updateStringDetection(stringIndex, confidence) {
    // Only consider high-confidence detections
    if (confidence > 0.7) {
      this.detectionHistory.push(stringIndex);
      
      // Keep history manageable
      if (this.detectionHistory.length > this.maxHistoryLength) {
        this.detectionHistory.shift();
      }

      // Determine most frequently detected string
      const stringCounts = {};
      this.detectionHistory.forEach(index => {
        stringCounts[index] = (stringCounts[index] || 0) + 1;
      });

      const mostFrequent = Object.keys(stringCounts).reduce((a, b) => 
        stringCounts[a] > stringCounts[b] ? a : b
      );

      // Update detected string if we have enough confidence
      if (stringCounts[mostFrequent] >= 3 && this.lastDetectedString !== parseInt(mostFrequent)) {
        this.lastDetectedString = parseInt(mostFrequent);
        this.highlightDetectedString(this.lastDetectedString);
      }
    }
  }

  highlightDetectedString(stringIndex) {
    // Remove previous highlights
    this.stringItems.forEach(item => item.classList.remove('detected'));
    
    // Highlight detected string
    if (stringIndex >= 0) {
      this.stringItems[stringIndex].classList.add('detected');
    }
  }

  resetStringHighlights() {
    this.stringItems.forEach(item => {
      item.classList.remove('detected', 'listening', 'in-tune');
    });
  }

  generateTuningInstructions(stringIndex, cents, frequency) {
    const string = this.strings[stringIndex];
    const targetFreq = string.frequency;
    const stringName = `${string.note}${string.number}`;

    if (Math.abs(cents) < 3) {
      this.updateStatus(`🎯 Perfect! ${stringName} string is in tune!`, 'success');
    } else if (Math.abs(cents) < 10) {
      const direction = cents > 0 ? 'down slightly' : 'up slightly';
      const arrow = cents > 0 ? '🔽' : '🔼';
      this.updateStatus(`${arrow} ${stringName} string - Tune ${direction} (${Math.abs(cents).toFixed(1)} cents off)`, 'warning');
    } else if (Math.abs(cents) < 30) {
      const direction = cents > 0 ? 'down' : 'up';
      const arrow = cents > 0 ? '🔽' : '🔼';
      this.updateStatus(`${arrow} ${stringName} string - Tune ${direction} (${Math.abs(cents).toFixed(0)} cents ${cents > 0 ? 'sharp' : 'flat'})`, 'warning');
    } else {
      const direction = cents > 0 ? 'down significantly' : 'up significantly';
      const arrow = cents > 0 ? '🔽🔽' : '🔼🔼';
      this.updateStatus(`${arrow} ${stringName} string - Tune ${direction} (very ${cents > 0 ? 'sharp' : 'flat'})`, 'error');
    }
  }

  updateMeter(cents) {
    const needle = this.meterNeedle;
    const fill = this.meterFill;

    needle.classList.add('active');

    // Clamp cents to reasonable range for display
    const clampedCents = Math.max(-50, Math.min(50, cents));
    
    // Convert cents to percentage (0-100%)
    const percentage = ((clampedCents + 50) / 100) * 100;
    
    // Update needle position
    needle.style.transform = `translateX(-50%) translateX(${(percentage - 50) * 2}px)`;
    
    // Update fill width and color
    fill.style.width = `${percentage}%`;
    
    if (Math.abs(cents) < 3) {
      fill.style.background = 'var(--accent-color)';
    } else if (Math.abs(cents) < 15) {
      fill.style.background = 'var(--warning-color)';
    } else {
      fill.style.background = 'var(--error-color)';
    }
  }

  updateStringIndicators(stringIndex, cents) {
    // Reset all indicators
    this.stringItems.forEach((item, index) => {
      const indicator = document.getElementById(`indicator-${index}`);
      item.classList.remove('in-tune', 'listening');
      indicator.classList.remove('in-tune', 'close');
    });

    if (stringIndex >= 0) {
      const item = this.stringItems[stringIndex];
      const indicator = document.getElementById(`indicator-${stringIndex}`);
      
      item.classList.add('listening');

      if (Math.abs(cents) < 3) {
        item.classList.add('in-tune');
        indicator.classList.add('in-tune');
      } else if (Math.abs(cents) < 15) {
        indicator.classList.add('close');
      }
    }
  }

  resetDisplay() {
    this.currentNote.textContent = '--';
    this.currentFreq.textContent = '-- Hz';
    this.meterNeedle.classList.remove('active');
    this.meterFill.style.width = '0%';
    
    this.stringItems.forEach((item, index) => {
      const indicator = document.getElementById(`indicator-${index}`);
      item.classList.remove('active', 'in-tune', 'listening', 'detected');
      indicator.classList.remove('in-tune', 'close');
    });
  }

  updateStatus(message, type = '') {
    this.status.textContent = message;
    this.status.className = `status ${type}`;
  }
}

// Initialize the tuner when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new GuitarTuner();
});