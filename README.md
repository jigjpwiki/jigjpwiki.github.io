# じぐじゅーる / jigdule

じぐじゅーるは、jig.jp非公式Wikiに関連するライバーの配信予定・配信情報を、ひとつのページで見やすく確認できる非公式スケジュールサイトです。

YouTube / Twitch / TikTok の情報をまとめて読み込み、日付ごとに整理して表示します。

## 特徴

- YouTube / Twitch / TikTok の配信情報をまとめて表示
- YouTube は**ブラウザから直接APIを叩くため、リアルタイム性が高い**（最大15分キャッシュ、設定で無効化可能）
- Twitch は定期的にGitHub Actionsで更新
- 日付ごとにスケジュールを確認可能
- 時間帯ごとにまとまっているので見やすい
- YouTube Live 配信中は赤いボーダーと「ON AIR」バッジで表示
- サムネイル・配信タイトル・ライバー名・リンクを一覧表示
- GitHub Pages で動作するシンプルな静的サイト構成

## サイト構成

このリポジトリでは、フロントエンドは主に以下のファイルで構成されています。

- `index.html`  
  サイト本体。メタ情報、OGP、外部ライブラリの読み込み、表示領域の定義を行います。
- `comitter.js`  
  **YouTube は直接 YouTube Data API v3 をブラウザから叩いて配信情報を取得** します。`data/config.json` から API キーを読み込み、`data/youtube_streamers.json` から配信者リストを読み込みます。  
  同時に `data/tiktok.json` / `data/twitch.json` も読み込み、3つのプラットフォームのデータを統合して画面に描画します。  
  **LocalStorage キャッシュ対応**（有効/無効は設定で制御可能）。
- `script.js`  
  カルーセル初期化処理を担当します。
- `style.css`  
  見た目のスタイルを定義します。
- `data/`
  - `config.json`: YouTube API キーを格納（Google Cloud Console でリファラー制限を設定してください）
  - `youtube_streamers.json`: 監視対象の YouTube チャンネルリスト
  - `tiktok.json`: TikTok 配信情報
  - `twitch.json`: Twitch 配信情報（GitHub Actions で定期更新）
- `assets/`  
  ロゴ、OGP画像、サムネイルテンプレート、アイコンなどを格納します。
- `fetch_twitch.js` + `.github/workflows/fetch_twitch.yml`  
  Twitch のデータを 12 分ごとに取得し、`data/twitch.json` を更新します。

## データの流れ

### YouTube（ブラウザ直叩き）
1. ユーザーが `index.html` を読み込み
2. `comitter.js` が `data/config.json` から API キーを取得
3. `data/youtube_streamers.json` から監視対象チャンネルリストを読込
4. 各チャンネルに対し、**ブラウザから直接 YouTube Data API v3 をポーリング**
   - `/search` エンドポイント（100 units）で最新 5 本の動画 ID を取得
   - `/videos` エンドポイント（5 units）で詳細情報（ライブ状態・スケジュール・タイトル・サムネイル）を取得
5. `actualStartTime`/`actualEndTime` で「配信中」「配信予定」「アーカイブ」を自動判定
6. LocalStorage に 15 分 TTL でキャッシュ（`YT_CACHE_ENABLED` で ON/OFF 可能）
7. Twitch/TikTok データと統合
8. 日時順にソート→日付ごとにグループ化→時間帯ごとに分けて表示

### Twitch/TikTok（定期更新）
- Twitch: GitHub Actions が 12 分ごとにデータ取得→`data/twitch.json` に保存
- TikTok: 手動でデータを `data/tiktok.json` に格納（API がないため）

## セットアップ

### YouTube API キーの設定（必須）

1. **Google Cloud Console で API キーを取得**
   - YouTube Data API v3 を有効化
   - API キー（HTTP 制限ありの再利用不可キー推奨）を生成

2. **HTTP リファラー制限を設定**
   - `https://jigjpwiki.github.io/*` のみ許可
   - ローカルテスト時は `http://localhost/*` も追加
   - これにより、キーが public リポジトリに含まれていても使用が制限されます

3. **キーを `data/config.json` に設定**
   ```json
   {
     "youtubeApiKey": "AIza..."
   }
   ```

### LocalStorage キャッシュの制御

`comitter.js` の先頭付近の `YT_CACHE_ENABLED` で制御できます。

```js
const YT_CACHE_ENABLED = false;  // false: 毎回API叩く / true: 15分TTLでキャッシュ
```

### Twitch データ更新

Twitch データを GitHub Actions で定期更新する場合は、リポジトリの Secrets に以下を登録してください。
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`

各プラットフォームのJSONは多少差がありますが、画面表示時にはおおむね次のような情報を使います。

```json
{
  "name": "ライバー名",
  "title": "配信タイトル",
  "date": "2026-04-18T20:45:00.000+09:00",
  "url": "配信URL",
  "thumbnail": "サムネイルURL",
  "channelIcon": "チャンネルアイコンURL",
  "status": "live / upcoming / archive"
}
```

## 注意事項
本サイトは非公式の配信スケジュールサイトであり、特定の企業・団体・ライバーとは公式な関係はありません。

掲載されている配信情報は各プラットフォーム（YouTube / Twitch / TikTok）から取得・整理したものであり、正確性・完全性・最新性を保証するものではありません。

配信予定は変更・延期・中止される場合があります。最新の情報は各配信ページをご確認ください。

プラットフォーム側の仕様変更やAPI制限等により、一部のデータが取得できない・表示されない場合があります。

本サイトの利用によって生じたトラブル・損害について、開発者は一切の責任を負いません。

## クレジット
- Project / Development：jig.jp非公式Wiki 管理者
- Data Sources：YouTube / Twitch / TikTok
- Frontend Library：Swiper.js
- Hosting：GitHub Pages
- Special Thanks：配信情報の公開・発信を行っているすべてのライバーの皆さま
