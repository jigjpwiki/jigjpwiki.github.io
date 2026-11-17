# 記念日・音楽・イベント・グッズ管理

基準main `9157888c4`（PR #40 / 公開Version 2.13.0を含む）。既存のVTuber・事務所・グループ管理に4分野の管理を追加する。**公開サイト・データ・Schema・収集・Secretsは変更しない**。非公開の独立Admin Workerだけの機能拡張なので、公開サイトに未デプロイの管理機能を告知せず、既存Admin導入時と同じく公開release.jsonは2.13.0を維持する。

## 通常の操作

ログイン→管理トップのカテゴリ→名前/タイトル・種類/状態・人物・公開状態で検索→新規/既存編集→「基本情報」「関連・出演者」「日時・詳細」→編集内容を保留→一括登録を確認→変更理由と値を確認→変更プレビュー→差分/参照影響を確認→PR作成。保留中の編集はブラウザーのメモリーだけにあり、GitHubやローカルStorageへ自動保存しない。未提出の変更は明示的に破棄できる。画面離脱時に未保存変更を確認し、検証中は編集・移動を止める。

巨大なJSONを入力しない。関連IDは名前検索で選択し、固定IDは補足/読み取り専用。日付と日時はJST、nullable値は空欄・不明、画像はURLとfallback、配列はカードと上下ボタンを使用する。エラー概要から該当欄へ移動できる。新規レコードは原則draftで開始する。

### 記念日

月・日・任意の年を入力し、人物/グループ、繰り返し、周年、公開状態を選ぶ。生年や起点年は補完しない。年不明の周年表示や、誕生日の年齢推測、同一事実の二重登録は既存の意味的検証が拒否する。

### 音楽

楽曲 / 歌動画 / 動画情報 / 歌枠 / 歌唱記録を独立したメニューで管理する。

- 楽曲候補は曲名・原曲アーティスト・作品URLを併記。同名だけで選択や統合はしない。同一性未確定の曲はidentityUrl=null、identityStatus=unresolved、draft。歌枠URLやタイムスタンプを作品の代用品にしない。
- 歌動画/歌枠は既存の動画を選択して再利用する。未登録なら「動画情報を追加」で確認した動画URL・タイトル・チャンネルを入力する。確認できないタイトル/チャンネルはSchemaの必須条件を満たさないため登録を保留する。公開日時・開始/終了・長さは不明ならnull。YouTubeへの問い合わせはしない。
- watch / youtu.be / shorts / live / embed のHTTPS URLから11文字IDを抽出。偽ホスト、認証付きURL、二重v、チャンネルURLを拒否する。既存動画を新規として送った場合は拒否し、既存レコードの選択を案内する。
- 歌枠から歌唱記録を追加できる。歌枠・動画情報・複数の歌唱を1本のPRへまとめる。曲順・秒/mm:ss/hh:mm:ssを入力し、時刻不明はnull。未確定曲はrawLabelとsongId=nullで保持する。
- 曲順の上下移動は既存の番号を交換し、番号の空きを埋めたり不明の曲順を推測しない。不明の番号がある場合は入力してから移動する。開始時刻の並びや動画長との矛盾は既存validatorが拒否する。
- 完全セットリストは確認した全曲数と公開・確認済み歌唱が一致する必要がある。未確認歌唱の公開やdraft Songへの公開歌唱リンクは拒否する。

### イベント

開催日時・出演者・名簿の完全性・主催/関連組織・公式告知・動画/配信先・会場/形式・料金・概要を編集する。出演枠は同じフォーム内で追加・並べ替え可能。新しい枠のIDは自動発行し、登録済み枠を無断で消す操作は拒否する。

日時の精度はunknown/month/date/instantを維持する。unknownはnull、時刻入力だけをJSTからUTCへ変換し、日付や月には架空の時刻を追加しない。既存の期間逆転/イベント範囲外の出演枠検証を維持する。

### グッズ

Campaign / Product / Offerを別レコードのまま管理する。PR #40の純粋関数Goods.aggregateをbuild時にAdminへコピーし、公開Offerの販売状況を同じルールで表示する。商品から人物・グループを集約する。

1. キャンペーンを作成（または既存キャンペーンを開く）。
2. 「商品を追加」で名前・関連人物/グループ・画像・商品情報を入力。
3. 商品の「販売情報を追加」で価格・通貨・販売先・期間・状態を入力。
4. 商品/Offerの保留後、親キャンペーンへ戻り、必要な商品を繰り返し追加する。
5. キャンペーン全体の差分を一括プレビューし、1本のPRを作成する。

新規Campaignと2商品/2Offerは5操作の1トランザクションになる。既存Campaignにも追加でき、1商品に複数Offerを保持する。親の作業文脈とOfferのcampaignId/productIdが一致しない場合は拒否する。終了と売り切れ・不明を区別し、期間内だけを理由に販売中にしない。過去の41商品・6Campaign・41OfferとURL/IDはそのまま。新UIに履歴を消す削除・統合操作はない。

## 実装・安全性

- `content-definitions.mjs`: 固定のentity→file/list/ID台帳対応と既存Schema v2。ユーザーにファイルパスを指定させない。
- `content-plan.mjs`: 最大60操作、確認hash、作業中の参照解決、全マスター同時検証、差分・監査を生成する純粋な計画処理。失敗時に一部をGitHubへ保存しない。
- `content-manager.js`: 検索/一覧、メモリー上の編集作業、親子登録、確認。`content-fields.js`が日本語フォーム、`content-utils.js`がURL/JST/秒数の純粋変換を担当。
- 既存のGitHub OAuth・数値ユーザーID/権限・CSRF・origin・main SHA・10分preview・SQLite journal・固定管理branch・main base・二重送信復旧を維持する。GitHubへの書込は既存publish gatewayだけ。
- 出典pool/refs/必須URL確認日は追加しない。作品のidentity URL、販売URL、公式告知URL、外部DBのレコードURLは利用者向けのコンテンツ情報として維持する。
- 新IDは各既存台帳と全現存IDの最大値から発行。削除済み/未公開の予約IDも再利用しない。slotもfeature-id-registryへ予約。既存IDと動画IDの変更を拒否する。
- 同じ動画の重複や歌動画/歌枠の二重登録、同一作品の重複identity、完全に同じOfferの二重登録を拒否する。曲名だけでは照合しない。
- 公開/draft参照、非公開人物、URL、日付、状態、ID形式、全マスターの意味的整合性を既存validatorsで検証する。validatorやSchemaを緩和しない。操作対象外のデータ・台帳・収集対象を変更しない。
- mainが進んだ場合は再読み込み・再確認を要求する。未マージPR間で独立に提案された新IDが競合する場合も、台帳/JSON差分を人間が解決し、最新mainから再プレビューする。自動上書き・自動マージはない。
- 一括プレビューはcontentProtocol=1/sourceFreeProtocol=2、既存のVTuber等は旧形式1を維持。旧Workerは新しい一括planの書込を拒否する。署名・期限・所有者・main照合は同じ経路で行う。

## 検証

root check / 単体195件 / build / scheduler 7件 / 全7ブラウザースイート。Admin単体39件 / check(dry-run) / ローカルworkerd・SQLite DO / 既存E2E＋新規40フロー（10ケース×320/390/768/1440px）を実行する。

新規/既存記念日、楽曲、歌動画、未登録動画情報を含む歌動画、歌枠＋セットリスト、イベント＋出演枠、Campaign＋複数Product＋Offer、既存Campaignへの追加、過去Offer編集を実フォーム→preview→模擬PRで検証。main更新時のPR拒否、CSRF拒否、全10種類の対象外レコード不変・ID/不正URL/重複/参照/公開保護を追加検証する。既存の認証/権限・403/409/422/429・再送・移行テストも維持する。

スクリーンショットは実際のChromium、ローカルfake OAuth/GitHubで撮影。390/1440pxのフォームと差分、768pxのダークモードを保存する。**実GitHubへのデータ登録や本番デプロイはテストしない**。

| 対象 | フォーム390 | フォーム1440 | 差分390 |
| --- | --- | --- | --- |
| 記念日 | [画面](screens/anniversary-form-390.png) | [画面](screens/anniversary-form-1440.png) | [画面](screens/anniversary-preview-390.png) |
| 楽曲 | [画面](screens/song-form-390.png) | [画面](screens/song-form-1440.png) | [画面](screens/song-preview-390.png) |
| 歌動画＋動画情報 | [画面](screens/new-media-video-form-390.png) | [画面](screens/new-media-video-form-1440.png) | [画面](screens/new-media-video-preview-390.png) |
| 歌枠・歌唱 | [画面](screens/karaoke-setlist-form-390.png) | [画面](screens/karaoke-setlist-form-1440.png) | [画面](screens/karaoke-setlist-preview-390.png) |
| イベント・枠 | [画面](screens/event-slots-form-390.png) | [画面](screens/event-slots-form-1440.png) | [画面](screens/event-slots-preview-390.png) |
| グッズ一括 | [画面](screens/campaign-bundle-form-390.png) | [画面](screens/campaign-bundle-form-1440.png) | [画面](screens/campaign-bundle-preview-390.png) |
| ダークモード | [768pxイベント](screens/event-slots-form-768.png) | [768pxグッズ](screens/campaign-bundle-form-768.png) | — |

新管理トップ: [390px](screens/dashboard-390.png) / [1440px](screens/dashboard-1440.png)。グッズ一覧: [390px](screens/goods-list-390.png) / [1440px](screens/goods-list-1440.png)。これらはAdmin docs内のみでPagesへ含めない。

## 導入と残る運用

[デプロイ・ロールバック](DEPLOY.md)を所有者が確認する。本PRは本番に反映しない。Schema/マスター移行・新しいGitHub App権限・Secrets・DB・Cloudflareサービスは不要。公開PagesのVersion 2.13.0、収集API/頻度/無料構成は不変。

未確認の動画メタデータの取得、在庫/販売リンクの監視、歌唱認識、候補の自動承認は実装しない。必須の動画タイトル/固定チャンネルが確認できない場合は安全に登録を保留する。大きなバッチは既存100KBリクエスト上限と60操作の範囲で扱う。履歴の抹消や破壊的統合は通常UIで行わない。
