import * as LavaLink from '../../../src/index.js';
import { Client, Constants } from '@projectdysnomia/dysnomia';

if (!process.env.DISCORD_TOKEN) {
    console.error('No token provided');
    process.exit(1);
}

const Intents = Constants.Intents;

const track = 'QAAA5QMAP1RoZSBUcmFnaWNhbGx5IEhpcCAtIEF0IFRoZSBIdW5kcmVkdGggTWVyaWRpYW4gKE9mZmljaWFsIFZpZGVvKQAUVGhlVHJhZ2ljYWxseUhpcFZFVk8AAAAAAAMFcAALQkNGbzBhOFYtQWcAAQAraHR0cHM6Ly93d3cueW91dHViZS5jb20vd2F0Y2g/dj1CQ0ZvMGE4Vi1BZwEANGh0dHBzOi8vaS55dGltZy5jb20vdmkvQkNGbzBhOFYtQWcvbWF4cmVzZGVmYXVsdC5qcGcAAAd5b3V0dWJlAAAAAAAAAAA=';

const client = new Client('Bot ' + process.env.DISCORD_TOKEN, {
    gateway: {
        intents: [Intents.guilds, Intents.guildMessages, Intents.guildVoiceStates]
    }
});


/** @type {LavaLink.Instance} */
let instance;

client.once('ready', async () => {
    instance = new LavaLink.Instance({
        url: 'http://localhost:2333',
        pass: 'youshallnotpass',
        userID: client.user.id,
        send: (guildID, packet) => {
            console.log('Sending packet', guildID, packet)
            const shardID = client.guildShardMap[guildID];
            if (shardID === undefined) return console.error('Shard not found for guild', guildID);
            client.shards.get(shardID)?.ws?.send(JSON.stringify(packet));
        }
    });
    await instance.connect();
    console.log('Connected');
});

client.on('messageCreate', async (msg) => {
    const mentionRegex = new RegExp(`^<@!?${client.user.id}> ?`);
    if (!mentionRegex.test(msg.content)) return;
    const args = msg.content.replace(mentionRegex, '').split(' ');
    const command = args.shift();
    switch (command) {
        case 'ping': {
            msg.channel.createMessage('Pong!');
            break;
        }
        case 'play': {
            const guildID = msg.guildID;
            const channelID = msg.member?.voiceState.channelID;
            if (!guildID || !channelID) {
                msg.channel.createMessage('You must be in a voice channel to use this command');
                return;
            }
            let thisTrack = track;
            if (args[0]) thisTrack = args[0];
            await instance.players.get(guildID).update({
                encodedTrack: thisTrack,
            })
                .then(console.log)
                .catch(console.error)

            break;
        }
        case 'lookup-and-play': {
            const toLookup = args.join(' ');
            const guildID = msg.guildID;
            const channelID = msg.member?.voiceState.channelID;
            if (!guildID || !channelID) {
                msg.channel.createMessage('You must be in a voice channel to use this command');
                return;
            }
            const res = await instance.loadTrack(toLookup);
            console.log('Lookup', res);
            let track
            switch (res?.loadType) {
                case 'search': {
                    const first = res.data?.[0];
                    await msg.channel.createMessage(`Found ${res.data.length} results for \`${toLookup}\`.\nPlaying first: \`${first.info.title}\` by \`${first.info.author}\`.`);
                    track = first;
                    break;
                }
                case 'track': {
                    await msg.channel.createMessage(`Playing track \`${res.data.info.title}\` by \`${res.data.info.author}\``);
                    track = res.data;
                    break;
                }
                case 'playlist': {
                    const first = res.data.tracks[0]
                    await msg.channel.createMessage(`Found playlist \`${res.data.info.name}\` with ${res.data.tracks.length} tracks. Playing first: ${first.info.title} by ${first.info.author}`);
                    break;
                }
                case 'empty': {
                    await msg.channel.createMessage(`No results for \`${toLookup}\``);
                    return;
                }
                case 'error': {
                    await msg.channel.createMessage(`${res.data.severity} Error: \`${res.data.error}\`\n\`${res.data.cause}\``);
                    return;
                }
                default: {
                    await msg.channel.createMessage(`Lol idk what to do with \`${res.loadType}\``);
                    return;
                }
            }
            const player = await instance.players.get(guildID).update({
                encodedTrack: track.encoded,
            });
            console.log('Player', player);
            break;
        }
        case 'join': {
            const guildID = msg.guildID;
            const channelID = msg.member?.voiceState.channelID;
            await instance.join(guildID, channelID, { deaf: true });
            console.log(new Error('Stack Trace'))
            break
        }
        case 'begone': {
            const guildID = msg.guildID;
            await instance.join(guildID);
            break
        }
        case 'destroy': {
            const guildID = msg.guildID;
            await instance.destroyPlayer(guildID);
            break;
        }
        case 'lookup': {
            const toLookup = args.join(' ');
            const res = await instance.loadTrack(toLookup);
            console.log(res);
            switch (res?.loadType) {
                case 'search': {
                    const first = res.data?.[0];
                    msg.channel.createMessage(`Found ${res.data.length} results for \`${toLookup}\`.\nFirst: \`${first.info.title}\` by \`${first.info.author}\` (\`${first.encoded}\`)`);
                    break;
                }
                case 'track': {
                    msg.channel.createMessage(`Found track \`${res.data.info.title}\` by \`${res.data.info.author}\` (\`${res.data.encoded}\`)`);
                    break;
                }
                case 'playlist': {
                    msg.channel.createMessage(`Found playlist \`${res.data.info.name}\` with ${res.data.tracks.length} tracks`);
                    break;
                }
                case 'empty': {
                    msg.channel.createMessage(`No results for \`${toLookup}\``);
                    break;
                }
                case 'error': {
                    msg.channel.createMessage(`${res.data.severity} Error: \`${res.data.error}\`\n\`${res.data.cause}\``);
                }
                default: {
                    msg.channel.createMessage(`Lol idk what to do with \`${res.loadType}\``);
                }
            }
        }
    }
});

client.on('rawWS', async (packet) => {
    if (packet.op === Constants.GatewayOPCodes.DISPATCH) {
        if (packet.t === 'VOICE_SERVER_UPDATE') {
            instance.voiceServerUpdate(packet.d);
        }
        if (packet.t === 'VOICE_STATE_UPDATE') {
            instance.voiceStateUpdate(packet.d);
        }
    }
});

client.connect();