import { appendPath, externalPromise, verifyURL } from "../functions/util.js";
import WebSocket from 'ws';
import PlayerManager from "./PlayerManager.js";
import { version } from "../functions/version.js";

class Instance {
    #readyPromise = externalPromise();
    ready = false;
    #voiceStates = new Map();
    #serverState = new Map();
    #guildChannels = new Map();
    #stats = {
        lastUpdated: 0,
        frameStats: { sent: 0, nulled: 0, deficit: 0 },
        players: 0,
        playingPlayers: 0,
        uptime: 0,
        memory: {
            free: 0,
            used: 0,
            allocated: 0,
            reservable: 0
        },
        cpu: {
            cores: 0,
            systemLoad: 0,
            lavalinkLoad: 0
        }
    };
    #voiceUpdateTimeout;

    constructor({ url, pass, send, userID, clientName = `WilsontheWolf-Lavalink/${version}` }) {
        if (!url) throw new Error("No URL provided");
        if (!send || typeof send !== 'function') throw new Error("No send function provided");
        if (!userID) throw new Error("No user ID provided");
        verifyURL(url);
        this.url = url;
        this.pass = pass;
        this.send = send;
        this.userID = userID;
        this.players = new PlayerManager({ instance: this });
        this.clientName = clientName;
    }

    async fetch(path, options = {}) {
        options.headers = options.headers || {};
        if (!options.headers['Content-Type']) {
            options.headers['Content-Type'] = 'application/json';
        }
        options.headers.Authorization = this.pass;
        let versionPrefix = '/v4'
        if (options.fetcher) {
            if (typeof options.fetcher.versionPrefix === 'string') versionPrefix = options.fetcher.versionPrefix;

            delete options.fetcher;
        }
        const res = await fetch(appendPath(this.url, versionPrefix, path), options);
        return res;
    }

    async connect() {
        if (this.ready) throw new Error("Already connected");
        const res = await this.fetch('/version', { fetcher: { versionPrefix: '' } });
        const apiVersion = res.headers.get('lavalink-api-version');
        if (apiVersion !== '4') {
            throw new Error(`Invalid API version ${apiVersion}`);
        }
        const ws = new WebSocket(this.url.replace(/^http/, 'ws') + '/v4/websocket', {
            headers: {
                Authorization: this.pass,
                'User-Id': this.userID,
                'Client-Name': this.clientName,
            }
        });

        ws.on('message', (message) => {
            this.handleWSMessage(JSON.parse(message));
        });

        ws.on('error', (err) => {
            this.ready = false;
            this.#readyPromise.reject(err);
        });
        ws.on('close', (code, reason) => {
            this.ready = false;
            console.log('WS Closed', code, reason.toString());
        });

        await this.#readyPromise.promise;
    }

    async join(guildID, channelID = null, { deaf = false, mute = false } = {}) {
        if (!guildID) throw new Error("No guild ID provided");
        if (this.#guildChannels.get(guildID) !== channelID) {
            this.#voiceStates.delete(guildID);
            this.#serverState.delete(guildID);
        }
        const packet = {
            op: 4, // Voice State Update
            d: {
                guild_id: guildID,
                channel_id: channelID,
                self_deaf: deaf,
                self_mute: mute,
            }
        };
        this.send(guildID, packet);
    }


    handleWSMessage(message) {
        switch (message.op) {
            case 'ready': {
                this.ready = true;
                this.#readyPromise.resolve();
                this.sessionID = message.sessionId;
                break;
            }
            case 'stats': {
                this.#stats = message;
                this.#stats.lastUpdated = Date.now();
                delete this.#stats.op;
                break;
            }
            case 'event':
            case 'playerUpdate': {
                const guild = message.guildId;
                if (!guild) return;
                this.#handlePlayerEvent(guild, message);
                break;
            }
            default: {
                console.log('Unknown WS Message:', message);
            }
        }
    }

    #newPlayerData(guildID, data = {}) {
        if (!guildID) throw new Error("No guild ID provided");
        this.players.get(guildID)._handleNewData(data);
    }

    #handlePlayerEvent(guildID, data = {}) {
        if (!guildID) throw new Error("No guild ID provided");
        this.players.get(guildID)._handleWSMessage(data);
    }

    get stats() {
        return this.#stats;
    }

    async updatePlayer(guildID, data = {}) {
        if (!guildID) throw new Error("No guild ID provided");
        if (!this.#serverState.has(guildID)) throw new Error("No voice server update received for this guild. Make sure you're forwarding voice server updates to the Lavalink server, and you've joined a voice channel.");
        if (!this.#voiceStates.has(guildID)) throw new Error("No voice state update received for this guild. Make sure you're forwarding voice state updates to the Lavalink server, and you've joined a voice channel.");
        let queryParam = '';
        if (data.noReplace === true) {
            queryParam = '?noReplace=true';
            delete data.noReplace;
        }

        data.voice = {
            token: this.#serverState.get(guildID).token,
            endpoint: this.#serverState.get(guildID).endpoint,
            sessionId: this.#voiceStates.get(guildID).session_id,
        }

        clearTimeout(this.#voiceUpdateTimeout);
        const res = await this.fetch(`/sessions/${this.sessionID}/players/${guildID}${queryParam}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });

        if (!res.ok) {
            throw new Error(`Failed to update player: ${res.status} ${res.statusText} ${await res.text().catch(e => '') || ''}`);
        }
        const playerData = await res.json();
        this.#newPlayerData(guildID, playerData);
        return playerData;
    }

    async destroyPlayer(guildID) {
        if (!guildID) throw new Error("No guild ID provided");
        const res = await this.fetch(`/sessions/${this.sessionID}/players/${guildID}`, {
            method: 'DELETE',
        });

        if (!res.ok) {
            throw new Error(`Failed to destroy player: ${res.status} ${res.statusText} ${await res.text().catch(e => '') || ''}`);
        }
        this.players._delete(guildID);
        this.join(guildID); // Disconnects the player.
        return res;
    }

    async loadTrack(identifier) {
        if (!identifier) throw new Error("No identifier provided");
        const res = await this.fetch(`/loadtracks?identifier=${encodeURIComponent(identifier)}`);
        if (!res.ok) {
            throw new Error(`Failed to load track: ${res.status} ${res.statusText} ${await res.text().catch(e => '') || ''}`);
        }
        return await res.json();
    }

    async decodeTracks(tracks) {
        if (!tracks) throw new Error("No tracks provided");
        if (!Array.isArray(tracks)) throw new Error("Tracks must be an array");
        if (tracks.length === 0) throw new Error("Tracks must not be empty");
        const res = await this.fetch(`/decodetracks`, {
            method: 'POST',
            body: JSON.stringify(tracks),
        });
        if (!res.ok) {
            throw new Error(`Failed to decode tracks: ${res.status} ${res.statusText} ${await res.text().catch(e => '') || ''}`);
        }
        return await res.json();
    }

    async decodeTrack(track) {
        if (!track) throw new Error("No track provided");
        const res = await this.fetch(`/decodetrack?encodedTrack=${encodeURIComponent(track)}`);
        if (!res.ok) {
            throw new Error(`Failed to decode track: ${res.status} ${res.statusText} ${await res.text().catch(e => '') || ''}`);
        }
        return await res.json();
    }

    async fetchStats() {
        const res = await this.fetch(`/stats`);
        if (!res.ok) {
            throw new Error(`Failed to fetch stats: ${res.status} ${res.statusText} ${await res.text().catch(e => '') || ''}`);
        }
        return await res.json();
    }

    #newVoiceStateData(guildID) {
        if (!guildID) throw new Error("No guild ID provided");
        if (this.#voiceUpdateTimeout) clearTimeout(this.#voiceUpdateTimeout);
        this.#voiceUpdateTimeout = setTimeout(() => {
            if (this.#voiceStates.has(guildID) && this.#serverState.has(guildID))
                this.updatePlayer(guildID);
        }, 1000);
    }

    voiceServerUpdate(data) {
        const guildID = data.guild_id;
        if (!guildID) return;
        this.#serverState.set(guildID, data);
        this.#newVoiceStateData(guildID);
    }

    voiceStateUpdate(data) {
        const guildID = data.guild_id;
        if (data.user_id !== this.userID) return;
        if (!guildID) return;
        this.#voiceStates.set(guildID, data);
        this.#newVoiceStateData(guildID);
    }

}

export default Instance;