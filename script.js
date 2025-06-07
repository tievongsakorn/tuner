class GuitarTuner {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.mediaStream = null;
        this.isRunning = false;
        this.animationFrameId = null;
        this.gainNode = null;
        
        // DOM elements
        this.startButton = document.getElementById('start-button');
        this.noteDisplay = document.getElementById('current-note');
        this.centsDisplay = document.getElementById('cents');
        this.frequencyDisplay = document.getElementById('frequency');
        this.needle = document.querySelector('.tuner-needle');
        
        // Note frequencies for standard tuning
        this.notes = [
            { note: 'E2', frequency: 82.41 },
            { note: 'A2', frequency: 110.00 },
            { note: 'D3', frequency: 146.83 },
            { note: 'G3', frequency: 196.00 },
            { note: 'B3', frequency: 246.94 },
            { note: 'E4', frequency: 329.63 }
        ];
        
        this.bindEvents();
        console.log('GuitarTuner initialized');
    }

    bindEvents() {
        this.startButton.addEventListener('click', () => this.toggleTuner());
    }

    async toggleTuner() {
        if (!this.isRunning) {
            try {
                console.log('Starting tuner...');
                await this.startTuner();
                this.startButton.textContent = 'Stop Tuner';
                this.isRunning = true;
                console.log('Tuner started successfully');
                this.startPitchDetection();
            } catch (error) {
                console.error('Error starting tuner:', error);
                alert('Error starting tuner: ' + error.message);
            }
        } else {
            console.log('Stopping tuner...');
            this.stopTuner();
            this.startButton.textContent = 'Start Tuner';
            this.isRunning = false;
            console.log('Tuner stopped');
        }
    }

    async startTuner() {
        try {
            console.log('Creating AudioContext...');
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('AudioContext created successfully');
            
            console.log('Creating analyser...');
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;
            console.log('Analyser created successfully');
            
            // Create gain node for boosting input
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 5.0; // Boost the input signal by 5x
            
            console.log('Requesting microphone access...');
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: true // Enable auto gain control
                }
            });
            console.log('Microphone access granted');
            
            console.log('Creating media stream source...');
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            // Connect source -> gain -> analyser
            source.connect(this.gainNode);
            this.gainNode.connect(this.analyser);
            console.log('Media stream source connected');
        } catch (error) {
            console.error('Error in startTuner:', error);
            throw error;
        }
    }

    startPitchDetection() {
        console.log('Starting pitch detection loop...');
        const detectPitchLoop = () => {
            if (!this.isRunning) {
                console.log('Pitch detection stopped');
                return;
            }

            try {
                const bufferLength = this.analyser.frequencyBinCount;
                const dataArray = new Float32Array(bufferLength);
                this.analyser.getFloatTimeDomainData(dataArray);

                // Calculate RMS to check if there's any signal
                let rms = 0;
                for (let i = 0; i < bufferLength; i++) {
                    rms += dataArray[i] * dataArray[i];
                }
                rms = Math.sqrt(rms / bufferLength);
                
                // Lower threshold for more sensitivity
                if (rms > 0.005) { // Reduced from 0.01 to 0.005
                    console.log('Signal detected, RMS:', rms);
                    const correlation = this.autoCorrelate(dataArray, this.audioContext.sampleRate);
                    if (correlation !== -1) {
                        const frequency = correlation;
                        this.updateDisplay(frequency);
                    }
                } else {
                    console.log('No signal detected, RMS:', rms);
                }
            } catch (error) {
                console.error('Error in pitch detection:', error);
            }

            this.animationFrameId = requestAnimationFrame(detectPitchLoop);
        };

        detectPitchLoop();
    }

    stopTuner() {
        try {
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            if (this.mediaStream) {
                console.log('Stopping media tracks...');
                this.mediaStream.getTracks().forEach(track => track.stop());
            }
            if (this.audioContext) {
                console.log('Closing audio context...');
                this.audioContext.close();
            }
            this.noteDisplay.textContent = '--';
            this.centsDisplay.textContent = '0';
            this.frequencyDisplay.textContent = '0';
            this.needle.style.transform = 'rotate(0deg)';
            console.log('Tuner stopped successfully');
        } catch (error) {
            console.error('Error stopping tuner:', error);
        }
    }

    autoCorrelate(buffer, sampleRate) {
        const SIZE = buffer.length;
        let bestOffset = -1;
        let bestCorrelation = 0;
        let rms = 0;
        let foundGoodCorrelation = false;

        // Find RMS of signal
        for (let i = 0; i < SIZE; i++) {
            const val = buffer[i];
            rms += val * val;
        }
        rms = Math.sqrt(rms / SIZE);

        // Lower threshold for more sensitivity
        if (rms < 0.005) { // Reduced from 0.01 to 0.005
            console.log('Signal too quiet, RMS:', rms);
            return -1;
        }

        let lastCorrelation = 1;
        for (let offset = 0; offset < SIZE; offset++) {
            let correlation = 0;

            for (let i = 0; i < SIZE - offset; i++) {
                correlation += buffer[i] * buffer[i + offset];
            }

            correlation = correlation / (SIZE - offset);

            // Lower correlation threshold for more sensitivity
            if (correlation > 0.8 && correlation > lastCorrelation) { // Reduced from 0.9 to 0.8
                foundGoodCorrelation = true;
                if (correlation > bestCorrelation) {
                    bestCorrelation = correlation;
                    bestOffset = offset;
                }
            } else if (foundGoodCorrelation) {
                const shift = bestOffset;
                return sampleRate / shift;
            }
            lastCorrelation = correlation;
        }

        return -1;
    }

    updateDisplay(frequency) {
        this.frequencyDisplay.textContent = frequency.toFixed(1);
        
        // Find closest note
        let minDiff = Infinity;
        let closestNote = null;
        let cents = 0;

        for (const note of this.notes) {
            const diff = Math.abs(frequency - note.frequency);
            if (diff < minDiff) {
                minDiff = diff;
                closestNote = note;
                cents = this.calculateCents(frequency, note.frequency);
            }
        }

        if (closestNote) {
            this.noteDisplay.textContent = closestNote.note;
            this.centsDisplay.textContent = `${cents > 0 ? '+' : ''}${cents.toFixed(0)}`;
            
            // Update needle position (-50 to +50 degrees)
            const needleRotation = Math.max(-50, Math.min(50, cents * 2));
            this.needle.style.transform = `rotate(${needleRotation}deg)`;
        }
    }

    calculateCents(frequency, referenceFrequency) {
        return Math.round(1200 * Math.log2(frequency / referenceFrequency));
    }
}

// Initialize the tuner when the page loads
window.addEventListener('load', () => {
    console.log('Page loaded, initializing tuner...');
    const tuner = new GuitarTuner();
}); 