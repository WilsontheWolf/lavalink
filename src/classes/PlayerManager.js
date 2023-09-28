import Player from './Player.js';

class PlayerManager {
    /** @type {Map<string, Player>} */
    #players = new Map();
    /**
     * @param {object} data - The data for the player manager.
     * @param {import('./Instance').default} data.instance - The instance for the player manager.
     */
    constructor({ instance }) {
        this.instance = instance;
    }

    /**
     * Gets the associated Player for a guild. Note: this will create a new Player if one does not exist. If you just want to check if a Player exists, use `has`.
     * @param {string} guildID - The guild ID for the player.
     * @returns {Player} - The player for the guild.
     */
    get(guildID) {
        let player = this.#players.get(guildID);

        if (!player) {
            player = new Player({ guildID, instance: this.instance });
            this.#players.set(guildID, player);
        }
        return player;
    }

    /**
     * Checks if an associated Player exists for a guild. Note: this doesn't confirm this player object is actually doing anything.
     * @param {string} guildID - The guild ID to check.
     * @returns {boolean} Whether the player manager has a player for the guild.
     */
    has(guildID) {
        return this.#players.has(guildID);
    }

    /**
     * Deletes a guild. NOTE: this is not for normal use. See {@link PlayerManager#destroy} instead.
     * @param {string} guildID - The guild ID to delete.
     */
    _delete(guildID) {
        this.#players.delete(guildID);
    }

    /**
     * Destroys a player. This will remove the player from the player manager, and destroy the player on the Lavalink server.
     * @param {string} guildID - The guild ID to destroy.
     * @returns {Promise<void>} - A promise that resolves when the player is destroyed.
     */
    async destroy(guildID) {
        await this.instance.destroyPlayer(guildID);
        this._delete(guildID);
    }
}

export default PlayerManager;