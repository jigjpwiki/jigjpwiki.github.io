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
const {publicTalents,assertPrivateUnreferenced}=require('../lib/talent-publication');
const talents=publicTalents(fullTalents);
const { loadCatalog, publicCatalog } = require('../lib/catalog');
const { anniversaryPage } = require('../lib/info-pages');
const catalog = publicCatalog(loadCatalog(fullTalents, root));
const { talentPage: renderTalentPage } = require('../lib/talent-details');
const optionalFeed = name => { try { const value = JSON.parse(fs.readFileSync(path.join(root, 'data', name + '.json'), 'utf8')); return Array.isArray(value) ? value : []; } catch { return []; } };
const { goodsPage, relatedGoods, productPage } = require('../lib/goods-pages');
const feeds = { youtube: optionalFeed('youtube'), twitch: optionalFeed('twitch') };
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
const musicView = { ...musicData, performances:karaokeData.performances };
const { loadRelease, publishRelease } = require('../lib/release');
const release = loadRelease(root);
assertPrivateUnreferenced(fullTalents,[catalog,eventData,musicData,karaokeData]);
const output = path.join(__dirname, '..', '_site');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
// Explicit public allowlist: do not publish collectors, caches or credentials.
for (const entry of ['index.html', 'style.css', 'assets', 'privacy-policy', 'terms', 'robots.txt', 'sitemap.xml', 'CNAME']) {
  fs.cpSync(path.join(__dirname, '..', entry), path.join(output, entry), { recursive: true });
}
fs.mkdirSync(path.join(output, 'data'));
for (const name of ['youtube', 'twitch', 'tiktok', 'last_updated', 'youtube_client']) {
  fs.copyFileSync(path.join(__dirname, '..', 'data', `${name}.json`), path.join(output, 'data', `${name}.json`));
}
for (const [file, route] of [['index.html', '/'], ['privacy-policy/index.html', '/privacy-policy/'], ['terms/index.html', '/terms/']]) {
  const target = path.join(output, file);
  fs.writeFileSync(target, applyNavigation(fs.readFileSync(target, 'utf8'), route));
}
fs.mkdirSync(path.join(output, 'talents'));
const talentPage = fs.readFileSync(path.join(root, 'pages/talents/index.html'), 'utf8');
fs.writeFileSync(path.join(output, 'talents/index.html'), applyNavigation(talentPage, '/talents/').replace('<!-- jigdule:talents -->', talentCards(talents, catalog.groups)));
// Publish only the schema-validated public master, never its registry or sources' raw responses.
fs.writeFileSync(path.join(output, 'data/talents.json'), JSON.stringify(talents, null, 2) + '\n');
fs.writeFileSync(path.join(output,'data/stream-talents.json'),JSON.stringify(require('../assets/js/stream-core').identityIndex(talents.talents))+'\n');
fs.writeFileSync(path.join(output, 'data/catalog.json'), JSON.stringify({ schemaVersion: 1, sources: catalog.sources, groups: catalog.groups }) + '\n');
fs.mkdirSync(path.join(output, 'anniversaries'));
fs.writeFileSync(path.join(output, 'anniversaries/index.html'), anniversaryPage(talents, catalog, true));
fs.writeFileSync(path.join(output, 'data/anniversaries.json'), JSON.stringify({ schemaVersion: 1, events: catalog.events }) + '\n');
for (const talent of talents.talents) {
  fs.mkdirSync(path.join(output, 'talents', talent.id));
  fs.writeFileSync(path.join(output, 'talents', talent.id, 'index.html'), renderTalentPage(talent, talents, catalog, feeds, id => relatedGoods(id, talents, catalog), id => talentEvents(id, talents, eventData)+talentMusic(id,talents,musicView,talentKaraoke(id,talents,karaokeData,musicData))));
}
fs.mkdirSync(path.join(output,'events'));
fs.writeFileSync(path.join(output,'events/index.html'), eventList(talents,eventData));
for(const event of eventData.events){ fs.mkdirSync(path.join(output,'events',event.id)); fs.writeFileSync(path.join(output,'events',event.id,'index.html'),eventPage(event,talents,{...eventData,karaokes:karaokeData.karaokes})); }
fs.writeFileSync(path.join(output,'data/events.json'),JSON.stringify(eventData)+'\n');
fs.mkdirSync(path.join(output,'music/songs'),{recursive:true});
fs.writeFileSync(path.join(output,'music/index.html'),musicTop(talents,musicView,recentKaraoke(talents,karaokeData)));
for(const song of musicData.songs){fs.mkdirSync(path.join(output,'music/songs',song.id));fs.writeFileSync(path.join(output,'music/songs',song.id,'index.html'),songPage(song,talents,musicView,songHistory(song,talents,karaokeData)));}
fs.writeFileSync(path.join(output,'data/music.json'),JSON.stringify(musicData)+'\n');
fs.mkdirSync(path.join(output,'music/karaoke'),{recursive:true});
fs.writeFileSync(path.join(output,'music/karaoke/index.html'),karaokeList(talents,karaokeData));
for(const k of karaokeData.karaokes){fs.mkdirSync(path.join(output,'music/karaoke',k.id));fs.writeFileSync(path.join(output,'music/karaoke',k.id,'index.html'),karaokePage(k,talents,karaokeData,musicData));}
fs.writeFileSync(path.join(output,'data/karaoke.json'),JSON.stringify(karaokeData)+'\n');
fs.writeFileSync(path.join(output,'data/karaoke-links.json'),JSON.stringify(karaokeLinks(karaokeData))+'\n');
const sitemap = fs.readFileSync(path.join(output, 'sitemap.xml'), 'utf8').replace('</urlset>', talents.talents.map(t => `<url><loc>https://www.jigdule.jp/talents/${t.id}/</loc></url>`).join('\n') + '\n'+[...catalog.products.map(p=>'/goods/'+p.id+'/'),'/events/',...eventData.events.map(e=>'/events/'+e.id+'/'),'/music/',...musicData.songs.map(s=>'/music/songs/'+s.id+'/'),'/music/karaoke/',...karaokeData.karaokes.map(k=>'/music/karaoke/'+k.id+'/')].map(route=>`<url><loc>https://www.jigdule.jp${route}</loc></url>`).join('\n')+'\n</urlset>');
fs.writeFileSync(path.join(output, 'sitemap.xml'), sitemap);
fs.mkdirSync(path.join(output, 'goods'));
fs.writeFileSync(path.join(output, 'goods/index.html'), goodsPage(talents, catalog));
for(const product of catalog.products){fs.mkdirSync(path.join(output,'goods',product.id));fs.writeFileSync(path.join(output,'goods',product.id,'index.html'),productPage(product,talents,catalog));}
fs.writeFileSync(path.join(output, 'data/goods.json'), JSON.stringify({ schemaVersion: 1, products: catalog.products, campaigns: catalog.campaigns, offers: catalog.offers }) + '\n');
fs.writeFileSync(path.join(output, '.nojekyll'), '');
publishRelease(output,release);
writeManifest(output);
const elapsed = Math.round(performance.now() - started);
console.log(`Public site prepared in _site/; build_ms=${elapsed}`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Local site build: ${elapsed} ms (copy + manifest; excludes Pages queue/sync).\n`);
