import fetch from 'node-fetch';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const API_URL = 'https://cosmic-spiral-whisper.lovable.app/api/spiral-sightings';
const ROLE_NAME = 'Spiral Egg Ping';
const GUILD_ID = process.env.GUILD_ID;
let lastSeen = {};

async function checkSightings() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    if (!data.sightings) return;
    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.members.fetch();
    for (const s of data.sightings) {
      const key = s.color + '_' + s.createdAt;
      if (lastSeen[s.color] === key) continue;
      lastSeen[s.color] = key;
      const role = guild.roles.cache.find(r => r.name === ROLE_NAME);
      if (!role) continue;
      const members = guild.members.cache.filter(m => m.roles.cache.has(role.id) && !m.user.bot);
      for (const [, member] of members) {
        try {
          await member.send(`🌀 **${s.color} Spiral Egg spotted!**\nReported by **${s.reportedBy}** in Discord\nYou have ~50 minutes to pick it up!\n\nhttps://beboreport1-ops.github.io/httyd-egg-tracker/`);
        } catch {}
      }
    }
  } catch (e) {
    console.error('Check failed:', e.message);
  }
}

client.once('ready', () => {
  console.log(`Bot ready as ${client.user.tag}`);
  checkSightings();
  setInterval(checkSightings, 30000);
});

client.login(process.env.DISCORD_TOKEN);
