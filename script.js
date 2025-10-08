class WebDAW {
    constructor() {
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
        this.osmdInstances = new Map();
        this.filesLoaded = 0;
        this.totalFilesToLoad = 0;

        // Sincronização Centralizada
        this.referenceTrackNumber = 1; // Usaremos o Violino 1 como maestro
        this.noteTimes = [];
        this.nextNoteIndex = 0;

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
        document.getElementById('loader-bar').style.width = `${percentage}%`;
        if (this.filesLoaded >= this.totalFilesToLoad) {
            setTimeout(() => document.getElementById('preloader')?.classList.add('hidden'), 500);
        }
    }

    async loadAndRenderScore(trackNumber) {
        const track = this.tracks.get(trackNumber);
        const scoreContainer = document.getElementById(`score-container-${trackNumber}`);
        scoreContainer.innerHTML = ''; // Limpa a mensagem "Carregando..."

        const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(scoreContainer, {
            autoResize: false, backend: "svg", drawingParameters: "horizontal",
            drawTitle: false, drawSubtitle: false, drawComposer: false, drawLyricist: false,
            drawMetronome: false, drawPartNames: false, drawMeasureNumbers: false,
            defaultColorMusic: "#FFFFFF", followCursor: true,
        });
        
        try {
            const response = await fetch(track.score);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const scoreText = await response.text();
            await osmd.load(scoreText);
            osmd.render();
            
            // Apenas a faixa de referência cria o mapa de tempo
            if (trackNumber === this.referenceTrackNumber) {
                osmd.cursor.show();
                const iterator = osmd.cursor.Iterator;
                while (!iterator.EndReached) {
                    const timestamp = iterator.CurrentVoiceEntries[0]?.Timestamp;
                    if (timestamp) this.noteTimes.push(timestamp.RealValue);
                    iterator.next();
                }
            } else {
                osmd.cursor.hide(); // Esconde os cursores das outras faixas
            }
            
            this.osmdInstances.set(trackNumber, osmd);
        } catch (error) {
            scoreContainer.innerHTML = `<div class="loading-score" style="color: #ff8a80;">Erro!</div>`;
            console.error(`Error for track ${trackNumber}:`, error);
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
            const trackData = { ...config, audioBuffer: null, source: null, isMuted: false, isSolo: false, volume: 0.7 };
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
                <div class="score-container" id="score-container-${trackNumber}"><div class="loading-score">Carregando...</div></div>`;
            tracksContainer.appendChild(trackItem);
            trackData.element = trackItem;
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
            const el = track.element;
            el.querySelector('.mute-btn').addEventListener('click', () => this.toggleMute(trackNumber));
            el.querySelector('.solo-btn').addEventListener('click', () => this.toggleSolo(trackNumber));
            el.querySelector('.volume-slider').addEventListener('input', (e) => {
                this.setTrackVolume(trackNumber, e.target.value / 100);
                el.querySelector('.volume-value').textContent = `${e.target.value}%`;
            });
            el.querySelector('.pan-slider').addEventListener('input', (e) => {
                this.setTrackPan(trackNumber, e.target.value / 100);
                const value = parseInt(e.target.value, 10);
                el.querySelector('.pan-value').textContent = value === 0 ? 'C' : (value > 0 ? `R${value}` : `L${Math.abs(value)}`);
            });
        });
    }

    togglePlayback() { this.isPlaying ? this.pause() : this.play(); }

    play() {
        if (this.audioContext.state === 'suspended') this.audioContext.resume();
        this.isPlaying = true;
        this.startTime = this.audioContext.currentTime - this.pauseTime;
        this.tracks.forEach(track => { if (track.audioBuffer) this.startTrack(track); });
        document.getElementById('playBtn').textContent = '⏸';
        requestAnimationFrame(() => this.updateProgress());
    }

    pause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.pauseTime = this.audioContext.currentTime - this.startTime;
        this.tracks.forEach(track => { if (track.source) track.source.stop(); });
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
        
        let nextNoteIndex = this.noteTimes.findIndex(noteTime => noteTime >= this.currentTime);
        if (nextNoteIndex === -1) nextNoteIndex = this.noteTimes.length;
        this.nextNoteIndex = nextNoteIndex;
        
        const referenceOSMD = this.osmdInstances.get(this.referenceTrackNumber);
        if (referenceOSMD) {
            referenceOSMD.cursor.reset();
            for (let i = 0; i < this.nextNoteIndex; i++) referenceOSMD.cursor.next();
        }

        this.updateUI(true);
        if (wasPlaying) this.play();
    }

    updateProgress() {
        if (!this.isPlaying) return;
        this.currentTime = this.pauseTime + (this.audioContext.currentTime - this.startTime);
        
        if (this.currentTime >= this.duration) {
            if (this.isLooping) { this.seekTo(0); }
            else { this.pause(); this.seekTo(0); }
            return;
        }
        
        const referenceOSMD = this.osmdInstances.get(this.referenceTrackNumber);
        if (referenceOSMD && this.noteTimes.length > 0) {
            while (this.nextNoteIndex < this.noteTimes.length && this.currentTime >= this.noteTimes[this.nextNoteIndex]) {
                referenceOSMD.cursor.next();
                this.nextNoteIndex++;
            }
        }

        this.updateUI();
        requestAnimationFrame(() => this.updateProgress());
    }

    updateUI(forceScroll = false) {
        document.getElementById("progressFill").style.width = `${(this.currentTime / this.duration) * 100}%`;
        document.getElementById("currentTime").textContent = this.formatTime(this.currentTime);

        const referenceOSMD = this.osmdInstances.get(this.referenceTrackNumber);
        if (!referenceOSMD || !referenceOSMD.cursor.cursorElement) return;

        const scoreContainer = document.getElementById(`score-container-${this.referenceTrackNumber}`);
        const cursorElement = referenceOSMD.cursor.cursorElement;
        const containerWidth = scoreContainer.clientWidth;
        const cursorLeft = cursorElement.offsetLeft;
        const scrollTarget = containerWidth * 0.4;
        const newScrollLeft = cursorLeft - scrollTarget;

        // Aplica a rolagem a TODAS as partituras
        this.osmdInstances.forEach((osmd, i) => {
            const container = document.getElementById(`score-container-${i}`);
            if (container) {
                if (forceScroll) {
                    container.scrollLeft = newScrollLeft;
                } else if (newScrollLeft > container.scrollLeft) {
                    container.scrollLeft = newScrollLeft;
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
