# Pagesデプロイ調査・容量削減・未公開データの再試行

対象: [Update and publish site #110](https://github.com/jigjpwiki/jigjpwiki.github.io/actions/runs/42846435823)。日付は2026-11-11 JST（ログ上は11月10日UTC）。本番設定、収集処理、データファイルは変更せず、ファイル削除も行っていない。

## 観測した時間と分からないこと

| 区間 | ログのJST時刻 | 観測時間 |
| --- | --- | --- |
| run開始 → Artifact完了 | 00:38:21 → 00:38:43.700 | 約23秒（setup/取得/commit/build/uploadを含む） |
| ローカルbuildコマンド → 次のupload step | 00:38:40.560 → 00:38:40.750 | 約0.19秒 |
| Artifact作成・upload step | 00:38:40.750 → 00:38:43.700 | 約2.95秒 |
| Pages `deployment_queued` | 初回00:39:18.496、最後00:44:03.751 | 約4分45秒観測、00:44:08.901にin_progress |
| Pages `syncing_files` | 00:44:14.072 → 00:49:14.471 | 約5分、同期中のままタイムアウト |

デプロイactionの既定timeoutは600,000ms。約5秒間隔のpollなので、状態遷移の正確な瞬間は分からない。Pages内部のキュー長、同期方式、バックエンド負荷はこのログでは確認できない。Artifactの容量が同期時間にどれほど寄与したかを証明する比較実験もない。**ビルドは主な待ち時間ではなく、画像削減でPagesのキュー・同期が何秒短くなるかは未検証。**

## 容量と内訳（MBは10進、MiBは2進）

ログのアップロード済みArtifact ZIPは **44,139,594 bytes**（約44.14 MB）。直接ダウンロードは配信先の403で取得できなかった。

代わりに、checkout `56e59e046`、収集後commit `0ded90eb2`の公開データと当時のbuildスクリプトから公開物を再構築した。177ファイル、**44,447,416 bytes**。これは公開ファイルの合計であり、ZIP/TARのサイズとは別の値である。

今回の作業開始時main `e0e6689ea`は同じ画像を使い、公開データの分だけ差がある。こちらを最適化前後の比較基準とする。

| 公開物 | ファイル数 | 最適化前bytes | 最適化後bytes |
| --- | ---: | ---: | ---: |
| assets/thumbnail | 75 | 30,741,660 | 24,967,809 |
| assets/face | 71 | 13,301,188 | 11,543,881 |
| assetsのその他（JS、vendor、アイコン等） | 17 | 255,288 | 235,030 |
| その他（HTML/CSS/JSON等） | 14 | 153,237 | 153,237 |
| 新しいdeployment.json | +1 | 0 | 95 |
| **合計** | **177 → 178** | **44,451,373** | **36,900,052** |

約7.55 MB、公開物全体の約17.0%を削減。PNG151ファイルだけでは44,086,520 → 36,535,104 bytes（17.13%削減）。ローカルで同じtarコマンドを使った最適化後TARは37,048,320 bytes。これは次回GitHub uploadのZIP容量を実測した値ではない。

全151 PNGをoxipng v10.2.1、`-o 4 --threads 4`で可逆最適化した。URL、拡張子、ファイル名、寸法をすべて維持。元画像とRGBAデコード値のSHA-256一致を全件確認し、ICC/sRGB/gammaなど既存のメタデータも比較して一致した。RGBA→パレット等で表現形式が変わる場合のtransparencyチャンクは、デコードRGBAの一致で検証した。縮小、非可逆圧縮、色数の近似は行っていない。元の画像の削除もない。

再現コマンド（開発時に一度だけ、CIのbuildでは圧縮しない）:

```sh
find assets -type f -name '*.png' -print0 | xargs -0 oxipng -o 4 --threads 4
```

### 使用状況

`assets/js/app.js`はTikTokの`schoolid`から`assets/thumbnail/<schoolid>.png`と`assets/face/<schoolid>.png`を動的に組み立てる。HTMLはlogo/OGP/favicon等を参照し、manifestもアイコンを参照する。1200×630のサムネイル60件、400×400の顔60件が容量の大きい候補。ほかに旧名の顔11件、サムネイル13件、template SVGやvendor等がある。

現在のtiktok.jsonが空でも、将来のデータや外部Wikiからの直リンクまで未使用とは判断できない。単純な文字列検索で「参照なし」として削除・公開除外しない。今回のファイル一覧はすべて保持した。

## 未公開データの回復

従来は今回stageされたyoutube.json/twitch.jsonの差分だけを公開条件にしていた。run #110のようにcommitとuploadは成功してもdeployが失敗すると、次回取得で差分がなければ、未公開commitが残ったまま公開を見送る。

今回の変更:

1. 収集成功分のcommit、失敗媒体の復元、git rebase/pushは従来どおり。その後、現在の正常なsnapshotを毎回ローカルbuildする。
2. 公開ファイルのパスと内容からSHA-256を計算し、`deployment.json`に入れる。ハッシュはmanifest自身と`data/last_updated.json`を除く全公開ファイルを含む。時刻だけの変化では新規deployを起こさない従来方針を維持する。
3. CNAMEのHTTPSサイトにある公開manifestを1回だけ読む（10秒timeout、cache-busting queryとno-cache）。一致すれば公開済み、違えば未公開としてupload/deployする。404、非JSON、network errorなど確認不能時も公開を試す。初回は旧サイトにmanifestがないので公開する。
4. デプロイが失敗すれば公開中のmanifestは旧ハッシュのため、次回にgit差分がなくても再試行する。公開成功時は同じArtifact内のmanifestも公開され、次回から一致する。コードpushの強制公開は従来どおり。

GitHub側の成功状態を永続化する追加commit・PAT・外部ストレージは不要。監視先のCDNが古いmanifestを返す場合やサイト障害時には、余分な再公開が発生しうる（未公開の取り残しを防ぐ方を選ぶ）。Pages内部でタイムアウト後に処理がどう扱われたかは今回のログだけでは確定できない。既存のworkflow concurrencyを維持し、1つのmain writer/deployに直列化する。無制限リトライや別の定期ジョブは追加しない。

cron `8,23,38,53 * * * *`、YouTubeの30分status/auto探索、Twitch取得、検索budget、キャッシュ、データ保護、Pagesのtimeoutと本番設定は変更しない。新たな外部アクセスは公開manifestのGETが最大1回/通常実行。収集APIの回数は増やさない。

## 計測の継続・検証

buildはローカルcopy+manifestのmsを出し、`report-artifact.js`はファイル数・非圧縮容量・内訳・上位10ファイルをActions Summaryへ出す。Pagesキュー/同期はdeploy actionのログで別に評価する。

同じ開発環境で各3回測定したローカルwall timeの中央値は、旧build約0.29秒、新build約0.38秒（copy+hashの追加あり）。この測定はGitHub runnerやPagesの高速化を示すものではない。

新規4テストで、前回失敗後の差分なし再試行、公開成功後の抑止、manifest欠落・不正・network error、コードpush、時刻のみの変化、データ/パス変更を検証。既存の収集失敗時のデータ保護テストも実施。PNG全151件のRGBA/寸法/色情報一致、全53テスト、actionlint、build、5画面幅のbrowser回帰は成功した。PRだけを作成し、マージ・本番デプロイ・設定変更は行わない。実際のPages処理時間への効果は、導入後に複数回分を比較する必要がある。

## 将来: JSONのみの公開を分離する選択肢

以下は設計比較で、このPRでは導入しない。無料枠はベンダー公開条件の目安で、採用時に最新の料金・用途条件を再確認する。

| 構成 | 無料枠・想定量 | 運用負荷と注意点 |
| --- | --- | --- |
| Pagesのまま（今回） | 現行の公開repo/Pages無料運用。最大96回/日の既存起動、実内容が変わった時と回復時だけdeploy | 追加の認証・サービスなし。JSON変更も全体deployとなり、Pages待ちは残る |
| GitHub rawのデータbranchを読み、UIはPages | 公開repoのデータcommitをrawで配信。96更新/日でもPagesのフルdeployを省ける | 低い追加運用負荷。ただしraw CDNのキャッシュ・更新遅延にSLAなし。API経由なら未認証60 requests/時の制限にも注意。公開配信基盤としての用途条件、CORS、CSP、キャッシュ、失敗時のローカルsnapshotへのfallbackを検証する必要あり |
| Pages UI + Worker/Workers KVのJSON | Workers Freeは100,000 requests/日・CPU 10ms/呼出し、KV Freeは100,000 reads/日・1,000 writes/日・1GB。単一snapshot+version pointerなら最大192 writes/日。3媒体別+pointerでも384 writes/日 | Writer用Secret/認証、KV binding、監視、CORS/CSP設定が必要。KVのeventual consistency（一般に最大60秒以上の伝播差）を考慮し、versioned snapshotとpointer、旧snapshot fallbackを設計。閲覧時の要求数が読み取り枠を消費するためアクセス数の算定が必要 |
| Pages UI + R2（必要に応じWorker） | R2 Standardの無料枠: storage 10GB、Class A 1M/月、Class B 10M/月、egress無料。snapshot+pointerを96回/日更新しても約5,760 writes/月。Workerを前段に置けば別途Worker枠 | custom domain/CDN・CORS・保護されたアップロード権限・バージョン/保持期間の運用。R2有効化の課金アカウント条件を要確認。整合性はKVより扱いやすいがCDN TTLは別。R2 lifecycleによる削除は別途合意が必要で本PRでは行わない |

移行するなら、まずデータを一つのsnapshotにまとめ、収集成功分だけで生成し、旧snapshotを維持する構成を評価する。収集は引き続きActions、API認証はActions Secrets、外部の書込み権限もSecret管理とする。更新先が失敗しても現在のPagesデータを読めるfallbackを用意する。無料枠だけでなく、実アクセス数・キャッシュTTL・更新失敗の通知・復旧手順を含めて選ぶ。

参考: [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)、[deploy-pages](https://github.com/actions/deploy-pages)、[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)、[KV pricing](https://developers.cloudflare.com/kv/platform/pricing/)、[KV consistency](https://developers.cloudflare.com/kv/concepts/how-kv-works/)、[R2 pricing](https://developers.cloudflare.com/r2/pricing/)。Workers/KV/R2料金ページは今回取得し、上記の無料枠を確認した。アカウントの条件・料金の最終確認は導入時にも行う。
