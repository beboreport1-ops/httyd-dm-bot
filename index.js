import fetch from 'node-fetch';
import http from 'http';
import nacl from 'tweetnacl';
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const API_URL = 'https://cosmic-spiral-whisper.lovable.app/api/spiral-sightings';
const ROLE_NAME = 'Spiral Egg Ping';
const GUILD_IDS = ['1398443076393107628', '1376289128169082960'];
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;
let lastSeen = {};
const BOT_START = Date.now();

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i*2, i*2+2), 16);
  return out;
}

function verifySignature(signature, timestamp, rawBody) {
  try {
    const msg = Buffer.concat([Buffer.from(timestamp), rawBody]);
    return nacl.sign.detached.verify(
      new Uint8Array(msg),
      hexToBytes(signature),
      hexToBytes(PUBLIC_KEY)
    );
  } catch { return false; }
}

const ER = {
  'Bronze Egg':'Common','Moss Egg':'Common','Verdant Egg':'Common',
  'Sandstone Egg':'Rare','Orchid Egg':'Rare','Wave Egg':'Rare','Ocean Egg':'Rare',
  'Floral Egg':'Epic','Prism Egg':'Epic','Venom Egg':'Epic','Emberflame Egg':'Epic','Crimson Egg (Epic)':'Epic',
  'Flameclaw Egg':'Legendary','Glacier Egg':'Legendary','Magma Egg':'Legendary','Emerald Egg':'Legendary','Celestial Egg':'Legendary','Speckled Egg':'Legendary','Crimson Egg (Legendary)':'Legendary',
  'Amethyst Egg':'Mythic','Eclipse Egg':'Mythic','Obsidian Egg':'Mythic','Shadow Egg':'Mythic','Storm Egg':'Mythic'
};
const RE = {Common:'🟢',Rare:'🔵',Epic:'🟣',Legendary:'🟠',Mythic:'🔴'};

const ISLANDS = [
  {num:1, name:'Berk', spots:2, spawns:[{egg:'Bronze Egg',pct:60},{egg:'Moss Egg',pct:30},{egg:'Sandstone Egg',pct:10}]},
  {num:2, name:'Dragonroost Island', spots:2, spawns:[{egg:'Bronze Egg',pct:55},{egg:'Moss Egg',pct:30},{egg:'Sandstone Egg',pct:12},{egg:'Orchid Egg',pct:3}]},
  {num:3, name:'Gateway Island', spots:2, spawns:[{egg:'Moss Egg',pct:45},{egg:'Sandstone Egg',pct:28},{egg:'Orchid Egg',pct:18},{egg:'Wave Egg',pct:6},{egg:'Crimson Egg (Epic)',pct:3}]},
  {num:4, name:'Sheep Island', spots:2, spawns:[{egg:'Sandstone Egg',pct:38},{egg:'Orchid Egg',pct:28},{egg:'Verdant Egg',pct:18},{egg:'Wave Egg',pct:12},{egg:'Crimson Egg (Epic)',pct:4}]},
  {num:5, name:'Isle of Frigga', spots:3, spawns:[{egg:'Moss Egg',pct:40},{egg:'Sandstone Egg',pct:28},{egg:'Orchid Egg',pct:18},{egg:'Wave Egg',pct:10},{egg:'Crimson Egg (Epic)',pct:4}]},
  {num:6, name:'Isle of Hollows', spots:3, spawns:[{egg:'Orchid Egg',pct:32},{egg:'Verdant Egg',pct:28},{egg:'Wave Egg',pct:20},{egg:'Ocean Egg',pct:15},{egg:'Crimson Egg (Epic)',pct:5}]},
  {num:7, name:'Botany Blight', spots:1, spawns:[{egg:'Verdant Egg',pct:35},{egg:'Ocean Egg',pct:26},{egg:'Floral Egg',pct:18},{egg:'Prism Egg',pct:14},{egg:'Crimson Egg (Epic)',pct:7}]},
  {num:8, name:'Meathead Island', spots:5, spawns:[{egg:'Verdant Egg',pct:30},{egg:'Ocean Egg',pct:24},{egg:'Floral Egg',pct:22},{egg:'Prism Egg',pct:16},{egg:'Crimson Egg (Epic)',pct:8}]},
  {num:9, name:'Ancient Retreat', spots:1, spawns:[{egg:'Verdant Egg',pct:32},{egg:'Ocean Egg',pct:26},{egg:'Floral Egg',pct:20},{egg:'Prism Egg',pct:15},{egg:'Crimson Egg (Epic)',pct:7}]},
  {num:10, name:'Gronckle Island', spots:3, spawns:[{egg:'Floral Egg',pct:30},{egg:'Venom Egg',pct:24},{egg:'Prism Egg',pct:20},{egg:'Emberflame Egg',pct:15},{egg:'Flameclaw Egg',pct:8},{egg:'Crimson Egg (Legendary)',pct:3}]},
  {num:11, name:'Basalt Shores', spots:3, spawns:[{egg:'Floral Egg',pct:30},{egg:'Prism Egg',pct:25},{egg:'Venom Egg',pct:20},{egg:'Ocean Egg',pct:15},{egg:'Emberflame Egg',pct:7},{egg:'Flameclaw Egg',pct:3}]},
  {num:12, name:'Whispering Dunes', spots:0, spawns:[]},
  {num:13, name:'Breakneck Bog', spots:5, spawns:[{egg:'Venom Egg',pct:28},{egg:'Emberflame Egg',pct:24},{egg:'Flameclaw Egg',pct:18},{egg:'Crimson Egg (Legendary)',pct:15},{egg:'Floral Egg',pct:10},{egg:'Glacier Egg',pct:5}]},
  {num:14, name:'Twin Flame Island', spots:0, spawns:[]},
  {num:15, name:'Flaming Forest', spots:6, spawns:[{egg:'Glacier Egg',pct:26},{egg:'Magma Egg',pct:22},{egg:'Emerald Egg',pct:18},{egg:'Celestial Egg',pct:15},{egg:'Crimson Egg (Legendary)',pct:12},{egg:'Eclipse Egg',pct:5},{egg:'Amethyst Egg',pct:2}]},
  {num:16, name:'Spiral Island', spots:3, spawns:[], isSpiral:true},
  {num:17, name:'Wild Island', spots:2, spawns:[{egg:'Flameclaw Egg',pct:28},{egg:'Crimson Egg (Legendary)',pct:24},{egg:'Glacier Egg',pct:20},{egg:'Magma Egg',pct:15},{egg:'Emerald Egg',pct:9},{egg:'Celestial Egg',pct:4}]},
  {num:18, name:"Odin's Respite", spots:0, spawns:[]},
  {num:19, name:'Crown Island', spots:3, spawns:[{egg:'Magma Egg',pct:25},{egg:'Emerald Egg',pct:22},{egg:'Celestial Egg',pct:18},{egg:'Glacier Egg',pct:15},{egg:'Eclipse Egg',pct:10},{egg:'Amethyst Egg',pct:7},{egg:'Obsidian Egg',pct:3}]},
  {num:20, name:'Standing Stones', spots:3, spawns:[{egg:'Celestial Egg',pct:25},{egg:'Eclipse Egg',pct:20},{egg:'Amethyst Egg',pct:17},{egg:'Obsidian Egg',pct:14},{egg:'Emerald Egg',pct:12},{egg:'Shadow Egg',pct:8},{egg:'Storm Egg',pct:4}]},
  {num:21, name:'Sea Stack', spots:0, spawns:[]},
  {num:22, name:'Ship Graveyard', spots:6, spawns:[{egg:'Amethyst Egg',pct:25},{egg:'Eclipse Egg',pct:22},{egg:'Obsidian Egg',pct:18},{egg:'Shadow Egg',pct:15},{egg:'Storm Egg',pct:12},{egg:'Celestial Egg',pct:8}]},
];

const ALL_EGGS = [...new Set(ISLANDS.flatMap(i => i.spawns.map(s => s.egg)))].sort();

const commands = [
  new SlashCommandBuilder()
    .setName('eggs')
    .setDescription('Show egg spawn info for an island')
    .addStringOption(opt =>
      opt.setName('island').setDescription('Choose an island').setRequired(true)
        .addChoices(...ISLANDS.filter(i => i.spots > 0 && !i.isSpiral).map(i => ({ name: i.name, value: i.name })))
    ),
  new SlashCommandBuilder()
    .setName('find')
    .setDescription('Find which islands spawn a specific egg')
    .addStringOption(opt =>
      opt.setName('egg').setDescription('Choose an egg type').setRequired(true)
        .addChoices(...ALL_EGGS.map(e => ({ name: e, value: e })))
    ),
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  for (const guildId of GUILD_IDS) {
    try {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
      console.log(`Commands registered for guild ${guildId}`);
    } catch (e) { console.error(`Failed for guild ${guildId}:`, e.message); }
  }
}

async function checkSightings() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    if (!data.sightings) return;
    for (const guildId of GUILD_IDS) {
      try {
        const guild = await client.guilds.fetch(guildId);
        await guild.members.fetch();
        for (const s of data.sightings) {
          const key = s.color + '_' + s.createdAt + '_' + guildId;
          if (lastSeen[key]) continue;
          if (new Date(s.createdAt).getTime() < BOT_START) continue;
          lastSeen[key] = true;
          const role = guild.roles.cache.find(r => r.name === ROLE_NAME);
          if (!role) continue;
          const members = guild.members.cache.filter(m => m.roles.cache.has(role.id) && !m.user.bot);
          for (const [, member] of members) {
            try {
              await member.send(`🌀 **${s.color} Spiral Egg spotted!**\nReported by **${s.reportedBy}** in Discord\nYou have ~50 minutes to pick it up!\n\nhttps://beboreport1-ops.github.io/httyd-egg-tracker/`);
            } catch {}
          }
        }
      } catch (e) { console.error(`Guild ${guildId} failed:`, e.message); }
    }
  } catch (e) { console.error('Check failed:', e.message); }
}

client.once('ready', async () => {
  console.log(`Bot ready as ${client.user.tag}`);
  await registerCommands();
  checkSightings();
  setInterval(checkSightings, 30000);
});

// HTTP server
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/interactions') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks);
      const signature = req.headers['x-signature-ed25519'];
      const timestamp = req.headers['x-signature-timestamp'];

      if (!verifySignature(signature, timestamp, rawBody)) {
        res.writeHead(401);
        res.end('Invalid signature');
        return;
      }

      const interaction = JSON.parse(rawBody.toString());

      if (interaction.type === 1) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ type: 1 }));
        return;
      }

      if (interaction.type === 2) {
        const name = interaction.data.name;

        if (name === 'eggs') {
          const islandName = interaction.data.options?.find(o => o.name === 'island')?.value;
          const island = ISLANDS.find(i => i.name === islandName);
          if (!island) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ type: 4, data: { content: 'Island not found!', flags: 64 } }));
            return;
          }
          const spawnList = island.spawns.map(s => `${RE[ER[s.egg]||'Common']} **${s.egg}** — ${s.pct}%`).join('\n') || 'No eggs';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ type: 4, data: { embeds: [{ title: `🏝️ ${island.name}`, color: 0xf0a500, description: `**#${island.num}** — 🥚 ${island.spots} spawn spot${island.spots!==1?'s':''}`, fields: [{ name: 'Egg Spawn Rates', value: spawnList }], footer: { text: 'HTTYD Egg Tracker • beboreport1-ops.github.io/httyd-egg-tracker' } }] } }));
          return;
        }

        if (name === 'find') {
          const eggName = interaction.data.options?.find(o => o.name === 'egg')?.value;
          const results = ISLANDS.filter(i => i.spawns.some(s => s.egg === eggName));
          const rarity = ER[eggName] || 'Common';
          const islandList = results.map(i => { const spawn = i.spawns.find(s => s.egg === eggName); return `🏝️ **${i.name}** — ${spawn.pct}% (${i.spots} spot${i.spots!==1?'s':''})`; }).join('\n') || 'Not found anywhere';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ type: 4, data: { embeds: [{ title: `${RE[rarity]} ${eggName}`, color: 0xf0a500, description: `**Rarity:** ${rarity}\n**Found on ${results.length} island${results.length!==1?'s':''}:**`, fields: [{ name: 'Islands', value: islandList }], footer: { text: 'HTTYD Egg Tracker • beboreport1-ops.github.io/httyd-egg-tracker' } }] } }));
          return;
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ type: 1 }));
    });
  } else {
    res.writeHead(200);
    res.end('ok');
  }
}).listen(process.env.PORT || 3000);

client.login(TOKEN);
