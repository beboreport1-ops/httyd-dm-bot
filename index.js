import fetch from 'node-fetch';
import http from 'http';
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const BASE_URL = 'https://httyd-egg-track.lovable.app';
const API_URL = `${BASE_URL}/api/spiral-sightings`;
const READY_URL = `${BASE_URL}/api/public/ready-users`;
const READY_GROUPS_URL = `${BASE_URL}/api/public/ready-groups`;
const PING_ROLE_URL = `${BASE_URL}/api/guild-ping-role`;

const notifiedReady = new Set();
const notifiedGroups = new Set();

function nextUTCHour(sightingTime) {
  const d = new Date(sightingTime);
  const top = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    0, 0, 0
  ));
  top.setUTCHours(top.getUTCHours() + 1);
  return top;
}

async function getPingRoleId(guildId) {
  try {
    const res = await fetch(`${PING_ROLE_URL}?guild_id=${guildId}`);
    const data = await res.json();
    return data.role_id || null;
  } catch { return null; }
}

async function dmUser(discordUserId, embedOrText) {
  for (const [, guild] of client.guilds.cache) {
    try {
      const member = await guild.members.fetch(discordUserId).catch(() => null);
      if (!member) continue;
      await member.send(embedOrText);
      return true;
    } catch (e) {
      console.log(`Failed to DM ${discordUserId} in guild ${guild.id}: ${e.message}`);
    }
  }
  return false;
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

      const sent = await dmUser(user.discord_user_id, {
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
          url: BASE_URL
        }]
      });
      if (sent) console.log(`DMed ${user.username} — all eggs ready`);
    }
  } catch (e) {
    console.error('Ready check failed:', e.message);
  }
}

async function checkReadyGroups() {
  try {
    const res = await fetch(READY_GROUPS_URL);
    const data = await res.json();
    if (!data.users || data.users.length === 0) return;

    for (const user of data.users) {
      if (!user.latest_collected_at) continue;
      const key = user.discord_user_id + '_group_' + user.group_id + '_' + user.latest_collected_at;
      if (notifiedGroups.has(key)) continue;
      notifiedGroups.add(key);

      const sent = await dmUser(user.discord_user_id, {
        embeds: [{
          title: '🥚 Group Ready!',
          description: `All islands in your group **${user.group_name}** are off cooldown and ready to collect!`,
          color: 0xf0a500,
          footer: { text: 'HTTYD Egg Tracker • httyd-egg-track.lovable.app' },
          url: BASE_URL
        }]
      });
      if (sent) console.log(`DMed ${user.username} — group "${user.group_name}" ready`);
    }
  } catch (e) {
    console.error('Ready groups check failed:', e.message);
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
          const despawn = nextUTCHour(s.createdAt);
          const minutesLeft = Math.ceil((despawn.getTime() - Date.now()) / 60000);
          for (const [, member] of targets) {
            try {
              await member.send(`🌀 **${s.color} Spiral Egg spotted!**\nReported by **${s.reportedBy}** in Discord\nDespawns at **${despawn.getUTCHours().toString().padStart(2, '0')}:00 UTC** — ${minutesLeft} minutes left!\n\n${BASE_URL}`);
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
  checkReadyGroups();
  setInterval(checkReadyGroups, 3 * 60 * 1000);
});

client.login(TOKEN);

// Self-ping every 10 minutes to prevent Render from sleeping
setInterval(() => {
  fetch(`${BASE_URL}`).catch(() => {});
  console.log('Self-ping sent');
}, 10 * 60 * 1000);
