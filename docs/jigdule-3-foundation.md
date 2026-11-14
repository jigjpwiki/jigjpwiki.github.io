# jigdule 3.0 第1段階：共通基盤とタレントマスター

## 目的と今回の境界

既存の `/` は配信スケジュールのまま。配信カード、Swiper、日付切替、動画表示トグル、取得・キャッシュ・更新・Pages再公開判定の実装は変更しない。トップは共有CSSへの参照とナビゲーション挿入位置だけを追加する。ナビゲーション分だけヘッダーが高くなるが、既存の可変高さ領域の中で配信画面を維持する。

追加費用・閲覧ログイン・常駐サーバーは不要。JSONをjigduleで管理し、ビルド時に静的HTMLを生成する。Wikiは照合先・リンク先であり、正本でも自動同期元でもない。タレント一覧はJavaScriptなしで閲覧でき、肖像の読込みに失敗した場合やJavaScript無効時はイニシャル表示となる。

## 構造と公開ルート

| ルート/ファイル | 第1段階 |
| --- | --- |
| `/` | 既存配信画面。共通ナビのみ追加 |
| `/talents/` | 確認済み初期データの簡素な一覧、所属と活動状態、外部アカウント・Wiki・出典の表示 |
| `/anniversaries/` | `pages/anniversaries/`を予約。HTMLなし、ナビリンク非表示 |
| `/talents/{id}/` | `pages/talents/detail/`を予約。個別詳細リンクなし |
| `/goods/` | `pages/goods/`を予約。HTMLなし、ナビリンク非表示 |
| `/privacy-policy/`, `/terms/` | 共通ナビ追加。本文変更なし |
| `data/talents.json` | 公開する正本。JSON Schema + 意味的整合性検証の対象 |
| `schemas/talents.schema.json` | 開発用JSON Schema draft-07。成果物には含めない |
| `data/talent-id-registry.json` | jigdule内部IDの発行台帳。成果物には含めない |
| `lib/site-pages.js` | 共有ナビ、HTMLエスケープと一覧の静的レンダラー |

`lib/site-pages.js`のreadyなページのみナビに出す。トップ・一覧・規約系ページは同じナビをビルドで挿入し、現在ページは`aria-current`で表す。未実装ページをクリック可能な「準備中リンク」にしない。

## 内部IDと同一性

- `tal-000001`のような不変のjigdule内部ID。表示名、事務所、YouTube IDをURL用IDとして流用しない。
- 改名は同じrecordのdisplayNameとaliasesを更新する。移籍・卒業・活動終了でもIDを変えない。複数事務所への同時所属・再所属を履歴配列で扱える。
- ID台帳は発行済みIDと照合アンカー（確認済みYouTube channel ID、未確認の場合は公式プロフィールURL）を保持し、別人へのID使い回しを防ぐ。削除した公開人物のIDも予約したまま残す。台帳は追記を原則とし、アンカー変更・統合は出典を伴う別PRでレビューする。
- バリデーターは台帳と現在データを照合し、`previous`引数がある場合は既存YouTube identityのID付け替えも検出する。悪意ある台帳とデータの同時書換えまで自動で防ぐ仕組みではないため、ID変更・統合のコードレビューは必須。
- YouTube channel IDは大文字小文字を区別する。X/Twitch等のアカウント同一性は大文字小文字の違いを正規化する。所属・活動状態を人物の同一性キーにしない。

## スキーマの意味

| フィールド | 意味 |
| --- | --- |
| displayName / displayNameSourceRefs | 公式情報で照合した表示名と出典 |
| aliases | 確認済みの旧活動名・別名。型、期間、出典を持つ。空配列は「確認済み登録なし」であり「別名が存在しない」ことを意味しない |
| affiliations | organizationId、current/former/unknown、from/to、sourceRefs。複数履歴を保持 |
| agencyStatus | affiliated / unaffiliated / unknown。事務所への現在の所属状態 |
| activityStatus | active / hiatus / retired / ended / unknown。VTuberとしての活動状態 |
| accounts | 公式アカウント。service、accountId、URL、sourceRefs。YouTube IDが不明でも確認済み公式handle URLとaccountId:nullを保持可能 |
| wiki | 確認したWikiページURLとその出典。未確認はnull |
| profileImage | 確認した画像URLと出典。未確認はnull。画像そのものは新たに複製せず公式アカウントの公開画像を参照 |
| sources | 出典ID、official/wiki、公開URL、確認日時checkedAt（UTC ISO8601） |

### 卒業と引退を同一視しない

`affiliations.status=former`だけでactivityStatusを変更しない。卒業後に活動継続する人もいるため、無所属とも推定しない。例として「旧事務所はformer、現在のagencyStatusはunknown、activityStatusもunknown」が有効であり、初期データにもこの組合せがある。引退・活動終了を登録するには、それぞれ公式出典による確認が必要。

currentの履歴にtoは指定できない。開始・終了の両日が確認できた履歴は順序と同一事務所内の期間の重複を検証する。他事務所との同時所属は許可。同一事務所へのcurrentの二重登録は禁止する。

### 不明値

期間は実在する`YYYY-MM-DD`、確認できなければnull。月まで分かる情報を便宜的に1日へ変換しない。from:nullは開始不明。to:nullは終了日不明であり、それだけで「在籍中」とは解釈しない。在籍中かはstatus=currentで表す。

情報が不明なら状態のvalueをunknown、根拠のないsourceRefsは空配列。null、空文字、unknownを混同しない。初期データの別名・過去所属は、未確認のものを埋めずに空配列とする。既知の状態には公式出典を必須にする。

## 初期データの照合（2026-11-15 JST確認）

4名の限定的なseedであり、全タレントの網羅や全状態の実データ例を完成させたものではない。

| ID | タレント | 登録した判断と根拠 |
| --- | --- | --- |
| tal-000001 | 真昼ねる | [公式プロフィール](https://www.proforma-production.jp/t/mahiru-neru)・[公式一覧](https://www.proforma-production.jp/talents)・[本人YouTube](https://www.youtube.com/channel/UCI-8WyYqMymGPw9vg55HXDQ)・[Wiki](https://wikiwiki.jp/jigjp/%E7%9C%9F%E6%98%BC%E3%81%AD%E3%82%8B)。本人説明に所属と「Twitchにてゲーム配信中」を確認 |
| tal-000002 | 火乃晴るい | [公式プロフィール](https://www.proforma-production.jp/t/hinoha-rui)・[本人YouTube](https://www.youtube.com/channel/UCVI8oEcv0MArpjPdwlRgYRw)・[Wiki](https://wikiwiki.jp/jigjp/%E7%81%AB%E4%B9%83%E6%99%B4%E3%82%8B%E3%81%84)。公式一覧に卒業属性なし。本人説明の所属・活動の自己紹介と公式リンクを確認 |
| tal-000003 | 水透ユウ | [公式プロフィール](https://www.proforma-production.jp/t/minato-yu)・[本人YouTube](https://www.youtube.com/channel/UCOah55SQYynzPgQQ4wxuzkA)・[Wiki](https://wikiwiki.jp/jigjp/%E6%B0%B4%E9%80%8F%E3%83%A6%E3%82%A6)。本人説明に所属とYouTube中心の活動を確認 |
| tal-000004 | 李じゅぴ汰 | [公式プロフィール](https://www.proforma-production.jp/t/lee-jupita)・[公式一覧](https://www.proforma-production.jp/talents)・[Wiki](https://wikiwiki.jp/jigjp/%E6%9D%8E%E3%81%98%E3%82%85%E3%81%B4%E6%B1%B0)。公式一覧カードにdata-graduation-date=2026-09-30T15:00:00.000Zを確認し旧所属をformerとする。Wikiのプロフィールには卒業・引退の説明を確認できず、現在の事務所所属とVTuber活動はunknown |

公式一覧の`data-date`が入所日だとは確認していないので、履歴開始日に流用しない。李じゅぴ汰の卒業属性はJSTでは2026-10-01に相当するが、日付を説明する告知本文まで確認できていないため履歴toはnullとする。本人YouTube channel IDは今回未照合なので、公式プロフィールで確認したhandle URLだけを登録しaccountId:null、画像:nullとした。卒業を引退の根拠にしない。

3名のactiveは確認時点の本人チャンネル説明に基づくスナップショットであり、配信のリアルタイム状態ではない。すべてのプロフィールを常時監視するものではなく、古い情報・公式更新に気づいた場合は再照合して更新する。

WikiのWeb画面はこの環境から403だったため、設定済みのWiki APIで該当ページを読み取り確認した。認証のためのauth POSTとpage GETのみで、PUT/更新は一切していない。APIレスポンスや認証情報は正本・成果物に保存しない。公式プロフィール・一覧は実HTTP取得し、3名のYouTube ID/handle/説明/画像はchannels.list 1バッチ（3件）で照合した。この照合をbuildやスケジュールに組み込んでいない。

`youtube_streamers.json`は同一性候補の参照だけに用いた。ProForma Production / ProForma Nova / VTuber登龍門等の番組・事務所チャンネルをタレント化しない。既存の収集対象ファイルは変更しない。

指定の既存ブランチ`feat/jigdule-3-foundation`を取得したが、このセッションで得たrefは825bac933（作業開始時mainと同じ）で、treeにも`data/talents.json`はなかった。そのため未検証の初期JSONを流用せず、新ブランチで再作成した。既存ブランチを変更していない。

## バリデーションと公開境界

`npm run validate:talents`およびcheck/buildでAjvのJSON Schema検証と参照・同一性・状態・期間の意味的検証を行う。Ajvはruntime dependencyなので、既存の`npm ci --omit=dev`による更新jobでもbuildできる。ブラウザーにはAjv/スキーマ/Nodeコードを送らない。

JSON Schemaはすべての公開objectでadditionalProperties:false。privateNotes、認証情報、管理者メールなどを足すとbuildが失敗する。ソースURLに埋込認証やkey/token/password等のqueryを許さない。表示名・URL・別名は静的レンダラーでエスケープする。

buildはデータ検証を**出力の削除より先**に実行し、不正なマスターでは成果物を作らない。公開対象は既存の明示allowlistと、検証した`data/talents.json`・生成した`talents/index.html`のみ。ID台帳、schemas、pages、docs、lib、package、node_modules、調査用ファイル、既存収集cacheは非公開。既存`youtube_client.json`は従来からの公開用ブラウザー設定として維持し、Actions Secretsをコピーしない。

新しい公開JSONと共有assetも既存のPages fingerprintの対象になる。workflowのpermissions/concurrency/cron/取得頻度、データ保護・デプロイ再試行は変更していない。本番設定変更は不要。

## 検証

- 新規7件を含む全60のNodeテスト：内部ID/出典/組織/アカウントの一意性・参照整合、改名・複数所属・卒業後継続・引退、状態分離、不明値・日付、秘密/内部フィールド/危険URLの拒否、公開allowlist、HTMLエスケープ。
- 既存browser回帰：1920/1440/1177/390/320px。配信カード、2列＋スクロールバー、動画トグル、Swiper前後移動、日付index、更新・失敗/復旧・安全なテキスト・規約ページを確認。
- 追加browser回帰：1440/390/320px × JavaScript有効/無効。キーボードとマウスのナビ、current表示、静的一覧、未実装リンクの不在、卒業と活動状態の分離、肖像読込成功・失敗のfallback、横はみ出しなしを確認。
- `npm ci --omit=dev`を隔離した作業ディレクトリで実行し、その依存だけで実際のbuild成功を確認。check/build、既存Actions YAMLのactionlintも成功した。

実デプロイは行わずPRのCIで同じcheck/test/build/browserを実行する。

## 次段階と更新手順

1. 公式情報・本人情報・Wikiを照合し、確認したURLと時刻をsourcesに登録する。Wiki単独の曖昧な状態は推測しない。活動終了済みの実在seedや他事務所の登録は、新たに確認できた情報を別PRで追加する。
2. 新しい人物にだけ新IDを発行して台帳へ追記。既存人物の改名・移籍・卒業は同じIDを維持し、履歴と出典を更新する。公式アカウントを人物と誤認しない。
3. 不明値は不明のままにし、`npm run validate:talents` → `npm run check` → `npm test` → `npm run build` → `npm run test:browser`を確認してレビューする。buildのためにネットワーク照合やAPIキーを追加しない。
4. 全体網羅・再確認間隔・情報訂正窓口、公式ブランドと運営法人の関係モデル、アカウント承継/人物統合時のID移行方針は継続課題。初期seedを自動的に全収集チャンネルへ広げない。
5. 記念日の日付精度・対象選択、内部IDによる個別詳細の静的生成、グッズ/イベントの出典/期間/更新方針は別PR。公開する実体ができてからready=trueにしてナビとsitemapへ追加する。

現段階では記念日カレンダー、個別詳細、グッズ/イベント機能、検索/絞込み、編集管理画面、Wikiへの自動書戻しは実装しない。
