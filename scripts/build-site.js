'use strict';
const started = performance.now();
const fs = require('node:fs');
const path = require('node:path');
const { writeManifest } = require('../lib/publication');
const { loadTalents } = require('../lib/talents');
const { applyNavigation, talentCards } = require('../lib/site-pages');
const root = path.join(__dirname, '..');
// Validate before touching the prior build output. Never publish unvalidated data.
const fullTalents = loadTalents(root);
const {publicTalents,assertPrivateUnreferenced,publicFeed,privateAssetPaths}=require('../lib/talent-publication');
const talents=publicTalents(fullTalents);
const { loadCatalog, publicCatalog } = require('../lib/catalog');
const { anniversaryPage } = require('../lib/info-pages');
const catalog = publicCatalog(loadCatalog(fullTalents, root));
const memberOrder=require('../assets/js/member-order');
const displayTalents={...talents,talents:memberOrder.orderedPeople(talents,catalog.events)};
const memberRanks=memberOrder.ranks(displayTalents.talents);
const { talentPage: renderTalentPage } = require('../lib/talent-details');
const collaboration = require('../lib/collaboration');
const collabIndex = collaboration.index(fullTalents.talents,{organizations:fullTalents.organizations,youtubeStreamers:JSON.parse(fs.readFileSync(path.join(root,'data','youtube_streamers.json'),'utf8'))});
const readFeed = name => publicFeed(JSON.parse(fs.readFileSync(path.join(root,'data',name+'.json'),'utf8')),fullTalents).map(row=>collaboration.project(row,name,collabIndex,memberRanks));
const { goodsPage, relatedGoods, productPage, campaignPage } = require('../lib/goods-pages');
const feeds = { youtube: readFeed('youtube'), twitch: readFeed('twitch'), tiktok: readFeed('tiktok') };
const { loadEvents, projectEvents } = require('../lib/feature-data');
const { eventList, eventPage, talentEvents } = require('../lib/feature-pages');
const eventModel = loadEvents(fullTalents, catalog, root);
const eventData = { ...projectEvents(eventModel), groups:catalog.groups };
const { loadMusic, projectMusic } = require('../lib/music-data');
const { musicTop, songPage, talentMusic } = require('../lib/music-pages');
const musicData = projectMusic(loadMusic(fullTalents,catalog,root));
const { loadKaraoke, projectKaraoke, karaokeLinks } = require('../lib/karaoke-data');
const { karaokeList, karaokePage, songHistory, recentKaraoke, talentKaraoke } = require('../lib/karaoke-pages');
const karaokeData = projectKaraoke(loadKaraoke(fullTalents,catalog,root));
const musicView = { ...musicData, performances:karaokeData.performances, karaokes:karaokeData.karaokes, karaokeVideos:karaokeData.videos };
const { loadRelease, publishRelease } = require('../lib/release');
const release = loadRelease(root);
// Couple redesigned talent markup to its matching CSS/JS release, without changing feed caching.
const talentAssets = html => html.replace(/(\/assets\/(?:js\/talent-directory\.js|js\/talent-streams\.js|talent-ux\.css|streams\.css))"/g, `$1?v=${release.version}"`);
assertPrivateUnreferenced(fullTalents,[catalog,eventData,musicData,karaokeData]);
const output = path.join(__dirname, '..', '_site');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
// Explicit public allowlist: do not publish collectors, caches or credentials.
for (const entry of ['index.html', 'style.css', 'assets', 'privacy-policy', 'terms', 'robots.txt', 'sitemap.xml', 'CNAME']) {
  fs.cpSync(path.join(__dirname, '..', entry), path.join(output, entry), { recursive: true });
}
// A local avatar must not remain publicly retrievable just because assets are copied.
const staticTexts=[];const scanStatic=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())scanStatic(p);else if(/\.(?:html|css|js)$/.test(e.name))staticTexts.push(fs.readFileSync(p,'utf8'));}};scanStatic(output);
for(const url of privateAssetPaths(fullTalents,[talents,catalog,eventData,musicData,karaokeData,feeds],staticTexts))fs.rmSync(path.join(output,url.slice(1)),{force:true});
fs.mkdirSync(path.join(output, 'data'));
for (const name of ['youtube', 'twitch', 'tiktok', 'last_updated', 'youtube_client']) {
  if(['youtube','twitch','tiktok'].includes(name)) fs.writeFileSync(path.join(output,'data',`${name}.json`),JSON.stringify(feeds[name],null,2)+'\n');
  else fs.copyFileSync(path.join(__dirname, '..', 'data', `${name}.json`), path.join(output, 'data', `${name}.json`));
}
for (const [file, route] of [['index.html', '/'], ['privacy-policy/index.html', '/privacy-policy/'], ['terms/index.html', '/terms/']]) {
  const target = path.join(output, file);
  fs.writeFileSync(target, applyNavigation(fs.readFileSync(target, 'utf8'), route));
}
fs.mkdirSync(path.join(output, 'talents'));
const talentPage = fs.readFileSync(path.join(root, 'pages/talents/index.html'), 'utf8');
fs.writeFileSync(path.join(output, 'talents/index.html'), talentAssets(applyNavigation(talentPage, '/talents/').replace('<!-- jigdule:talents -->', talentCards(talents, catalog.groups, catalog.events))));
// Publish only the schema-validated public master, never its registry or raw responses.
fs.writeFileSync(path.join(output, 'data/talents.json'), JSON.stringify(talents, null, 2) + '\n');
fs.writeFileSync(path.join(output,'data/stream-talents.json'),JSON.stringify(require('../assets/js/stream-core').identityIndex(talents.talents))+'\n');
fs.writeFileSync(path.join(output, 'data/catalog.json'), JSON.stringify({ schemaVersion: 2, groups: catalog.groups }) + '\n');
fs.mkdirSync(path.join(output, 'anniversaries'));
fs.writeFileSync(path.join(output, 'anniversaries/index.html'), anniversaryPage(displayTalents, catalog, true));
fs.writeFileSync(path.join(output, 'data/anniversaries.json'), JSON.stringify({ schemaVersion: 2, fallbackDate: catalog.fallbackDate, events: catalog.events }) + '\n');
for (const talent of talents.talents.filter(t=>!t.profileHidden)) {
  fs.mkdirSync(path.join(output, 'talents', talent.id));
  fs.writeFileSync(path.join(output, 'talents', talent.id, 'index.html'), talentAssets(renderTalentPage(talent, displayTalents, catalog, feeds, id => relatedGoods(id, displayTalents, catalog), id => talentMusic(id,displayTalents,musicView,talentKaraoke(id,displayTalents,karaokeData,musicData))+talentEvents(id, displayTalents, eventData))));
}
fs.mkdirSync(path.join(output,'events'));
fs.writeFileSync(path.join(output,'events/index.html'), eventList(displayTalents,eventData,catalog.fallbackDate));
for(const event of eventData.events){ fs.mkdirSync(path.join(output,'events',event.id)); fs.writeFileSync(path.join(output,'events',event.id,'index.html'),eventPage(event,displayTalents,{...eventData,karaokes:karaokeData.karaokes})); }
fs.writeFileSync(path.join(output,'data/events.json'),JSON.stringify(eventData)+'\n');
fs.mkdirSync(path.join(output,'music/songs'),{recursive:true});
fs.writeFileSync(path.join(output,'music/index.html'),musicTop(displayTalents,musicView,recentKaraoke(displayTalents,karaokeData)));
for(const song of musicData.songs){fs.mkdirSync(path.join(output,'music/songs',song.id));fs.writeFileSync(path.join(output,'music/songs',song.id,'index.html'),songPage(song,displayTalents,musicView,songHistory(song,displayTalents,karaokeData)));}
fs.writeFileSync(path.join(output,'data/music.json'),JSON.stringify(musicData)+'\n');
fs.mkdirSync(path.join(output,'music/karaoke'),{recursive:true});
fs.writeFileSync(path.join(output,'music/karaoke/index.html'),karaokeList(displayTalents,karaokeData));
for(const k of karaokeData.karaokes){fs.mkdirSync(path.join(output,'music/karaoke',k.id));fs.writeFileSync(path.join(output,'music/karaoke',k.id,'index.html'),karaokePage(k,displayTalents,karaokeData,musicData));}
fs.writeFileSync(path.join(output,'data/karaoke.json'),JSON.stringify(karaokeData)+'\n');
fs.writeFileSync(path.join(output,'data/karaoke-links.json'),JSON.stringify(karaokeLinks(karaokeData))+'\n');
const sitemap = fs.readFileSync(path.join(output, 'sitemap.xml'), 'utf8').replace('</urlset>', talents.talents.filter(t=>!t.profileHidden).map(t => `<url><loc>https://www.jigdule.jp/talents/${t.id}/</loc></url>`).join('\n') + '\n'+[...catalog.products.map(p=>'/goods/'+p.id+'/'),...catalog.campaigns.map(c=>'/goods/campaigns/'+c.id+'/'),'/events/',...eventData.events.map(e=>'/events/'+e.id+'/'),'/music/',...musicData.songs.map(s=>'/music/songs/'+s.id+'/'),...karaokeData.karaokes.map(k=>'/music/karaoke/'+k.id+'/')].map(route=>`<url><loc>https://www.jigdule.jp${route}</loc></url>`).join('\n')+'\n</urlset>');
fs.writeFileSync(path.join(output, 'sitemap.xml'), sitemap);
fs.mkdirSync(path.join(output, 'goods'));
fs.writeFileSync(path.join(output, 'goods/index.html'), goodsPage(displayTalents, catalog));
for(const product of catalog.products){fs.mkdirSync(path.join(output,'goods',product.id));fs.writeFileSync(path.join(output,'goods',product.id,'index.html'),productPage(product,displayTalents,catalog));}
fs.mkdirSync(path.join(output,'goods/campaigns'),{recursive:true});
for(const c of catalog.campaigns){fs.mkdirSync(path.join(output,'goods/campaigns',c.id));fs.writeFileSync(path.join(output,'goods/campaigns',c.id,'index.html'),campaignPage(c,displayTalents,catalog));}
fs.writeFileSync(path.join(output, 'data/goods.json'), JSON.stringify({ schemaVersion: 2, products: catalog.products, campaigns: catalog.campaigns, offers: catalog.offers }) + '\n');
fs.writeFileSync(path.join(output, '.nojekyll'), '');
publishRelease(output,release);
writeManifest(output);
const elapsed = Math.round(performance.now() - started);
console.log(`Public site prepared in _site/; build_ms=${elapsed}`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Local site build: ${elapsed} ms (copy + manifest; excludes Pages queue/sync).\n`);
