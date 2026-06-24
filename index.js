import fetch from 'node-fetch';
import http from 'http';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const API_URL = 'https://httyd-egg-track.lovable.app/api/spiral-sightings';
const READY_URL = 'https://httyd-egg-track.lovable.app/api/public/ready-users';
const PING_ROLE_URL = 'https://httyd-egg-track.lovable.app/api/guild-ping-role';
const notifiedReady = new Set();

async function getPingRoleId(guildId) {
  try {
    const res = await fetch(`${PING_ROLE_URL}?guild_id=${guildId}`);
    const data = await res.json();
    return data.role_id || null;
  } catch { return null; }
}

const TOKEN = process.env.DISCORD_TOKEN;
let lastSeen = {};
const BOT_START = Date.now();

async function checkReadyUsers() {
  try {
    const res = await fetch(READY_URL);
    const data = await res.json();
    if (!data.users || data.users.length === 0) return;

    for (const user of data.users) {
      const key = user.discord_user_id + '_' + user.latest_collected_at;
      if (notifiedReady.has(key)) continue;
      notifiedReady.add(key);

      for (const [, guild] of client.guilds.cache) {
        try {
          const member = await guild.members.fetch(user.discord_user_id).catch(() => null);
          if (!member) continue;

          await member.send({
            embeds: [{
              title: '🥚 All Eggs Ready!',
              description: `All **${user.total_collected}** of your collected islands are off cooldown and ready to collect again!`,
              color: 0x57f287,
              fields: [
                {
                  name: '🏝️ Ready Islands',
                  value: `${user.ready_count} island${user.ready_count !== 1 ? 's' : ''} ready`
                }
              ],
              footer: { text: 'HTTYD Egg Tracker • httyd-egg-track.lovable.app' },
              url: 'https://httyd-egg-track.lovable.app'
            }]
          });
          console.log(`DMed ${user.username} — all eggs ready`);
          break;
        } catch (e) {
          console.log(`Failed to DM ${user.username}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.error('Ready check failed:', e.message);
  }
}

async function checkSightings() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    if (!data.sightings) return;

    const newSightings = [];
    for (const s of data.sightings) {
      if (new Date(s.createdAt).getTime() < BOT_START) continue;
      for (const [guildId] of client.guilds.cache) {
        const key = s.color + '_' + s.createdAt + '_' + guildId;
        if (!lastSeen[key]) newSightings.push({ s, guildId, key });
      }
    }

    if (newSightings.length === 0) return;
    console.log(`New sightings found: ${newSightings.length}`);

    for (const [guildId, guild] of client.guilds.cache) {
      const guildSightings = newSightings.filter(n => n.guildId === guildId);
      if (guildSightings.length === 0) continue;
      try {
        const pingRoleId = await getPingRoleId(guildId);
        if (!pingRoleId) { console.log(`No ping role configured for guild ${guildId}, skipping DMs`); continue; }

        const members = await guild.members.fetch({ force: false });
        const targets = members.filter(m => m.roles.cache.has(pingRoleId) && !m.user.bot);
        console.log(`Found ${targets.size} members with ping role in guild ${guildId}`);

        for (const { s, key } of guildSightings) {
          lastSeen[key] = true;
          for (const [, member] of targets) {
            try {
              await member.send(`🌀 **${s.color} Spiral Egg spotted!**\nReported by **${s.reportedBy}** in Discord\nYou have ~50 minutes to pick it up!\n\nhttps://httyd-egg-track.lovable.app`);
            } catch (e) { console.log(`Failed to DM ${member.user.tag}: ${e.message}`); }
          }
        }
      } catch (e) { console.error(`Guild ${guildId} failed:`, e.message); }
    }
  } catch (e) { console.error('Check failed:', e.message); }
}

// Simple HTTP server for health checks and self-ping
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('ok');
}).listen(process.env.PORT || 3000);

client.once('clientReady', async (c) => {
  console.log(`Bot ready as ${c.user.tag}`);
  console.log(`Active in ${client.guilds.cache.size} guild(s): ${client.guilds.cache.map(g => g.name).join(', ')}`);
  checkSightings();
  setInterval(checkSightings, 30000);
  checkReadyUsers();
  setInterval(checkReadyUsers, 3 * 60 * 1000);
});

client.login(TOKEN);

// Self-ping every 10 minutes to prevent Render from sleeping
setInterval(() => {
  fetch('https://httyd-dm-bot.onrender.com').catch(() => {});
  console.log('Self-ping sent');
}, 10 * 60 * 1000);
