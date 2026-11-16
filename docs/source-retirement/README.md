# 出典管理の廃止（Schema v2）

出典の入力・紐付け・件数・種類・確認日の検証を撤去する。プロフィール、所属・活動状態、公式アカウント、コンテンツとそのURL、固定ID・発行台帳、公開制御、認証、変更理由・操作者・操作日時の監査、差分レビューとPR提出は維持する。出典の有無が登録条件になる経路は残さない。

## 削除対象と残す情報

| 対象 | 対応 |
| --- | --- |
| 8マスターとSchema（talents/catalog/anniversaries/goods/events/media/music/karaoke） | `sources`、`sourceRefs`、`displayNameSourceRefs`、出典定義・ID・必須条件を削除。`schemaVersion: 2`へ移行 |
| 楽曲・歌唱 | `artistEvidence`、`verificationMethod`、外部楽曲IDの出典確認日を削除。出典説明だけの既存55件のnoteはnullへ。曲名・原曲アーティスト・原文曲目・時刻・Song/Performance ID・公開/確認状態は保持 |
| talent/catalog/feature/music/karaoke validators | 出典ID照合、official件数、項目ごとの証拠URL一致・未来確認日チェックを削除。ID、アカウント形式/URL一致、日付、参照、状態整合性、公開制御、Songの同一性・別版・アーカイブURL禁止は維持 |
| 登録支援 | 出典レコード生成、supplied sources、出典URL/日付必須チェックを削除。値・候補ハッシュに紐づく承認、同一動画・楽曲の重複検出、並行変更チェック、コメント由来候補の人間レビューは維持 |
| 登録済みレビューJSON | 出典専用フィールドと50件の出典追加patchを削除。出典以外を変えず承認対象値・結果のハッシュを移行。楽曲/商品登録案は再実行して変更0件を確認。過去のGit履歴は変更しない |
| Admin model/API | 出典追加・上書き・統合処理を削除。`confirmation: {status: "confirmed", valueHash}`で変更内容の明示確認を維持。新規人物はアカウント不明でも登録可能、既知の本人照合アンカーは維持 |
| Admin public | 出典選択・追加・一覧・種類・確認日・専用エラー・専用差分表示とCSSを削除。「出典・履歴」は「変更履歴」へ。PR作成前の理由・変更差分・参照影響の確認は維持 |
| 監査 | 新旧の現行ledgerから出典専用`evidence`を除去。actor/reason/action/subject/changedFields/at等は保持。過去のcommitは不変 |
| 公開ページ | 人物、記念日、イベント/出演枠、楽曲、歌枠/歌唱、商品/販売情報の出典・確認日コンポーネントとCSSを削除。Wiki/公式プロフィール・SNS・原曲・配信/タイムスタンプ・告知・購入リンクは維持 |
| 静的カレンダー | 元の基準日を`anniversaries.fallbackDate`という表示設定へ一度だけ移す。出典日時やビルド時計に依存せず、JS有効時は引き続き閲覧時JSTで動く。変更したcalendar coreには公開版のクエリを付け、旧キャッシュと新データの混在を防ぐ |
| 開発ルール・文書 | AGENTS、Admin現行仕様/設定手順を更新。過去の設計・調査記録は廃止を明記して歴史資料として残す |

通常の出典グラフを読むコードは撤去した。残る旧フィールド名は、一方向の移行境界`lib/source-migration.js`、旧形式のテスト、廃止仕様の説明だけ。

**廃止対象ではないもの**：SNS/動画/購入先/原曲・MusicBrainzレコードのURL、本人照合アンカー。収集ターゲット設定`ops/official-discovery/sources.json`のallowlist/permission、API取得キャッシュの`checkedAt`、候補の動画/コメントURL・抽出元`sourceType`・内容ハッシュ/レビュー状態は収集・再試行・差分確認の運用データであり、手入力の出典レジストリではない。公開マスターから参照せず、Pagesにも公開しない。収集Worker・Wiki・定期取得処理は変更しない。

## 移行前後の比較

基準mainは `ed9d5e5688bfa11c77e24e7eb1597e094e065425`。[機械検証レポート](migration-report.json)で全8マスターを、削除対象だけを除いた期待値とdeepEqualし、発行台帳3つも完全一致させる。

| レコード | 前→後 |
| --- | --- |
| タレント/事務所/グループ | 97→97 / 5→5 / 11→11 |
| 記念日/イベント/動画メタデータ | 91→91 / 5→5 / 22→22 |
| 商品/販売企画/販売情報 | 41→41 / 6→6 / 41→41 |
| 楽曲/歌動画/歌枠/歌唱 | 57→57 / 4→4 / 17→17 / 55→55 |

出典レコード480件、`sourceRefs`1,086項目、名前の出典97項目、出典専用確認日時482項目（外部楽曲ID2件を含む）を除去。削除したsource専用IDを、タレント等のコンテンツIDへ転用しない。公式プロフィールURLはID台帳から通常のプロフィールリンクへ保持する。楽曲は未確定3曲をdraftのまま残し、公開楽曲54曲・公開歌唱55件・songId=nullの歌唱3件という関係も維持する。

`node scripts/migrate-source-management.cjs --from-ref COMMIT --check-current` は読み取り専用。`--out /tmp/NEW_DIRECTORY`を指定すると、検証済みの移行案と比較レポートを**新規ディレクトリにだけ**書く。既存の出力先は拒否し、リポジトリ内のマスターを直接書き換えない。不明なSchema版・安全検証違反・想定外の内容変更は拒否する。

## 旧SchemaのPR

PR #33のhead `10be6e032b9bf9b87fd0f8ad71ea3326d9005ff5`を`--out`で移行し、98人の新Schema・全マスター検証が成功。移行後も既存97人はこのPRの97人と完全一致、新規人物のID/所属/アカウントはそのまま。これは移行互換性の検証であり、登録内容の事実確認やPR #33の更新・マージではない。

旧形式PRをそのままマージしない。最新mainを取り込み、移行案から**そのPR固有のコンテンツ差分だけ**を適用し、台帳/他レコード不変・check/test/build/browser/CIを確認する。機械的な移行で旧PRの内容を勝手に承認したり、新しいIDを振り直したりしない。Schema v2への出典フィールド再導入はadditionalPropertiesで拒否する。

## 安全な導入順序

このPRはコード・データを一体でレビューできるようにしているが、**旧Workerのまま先にマージしない**。実デプロイ・Secrets変更・main更新は開発作業として実行していない。

1. 所有者が差分・CI・この手順を確認。移行前のmain SHAと現行Adminのデプロイ版を記録する。処理中のPR作成がないこと、応答不明の古いjournal/途中作成branchがあればGitHub上の状態を先に確認する。既存の完了済みPRは保持する。
2. 所有者が承認した場合に限り、このPRの**同一コミット**からAdminをbuild/dry-runし、既存`jigwiki-admin`だけへ先行デプロイする。既存binding/DO・OAuth/Secrets・配信Workerは変更しない。所有者が管理する本番用デプロイ設定を使い、現行のvars（ADMIN_ENABLED/GITHUB_CLIENT_ID/ADMIN_USER_IDS）を保つ。テンプレートの空varsやADMIN_ENABLED=falseで上書きしない。
3. 互換Workerは旧v1をメモリー内でv2へ変換し、一覧・編集・出典なしプレビューを提供する。mainが旧形式の間はPR作成だけを明示的に停止する（UI無効＋API409 `migration_pending_reload`）。旧mainのCIへv2データを送ることを防ぐ短い移行期間。通常の閲覧・配信収集は継続する。
4. 人間が本PRをmainへマージ。リポジトリの既存CI/Pagesフローで検証・公開する。公開スケジュール・デプロイ条件・未公開snapshot再試行は変更しない。
5. 管理者が再読み込みし、v2データを確認して再プレビューする。新しいPR作成が再開する。旧preview・旧未完了journalからの書き込みは拒否し、最新mainで作り直す。移行後の通常PR作成では既存の冪等キー・journal・二重送信復旧が動く。
6. 新規登録/既存編集の差分・監査と、公開プロフィール/カレンダー等を確認する。不要な本番データの追加で確認せず、必要ならレビュー用PRとして扱う。

**ロールバック**：マージ前なら旧データのまま旧Adminへ戻せる。v2データのマージ後は旧Workerだけを戻さない。このPRのコード/データを揃えたrevert PRを最新mainから作り、移行後の新規登録・編集があればその差分を保全してからレビューする。Git履歴の書き換え・台帳ID再利用・途中branchの自動削除は行わない。旧プレビューは再利用しない。

## 画面比較と操作数

本番認証を使わず、実Chromium＋ローカルWorker＋模擬OAuth/GitHubで撮影。外部画像は遮断し、画像取得失敗のフォールバックを含めて確認した。320/390/768/1440px、ライト/ダーク、キーボード、未保存の離脱確認を実行した。

| 画面 | Before | After |
| --- | --- | --- |
| 編集・モバイル | [390px](screens/before/admin-editor-390.png) | [390px](screens/after/admin-editor-390.png) |
| 編集・PC | [1440px](screens/before/admin-editor-1440.png) | [1440px](screens/after/admin-editor-1440.png) |
| 編集・ダーク | [390px](screens/before/admin-editor-dark-390.png) | [390px](screens/after/admin-editor-dark-390.png) |
| 画像変更プレビュー | [390px](screens/before/admin-image-preview-390.png) | [390px](screens/after/admin-image-preview-390.png) |
| 差分レビュー | [1440px](screens/before/admin-preview-1440.png) | [1440px](screens/after/admin-preview-1440.png) |

名前のみの新規登録→理由・確認→プレビューの経路では11→6操作。名前の出典展開/追加フォーム展開/URL入力/登録/最終出典選択の5操作を除去した。出典が既に揃っている画像変更では7→6操作（最終出典選択を除去）。クリック・選択・入力を各1操作とし、待機・試験用のエラー再現/色切替/追加削除・Tab移動を数えない。PR提出前の差分確認と提出の2操作は両方で維持する。複数所属やSNSの追加数によって総操作数は変わる。

## 検証

実行結果はPRにも記載する。rootのcheck・単体185件・build・6組のbrowserとscheduler 7件、Adminの単体/結合27件・check（build＋wrangler **dry-runのみ**）・workerd/SQLite DO・browser E2Eを実行。新規人物、人物/組織/グループ編集、画像/nullable URL、他レコード不変、出典なしの模擬PR、変更確認の失効、競合・重複・不正URL・非公開・XSS・移行中の書き込み停止を検証する。

[公開容量比較](site-size.json)：ファイル数424、HTML223を維持。約38.96MB→38.45MB、約0.51MB減。画像等の公開アセット追加なし、スクリーンショット/レポート/移行ツール/台帳はPages allowlist外。計測時buildは1秒未満（環境依存）。Pages側のキュー時間の改善は主張しない。公開版は既存の規則に従って2.12.0へ更新する。
