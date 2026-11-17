# PR C — 公開コンテンツのUX統一

基準main: `e28471cbc`（PR #32/#34/#37を含む）。Schema v2と既存マスターを維持。
`data/release.json`のみ2.12.0→2.13.0へ更新する。PR Bの人物中心の構成と配信画面の青・白・グレーを使い、4分野の検索・カード・回遊を統一した。

## 表示と探索

- `content-ux.css`: 公開コンテンツ用の幅・文字・線・グリッド・フォーカス。スケジュールのCSS/JSには適用しない。既存人物ページには関連グッズのサイズ規則だけを限定適用。
- `content-components.js`/`content-media.js`: 検証済み動画IDの公式YouTubeサムネイルと同寸法fallback。16:9/cover、商品画像は正方形/contain。JavaScript無効でも画像・コンテンツを閲覧できる。
- 共通フィルター: 検索、人物、旧所属を含む事務所、日付、種類などを併用。URL復元・戻る/進む・解除・件数・空状態・不正値の標準復帰・IME入力に対応。
- 記念日: JSTの当月/今日/30日間、選択日、種類/所属をURLへ保存。`event`リンク・閏年・年齢推測禁止・キーボード移動・静的fallbackを維持。人物画像とグループ別一覧への導線を追加。
- 音楽: 楽曲/歌動画/最近登録された歌枠を分離。種類フィルターは歌動画カテゴリに限定。歌枠の全件検索は従来の歌枠一覧へ移動できる。Song/Performance/未確定曲/未確定時刻の意味を維持。
- イベント: 開催中・今後/過去/日時・終了時刻未確認を分離。明示的な終了日時なしに終了扱いしない。実データ5件のうち3件は終了時刻未確認（2026-11-20 JST基準）。出演者・日時・公式告知・配信・出演枠を優先し、空の配信/出演枠見出しを削除。

## キャンペーンと永久アーカイブ

Campaign / Product / Offerは統合しない。公開OfferのcampaignIdで商品を集約する。公開Campaignは販売終了後やOffer未登録でも保持し、campaignId=nullのOfferを持つ商品・Offer未登録商品は単独表示する。同じ商品が複数Campaignに属する場合も、各販売文脈で既存Productを参照する。

- `/goods/`: 原則6キャンペーン。藤宮コトハ誕生日2026は7商品→1カード。関連人物は2名までと残り人数で簡潔に表示し、検索対象には全員を含める。
- `/goods/campaigns/campaign-000001/`等: 全商品・全販売期間・全販売先へ。商品ごとの価格/状態/販売先を表示し、期間・条件は展開して確認できる。
- `/goods/product-XXXXXX/`: 全41 URLを維持。商品↔キャンペーン、人物→キャンペーンを相互リンク。
- 販売終了による削除処理はない。「すべて/販売中・販売予定/販売終了/販売状況未確認」で過去の記録も閲覧可能。外部リンクは「販売サイトで確認」と案内し、購入可能とは保証しない。
- 元マスターは変更なし。公開goods.jsonのschemaVersionだけ、既存buildの誤った1から正しい2へ修正（商品等の内容は不変）。Adminの認証・編集・PR作成やSchemaの変更はない。

### 集約ルール（純粋関数 Goods.aggregate）

| Offerの状態 | キャンペーン表示 |
| --- | --- |
| 全件同じ状態 | その状態（売り切れは確認時点） |
| 販売中と他状態が混在 | 一部販売中 |
| 販売中なし、予定と他状態が混在 | 一部販売予定 |
| 終了/売り切れと未確認が混在 | 販売状況未確認 |
| 終了と売り切れのみ混在 | 販売終了・売り切れ |
| Offerなし | 販売状況未確認 |

日付だけで販売中にしない。確認済み終了日時の経過は終了にできる。すべてのOfferを判定するため、過去期間だけを見て再販予定や終了日不明の販売を終了扱いしない。一部売り切れを全体の売り切れにはしない。

JS有効時は閲覧時刻で初期化・60秒ごと/再表示時に更新し、現在の絞り込みにも反映する。JS無効時は静的基準時点を明示する。静的基準は既存anniversaries.fallbackDateを再利用し、日付変更だけで再ビルド差分が発生しない。Pages未公開snapshot判定・再試行のコードは変更しない。

## 比較画像

すべて実際のChromiumで撮影。JST 2026-11-20 09:00固定、外部画像へのアクセスは遮断しfallbackを比較。実データの商品画像は全件未登録。縦長画像のcontain表示は非公開fixtureで別途実測した。

各リンクに390px/1440pxの画面がある。画像はdocs内だけでPagesには含まれない。

| 画面 | Before（390 / 1440） | After（390 / 1440） |
| --- | --- | --- |
| 記念日 | [390](screens/before-anniversaries-390.png) / [1440](screens/before-anniversaries-1440.png) | [390](screens/after-anniversaries-390.png) / [1440](screens/after-anniversaries-1440.png) |
| 音楽トップ | [390](screens/before-music-390.png) / [1440](screens/before-music-1440.png) | [390](screens/after-music-390.png) / [1440](screens/after-music-1440.png) |
| 歌動画 | [390](screens/before-music-videos-390.png) / [1440](screens/before-music-videos-1440.png) | [390](screens/after-music-videos-390.png) / [1440](screens/after-music-videos-1440.png) |
| 歌枠一覧 | [390](screens/before-karaoke-390.png) / [1440](screens/before-karaoke-1440.png) | [390](screens/after-karaoke-390.png) / [1440](screens/after-karaoke-1440.png) |
| セットリスト | [390](screens/before-karaoke-detail-390.png) / [1440](screens/before-karaoke-detail-1440.png) | [390](screens/after-karaoke-detail-390.png) / [1440](screens/after-karaoke-detail-1440.png) |
| イベント一覧 | [390](screens/before-events-390.png) / [1440](screens/before-events-1440.png) | [390](screens/after-events-390.png) / [1440](screens/after-events-1440.png) |
| イベント詳細 | [390](screens/before-event-detail-390.png) / [1440](screens/before-event-detail-1440.png) | [390](screens/after-event-detail-390.png) / [1440](screens/after-event-detail-1440.png) |
| グッズ一覧 | [390](screens/before-goods-390.png) / [1440](screens/before-goods-1440.png) | [390](screens/after-goods-390.png) / [1440](screens/after-goods-1440.png) |
| 藤宮コトハ誕生日2026の一覧 | [390](screens/before-goods-kotoha-390.png) / [1440](screens/before-goods-kotoha-1440.png) | [390](screens/after-goods-kotoha-390.png) / [1440](screens/after-goods-kotoha-1440.png) |
| キャンペーン詳細 | [旧商品詳細390](screens/before-campaign-detail-390.png) / [1440](screens/before-campaign-detail-1440.png) | [全7商品390](screens/after-campaign-detail-390.png) / [1440](screens/after-campaign-detail-1440.png) |

Beforeにはキャンペーン詳細が存在しないため、同キャンペーンのアクリルジオラマの商品詳細を比較対象にした。旧商品詳細もAfterに残っている。

再撮影: `UX_BASELINE_DIR=/path/to/main-built-site CHROMIUM_PATH=/path/to/chromium node scripts/capture-public-ux.cjs`。

## 検証と変更規模

- root check / 単体195件 / build / scheduler 7件。
- rootブラウザー7スイート（既存6＋新規UX）。320/390/768/1440px、JS有効/無効、画像失敗、URL復元、キーボード、日付・販売状態更新、旧商品URLを検証。
- Admin単体28件 / check（dry-runのみ） / ローカルworkerd・SQLite DO / ブラウザー4幅。
- 測定値は[measurements.json](measurements.json)、全マスター内容・既存URL・内部リンク・公開サイズは[verification.json](verification.json)。
- 公開HTML 223→229（キャンペーン6件追加）、既存URL削除0、内部リンク切れ0。商品41/キャンペーン6/Offer41、公開楽曲54/歌動画4/歌枠17/歌唱55/イベント5/記念日91は不変。非公開の3楽曲も公開へ昇格していない。
- サムネイルは幅/高さ比16/9（誤差0.03以内）、商品画像containと正方形枠を確認。4幅の横スクロールなし。
- 配信本体・Swiper・日付切替・動画トグル・収集・公開snapshot/再試行・OAuth/Secretsは変更なし。新規API消費・DB・外部パッケージ・画像ファイルの公開追加なし。

## 残る課題

- 商品/キャンペーン画像の追加、在庫・リンク可用性の確認はデータ登録作業として別途行う。画像や年を推測しない。現Schemaにないキャンペーン画像編集等は将来の互換性検証付きで検討する。
- イベント終了時刻不明3件は確認できるまで未確認枠。開始日から終了を推測しない。
- 歌枠は全17件への一覧導線を維持。音楽トップは最近登録された6件だけであることを明示し、全歌枠と混同しない。
- 「永久アーカイブ」は終了時に消去・非表示にしないデータ/公開方針であり、将来もID・URLを維持する。今回、既存マスターの編集や削除は行っていない。
