const ruleRoot=require('./fixtures/historical-root.cjs')();
"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  directory = require("../assets/js/talent-directory"),
  { talentCards } = require("../lib/site-pages");
const organizations = [
  { id: "b", name: "事務所B" },
  { id: "a", name: "事務所A" },
];
const row = (id, name, current = [], former = [], unaffiliated = false) => ({
  id,
  name,
  current,
  former,
  unaffiliated,
  aliases: [],
  groups: [],
});
test("agency grouping uses master agency and talent order, never duplicates multi-agency people", () => {
  const people = [
    row("x", "夏", ["a", "b"]),
    row("y", "春", ["b"]),
    row("z", "秋", ["a"]),
    row("g", "卒業", [], ["a"]),
    row("u", "無所属", [], ["b"], true),
    row("n", "不明"),
  ];
  const original = structuredClone(people);
  const groups = directory.arrange(people, organizations);
  assert.deepEqual(
    groups.map((g) => g.id),
    ["b", "a", "unaffiliated", "former", "unknown"],
  );
  assert.deepEqual(
    groups[0].people.map((p) => p.id),
    ["x", "y"],
  );
  assert.equal(groups.flatMap((g) => g.people).length, people.length);
  assert.deepEqual(people, original);
  assert.equal(
    directory.representative(people[0], [...organizations].reverse()),
    "a",
  );
});
test("name and registration sort use names and actual master order, without invented readings or debut dates", () => {
  const people = [
    row("tal-999999", "しろ"),
    row("tal-000001", "あか"),
    row("tal-000003", "あお"),
  ];
  assert.deepEqual(
    directory
      .arrange(people, organizations, "registered")[0]
      .people.map((p) => p.id),
    people.map((p) => p.id),
  );
  assert.deepEqual(
    directory
      .arrange(people, organizations, "name")[0]
      .people.map((p) => p.name),
    ["あお", "あか", "しろ"],
  );
});
test("combined filters preserve representative grouping and distinguish past, unaffiliated and unknown", () => {
  const person = {
    ...row("x", "テスト", ["b"], ["a"]),
    aliases: ["旧名"],
    groups: ["g"],
  };
  assert(
    directory.matches(person, {
      q: "旧名",
      organization: "a",
      relation: "former",
      group: "g",
    }),
  );
  assert(
    !directory.matches(person, { organization: "a", relation: "current" }),
  );
  const unknown = row("n", "不明"),
    former = row("f", "旧所属", [], ["a"]),
    unaffiliated = row("u", "無所属", [], ["a"], true);
  assert(directory.matches(unknown, { relation: "unknown" }));
  assert(!directory.matches(former, { relation: "unknown" }));
  assert(directory.matches(unaffiliated, { relation: "unaffiliated" }));
});
test("server renders static grouped cards once, excludes drafts and escapes all public labels", () => {
  const master = structuredClone(require("./fixtures/admin-vnext-baseline.json").talents);
  master.talents[0].visibility = "draft";
  master.talents[1].displayName = "<script>fixture</script>";
  const html = talentCards(master);
  assert(!html.includes('id="tal-000001"'));
  assert.equal((html.match(/id="tal-000002"/g) || []).length, 1);
  assert(html.includes("&lt;script&gt;fixture"));
  assert(!html.includes("<script>fixture"));
  assert(!html.includes("プロフィールを見る"));
  assert(html.includes("data-directory-section="));
  const privateGroup = {
    ...require("./fixtures/admin-vnext-baseline.json").catalog.groups[0],
    visibility: "draft",
  };
  const withoutPrivateGroup = talentCards(master, [privateGroup]);
  assert(!withoutPrivateGroup.includes(privateGroup.id));
  assert(!withoutPrivateGroup.includes(privateGroup.name));
});
test("sparse profiles omit unrelated empty sections and keep Wiki links and human-confirmed activity separate", () => {
  const { loadTalents } = require("../lib/talents"),
    { loadCatalog, publicCatalog } = require("../lib/catalog"),
    { talentPage } = require("../lib/talent-details");
  const master = loadTalents(ruleRoot),
    person = structuredClone(require("./fixtures/foundation-talents.json")[3]);
  person.profileImage = null;
  const html = talentPage(person, master, {
    ...publicCatalog(loadCatalog(master,ruleRoot)),
    events: [],
  });
  assert(!html.includes("profile-anniversaries"));
  assert(!html.includes("画像未確認"));
  assert(!html.includes("<h2>音楽</h2>"));
  assert(!html.includes("profile-provenance"));
  assert(html.includes(person.wiki.url.replaceAll("&", "&amp;")));
  assert(!html.includes(">引退<"));
  assert(
    html.indexOf('id="talent-streams"') < html.indexOf('id="profile-biography"'),
  );
  person.affiliations = [];
  person.agencyStatus = { value: "unknown" };
  const unknown = talentPage(person, master, {
    ...publicCatalog(loadCatalog(master,ruleRoot)),
    events: [],
  });
  assert(unknown.includes("所属不明"));
  assert(!unknown.includes(">undefined<"));
});

test("registration order survives reading an already grouped DOM", () => {
  const people = [
    { ...row("a", "後"), order: 2 },
    { ...row("b", "先"), order: 0 },
  ];
  assert.deepEqual(
    directory
      .arrange(people, organizations, "registered")[0]
      .people.map((p) => p.id),
    ["b", "a"],
  );
});

test("ended former members stay in former section; active independent talents stay independent",()=>{
  const graduate={...row("g","卒業",[],["a"],true),activity:"ended"};
  const retired={...row("r","引退",[],[],true),activity:"retired"};
  const active={...row("a","個人活動",[],["b"],true),activity:"active"};
  const current={...row("c","所属中",["a"],[],false),activity:"ended"};
  assert.equal(directory.representative(graduate,organizations),"former");
  assert.equal(directory.representative(retired,organizations),"ended");
  assert.equal(directory.representative(active,organizations),"unaffiliated");
  assert.equal(directory.representative(current,organizations),"a");
  assert.equal(directory.matches(graduate,{relation:"unaffiliated"}),false);
  assert.equal(directory.matches(graduate,{relation:"former",organization:"a"}),true);
  assert.equal(directory.matches(active,{relation:"unaffiliated"}),true);
  const master=structuredClone(require("./fixtures/admin-vnext-baseline.json").talents);
  const t=master.talents[3];t.visibility="public";t.affiliations=t.affiliations.map(a=>({...a,status:"former"}));t.agencyStatus.value="unaffiliated";t.activityStatus.value="ended";
  const html=talentCards(master);
  const card=html.split('id="'+t.id+'"')[1].split("</li>")[0];
  assert(!card.includes("<p>無所属</p>"));assert(card.includes("旧所属："));
  const section=html.split('data-directory-section="former"')[1].split("</section>")[0];
  assert(section.includes('id="'+t.id+'"'));
});

test("activity filters use recorded status, including unknown, without inferring retirement from affiliation",()=>{
  const rows=[{...row("a","活動中",["a"]),activity:"active"},{...row("b","卒業",[],["a"]),activity:"ended"},{...row("c","旧所属",[],["a"]),activity:"unknown"},{...row("d","休止",["a"]),activity:"hiatus"}];
  assert.deepEqual(rows.filter(p=>directory.matches(p,{activity:"ended"})).map(p=>p.id),["b"]);
  assert.deepEqual(rows.filter(p=>directory.matches(p,{activity:"unknown",relation:"former"})).map(p=>p.id),["c"]);
  assert.deepEqual(rows.filter(p=>directory.matches(p,{activity:"hiatus",organization:"a"})).map(p=>p.id),["d"]);
});
test("profile navigation only links to rendered sections and group filter links retain stable IDs",()=>{
  const {talentPage}=require("../lib/talent-details");
  const master=structuredClone(require("./fixtures/admin-vnext-baseline.json").talents);
  const t=master.talents[0]; t.activityStatus.value="hiatus";
  const group={id:"grp-000001",name:"試験グループ",talentIds:[t.id]};
  const render=()=>'<section class="profile-section"><h2>音楽</h2><p>曲</p></section><section class="profile-section"><h2>関連イベント</h2><p>イベント</p></section>';
  const html=talentPage(t,master,{groups:[group],events:[]},{},null,render);
  assert(html.includes('href="/talents/?group=grp-000001"'));
  assert(html.includes('data-activity="hiatus">活動休止</span>'));
  const nav=html.split('class="profile-jumps"')[1].split("</nav>")[0];
  for(const id of ["talent-streams","profile-music","profile-events","profile-biography"]){
    assert(nav.includes('href="#'+id+'"'));
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
  }
  assert(!nav.includes("#profile-anniversaries"));assert(!nav.includes("#profile-goods"));
});
