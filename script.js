class WebDAW {
    constructor() {
        // Audio properties
        this.audioContext = null;
        this.tracks = new Map();
        this.masterGainNode = null;
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.currentTime = 0;
        this.duration = 0;
        this.soloedTracks = new Set();
        this.isLooping = false;

        // OSMD properties
        this.osmdInstances = new Map();

        // Pre-loader properties
        this.filesLoaded = 0;
        this.totalFilesToLoad = 0;

        this.trackConfigs = [
            { name: 'Violino 1', file: 'audio/Violino 1.mp3', score: 'scores/Violino 1.xml' },
            { name: 'Violino 2', file: 'audio/Violino 2.mp3', score: 'scores/Violino 2.xml' },
            { name: 'Violino 3', file: 'audio/Violino 3.mp3', score: 'scores/Violino 3.xml' },
            { name: 'Clarinete', file: 'audio/Clarinete.mp3', score: 'scores/Clarinete.xml' },
            { name: 'Cello', file: 'audio/Cello.mp3', score: 'scores/Cello.xml' },
            { name: 'Piano', file: 'audio/Piano.mp3', score: 'scores/Piano.xml' },
            { name: 'Guitarra', file: 'audio/Guitarra.mp3', score: 'scores/Guitarra.xml' },
            { name: 'Baixo', file: 'audio/Baixo.mp3', score: 'scores/Baixo.xml' },
            { name: 'Bateria', file: 'audio/Bateria.mp3', score: 'scores/Bateria.xml' }
        ];
        
        this.totalFilesToLoad = this.trackConfigs.length * 2;
        this.init();
    }
    
    async init() {
        await this.initializeAudioContext();
        this.createTrackElements();
        this.setupEventListeners();
        
        const loadPromises = this.trackConfigs.map((config, index) => {
            const trackNumber = index + 1;
            return Promise.all([
                this.loadAudioFile(trackNumber),
                this.loadAndRenderScore(trackNumber)
            ]);
        });

        await Promise.all(loadPromises);
        this.calculateDuration();
    }

    updateLoaderProgress() {
        this.filesLoaded++;
        const percentage = (this.filesLoaded / this.totalFilesToLoad) * 100;
        const loaderBar = document.getElementById('loader-bar');
        if (loaderBar) loaderBar.style.width = `${percentage}%`;

        if (this.filesLoaded >= this.totalFilesToLoad) {
            setTimeout(() => {
                document.getElementById('preloader')?.classList.add('hidden');
            }, 500);
        }
    }

    async loadAndRenderScore(trackNumber) {
        const track = this.tracks.get(trackNumber);
        const scoreContainer = document.getElementById(`score-container-${trackNumber}`);
        
        const loadingMessage = scoreContainer.querySelector('.loading-score');
        if (loadingMessage) loadingMessage.remove();

        const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(scoreContainer, {
            autoResize: false,
            backend: "svg",
            drawingParameters: "horizontal",
            drawTitle: false, drawSubtitle: false, drawComposer: false, drawLyricist: false,
            drawMetronome: false, drawPartNames: false, drawMeasureNumbers: false,
            defaultColorMusic: "#FFFFFF",
            followCursor: true,
        });
        
        try {
            // **CORREÇÃO DEFINITIVA: Forçar o carregamento como texto**
            const response = await fetch(track.score);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const scoreText = await response.text(); // Lê o arquivo como texto, ignorando o cabeçalho do servidor
            await osmd.load(scoreText); // Carrega o texto no OSMD

            osmd.render();
            osmd.cursor.show();
            
            const noteTimes = [];
            const iterator = osmd.cursor.Iterator;
            while (!iterator.EndReached) {
                const timestamp = iterator.CurrentVoiceEntries[0]?.Timestamp;
                if (timestamp) {
                    noteTimes.push(timestamp.RealValue);
                }
                iterator.next();
            }
            track.noteTimes = noteTimes;
            track.nextNoteIndex = 0;
            
            this.osmdInstances.set(trackNumber, osmd);

        } catch (error) {
            scoreContainer.innerHTML = `<div class="loading-score" style="color: #ff8a80;">Erro!</div>`;
            console.error(`Error loading score for track ${trackNumber}:`, error);
        } finally {
            this.updateLoaderProgress();
        }
    }

    async initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.connect(this.audioContext.destination);
        } catch (e) { console.error("Audio Context error:", e); }
    }

    createTrackElements() {
        const tracksContainer = document.querySelector('.track-list');
        this.trackConfigs.forEach((config, index) => {
            const trackNumber = index + 1;
            const trackData = { 
                ...config, 
                audioBuffer: null, source: null, gainNode: null, panNode: null, 
                isMuted: false, isSolo: false, volume: 0.7 
            };

            trackData.gainNode = this.audioContext.createGain();
            trackData.panNode = this.audioContext.createStereoPanner();
            trackData.gainNode.connect(trackData.panNode).connect(this.masterGainNode);

            this.tracks.set(trackNumber, trackData);
            
            const trackItem = document.createElement('div');
            trackItem.className = 'track-item';
            trackItem.innerHTML = `
                <div class="track-header">
                    <div class="track-info"><h3>${config.name}</h3></div>
                    <div class="track-controls">
                        <button class="mute-btn" title="Mute">M</button>
                        <button class="solo-btn" title="Solo">S</button>
                    </div>
                </div>
                <div class="track-sliders">
                    <div class="slider-group"><label>Vol</label><input type="range" class="volume-slider" min="0" max="100" value="70"><span class="volume-value">70%</span></div>
                    <div class="slider-group"><label>Pan</label><input type="range" class="pan-slider" min="-100" max="100" value="0"><span class="pan-value">C</span></div>
                </div>
                <div class="score-container" id="score-container-${trackNumber}">
                    <div class="loading-score">Carregando...</div>
                </div>`;
            tracksContainer.appendChild(trackItem);
            this.tracks.get(trackNumber).element = trackItem;
        });
    }

    async loadAudioFile(trackNumber) {
        const track = this.tracks.get(trackNumber);
        try {
            const response = await fetch(track.file);
            const arrayBuffer = await response.arrayBuffer();
            track.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.error(`Error loading audio for track ${trackNumber}:`, error);
        } finally {
            this.updateLoaderProgress();
        }
    }

    calculateDuration() {
        let maxDuration = 0;
        for (const track of this.tracks.values()) {
            if (track.audioBuffer) maxDuration = Math.max(maxDuration, track.audioBuffer.duration);
        }
        this.duration = maxDuration;
        document.getElementById('totalTime').textContent = this.formatTime(this.duration);
    }

    setupEventListeners() {
        document.getElementById('playBtn').addEventListener('click', () => this.togglePlayback());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('progressBar').addEventListener('click', (e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            this.seekTo(((e.clientX - rect.left) / rect.width) * this.duration);
        });
        
        this.tracks.forEach((track, trackNumber) => {
            const element = track.element;
            element.querySelector('.mute-btn').addEventListener('click', () => this.toggleMute(trackNumber));
            element.querySelector('.solo-btn').addEventListener('click', () => this.toggleSolo(trackNumber));
            element.querySelector('.volume-slider').addEventListener('input', (e) => {
                this.setTrackVolume(trackNumber, e.target.value / 100);
                element.querySelector('.volume-value').textContent = `${e.target.value}%`;
            });
            element.querySelector('.pan-slider').addEventListener('input', (e) => {
                const panValue = e.target.value / 100;
                this.setTrackPan(trackNumber, panValue);
                const value = parseInt(e.target.value, 10);
                element.querySelector('.pan-value').textContent = value === 0 ? 'C' : (value > 0 ? `R${value}` : `L${Math.abs(value)}`);
            });
        });
    }

    togglePlayback() { this.isPlaying ? this.pause() : this.play(); }

    play() {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();
        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime - this.pauseTime;
        
        this.tracks.forEach(track => {
            if (track.audioBuffer) this.startTrack(track);
        });

        document.getElementById('playBtn').textContent = '⏸';
        requestAnimationFrame(() => this.updateProgress());
    }

    pause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.pauseTime = this.audioContext.currentTime - this.startTime;
        this.tracks.forEach(track => {
            if (track.source) {
                track.source.stop();
                track.source = null;
            }
        });
        document.getElementById('playBtn').textContent = '▶';
    }

    startTrack(track) {
        if (track.source) track.source.stop();
        track.source = this.audioContext.createBufferSource();
        track.source.buffer = track.audioBuffer;
        track.source.connect(track.gainNode);
        track.source.start(0, this.pauseTime);
    }

    seekTo(time) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) this.pause();
        this.pauseTime = Math.max(0, Math.min(time, this.duration));
        this.currentTime = this.pauseTime;
        
        this.osmdInstances.forEach((osmd, trackNumber) => {
            const track = this.tracks.get(trackNumber);
            if (!track || !track.noteTimes) return;

            let nextNoteIndex = track.noteTimes.findIndex(noteTime => noteTime >= this.currentTime);
            if (nextNoteIndex === -1) nextNoteIndex = track.noteTimes.length;
            
            track.nextNoteIndex = nextNoteIndex;
            osmd.cursor.reset();
            for (let i = 0; i < nextNoteIndex; i++) {
                osmd.cursor.next();
            }
        });

        this.updateUI(true);
        if (wasPlaying) this.play();
    }

    updateProgress() {
        if (!this.isPlaying) return;
        this.currentTime = this.pauseTime + (this.audioContext.currentTime - this.startTime);
        
        if (this.currentTime >= this.duration) {
            if (this.isLooping) { this.seekTo(0); this.play(); }
            else { this.pause(); this.seekTo(0); }
            return;
        }
        
        this.osmdInstances.forEach((osmd, trackNumber) => {
            const track = this.tracks.get(trackNumber);
            if (!track || !track.noteTimes) return;

            while (track.nextNoteIndex < track.noteTimes.length && this.currentTime >= track.noteTimes[track.nextNoteIndex]) {
                osmd.cursor.next();
                track.nextNoteIndex++;
            }
        });

        this.updateUI();
        requestAnimationFrame(() => this.updateProgress());
    }

    updateUI(forceScroll = false) {
        document.getElementById("progressFill").style.width = `${(this.currentTime / this.duration) * 100}%`;
        document.getElementById("currentTime").textContent = this.formatTime(this.currentTime);

        this.osmdInstances.forEach((osmd, trackNumber) => {
            if (osmd && osmd.cursor && osmd.cursor.cursorElement) {
                const scoreContainer = document.getElementById(`score-container-${trackNumber}`);
                const cursorElement = osmd.cursor.cursorElement;
                
                if (scoreContainer && cursorElement) {
                    const containerWidth = scoreContainer.clientWidth;
                    const cursorLeft = cursorElement.offsetLeft;
                    const scrollTarget = containerWidth * 0.4;
                    const newScrollLeft = cursorLeft - scrollTarget;

                    if (forceScroll) {
                        scoreContainer.scrollLeft = newScrollLeft;
                    } else if (newScrollLeft > scoreContainer.scrollLeft) {
                        scoreContainer.scrollLeft = newScrollLeft;
                    }
                }
            }
        });
    }

    reset() {
        this.tracks.forEach((track, trackNumber) => {
            this.setTrackVolume(trackNumber, 0.7, true);
            this.setTrackPan(trackNumber, 0, true);
            if (track.isMuted) this.toggleMute(trackNumber);
            if (track.isSolo) this.toggleSolo(trackNumber);
        });
        this.seekTo(0);
    }

    setTrackVolume(trackNumber, volume, isReset = false) {
        const track = this.tracks.get(trackNumber);
        track.volume = volume;
        this.updateTrackGains();
        if (isReset) {
            track.element.querySelector('.volume-slider').value = volume * 100;
            track.element.querySelector('.volume-value').textContent = `${Math.round(volume * 100)}%`;
        }
    }

    setTrackPan(trackNumber, pan, isReset = false) {
        const track = this.tracks.get(trackNumber);
        if (track.panNode) track.panNode.pan.value = pan;
        if (isReset) {
            track.element.querySelector('.pan-slider').value = 0;
            track.element.querySelector('.pan-value').textContent = 'C';
        }
    }

    toggleMute(trackNumber) {
        const track = this.tracks.get(trackNumber);
        track.isMuted = !track.isMuted;
        this.updateTrackGains();
        track.element.querySelector('.mute-btn').classList.toggle('active', track.isMuted);
    }

    toggleSolo(trackNumber) {
        const track = this.tracks.get(trackNumber);
        track.isSolo = !track.isSolo;
        if (track.isSolo) this.soloedTracks.add(trackNumber);
        else this.soloedTracks.delete(trackNumber);
        this.updateTrackGains();
        track.element.querySelector('.solo-btn').classList.toggle('active', track.isSolo);
    }

    updateTrackGains() {
        const hasSolo = this.soloedTracks.size > 0;
        this.tracks.forEach(t => {
            if (t.gainNode) {
                const shouldPlay = !t.isMuted && (!hasSolo || t.isSolo);
                const newVolume = shouldPlay ? t.volume : 0;
                t.gainNode.gain.setTargetAtTime(newVolume, this.audioContext.currentTime, 0.01);
            }
        });
    }

    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.webDAW = new WebDAW();
});
