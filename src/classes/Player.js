/**
 * @typedef {object} PlayerState
 * @property {number} time - The time of the state update. If this is `0`, the player hasn't received any data yet.
 * @property {number} position - The position of the player, in milliseconds.
 * @property {boolean} connected - Whether the player is connected to a voice channel.
 * @property {number} ping - The ping of the player, in milliseconds. `-1` if not connected.
 */

import { EventEmitter } from 'node:events';

class Player extends EventEmitter {
    /** @type {PlayerState} */
    #state = {
        time: 0,
        position: 0,
        connected: false,
        ping: -1,
    }
    #data = {
        track: null,
        volume: 100,
        paused: false,
        filters: {},
    }
    #guildID;
    #instance;
    lastError;

    /**
     * @param {object} data
     * @param {string} data.guildID - The guild ID for the player.
     * @param {import('./Instance').default} data.instance - The instance for the player manager.
     */
    constructor({ guildID, instance }) {
        super();
        this.#guildID = guildID;
        this.#instance = instance;
    }

    /**
     * The state of the player.
     * @type {PlayerState}
     */
    get state() {
        return this.#state;
    }

    /**
     * The guild this player belongs to.
     * @type {string}
     */
    get guildID() {
        return this.#guildID;
    }

    /**
     * The instance this player belongs to.
     * @type {import('./Instance').default}
     */
    get instance() {
        return this.#instance;
    }

    get track() {
        return this.#data.track;
    }

    get volume() {
        return this.#data.volume;
    }

    get paused() {
        return this.#data.paused;
    }

    get filters() {
        return this.#data.filters;
    }

    get position() {
        if (this.#data.paused) return this.#state.position;
        return this.#state.position + (Date.now() - this.#state.time);
    }

    get connected() {
        return this.#state.connected;
    }

    get ping() {
        return this.#state.ping;
    }


    /**
     * Sends a player update to the server. See {@link https://lavalink.dev/api/rest#update-player}.
     * @param {Object} options - See {@link https://lavalink.dev/api/rest#update-player}. The only differences in this method is you can pass `noReplace: true` to not replace the current track and `voice` is automatically filled in.
     * @returns {Promise<Player>} The player.
     */
    async update(options) {
        await this.#instance.updatePlayer(this.guildID, options);
        return this;
    }

    /**
     * Join a VC. Must be done before playing anything.
     * @param {string} channelID - The channel ID to join.
     * @param {object} options 
     * @param {boolean} [options.deaf=false] - Whether to deafen the bot.
     * @param {boolean} [options.mute=false] - Whether to mute the bot.
     * @returns {Promise<Player>} The player.
     */
    async join(channelID, options) {
        await this.#instance.join(this.guildID, channelID, options);
        return this;
    }

    /**
     * Leaves the VC and destroys the player. Note: this will remove the player from the player manager. Get a new player with {@link PlayerManager#get}.
     * @returns {Promise<void>} A promise that resolves when the player is destroyed.
     */
    async destroy() {
        await this.#instance.destroyPlayer(this.guildID);
    }

    /**
     * Checks if the player is destroyed.
     * @returns {boolean} Whether the player is destroyed.
     */
    isDestroyed() {
        if (!this.#instance.players.has(this.guildID)) return true;
        if (this.#instance.players.get(this.guildID) !== this) return true;
        return false;
    }

    _handleWSMessage(message) {
        switch (message.op) {
            case 'playerUpdate': {
                this.#state = message.state;
                break;
            }
            case 'event': {
                switch (message.type) {
                    case 'TrackStartEvent': {
                        this.#data.track = message.track;
                        this.emit('start', message.track);
                        break;
                    }
                    case 'TrackEndEvent': {
                        this.#data.track = null;
                        this.emit('end', { track: message.track, reason: message.reason });
                        break;
                    }
                    case 'TrackExceptionEvent': {
                        this.lastError = message;
                        this.emit('error', message);
                        this.lastError.at = Date.now();
                        break;
                    }
                    case 'TrackStuckEvent': {
                        this.lastError = message;
                        this.emit('stuck', message);
                        break;
                    }
                    case 'WebSocketClosedEvent': {
                        this.emit('wsClosed', message);
                        break;
                    }
                }
                break;
            }

            default: {
                console.log('Unknown WS Message In Player:', message);
            }
        }
    }

    _handleNewData(data) {
        this.#data = data;
    }


}

export default Player;